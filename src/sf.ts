/**
 * Salesforce client with robust task fetching and target resolution
 * Uses jsforce with OAuth Username+Password+Token authentication
 * Implements polymorphic Who/What resolution via TYPEOF
 */
import { Connection } from 'jsforce';
import { getConfig } from './config.js';
import { getLogger } from './logger.js';
import { normalizeE164, mask } from './phone.js';
import { normalizeTaskKey } from './templates.js';

const logger = getLogger();

/**
 * Salesforce Contact record (from TYPEOF Who)
 */
export interface SFContact {
  attributes: { type: 'Contact' };
  FirstName?: string;
  LastName?: string;
  MobilePhone?: string;
  Phone?: string;
  Account?: {
    Name?: string;
  };
}

/**
 * Salesforce Lead record (from TYPEOF Who)
 */
export interface SFLead {
  attributes: { type: 'Lead' };
  FirstName?: string;
  LastName?: string;
  MobilePhone?: string;
  Phone?: string;
}

/**
 * Salesforce Account record (from TYPEOF What)
 */
export interface SFAccount {
  attributes: { type: 'Account' };
  Name?: string;
  Phone?: string;
}

/**
 * Salesforce Task with polymorphic Who/What resolved via TYPEOF
 */
export interface STask {
  Id: string;
  Subject?: string;
  Status: string;
  ActivityDate?: string; // Task due date (ISO string)
  Who?: SFContact | SFLead | null; // Contact or Lead (TYPEOF)
  What?: SFAccount | null; // Account (TYPEOF) or other
  Description?: string;
  [customPhoneApi: string]: unknown; // dynamic field access (TASK_CUSTOM_PHONE_FIELD)
  Task_Type_Key__c?: string;
  Message_Template_Key__c?: string;
  Context_JSON__c?: string;
}

/**
 * Target resolution result with phone and name details
 */
export type TargetResolution = {
  firstName?: string;
  accountName?: string;
  phoneRaw?: string; // raw as found in SF
  phoneE164?: string | null; // normalized via phone.ts
  source:
    | 'TaskCustomPhone'
    | 'ContactMobile'
    | 'ContactPhone'
    | 'LeadMobile'
    | 'LeadPhone'
    | 'AccountPhone'
    | 'None';
};

/**
 * Type guards for polymorphic Who/What
 */
function isContact(w: unknown): w is SFContact {
  return !!w && typeof w === 'object' && 'attributes' in w && 
    (w as SFContact).attributes?.type === 'Contact';
}

function isLead(w: unknown): w is SFLead {
  return !!w && typeof w === 'object' && 'attributes' in w && 
    (w as SFLead).attributes?.type === 'Lead';
}

function isAccount(a: unknown): a is SFAccount {
  return !!a && typeof a === 'object' && 'attributes' in a && 
    (a as SFAccount).attributes?.type === 'Account';
}

/**
 * Authenticate to Salesforce using jsforce with OAuth Username+Password+Token
 */
export async function login(): Promise<Connection> {
  const config = getConfig();

  logger.info('Connecting to Salesforce...');

  const conn = new Connection({
    loginUrl: config.SF_LOGIN_URL,
  });

  await conn.login(config.SF_USERNAME, config.SF_PASSWORD + config.SF_TOKEN);

  logger.info(
    { userId: conn.userInfo?.id, orgId: conn.userInfo?.organizationId },
    'Connected to Salesforce successfully'
  );

  return conn;
}

/**
 * Fetch pending tasks using a single SOQL with TYPEOF
 */
export async function fetchPendingTasks(
  conn: Connection,
  limit?: number
): Promise<STask[]> {
  const config = getConfig();
  const queryLimit = limit ?? config.TASKS_QUERY_LIMIT;
  const customPhone = config.TASK_CUSTOM_PHONE_FIELD;

  // Build SOQL with dynamic custom phone field and TYPEOF for polymorphic relations
  const soql = `
    SELECT Id, Subject, Status, ActivityDate, Description,
           ${customPhone},
           Task_Type_Key__c, Message_Template_Key__c, Context_JSON__c,
           TYPEOF Who
             WHEN Contact THEN FirstName, LastName, MobilePhone, Phone, Account.Name
             WHEN Lead    THEN FirstName, LastName, MobilePhone, Phone
           END,
           TYPEOF What
             WHEN Account THEN Name, Phone
           END
    FROM Task
    WHERE Ready_for_Automation__c = true
      AND Status IN ('Not Started', 'In Progress')
    ORDER BY CreatedDate ASC
    LIMIT ${queryLimit}
  `;

  logger.debug({ queryLimit, customPhone }, 'Fetching pending tasks');

  const result = await conn.query<STask>(soql);

  logger.info(
    { count: result.records.length, limit: queryLimit },
    'Fetched pending tasks'
  );

  return result.records;
}

/**
 * Derive task key from Task_Type_Key__c or Subject with normalization
 * Uses shared normalizeTaskKey function for consistent normalization
 */
export function deriveTaskKey(t: STask): string {
  const raw = t.Task_Type_Key__c ?? t.Subject ?? '';
  return normalizeTaskKey(raw);
}

/**
 * Safely parse Context_JSON__c field
 * Returns empty object on error (no throw)
 */
export function getContext(t: STask): Record<string, string | number | boolean | null> {
  if (!t.Context_JSON__c) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(t.Context_JSON__c);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      // Ensure all values are primitive types
      const result: Record<string, string | number | boolean | null> = {};
      const entries = Object.entries(parsed as Record<string, unknown>);
      for (const [key, value] of entries) {
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean' ||
          value === null
        ) {
          result[key] = value;
        }
      }
      return result;
    }
    return {};
  } catch (error) {
    logger.warn(
      { taskId: t.Id, error: error instanceof Error ? error.message : String(error) },
      'Failed to parse Context_JSON__c'
    );
    return {};
  }
}

/**
 * Resolve target phone and names from Task with priority order:
 * 1) Task custom phone field (config.TASK_CUSTOM_PHONE_FIELD)
 * 2) If Who is Contact: MobilePhone, then Phone
 * 3) If Who is Lead: MobilePhone, then Phone
 * 4) If What is Account: Phone
 * else: none
 */
export function resolveTarget(t: STask): TargetResolution {
  const config = getConfig();
  const customPhoneField = config.TASK_CUSTOM_PHONE_FIELD;

  let phoneRaw: string | undefined;
  let source: TargetResolution['source'] = 'None';
  let firstName: string | undefined;
  let accountName: string | undefined;

  // Priority 1: Task custom phone field
  const taskCustomPhone = (t[customPhoneField] as string | undefined);
  if (taskCustomPhone) {
    phoneRaw = taskCustomPhone;
    source = 'TaskCustomPhone';
  }

  // Priority 2: Contact fields
  if (!phoneRaw && isContact(t.Who)) {
    const contact = t.Who;
    firstName = contact.FirstName ?? undefined;
    accountName = contact.Account?.Name ?? undefined;

    if (contact.MobilePhone) {
      phoneRaw = contact.MobilePhone;
      source = 'ContactMobile';
    } else if (contact.Phone) {
      phoneRaw = contact.Phone;
      source = 'ContactPhone';
    }
  }

  // Priority 3: Lead fields
  if (!phoneRaw && isLead(t.Who)) {
    const lead = t.Who;
    firstName = lead.FirstName ?? undefined;

    if (lead.MobilePhone) {
      phoneRaw = lead.MobilePhone;
      source = 'LeadMobile';
    } else if (lead.Phone) {
      phoneRaw = lead.Phone;
      source = 'LeadPhone';
    }
  }

  // Priority 4: Account phone (from What)
  if (!phoneRaw && isAccount(t.What)) {
    const account = t.What;
    accountName = account.Name ?? undefined;

    if (account.Phone) {
      phoneRaw = account.Phone;
      source = 'AccountPhone';
    }
  }

  // If we still don't have firstName/accountName, try to extract from Who/What
  if (!firstName && isContact(t.Who)) {
    firstName = t.Who.FirstName ?? undefined;
  }
  if (!firstName && isLead(t.Who)) {
    firstName = t.Who.FirstName ?? undefined;
  }
  if (!accountName && isContact(t.Who)) {
    accountName = t.Who.Account?.Name ?? undefined;
  }
  if (!accountName && isAccount(t.What)) {
    accountName = t.What.Name ?? undefined;
  }

  // Normalize phone to E.164
  const phoneE164 = phoneRaw ? normalizeE164(phoneRaw, 'IL') : null;

  // Log with masked phone
  logger.debug(
    {
      taskId: t.Id,
      source,
      phoneMasked: phoneE164 ? mask(phoneE164) : phoneRaw ? mask(phoneRaw) : 'none',
      firstName,
      accountName,
    },
    'Resolved target'
  );

  return {
    firstName,
    accountName,
    phoneRaw,
    phoneE164,
    source,
  };
}
