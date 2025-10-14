/**
 * Tests for Salesforce Task Updater
 * Verifies field-aware updates, retry logic, and error handling
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SalesforceTaskUpdater, buildFieldMap, type TaskFieldMap } from '../src/sf-updater.js';
import type { Config } from '../src/config.js';
import type { SendResult } from '../src/glassix.js';

describe('SalesforceTaskUpdater', () => {
  const mockConfig: Config = {
    SF_LOGIN_URL: 'https://test.salesforce.com',
    SF_USERNAME: 'test@example.com',
    SF_PASSWORD: 'password',
    SF_TOKEN: 'token',
    GLASSIX_BASE_URL: 'https://api.glassix.com',
    GLASSIX_API_KEY: 'test-key',
    GLASSIX_API_MODE: 'messages',
    GLASSIX_TIMEOUT_MS: 15000,
    SAFE_MODE_STRICT: true,
    ALLOW_LEGACY_BEARER: false,
    RETRY_ATTEMPTS: 3,
    RETRY_BASE_MS: 300,
    TASKS_QUERY_LIMIT: 200,
    TASK_CUSTOM_PHONE_FIELD: 'Phone__c',
    XSLX_MAPPING_PATH: './test.xlsx',
    DEFAULT_LANG: 'he' as const,
    LOG_LEVEL: 'error' as const,
    KEEP_READY_ON_FAIL: true,
    PERMIT_LANDLINES: false,
    PAGED: false,
    METRICS_ENABLED: false,
    METRICS_PORT: 9090,
  };

  let mockConn: any;
  let fieldMap: TaskFieldMap;
  let updater: SalesforceTaskUpdater;

  beforeEach(() => {
    // Create mock connection
    mockConn = {
      sobject: vi.fn(() => ({
        retrieve: vi.fn(),
        update: vi.fn(),
      })),
    };

    // Default field map with all fields available
    fieldMap = {
      deliveryStatus: true,
      lastSent: true,
      conversationUrl: true,
      failureReason: true,
      readyForAutomation: true,
      auditTrail: true,
    };

    updater = new SalesforceTaskUpdater(mockConn, fieldMap, mockConfig);
  });

  describe('buildFieldMap', () => {
    it('should build field map from availableFields Set', () => {
      const availableFields = new Set([
        'Delivery_Status__c',
        'Last_Sent_At__c',
        'Glassix_Conversation_URL__c',
        'Audit_Trail__c',
      ]);

      const map = buildFieldMap(availableFields);

      expect(map.deliveryStatus).toBe(true);
      expect(map.lastSent).toBe(true);
      expect(map.conversationUrl).toBe(true);
      expect(map.auditTrail).toBe(true);
      expect(map.failureReason).toBe(false);
      expect(map.readyForAutomation).toBe(false);
    });

    it('should handle empty availableFields Set', () => {
      const map = buildFieldMap(new Set());

      expect(map.deliveryStatus).toBe(false);
      expect(map.lastSent).toBe(false);
      expect(map.conversationUrl).toBe(false);
      expect(map.auditTrail).toBe(false);
      expect(map.failureReason).toBe(false);
      expect(map.readyForAutomation).toBe(false);
    });
  });

  describe('markCompleted', () => {
    it('should update task with all available fields', async () => {
      const taskId = 'task-123';
      const details = {
        phoneE164: '+972521234567',
        sendResult: {
          providerId: 'msg-456',
          conversationUrl: 'https://app.glassix.com/c/456',
        } as SendResult,
      };

      const mockRetrieve = vi.fn().mockResolvedValue({
        Audit_Trail__c: 'Previous audit',
      });
      const mockUpdate = vi.fn().mockResolvedValue({ success: true });

      mockConn.sobject.mockReturnValue({
        retrieve: mockRetrieve,
        update: mockUpdate,
      });

      await updater.markCompleted(taskId, details);

      expect(mockRetrieve).toHaveBeenCalledWith(taskId);
      expect(mockUpdate).toHaveBeenCalled();

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.Id).toBe(taskId);
      expect(updateCall.Status).toBe('Completed');
      expect(updateCall.Delivery_Status__c).toBe('SENT');
      expect(updateCall.Last_Sent_At__c).toBeDefined();
      expect(updateCall.Glassix_Conversation_URL__c).toBe('https://app.glassix.com/c/456');
      expect(updateCall.Audit_Trail__c).toContain('WhatsApp →');
      expect(updateCall.Audit_Trail__c).toContain('msg-456');
    });

    it('should only set fields present in fieldMap', async () => {
      // Limited field map
      const limitedFieldMap: TaskFieldMap = {
        deliveryStatus: false,
        lastSent: true,
        conversationUrl: false,
        failureReason: false,
        readyForAutomation: false,
        auditTrail: false,
      };

      const limitedUpdater = new SalesforceTaskUpdater(mockConn, limitedFieldMap, mockConfig);

      const mockRetrieve = vi.fn().mockResolvedValue({
        Description: 'Previous description',
      });
      const mockUpdate = vi.fn().mockResolvedValue({ success: true });

      mockConn.sobject.mockReturnValue({
        retrieve: mockRetrieve,
        update: mockUpdate,
      });

      await limitedUpdater.markCompleted('task-456', {
        phoneE164: '+972521234567',
        sendResult: { providerId: 'msg-789' } as SendResult,
      });

      const updateCall = mockUpdate.mock.calls[0][0];
      
      // Should set Last_Sent_At__c (available)
      expect(updateCall.Last_Sent_At__c).toBeDefined();
      
      // Should NOT set Delivery_Status__c (not available)
      expect(updateCall.Delivery_Status__c).toBeUndefined();
      
      // Should NOT set Glassix_Conversation_URL__c (not available)
      expect(updateCall.Glassix_Conversation_URL__c).toBeUndefined();
      
      // Should use Description instead of Audit_Trail__c
      expect(updateCall.Description).toBeDefined();
      expect(updateCall.Audit_Trail__c).toBeUndefined();
    });

    it('should never throw on SF update error', async () => {
      const mockRetrieve = vi.fn().mockResolvedValue({});
      const mockUpdate = vi.fn().mockRejectedValue(new Error('INVALID_FIELD'));

      mockConn.sobject.mockReturnValue({
        retrieve: mockRetrieve,
        update: mockUpdate,
      });

      // Should not throw
      await expect(
        updater.markCompleted('task-error', {
          phoneE164: '+972521234567',
          sendResult: { providerId: 'msg-error' } as SendResult,
        })
      ).resolves.not.toThrow();
    });

    it('should retry on UNABLE_TO_LOCK_ROW error', async () => {
      const mockRetrieve = vi.fn().mockResolvedValue({
        Audit_Trail__c: '',
      });
      
      const mockUpdate = vi
        .fn()
        .mockRejectedValueOnce(new Error('UNABLE_TO_LOCK_ROW'))
        .mockResolvedValueOnce({ success: true });

      mockConn.sobject.mockReturnValue({
        retrieve: mockRetrieve,
        update: mockUpdate,
      });

      await updater.markCompleted('task-retry', {
        phoneE164: '+972521234567',
        sendResult: { providerId: 'msg-retry' } as SendResult,
      });

      // Should have retried
      expect(mockUpdate).toHaveBeenCalledTimes(2);
    });

    it('should use Description if Audit_Trail__c not available', async () => {
      const noAuditFieldMap: TaskFieldMap = {
        ...fieldMap,
        auditTrail: false,
      };

      const noAuditUpdater = new SalesforceTaskUpdater(mockConn, noAuditFieldMap, mockConfig);

      const mockRetrieve = vi.fn().mockResolvedValue({
        Description: 'Existing description',
      });
      const mockUpdate = vi.fn().mockResolvedValue({ success: true });

      mockConn.sobject.mockReturnValue({
        retrieve: mockRetrieve,
        update: mockUpdate,
      });

      await noAuditUpdater.markCompleted('task-desc', {
        phoneE164: '+972521234567',
        sendResult: { providerId: 'msg-desc' } as SendResult,
      });

      const updateCall = mockUpdate.mock.calls[0][0];
      
      expect(updateCall.Description).toBeDefined();
      expect(updateCall.Audit_Trail__c).toBeUndefined();
      expect(updateCall.Description).toContain('Existing description');
      expect(updateCall.Description).toContain('WhatsApp →');
    });

    it('should mask phone number in audit trail', async () => {
      const mockRetrieve = vi.fn().mockResolvedValue({
        Audit_Trail__c: '',
      });
      const mockUpdate = vi.fn().mockResolvedValue({ success: true });

      mockConn.sobject.mockReturnValue({
        retrieve: mockRetrieve,
        update: mockUpdate,
      });

      await updater.markCompleted('task-mask', {
        phoneE164: '+972521234567',
        sendResult: { providerId: 'msg-mask' } as SendResult,
      });

      const updateCall = mockUpdate.mock.calls[0][0];
      
      // Should contain masked phone (not full number)
      expect(updateCall.Audit_Trail__c).toContain('+9725');
      expect(updateCall.Audit_Trail__c).toContain('67'); // Last 2 digits
      expect(updateCall.Audit_Trail__c).toContain('****'); // Masked middle
      expect(updateCall.Audit_Trail__c).not.toContain('12345'); // Middle digits should be masked
    });
  });

  describe('markFailed', () => {
    it('should update task with failure reason if available', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ success: true });

      mockConn.sobject.mockReturnValue({
        update: mockUpdate,
      });

      await updater.markFailed('task-fail', 'Test error message');

      expect(mockUpdate).toHaveBeenCalled();

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.Id).toBe('task-fail');
      expect(updateCall.Status).toBe('Waiting on External');
      expect(updateCall.Failure_Reason__c).toBe('Test error message');
      expect(updateCall.Ready_for_Automation__c).toBe(true); // KEEP_READY_ON_FAIL=true
    });

    it('should truncate long failure reasons to MAX_FAILURE', async () => {
      const mockUpdate = vi.fn().mockResolvedValue({ success: true });

      mockConn.sobject.mockReturnValue({
        update: mockUpdate,
      });

      const longReason = 'A'.repeat(2000); // Way over 1000 char limit

      await updater.markFailed('task-long', longReason);

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.Failure_Reason__c.length).toBeLessThanOrEqual(1000);
    });

    it('should not set Failure_Reason__c if not in fieldMap', async () => {
      const noFailureFieldMap: TaskFieldMap = {
        ...fieldMap,
        failureReason: false,
      };

      const noFailureUpdater = new SalesforceTaskUpdater(mockConn, noFailureFieldMap, mockConfig);

      const mockUpdate = vi.fn().mockResolvedValue({ success: true });

      mockConn.sobject.mockReturnValue({
        update: mockUpdate,
      });

      await noFailureUpdater.markFailed('task-no-failure', 'Error message');

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.Failure_Reason__c).toBeUndefined();
    });

    it('should not set Ready_for_Automation__c if KEEP_READY_ON_FAIL=false', async () => {
      const configNoKeep: Config = {
        ...mockConfig,
        KEEP_READY_ON_FAIL: false,
      };

      const noKeepUpdater = new SalesforceTaskUpdater(mockConn, fieldMap, configNoKeep);

      const mockUpdate = vi.fn().mockResolvedValue({ success: true });

      mockConn.sobject.mockReturnValue({
        update: mockUpdate,
      });

      await noKeepUpdater.markFailed('task-no-keep', 'Error');

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.Ready_for_Automation__c).toBeUndefined();
    });

    it('should never throw on SF update error', async () => {
      const mockUpdate = vi.fn().mockRejectedValue(new Error('INVALID_FIELD'));

      mockConn.sobject.mockReturnValue({
        update: mockUpdate,
      });

      // Should not throw
      await expect(
        updater.markFailed('task-error', 'Test error')
      ).resolves.not.toThrow();
    });

    it('should handle No such column error gracefully', async () => {
      const mockUpdate = vi.fn().mockRejectedValue(new Error('No such column: Failure_Reason__c'));

      mockConn.sobject.mockReturnValue({
        update: mockUpdate,
      });

      // Should not throw
      await expect(
        updater.markFailed('task-no-column', 'Test error')
      ).resolves.not.toThrow();
    });
  });

  describe('audit trail truncation', () => {
    it('should keep audit trail under MAX_DESC (32000 chars)', async () => {
      const mockRetrieve = vi.fn().mockResolvedValue({
        Audit_Trail__c: 'A'.repeat(32000), // Already at limit
      });
      const mockUpdate = vi.fn().mockResolvedValue({ success: true });

      mockConn.sobject.mockReturnValue({
        retrieve: mockRetrieve,
        update: mockUpdate,
      });

      await updater.markCompleted('task-truncate', {
        phoneE164: '+972521234567',
        sendResult: { providerId: 'msg-truncate' } as SendResult,
      });

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.Audit_Trail__c.length).toBeLessThanOrEqual(32000);
    });

    it('should preserve first line in long audit trails', async () => {
      const firstLine = '[2024-01-01T00:00:00.000Z] Task created';
      // Need > MAX_AUDIT_LINES (100) AND > MAX_DESC (32000 chars) to trigger first+last truncation
      // Create 150 lines with ~250 chars each = ~37,500 chars total
      const manyLines = Array.from(
        { length: 150 },
        (_, i) => `[Line ${i}] ${'A'.repeat(230)} Some audit entry with lots of text to make it longer`
      ).join('\n');
      const longAudit = firstLine + '\n' + manyLines;

      const mockRetrieve = vi.fn().mockResolvedValue({
        Audit_Trail__c: longAudit,
      });
      const mockUpdate = vi.fn().mockResolvedValue({ success: true });

      mockConn.sobject.mockReturnValue({
        retrieve: mockRetrieve,
        update: mockUpdate,
      });

      await updater.markCompleted('task-preserve', {
        phoneE164: '+972521234567',
        sendResult: { providerId: 'msg-preserve' } as SendResult,
      });

      const updateCall = mockUpdate.mock.calls[0][0];
      
      // Should still contain the first line
      expect(updateCall.Audit_Trail__c).toContain('[2024-01-01T00:00:00.000Z] Task created');
      
      // Should contain the separator
      expect(updateCall.Audit_Trail__c).toContain('...');
      
      // Should NOT contain early middle lines (they were truncated)
      expect(updateCall.Audit_Trail__c).not.toContain('[Line 10]');
      
      // Should be under MAX_DESC
      expect(updateCall.Audit_Trail__c.length).toBeLessThanOrEqual(32000);
    });
  });
});

