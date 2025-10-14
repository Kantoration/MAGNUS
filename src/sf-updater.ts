/**
 * Salesforce Task updater with centralized update logic and retry handling
 * Isolates all SF update operations from orchestration logic
 */
import type { Connection } from 'jsforce';
import type { Config } from './config.js';
import { getLogger } from './logger.js';
import { mask } from './phone.js';
import type { SendResult } from './types/glassix.js';

const logger = getLogger();

/**
 * Maximum length for Task Description/Audit_Trail__c field in Salesforce
 */
const MAX_DESC = 32000;

/**
 * Maximum length for Failure_Reason__c field
 */
const MAX_FAILURE = 1000;

/**
 * Maximum audit trail lines to keep (first + last N)
 */
const MAX_AUDIT_LINES = 100;

/**
 * Field availability map (pre-computed from availableFields Set)
 */
export interface TaskFieldMap {
  deliveryStatus: boolean;
  lastSent: boolean;
  conversationUrl: boolean;
  failureReason: boolean;
  readyForAutomation: boolean;
  auditTrail: boolean;
}

/**
 * Completion details for marking task as completed
 */
export interface CompletionDetails {
  phoneE164: string;
  sendResult: SendResult;
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncate string to max length
 */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) {
    return s;
  }
  return s.substring(0, maxLen);
}

/**
 * Smart audit trail truncation policy
 * Keeps first line (creation timestamp) + '...' + last N lines
 */
function truncateAuditTrail(audit: string, maxLength: number = MAX_DESC): string {
  if (audit.length <= maxLength) {
    return audit;
  }

  const lines = audit.split('\n');
  
  if (lines.length <= MAX_AUDIT_LINES) {
    // If total lines is reasonable, just truncate from end
    return audit.slice(-maxLength);
  }

  // Keep first line + separator + last N-2 lines
  const firstLine = lines[0];
  const separator = '...';
  const keepLastN = MAX_AUDIT_LINES - 2; // Reserve space for first line and separator
  const lastLines = lines.slice(-keepLastN);

  const result = [firstLine, separator, ...lastLines].join('\n');

  // If still too long, truncate from end
  if (result.length > maxLength) {
    return result.slice(-maxLength);
  }

  return result;
}

/**
 * Salesforce Task Updater
 * Centralizes all SF update operations with retry logic and field-aware updates
 */
export class SalesforceTaskUpdater {
  constructor(
    private conn: Connection,
    private fieldMap: TaskFieldMap,
    private config: Config
  ) {}

  /**
   * Mark task as completed with delivery details
   * - Retrieves current task to get audit trail
   * - Appends new audit entry with smart truncation
   * - Retries on transient SF errors
   * - Never throws (logs warnings and continues)
   */
  async markCompleted(taskId: string, details: CompletionDetails): Promise<void> {
    const now = new Date().toISOString();
    const maskedPhone = mask(details.phoneE164);
    const providerId = details.sendResult.providerId ?? 'n/a';

    // Build audit line
    const auditLine = `[${now}] WhatsApp → ${maskedPhone} (provId=${providerId})`;

    const glassixUrl =
      details.sendResult.conversationUrl ||
      `https://app.glassix.com/conversations/${providerId}`;

    try {
      // Single retrieve to get current audit trail
      const current = await this.conn.sobject('Task').retrieve(taskId);

      // Determine which field to use for audit trail (prefer Audit_Trail__c)
      const targetField = this.fieldMap.auditTrail ? 'Audit_Trail__c' : 'Description';

      const currentRecord = current as any;
      const previous = (currentRecord?.[targetField] as string | undefined) ?? '';

      // Append audit line with smart truncation
      const combined = previous + (previous ? '\n' : '') + auditLine;
      const nextAudit = truncateAuditTrail(combined, MAX_DESC);

      // Retry update on transient failures
      const maxAttempts = this.config.RETRY_ATTEMPTS;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          // Build update payload with only available fields
          const updatePayload: Record<string, unknown> & { Id: string } = {
            Id: taskId,
            Status: 'Completed',
          };

          if (this.fieldMap.deliveryStatus) {
            updatePayload.Delivery_Status__c = 'SENT';
          }
          if (this.fieldMap.lastSent) {
            updatePayload.Last_Sent_At__c = now;
          }
          if (this.fieldMap.conversationUrl) {
            updatePayload.Glassix_Conversation_URL__c = glassixUrl;
          }

          // Set bounded audit trail in preferred field
          updatePayload[targetField] = nextAudit;

          await this.conn.sobject('Task').update(updatePayload);

          logger.debug(
            { taskId, maskedPhone, providerId, attempt, auditField: targetField },
            'Task marked completed'
          );
          return; // Success
        } catch (updateError: unknown) {
          lastError = updateError instanceof Error ? updateError : new Error(String(updateError));
          const errorMsg = lastError.message;

          // Check if it's a retryable error (UNABLE_TO_LOCK_ROW, 5xx, etc.)
          const isRetryable =
            errorMsg.includes('UNABLE_TO_LOCK_ROW') ||
            errorMsg.includes('SERVER_UNAVAILABLE') ||
            errorMsg.match(/5\d{2}/);

          if (!isRetryable || attempt >= maxAttempts) {
            logger.warn(
              { taskId, error: errorMsg, attempt },
              'Failed to update task to Completed (non-fatal)'
            );
            return; // Don't throw - message was sent successfully
          }

          // Retry with exponential backoff + jitter
          const delay =
            this.config.RETRY_BASE_MS * Math.pow(2, attempt - 1) +
            Math.floor(Math.random() * 100);
          logger.debug({ attempt, delay, taskId }, 'Retrying Task update');
          await sleep(delay);
        }
      }

      // All retries exhausted
      logger.warn(
        { taskId, error: lastError?.message },
        'Failed to update task to Completed after retries (non-fatal)'
      );
    } catch (error) {
      // Retrieve failed
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ taskId, error: errorMsg }, 'Failed to retrieve Task for update (non-fatal)');
    }
  }

  /**
   * Mark task as failed with error reason
   * - Truncates reason to MAX_FAILURE chars
   * - Sets Failure_Reason__c if available
   * - Optionally keeps Ready_for_Automation__c = true for retry
   * - Never throws (logs warnings and continues)
   */
  async markFailed(taskId: string, reason: string): Promise<void> {
    // Clean error: no stack traces, truncate to MAX_FAILURE chars
    const cleanReason = truncate(reason, MAX_FAILURE);

    try {
      // Build update payload with only available fields
      const updatePayload: Record<string, unknown> & { Id: string } = {
        Id: taskId,
        Status: 'Waiting on External',
      };

      if (this.fieldMap.failureReason) {
        updatePayload.Failure_Reason__c = cleanReason;
      }

      if (this.config.KEEP_READY_ON_FAIL && this.fieldMap.readyForAutomation) {
        updatePayload.Ready_for_Automation__c = true;
      }

      await this.conn.sobject('Task').update(updatePayload);

      logger.debug({ taskId, reason: cleanReason }, 'Task marked failed');
    } catch (error) {
      // Check for INVALID_FIELD error
      const errorMsg = error instanceof Error ? error.message : String(error);

      if (errorMsg.includes('INVALID_FIELD') || errorMsg.includes('No such column')) {
        logger.error(
          { taskId, error: errorMsg },
          'Failed to update Task: Custom fields missing in Salesforce. ' +
            'Please create these optional fields: Failure_Reason__c (Text), ' +
            'Ready_for_Automation__c (Checkbox). ' +
            'See README.md#salesforce-setup for details.'
        );
      } else {
        logger.warn({ taskId, error: errorMsg }, 'Failed to update task to Waiting (non-fatal)');
      }
      // Don't throw - continue processing other tasks
    }
  }
}

/**
 * Build field map from availableFields Set (once per run)
 * Converts Set lookups to pre-computed boolean flags for performance
 */
export function buildFieldMap(availableFields: Set<string>): TaskFieldMap {
  return {
    deliveryStatus: availableFields.has('Delivery_Status__c'),
    lastSent: availableFields.has('Last_Sent_At__c'),
    conversationUrl: availableFields.has('Glassix_Conversation_URL__c'),
    failureReason: availableFields.has('Failure_Reason__c'),
    readyForAutomation: availableFields.has('Ready_for_Automation__c'),
    auditTrail: availableFields.has('Audit_Trail__c'),
  };
}

