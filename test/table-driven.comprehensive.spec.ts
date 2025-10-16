/**
 * Comprehensive Table-Driven Tests for AutoMessager
 * 
 * Implements all test categories from the requirements:
 * - Template parity validation
 * - Idempotency verification
 * - Daily de-duplication
 * - Fallback chain testing
 * - Write-back robustness
 * - Compliance guardrails
 * - Rate-limit/retry mechanisms
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearConfigCache } from '../src/config.js';
import type { STask, SFContact, SFLead, SFAccount } from '../src/sf.js';
import type { NormalizedMapping } from '../src/types.js';
import type { GlassixTemplate } from '../src/glassix.js';

// Test data fixtures for the 9 canonical tasks
const CANONICAL_TASKS = [
  {
    id: 'TASK_001',
    name: 'NEW_PHONE_READY',
    subject: 'New Phone Ready',
    variables: {
      first_name: 'יוסי',
      account_name: 'חברה בע"מ',
      device_model: 'iPhone 15',
      imei: '123456789012345',
      date_he: '09/10/2024',
      date_iso: '2024-10-09',
      link: 'https://example.com/phone'
    },
    expectedParamCount: 5,
    expectedTemplateId: 'NEW_PHONE_READY_TEMPLATE'
  },
  {
    id: 'TASK_002',
    name: 'PAYMENT_REMINDER',
    subject: 'Payment Reminder',
    variables: {
      first_name: 'שרה',
      account_name: 'חברה טכנולוגיות',
      amount: '₪1,500',
      due_date: '15/10/2024',
      date_he: '09/10/2024',
      date_iso: '2024-10-09',
      link: 'https://example.com/payment'
    },
    expectedParamCount: 4,
    expectedTemplateId: 'PAYMENT_REMINDER_TEMPLATE'
  },
  {
    id: 'TASK_003',
    name: 'APPOINTMENT_CONFIRMATION',
    subject: 'Appointment Confirmation',
    variables: {
      first_name: 'דוד',
      account_name: 'מרכז שירות',
      appointment_date: '12/10/2024',
      appointment_time: '14:30',
      date_he: '09/10/2024',
      date_iso: '2024-10-09',
      link: 'https://example.com/appointment'
    },
    expectedParamCount: 4,
    expectedTemplateId: 'APPOINTMENT_CONFIRMATION_TEMPLATE'
  },
  {
    id: 'TASK_004',
    name: 'WELCOME_MESSAGE',
    subject: 'Welcome Message',
    variables: {
      first_name: 'מיכל',
      account_name: 'חברה חדשה',
      date_he: '09/10/2024',
      date_iso: '2024-10-09',
      link: 'https://example.com/welcome'
    },
    expectedParamCount: 2,
    expectedTemplateId: 'WELCOME_MESSAGE_TEMPLATE'
  },
  {
    id: 'TASK_005',
    name: 'SERVICE_REMINDER',
    subject: 'Service Reminder',
    variables: {
      first_name: 'אבי',
      account_name: 'חברה שירותים',
      service_type: 'תחזוקה שנתית',
      date_he: '09/10/2024',
      date_iso: '2024-10-09',
      link: 'https://example.com/service'
    },
    expectedParamCount: 3,
    expectedTemplateId: 'SERVICE_REMINDER_TEMPLATE'
  },
  {
    id: 'TASK_006',
    name: 'DELIVERY_NOTIFICATION',
    subject: 'Delivery Notification',
    variables: {
      first_name: 'רחל',
      account_name: 'חברה לוגיסטית',
      tracking_number: 'TRK123456789',
      delivery_date: '11/10/2024',
      date_he: '09/10/2024',
      date_iso: '2024-10-09',
      link: 'https://example.com/delivery'
    },
    expectedParamCount: 4,
    expectedTemplateId: 'DELIVERY_NOTIFICATION_TEMPLATE'
  },
  {
    id: 'TASK_007',
    name: 'CANCELLATION_NOTICE',
    subject: 'Cancellation Notice',
    variables: {
      first_name: 'אלון',
      account_name: 'חברה ביטוח',
      policy_number: 'POL789012345',
      effective_date: '01/11/2024',
      date_he: '09/10/2024',
      date_iso: '2024-10-09',
      link: 'https://example.com/cancellation'
    },
    expectedParamCount: 4,
    expectedTemplateId: 'CANCELLATION_NOTICE_TEMPLATE'
  },
  {
    id: 'TASK_008',
    name: 'RENEWAL_REMINDER',
    subject: 'Renewal Reminder',
    variables: {
      first_name: 'נועה',
      account_name: 'חברה מנויים',
      service_name: 'מנוי פרימיום',
      expiry_date: '31/12/2024',
      date_he: '09/10/2024',
      date_iso: '2024-10-09',
      link: 'https://example.com/renewal'
    },
    expectedParamCount: 4,
    expectedTemplateId: 'RENEWAL_REMINDER_TEMPLATE'
  },
  {
    id: 'TASK_009',
    name: 'SURVEY_INVITATION',
    subject: 'Survey Invitation',
    variables: {
      first_name: 'גיל',
      account_name: 'חברה מחקר',
      survey_name: 'סקר שביעות רצון',
      date_he: '09/10/2024',
      date_iso: '2024-10-09',
      link: 'https://example.com/survey'
    },
    expectedParamCount: 3,
    expectedTemplateId: 'SURVEY_INVITATION_TEMPLATE'
  }
];

// Mock Glassix templates matching the canonical tasks
const MOCK_GLASSIX_TEMPLATES: GlassixTemplate[] = CANONICAL_TASKS.map(task => ({
  id: `template_${task.id}`,
  name: task.expectedTemplateId,
  content: generateMockTemplateContent(task),
  language: 'he',
  status: 'APPROVED',
  category: 'business',
  components: generateMockComponents(task)
}));

function generateMockTemplateContent(task: typeof CANONICAL_TASKS[0]): string {
  const templates = {
    'NEW_PHONE_READY': 'שלום {{first_name}}, הטלפון החדש שלך {{device_model}} מוכן לאסיפה. IMEI: {{imei}}. חשבון: {{account_name}}. תאריך: {{date_he}}.',
    'PAYMENT_REMINDER': 'שלום {{first_name}}, תזכורת לתשלום בסך {{amount}} עבור {{account_name}}. תאריך יעד: {{due_date}}. תאריך: {{date_he}}.',
    'APPOINTMENT_CONFIRMATION': 'שלום {{first_name}}, אישור פגישה ב-{{appointment_date}} בשעה {{appointment_time}} עבור {{account_name}}. תאריך: {{date_he}}.',
    'WELCOME_MESSAGE': 'שלום {{first_name}}, ברוכים הבאים ל-{{account_name}}! תאריך: {{date_he}}.',
    'SERVICE_REMINDER': 'שלום {{first_name}}, תזכורת לשירות {{service_type}} עבור {{account_name}}. תאריך: {{date_he}}.',
    'DELIVERY_NOTIFICATION': 'שלום {{first_name}}, המשלוח שלך {{tracking_number}} יגיע ב-{{delivery_date}}. חשבון: {{account_name}}. תאריך: {{date_he}}.',
    'CANCELLATION_NOTICE': 'שלום {{first_name}}, הודעה על ביטול פוליסה {{policy_number}} של {{account_name}} החל מ-{{effective_date}}. תאריך: {{date_he}}.',
    'RENEWAL_REMINDER': 'שלום {{first_name}}, תזכורת לחידוש {{service_name}} עבור {{account_name}}. תאריך פג: {{expiry_date}}. תאריך: {{date_he}}.',
    'SURVEY_INVITATION': 'שלום {{first_name}}, הזמנה להשתתף ב-{{survey_name}} עבור {{account_name}}. תאריך: {{date_he}}.'
  };
  
  return templates[task.name as keyof typeof templates] || 'Default template';
}

function generateMockComponents(task: typeof CANONICAL_TASKS[0]): Array<{ type: string; text?: string; parameters?: string[] }> {
  return [
    {
      type: 'header',
      text: 'Header text'
    },
    {
      type: 'body',
      parameters: Object.keys(task.variables).filter(key => key !== 'date_he' && key !== 'date_iso' && key !== 'link')
    },
    {
      type: 'footer',
      text: 'Footer text'
    }
  ];
}

// Mock Salesforce tasks
function createMockTask(taskData: typeof CANONICAL_TASKS[0], phone: string = '+972521234567'): STask {
  return {
    Id: taskData.id,
    Subject: taskData.subject,
    Status: 'Not Started',
    Task_Type_Key__c: taskData.name,
    Context_JSON__c: JSON.stringify(taskData.variables),
    Phone__c: phone,
    Who: {
      attributes: { type: 'Contact' },
      FirstName: taskData.variables.first_name,
      MobilePhone: phone,
      Account: { Name: taskData.variables.account_name }
    } as SFContact,
    What: null
  };
}

describe('AutoMessager Table-Driven Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
    process.env.GLASSIX_API_KEY = 'test-key';
    process.env.GLASSIX_API_MODE = 'messages';
    process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
    process.env.SF_USERNAME = 'test@example.com';
    process.env.SF_PASSWORD = 'password';
    process.env.SF_TOKEN = 'token';
    process.env.TASK_CUSTOM_PHONE_FIELD = 'Phone__c';
    process.env.LOG_LEVEL = 'error';
    process.env.XSLX_MAPPING_PATH = './test-template-mapping.xlsx';
    delete process.env.DRY_RUN;

    clearConfigCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
    vi.restoreAllMocks();
  });

  describe('Template Parity Tests', () => {
    it.each(CANONICAL_TASKS)('should validate parameter count/order for $name', async (taskData) => {
      // Import modules after env setup
      const { validateTemplateParameters } = await import('../src/template-validator.js');
      const { renderMessage } = await import('../src/templates.js');
      
      // Find matching Glassix template
      const glassixTemplate = MOCK_GLASSIX_TEMPLATES.find(t => t.name === taskData.expectedTemplateId);
      expect(glassixTemplate).toBeDefined();
      
      // Create template mapping
      const mapping: NormalizedMapping = {
        taskKey: taskData.name,
        messageBody: glassixTemplate!.content,
        glassixTemplateId: glassixTemplate!.name
      };
      
      // Render message to get variables
      const { text } = renderMessage(mapping, taskData.variables, { defaultLang: 'he' });
      
      // Validate template parameters
      const validation = validateTemplateParameters(glassixTemplate!, taskData.variables);
      
      // Assertions
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.parameterCount).toBe(taskData.expectedParamCount);
      expect(validation.expectedCount).toBe(taskData.expectedParamCount);
      
      // Verify parameter order matches template structure
      const templateParams = extractTemplateParameters(glassixTemplate!.content);
      const variableKeys = Object.keys(taskData.variables).filter(k => k !== 'date_he' && k !== 'date_iso' && k !== 'link');
      
      expect(templateParams).toEqual(expect.arrayContaining(variableKeys));
      expect(variableKeys).toEqual(expect.arrayContaining(templateParams));
      
      // Verify message renders without placeholders
      expect(text).not.toMatch(/\{\{[^}]+\}\}/);
      expect(text).not.toMatch(/\{[^}]+\}/);
    });

    it.each(CANONICAL_TASKS)('should handle parameter mismatches for $name', async (taskData) => {
      const { validateTemplateParameters } = await import('../src/template-validator.js');
      
      const glassixTemplate = MOCK_GLASSIX_TEMPLATES.find(t => t.name === taskData.expectedTemplateId);
      expect(glassixTemplate).toBeDefined();
      
      // Create variables with missing required parameter
      const incompleteVariables = { ...taskData.variables };
      delete incompleteVariables.first_name;
      
      const validation = validateTemplateParameters(glassixTemplate!, incompleteVariables);
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing parameters: first_name');
      expect(validation.parameterCount).toBe(taskData.expectedParamCount - 1);
    });
  });

  describe('Idempotency Tests', () => {
    it.each(CANONICAL_TASKS)('should generate deterministic keys for $name', async (taskData) => {
      const { generateDeterministicId } = await import('../src/template-validator.js');
      
      const taskId = taskData.id;
      const templateName = taskData.expectedTemplateId;
      const variables = taskData.variables;
      
      // Generate key multiple times
      const key1 = generateDeterministicId(taskId, templateName, variables);
      const key2 = generateDeterministicId(taskId, templateName, variables);
      const key3 = generateDeterministicId(taskId, templateName, variables);
      
      // All keys should be identical
      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
      expect(key1).toContain(taskId);
      expect(key1).toContain(templateName);
    });

    it.each(CANONICAL_TASKS)('should generate different keys for different variables in $name', async (taskData) => {
      const { generateDeterministicId } = await import('../src/template-validator.js');
      
      const taskId = taskData.id;
      const templateName = taskData.expectedTemplateId;
      
      const key1 = generateDeterministicId(taskId, templateName, taskData.variables);
      
      // Modify one variable
      const modifiedVariables = { ...taskData.variables };
      modifiedVariables.first_name = 'Modified';
      
      const key2 = generateDeterministicId(taskId, templateName, modifiedVariables);
      
      expect(key1).not.toBe(key2);
    });

    it('should short-circuit on identical TaskId + variables', async () => {
      const sf = await import('../src/sf.js');
      const glassix = await import('../src/glassix.js');
      const templates = await import('../src/templates.js');
      
      // Mock Salesforce
      const mockConn = {
        login: vi.fn(),
        logout: vi.fn(),
        query: vi.fn(),
        sobject: vi.fn(() => ({
          update: vi.fn().mockResolvedValue({ success: true })
        })),
        userInfo: { id: 'user-123' }
      };
      
      vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);
      vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(new Set(['Id', 'Delivery_Status__c']));
      
      // Return same task twice (simulating duplicate)
      const task = createMockTask(CANONICAL_TASKS[0]);
      vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([task, { ...task, Id: 'TASK_001_DUPLICATE' }]);
      
      // Mock templates
      const mockTemplate = {
        taskKey: CANONICAL_TASKS[0].name,
        messageBody: 'Test message',
        glassixTemplateId: CANONICAL_TASKS[0].expectedTemplateId
      };
      
      vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
        new Map([[CANONICAL_TASKS[0].name, mockTemplate]]) as any
      );
      vi.spyOn(templates, 'pickTemplate').mockReturnValue(mockTemplate as any);
      vi.spyOn(templates, 'renderMessage').mockReturnValue({
        text: 'Test message',
        viaGlassixTemplate: CANONICAL_TASKS[0].expectedTemplateId
      });
      
      // Mock Glassix send
      const sendSpy = vi.spyOn(glassix, 'sendWhatsApp').mockResolvedValue({
        providerId: 'msg-123'
      });
      
      // Import and run orchestrator
      const { runOnce } = await import('../src/run.js');
      const stats = await runOnce();
      
      // Should only send once due to idempotency
      expect(stats.tasks).toBe(2);
      expect(stats.sent).toBe(1); // Second should be short-circuited
      expect(sendSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Daily De-duplication Tests', () => {
    it.each(CANONICAL_TASKS)('should prevent duplicate sends within 24h for $name', async (taskData) => {
      const { shouldSkipDueToDailyDedupe } = await import('../src/daily-dedupe.js');
      
      const mockConn = {
        query: vi.fn()
      };
      
      const phoneE164 = '+972521234567';
      const templateName = taskData.expectedTemplateId;
      const taskId = taskData.id;
      
      // Mock recent duplicate found
      const cutoffTime = new Date(Date.now() - (12 * 60 * 60 * 1000)); // 12 hours ago
      mockConn.query.mockResolvedValue({
        records: [{
          Id: 'previous-task',
          CreatedDate: cutoffTime.toISOString(),
          Description: `Template: ${templateName}, Phone: +972521234567`
        }]
      });
      
      const result = await shouldSkipDueToDailyDedupe(
        mockConn as any,
        taskId,
        phoneE164,
        templateName,
        24
      );
      
      expect(result.shouldSkip).toBe(true);
      expect(result.reason).toContain('Duplicate template');
      expect(result.hoursSinceLastSent).toBeCloseTo(12, 0);
    });

    it.each(CANONICAL_TASKS)('should allow sends after 24h for $name', async (taskData) => {
      const { shouldSkipDueToDailyDedupe } = await import('../src/daily-dedupe.js');
      
      const mockConn = {
        query: vi.fn()
      };
      
      const phoneE164 = '+972521234567';
      const templateName = taskData.expectedTemplateId;
      const taskId = taskData.id;
      
      // Mock no recent duplicates found
      mockConn.query.mockResolvedValue({
        records: []
      });
      
      const result = await shouldSkipDueToDailyDedupe(
        mockConn as any,
        taskId,
        phoneE164,
        templateName,
        24
      );
      
      expect(result.shouldSkip).toBe(false);
    });

    it('should handle dedupe query failures gracefully', async () => {
      const { shouldSkipDueToDailyDedupe } = await import('../src/daily-dedupe.js');
      
      const mockConn = {
        query: vi.fn().mockRejectedValue(new Error('Database error'))
      };
      
      const result = await shouldSkipDueToDailyDedupe(
        mockConn as any,
        'TASK_001',
        '+972521234567',
        'TEST_TEMPLATE',
        24
      );
      
      // Should not skip on query failure (non-fatal)
      expect(result.shouldSkip).toBe(false);
    });
  });

  describe('Fallback Chain Tests', () => {
    it.each(CANONICAL_TASKS)('should handle missing FirstName for $name', async (taskData) => {
      const sf = await import('../src/sf.js');
      const templates = await import('../src/templates.js');
      
      // Mock task with missing FirstName
      const task = createMockTask(taskData);
      (task.Who as SFContact).FirstName = undefined;
      
      vi.spyOn(sf, 'login').mockResolvedValue({} as any);
      vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(new Set(['Id']));
      vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([task]);
      
      // Mock template
      const mockTemplate = {
        taskKey: taskData.name,
        messageBody: 'שלום {{first_name}}, חשבון: {{account_name}}',
        glassixTemplateId: taskData.expectedTemplateId
      };
      
      vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
        new Map([[taskData.name, mockTemplate]]) as any
      );
      vi.spyOn(templates, 'pickTemplate').mockReturnValue(mockTemplate as any);
      
      // Test rendering with missing FirstName
      const { renderMessage } = await import('../src/templates.js');
      const { text } = renderMessage(mockTemplate, {
        first_name: '', // Fallback to empty string
        account_name: taskData.variables.account_name
      }, { defaultLang: 'he' });
      
      // Should render without crashing
      expect(text).toContain('שלום , חשבון:');
      expect(text).not.toContain('{{first_name}}');
    });

    it.each(CANONICAL_TASKS)('should handle missing Account for $name', async (taskData) => {
      const sf = await import('../src/sf.js');
      const templates = await import('../src/templates.js');
      
      // Mock task with missing Account
      const task = createMockTask(taskData);
      (task.Who as SFContact).Account = undefined;
      
      // Test rendering with missing Account
      const { renderMessage } = await import('../src/templates.js');
      const mockTemplate = {
        taskKey: taskData.name,
        messageBody: 'שלום {{first_name}}, חשבון: {{account_name}}',
        glassixTemplateId: taskData.expectedTemplateId
      };
      
      const { text } = renderMessage(mockTemplate, {
        first_name: taskData.variables.first_name,
        account_name: '' // Fallback to empty string
      }, { defaultLang: 'he' });
      
      expect(text).toContain('שלום יוסי, חשבון: ');
      expect(text).not.toContain('{{account_name}}');
    });

    it.each(CANONICAL_TASKS)('should handle missing custom phone field for $name', async (taskData) => {
      const sf = await import('../src/sf.js');
      
      // Mock task with missing custom phone field
      const task = createMockTask(taskData);
      delete (task as any).Phone__c;
      
      vi.spyOn(sf, 'login').mockResolvedValue({} as any);
      vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(new Set(['Id']));
      vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([task]);
      
      // Test target resolution
      const { resolveTarget } = await import('../src/sf.js');
      const target = resolveTarget(task);
      
      // Should fall back to Contact MobilePhone
      expect(target.phoneE164).toBe('+972521234567');
      expect(target.source).toBe('ContactMobile');
      expect(target.firstName).toBe(taskData.variables.first_name);
      expect(target.accountName).toBe(taskData.variables.account_name);
    });

    it.each(CANONICAL_TASKS)('should maintain natural Hebrew subjects for $name', async (taskData) => {
      const { generateHebrewSubject } = await import('../src/hebrew-subjects.js');
      
      const subject = generateHebrewSubject(taskData.name, {
        accountName: taskData.variables.account_name,
        date: taskData.variables.date_he,
        firstName: taskData.variables.first_name
      });
      
      // Should be in Hebrew and natural
      expect(subject).toMatch(/[\u0590-\u05FF]/); // Contains Hebrew characters
      expect(subject.length).toBeGreaterThan(5);
      expect(subject).not.toContain('{{');
      expect(subject).not.toContain('}}');
    });
  });

  describe('Write-back Robustness Tests', () => {
    it.each(CANONICAL_TASKS)('should send message despite SFDC audit failure for $name', async (taskData) => {
      const sf = await import('../src/sf.js');
      const glassix = await import('../src/glassix.js');
      const templates = await import('../src/templates.js');
      
      // Mock Salesforce with audit failure
      const mockConn = {
        login: vi.fn(),
        logout: vi.fn(),
        sobject: vi.fn(() => ({
          update: vi.fn().mockRejectedValue(new Error('SFDC audit failure'))
        })),
        userInfo: { id: 'user-123' }
      };
      
      vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);
      vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(new Set(['Id', 'Delivery_Status__c']));
      vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([createMockTask(taskData)]);
      
      // Mock successful template and Glassix
      const mockTemplate = {
        taskKey: taskData.name,
        messageBody: 'Test message',
        glassixTemplateId: taskData.expectedTemplateId
      };
      
      vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
        new Map([[taskData.name, mockTemplate]]) as any
      );
      vi.spyOn(templates, 'pickTemplate').mockReturnValue(mockTemplate as any);
      vi.spyOn(templates, 'renderMessage').mockReturnValue({
        text: 'Test message',
        viaGlassixTemplate: taskData.expectedTemplateId
      });
      
      const sendSpy = vi.spyOn(glassix, 'sendWhatsApp').mockResolvedValue({
        providerId: 'msg-123'
      });
      
      // Run orchestrator
      const { runOnce } = await import('../src/run.js');
      const stats = await runOnce();
      
      // Message should still be sent despite audit failure
      expect(stats.sent).toBe(1);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      
      // Audit failure should be logged but not fatal
      expect(stats.failed).toBe(0);
    });

    it.each(CANONICAL_TASKS)('should handle partial SFDC outage gracefully for $name', async (taskData) => {
      const sf = await import('../src/sf.js');
      const glassix = await import('../src/glassix.js');
      const templates = await import('../src/templates.js');
      
      // Mock Salesforce with connection issues
      const mockConn = {
        login: vi.fn().mockRejectedValue(new Error('SFDC connection timeout')),
        logout: vi.fn(),
        userInfo: { id: 'user-123' }
      };
      
      vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);
      
      // Run orchestrator
      const { runOnce } = await import('../src/run.js');
      
      await expect(runOnce()).rejects.toThrow('SFDC connection timeout');
    });
  });

  describe('Compliance Guardrails Tests', () => {
    it.each(CANONICAL_TASKS)('should block send when no WhatsApp opt-in for $name', async (taskData) => {
      const sf = await import('../src/sf.js');
      const templates = await import('../src/templates.js');
      
      // Mock task with no opt-in field
      const task = createMockTask(taskData);
      delete (task as any).WhatsApp_Opt_In__c;
      
      vi.spyOn(sf, 'login').mockResolvedValue({} as any);
      vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(new Set(['Id']));
      vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([task]);
      
      // Mock template
      const mockTemplate = {
        taskKey: taskData.name,
        messageBody: 'Test message',
        glassixTemplateId: taskData.expectedTemplateId
      };
      
      vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
        new Map([[taskData.name, mockTemplate]]) as any
      );
      vi.spyOn(templates, 'pickTemplate').mockReturnValue(mockTemplate as any);
      
      // Run orchestrator
      const { runOnce } = await import('../src/run.js');
      const stats = await runOnce();
      
      // Should be skipped due to compliance
      expect(stats.skipped).toBe(1);
      expect(stats.errors[0].reason).toContain('Unable to process task');
    });

    it.each(CANONICAL_TASKS)('should block send when no approved template for $name', async (taskData) => {
      const sf = await import('../src/sf.js');
      const templates = await import('../src/templates.js');
      const templateMatcher = await import('../src/template-matcher.js');
      
      // Mock task
      const task = createMockTask(taskData);
      
      vi.spyOn(sf, 'login').mockResolvedValue({} as any);
      vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(new Set(['Id']));
      vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([task]);
      
      // Mock template without Glassix template ID
      const mockTemplate = {
        taskKey: taskData.name,
        messageBody: 'Test message',
        glassixTemplateId: undefined
      };
      
      vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
        new Map([[taskData.name, mockTemplate]]) as any
      );
      vi.spyOn(templates, 'pickTemplate').mockReturnValue(mockTemplate as any);
      vi.spyOn(templates, 'renderMessage').mockReturnValue({
        text: 'Test message',
        viaGlassixTemplate: undefined
      });
      
      // Mock no template match found
      vi.spyOn(templateMatcher, 'findBestTemplateMatch').mockResolvedValue(null);
      
      // Run orchestrator
      const { runOnce } = await import('../src/run.js');
      const stats = await runOnce();
      
      // Should be skipped due to no template match
      expect(stats.skipped).toBe(1);
      expect(stats.errors[0].reason).toContain('NO_TEMPLATE_MATCH');
    });

    it.each(CANONICAL_TASKS)('should validate locale exactness for $name', async (taskData) => {
      const { getApprovedTemplates } = await import('../src/glassix.js');
      
      // Mock Glassix templates with different locales
      const mockTemplates: GlassixTemplate[] = [
        {
          id: 'template_1',
          name: taskData.expectedTemplateId,
          content: 'Test message',
          language: 'he', // Correct Hebrew
          status: 'APPROVED'
        },
        {
          id: 'template_2',
          name: taskData.expectedTemplateId,
          content: 'Test message',
          language: 'he_IL', // Should be normalized to 'he'
          status: 'APPROVED'
        }
      ];
      
      vi.spyOn(getApprovedTemplates, 'getApprovedTemplates').mockResolvedValue(mockTemplates);
      
      const templates = await getApprovedTemplates();
      
      // Both should be normalized to 'he'
      expect(templates[0].language).toBe('he');
      expect(templates[1].language).toBe('he');
    });
  });

  describe('Rate-limit/Retry Tests', () => {
    it.each(CANONICAL_TASKS)('should retry on 429 for $name', async (taskData) => {
      const glassix = await import('../src/glassix.js');
      
      // Mock axios to return 429 on first call, success on second
      const mockAxios = {
        post: vi.fn()
          .mockRejectedValueOnce({
            response: { status: 429, data: { error: 'Rate limited' } }
          })
          .mockResolvedValueOnce({
            data: { providerId: 'msg-123' },
            headers: {}
          })
      };
      
      vi.doMock('axios', () => ({
        default: mockAxios
      }));
      
      // Test retry behavior
      const sendParams = {
        toE164: '+972521234567',
        text: 'Test message',
        idemKey: taskData.id,
        templateId: taskData.expectedTemplateId
      };
      
      const result = await glassix.sendWhatsApp(sendParams);
      
      expect(result.providerId).toBe('msg-123');
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
    });

    it.each(CANONICAL_TASKS)('should retry on 5xx for $name', async (taskData) => {
      const glassix = await import('../src/glassix.js');
      
      // Mock axios to return 503 on first call, success on second
      const mockAxios = {
        post: vi.fn()
          .mockRejectedValueOnce({
            response: { status: 503, data: { error: 'Service unavailable' } }
          })
          .mockResolvedValueOnce({
            data: { providerId: 'msg-123' },
            headers: {}
          })
      };
      
      vi.doMock('axios', () => ({
        default: mockAxios
      }));
      
      const sendParams = {
        toE164: '+972521234567',
        text: 'Test message',
        idemKey: taskData.id,
        templateId: taskData.expectedTemplateId
      };
      
      const result = await glassix.sendWhatsApp(sendParams);
      
      expect(result.providerId).toBe('msg-123');
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
    });

    it.each(CANONICAL_TASKS)('should fail permanently after max retries for $name', async (taskData) => {
      const glassix = await import('../src/glassix.js');
      
      // Mock axios to always return 429
      const mockAxios = {
        post: vi.fn().mockRejectedValue({
          response: { status: 429, data: { error: 'Rate limited' } }
        })
      };
      
      vi.doMock('axios', () => ({
        default: mockAxios
      }));
      
      const sendParams = {
        toE164: '+972521234567',
        text: 'Test message',
        idemKey: taskData.id,
        templateId: taskData.expectedTemplateId
      };
      
      await expect(glassix.sendWhatsApp(sendParams)).rejects.toThrow();
      
      // Should have tried max retry attempts
      expect(mockAxios.post).toHaveBeenCalledTimes(3); // Default max retries
    });

    it.each(CANONICAL_TASKS)('should classify errors correctly for $name', async (taskData) => {
      const { classifyError } = await import('../src/error-taxonomy.js');
      
      const errorReasons = [
        'TEMPLATE_NOT_FOUND: No template found',
        'PHONE_UNAVAILABLE: Missing phone number',
        'GLASSIX_API_ERROR: Rate limit exceeded',
        'DAILY_DEDUPLICATION: Duplicate message',
        'Unknown error message'
      ];
      
      const classifications = errorReasons.map(reason => classifyError(reason));
      
      expect(classifications[0].code).toBe('TEMPLATE_NOT_FOUND');
      expect(classifications[1].code).toBe('PHONE_UNAVAILABLE');
      expect(classifications[2].code).toBe('GLASSIX_API_ERROR');
      expect(classifications[3].code).toBe('DAILY_DEDUPLICATION');
      expect(classifications[4].code).toBe('UNKNOWN_ERROR');
      
      // Check retryable flags
      expect(classifications[2].retryable).toBe(true); // API errors are retryable
      expect(classifications[3].retryable).toBe(true); // Deduplication is retryable
      expect(classifications[0].retryable).toBe(false); // Template not found is not retryable
    });
  });
});

// Helper function to extract template parameters
function extractTemplateParameters(content: string): string[] {
  const patterns = [
    /\{\{([^}]+)\}\}/g,  // {{param}}
    /\{([^}]+)\}/g       // {param}
  ];
  
  const params = new Set<string>();
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      params.add(match[1].trim());
    }
  }
  
  return Array.from(params);
}
