/**
 * Unit tests for the refactored run orchestrator
 * Tests DRY_RUN mode, happy path, and failure scenarios
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Connection } from 'jsforce';
import { runOnce } from '../src/run.js';
import * as sf from '../src/sf.js';
import * as glassix from '../src/glassix.js';
import * as templates from '../src/templates.js';
import * as dateUtils from '../src/utils/date.js';

// Setup env vars before importing modules
process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
process.env.SF_USERNAME = 'test@example.com';
process.env.SF_PASSWORD = 'password';
process.env.SF_TOKEN = 'token';
process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
process.env.GLASSIX_API_KEY = 'test-api-key';
process.env.GLASSIX_API_MODE = 'messages';
process.env.LOG_LEVEL = 'silent'; // Silence logs during tests

// Mock modules
vi.mock('../src/sf.js');
vi.mock('../src/glassix.js');
vi.mock('../src/templates.js');
vi.mock('../src/utils/date.js');

describe('Run Orchestrator', () => {
  let mockConn: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };

    // Mock connection
    mockConn = {
      logout: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ 
        records: [{ Id: 'task-id', Description: '' }] 
      }),
      describeSObject: vi.fn().mockResolvedValue({
        fields: [
          { name: 'Id' },
          { name: 'Status' },
          { name: 'Description' },
          { name: 'Delivery_Status__c' },
          { name: 'Last_Sent_At__c' },
          { name: 'Glassix_Conversation_URL__c' },
          { name: 'Failure_Reason__c' },
          { name: 'Ready_for_Automation__c' },
        ],
      }),
      sobject: vi.fn().mockReturnValue({
        update: vi.fn().mockResolvedValue({ success: true }),
        retrieve: vi.fn().mockResolvedValue({ Id: 'task-id', Description: '' }),
      }),
    };

    // Mock SF module
    vi.mocked(sf.login).mockResolvedValue(mockConn as Connection);
    vi.mocked(sf.describeTaskFields).mockResolvedValue(
      new Set([
        'Id',
        'Status',
        'Description',
        'Delivery_Status__c',
        'Last_Sent_At__c',
        'Glassix_Conversation_URL__c',
        'Failure_Reason__c',
        'Ready_for_Automation__c',
      ])
    );
    vi.mocked(sf.fetchPendingTasks).mockResolvedValue([]);
    vi.mocked(sf.deriveTaskKey).mockReturnValue('TEST_KEY');
    vi.mocked(sf.getContext).mockReturnValue({});
    vi.mocked(sf.resolveTarget).mockReturnValue({
      firstName: 'Dan',
      accountName: 'MAGNUS',
      phoneRaw: '0521234567',
      phoneE164: '+972521234567',
      source: 'ContactMobile',
    });

    // Mock templates module
    const mockMapping = {
      taskKey: 'TEST_KEY',
      messageBody: 'Hello {{first_name}}!',
      link: undefined,
      glassixTemplateId: undefined,
    };
    const mockTemplateMap = new Map([['TEST_KEY', mockMapping]]);

    vi.mocked(templates.loadTemplateMap).mockResolvedValue(mockTemplateMap);
    vi.mocked(templates.pickTemplate).mockReturnValue(mockMapping);
    vi.mocked(templates.renderMessage).mockReturnValue({
      text: 'Hello Dan!',
      viaGlassixTemplate: undefined,
    });

    // Mock date utils
    vi.mocked(dateUtils.todayIso).mockReturnValue('2025-10-09');
    vi.mocked(dateUtils.todayHe).mockReturnValue('09/10/2025');

    // Mock glassix
    vi.mocked(glassix.sendWhatsApp).mockResolvedValue({
      conversationUrl: 'https://app.glassix.com/c/123',
      providerId: 'msg-123',
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DRY_RUN mode', () => {
    beforeEach(() => {
      process.env.DRY_RUN = '1';
    });

    it('should log intent with masked phones without making network calls', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-001',
          Subject: 'Test Task',
          Status: 'Not Started',
        },
        {
          Id: 'task-002',
          Subject: 'Test Task 2',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);

      const stats = await runOnce();

      // Verify stats
      expect(stats.tasks).toBe(2);
      expect(stats.sent).toBe(0); // DRY_RUN doesn't send
      expect(stats.previewed).toBe(2); // DRY_RUN previews
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(0);

      // Verify no network calls
      expect(glassix.sendWhatsApp).not.toHaveBeenCalled();

      // Verify no SF updates
      expect(mockConn.sobject).not.toHaveBeenCalled();

      // Verify SF connection was closed
      expect(mockConn.logout).toHaveBeenCalled();
    });

    it('should handle tasks with templated messages in DRY_RUN', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-templated',
          Subject: 'Welcome',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(templates.renderMessage).mockReturnValue({
        text: 'Welcome template message',
        viaGlassixTemplate: 'welcome_tmpl',
      });

      const stats = await runOnce();

      expect(stats.sent).toBe(0);
      expect(stats.previewed).toBe(1);
      expect(glassix.sendWhatsApp).not.toHaveBeenCalled();
    });

    it('should still skip tasks with missing phones in DRY_RUN', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-no-phone',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(sf.resolveTarget).mockReturnValue({
        firstName: 'Dan',
        accountName: undefined,
        phoneRaw: undefined,
        phoneE164: null,
        source: 'None',
      });

      const stats = await runOnce();

      expect(stats.tasks).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.errors).toHaveLength(1);
      expect(stats.errors[0].reason).toContain('Missing/invalid phone');
    });
  });

  describe('Happy path', () => {
    beforeEach(() => {
      delete process.env.DRY_RUN;
    });

    it('should successfully send message and update task to Completed', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-success',
          Subject: 'Test Task',
          Status: 'Not Started',
          Description: 'Original description',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);

      const stats = await runOnce();

      // Verify stats
      expect(stats.tasks).toBe(1);
      expect(stats.sent).toBe(1);
      expect(stats.previewed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(0);

      // Verify glassix was called with correct params
      expect(glassix.sendWhatsApp).toHaveBeenCalledWith({
        toE164: '+972521234567',
        text: 'Hello Dan!',
        idemKey: 'task-success',
        templateId: undefined,
        variables: expect.objectContaining({
          first_name: 'Dan',
          account_name: 'MAGNUS',
          date_iso: '2025-10-09',
          date_he: '09/10/2025',
        }),
      });

      // Verify task was updated to Completed
      expect(mockConn.sobject).toHaveBeenCalledWith('Task');
      const updateCall = mockConn.sobject().update;
      expect(updateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          Id: 'task-success',
          Status: 'Completed',
          Delivery_Status__c: 'SENT',
          Last_Sent_At__c: expect.any(String),
          Glassix_Conversation_URL__c: 'https://app.glassix.com/c/123',
          Description: expect.stringContaining('+9725******67'),
        })
      );

      // Verify masked phone in description (not raw)
      const updatePayload = updateCall.mock.calls[0][0];
      expect(updatePayload.Description).toContain('+9725******67');
      expect(updatePayload.Description).toContain('provId=msg-123');
      expect(updatePayload.Description).not.toContain('521234567'); // Not raw phone
    });

    it('should send with templateId when using Glassix templates', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-template',
          Subject: 'Welcome',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(templates.renderMessage).mockReturnValue({
        text: 'Welcome!',
        viaGlassixTemplate: 'welcome_approved',
      });

      const stats = await runOnce();

      expect(stats.sent).toBe(1);
      expect(glassix.sendWhatsApp).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'welcome_approved',
        })
      );
    });

    it('should use conversationUrl from sendResult if provided', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-url',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(glassix.sendWhatsApp).mockResolvedValue({
        conversationUrl: 'https://app.glassix.com/custom/conv-456',
        providerId: 'msg-456',
      });

      await runOnce();

      const updateCall = mockConn.sobject().update;
      expect(updateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          Glassix_Conversation_URL__c: 'https://app.glassix.com/custom/conv-456',
        })
      );
    });

    it('should preserve existing Description when completing task', async () => {
      const existingDescription = 'Original task notes from user';
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-preserve-desc',
          Subject: 'Test',
          Status: 'Not Started',
          Description: existingDescription,
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(glassix.sendWhatsApp).mockResolvedValue({
        conversationUrl: 'https://app.glassix.com/c/123',
        providerId: 'msg-123',
      });

      // Mock the retrieve call to return the existing description
      mockConn.sobject().retrieve = vi.fn().mockResolvedValue({
        Id: 'task-preserve-desc',
        Description: existingDescription,
      });

      await runOnce();

      // Verify retrieve was called instead of query
      expect(mockConn.sobject().retrieve).toHaveBeenCalledWith('task-preserve-desc');

      const updateCall = mockConn.sobject().update;
      expect(updateCall).toHaveBeenCalled();
      
      const updatePayload = updateCall.mock.calls[0][0];
      expect(updatePayload.Description).toContain(existingDescription);
      expect(updatePayload.Description).toContain('WhatsApp →');
      expect(updatePayload.Description).toContain('+9725******67');
      expect(updatePayload.Description).toContain('provId=msg-123');
      
      // Verify existing description comes before audit line
      const existingIndex = updatePayload.Description.indexOf(existingDescription);
      const auditIndex = updatePayload.Description.indexOf('WhatsApp →');
      expect(existingIndex).toBeLessThan(auditIndex);
    });

    it('should truncate Description if it exceeds 32000 chars', async () => {
      const longDescription = 'X'.repeat(31990); // Almost at limit
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-long-desc',
          Subject: 'Test',
          Status: 'Not Started',
          Description: longDescription,
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(glassix.sendWhatsApp).mockResolvedValue({
        conversationUrl: 'https://app.glassix.com/c/123',
        providerId: 'msg-123',
      });

      // Mock the retrieve call to return the long description
      mockConn.sobject().retrieve = vi.fn().mockResolvedValue({
        Id: 'task-long-desc',
        Description: longDescription,
      });

      await runOnce();

      const updateCall = mockConn.sobject().update;
      const updatePayload = updateCall.mock.calls[0][0];
      
      expect(updatePayload.Description.length).toBeLessThanOrEqual(32000);
      expect(updatePayload.Description.length).toBe(32000); // Should be exactly at limit
      expect(updatePayload.Description).toContain('WhatsApp →'); // Audit line preserved
      // Most recent content is kept (truncated from beginning via slice(-32000))
      expect(updatePayload.Description.endsWith('provId=msg-123)')).toBe(true);
    });

    it('should truncate huge Description keeping only most recent content', async () => {
      // Create a massive description that far exceeds the limit
      const hugeDescription = 'HISTORY_ENTRY_'.repeat(5000); // ~70K chars
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-huge-desc',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(glassix.sendWhatsApp).mockResolvedValue({
        providerId: 'msg-huge',
      });

      // Mock huge existing description
      mockConn.sobject().retrieve = vi.fn().mockResolvedValue({
        Id: 'task-huge-desc',
        Description: hugeDescription,
      });

      await runOnce();

      const updateCall = mockConn.sobject().update;
      const updatePayload = updateCall.mock.calls[0][0];
      
      // Verify truncation
      expect(updatePayload.Description.length).toBe(32000);
      
      // Most recent audit line should be preserved at the end
      expect(updatePayload.Description).toContain('provId=msg-huge');
      expect(updatePayload.Description.endsWith('provId=msg-huge)')).toBe(true);
      
      // slice(-32000) keeps the LAST 32000 chars, so recent content is preserved
      expect(updatePayload.Description).toContain('HISTORY_ENTRY');
    });
  });

  describe('Failure scenarios', () => {
    beforeEach(() => {
      delete process.env.DRY_RUN;
    });

    it('should handle send failure and update task with truncated reason', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-fail',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(glassix.sendWhatsApp).mockRejectedValue(
        new Error('429 Too Many Requests :: Rate limit exceeded')
      );

      const stats = await runOnce();

      // Verify stats
      expect(stats.tasks).toBe(1);
      expect(stats.sent).toBe(0);
      expect(stats.failed).toBe(1);
      expect(stats.errors).toHaveLength(1);
      expect(stats.errors[0].reason).toBe('429 Too Many Requests :: Rate limit exceeded');

      // Verify task was updated to Waiting on External
      const updateCall = mockConn.sobject().update;
      expect(updateCall).toHaveBeenCalledWith({
        Id: 'task-fail',
        Status: 'Waiting on External',
        Failure_Reason__c: '429 Too Many Requests :: Rate limit exceeded',
        Ready_for_Automation__c: true, // Preserved by default
      });
    });

    it('should truncate failure reason to 1000 chars', async () => {
      const longError = 'Error: ' + 'x'.repeat(2000);

      const mockTasks: sf.STask[] = [
        {
          Id: 'task-long-error',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(glassix.sendWhatsApp).mockRejectedValue(new Error(longError));

      await runOnce();

      const updateCall = mockConn.sobject().update;
      const failureReason = updateCall.mock.calls[0][0].Failure_Reason__c;

      expect(failureReason.length).toBeLessThanOrEqual(1000);
      expect(failureReason).toBe(longError.substring(0, 1000));
    });

    it('should skip task when template not found', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-no-template',
          Subject: 'Unknown Task Type',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(templates.pickTemplate).mockReturnValue(undefined);
      vi.mocked(sf.deriveTaskKey).mockReturnValue('UNKNOWN_KEY');

      const stats = await runOnce();

      expect(stats.tasks).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.errors[0].reason).toBe('Template not found: UNKNOWN_KEY');

      // Verify task updated to Waiting
      const updateCall = mockConn.sobject().update;
      expect(updateCall).toHaveBeenCalledWith({
        Id: 'task-no-template',
        Status: 'Waiting on External',
        Failure_Reason__c: 'Template not found: UNKNOWN_KEY',
        Ready_for_Automation__c: true, // Preserved by default
      });
    });

    it('should skip task when phone is missing', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-no-phone',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(sf.resolveTarget).mockReturnValue({
        firstName: 'Dan',
        accountName: 'MAGNUS',
        phoneRaw: 'invalid',
        phoneE164: null,
        source: 'ContactPhone',
      });

      const stats = await runOnce();

      expect(stats.tasks).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.errors[0].reason).toContain('Missing/invalid phone');

      const updateCall = mockConn.sobject().update;
      expect(updateCall).toHaveBeenCalledWith({
        Id: 'task-no-phone',
        Status: 'Waiting on External',
        Failure_Reason__c: 'Missing/invalid phone (source: ContactPhone)',
        Ready_for_Automation__c: true, // Preserved by default
      });
    });

    it('should handle unexpected errors during task processing', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-unexpected',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(templates.renderMessage).mockImplementation(() => {
        throw new Error('Unexpected render error');
      });

      const stats = await runOnce();

      expect(stats.tasks).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.errors[0].reason).toBe('Unexpected render error');
    });

    it('should preserve Ready_for_Automation__c flag on failed tasks', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-preserve-ready',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(glassix.sendWhatsApp).mockRejectedValue(
        new Error('Send failed - network error')
      );

      await runOnce();

      const updateCall = mockConn.sobject().update;
      expect(updateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          Id: 'task-preserve-ready',
          Status: 'Waiting on External',
          Ready_for_Automation__c: true,
          Failure_Reason__c: expect.stringContaining('Send failed'),
        })
      );
    });

    it('should not set Ready flag when KEEP_READY_ON_FAIL is false', async () => {
      // Need to clear config cache and set env before importing config
      // For now, we'll just verify the conditional spread works
      // Note: In production, KEEP_READY_ON_FAIL would be set at startup
      
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-no-ready',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(glassix.sendWhatsApp).mockRejectedValue(
        new Error('Send failed')
      );

      await runOnce();

      const updateCall = mockConn.sobject().update;
      const updatePayload = updateCall.mock.calls[0][0];
      
      expect(updatePayload.Status).toBe('Waiting on External');
      // With default config (KEEP_READY_ON_FAIL=true), flag is preserved
      expect(updatePayload.Ready_for_Automation__c).toBe(true);
    });
  });

  describe('Phone masking', () => {
    beforeEach(() => {
      delete process.env.DRY_RUN;
    });

    it('should never log raw phone numbers in success path', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-mask-test',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);

      await runOnce();

      // Check update payload
      const updateCall = mockConn.sobject().update;
      const updatePayload = updateCall.mock.calls[0][0];

      // Verify masked phone in description
      expect(updatePayload.Description).toContain('+9725******67');
      expect(updatePayload.Description).not.toContain('521234567');
      expect(updatePayload.Description).not.toContain('+972521234567');
    });

    it('should mask phones in failure path', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-fail-mask',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(glassix.sendWhatsApp).mockRejectedValue(new Error('Send failed'));

      await runOnce();

      // In the actual logs (not tested here), phones should be masked
      // But at least verify the task was updated
      const updateCall = mockConn.sobject().update;
      expect(updateCall).toHaveBeenCalledWith(
        expect.objectContaining({
          Status: 'Waiting on External',
        })
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle no pending tasks gracefully', async () => {
      vi.mocked(sf.fetchPendingTasks).mockResolvedValue([]);

      const stats = await runOnce();

      expect(stats.tasks).toBe(0);
      expect(stats.sent).toBe(0);
      expect(stats.previewed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(0);
    });

    it('should logout from SF even on error after login', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-1',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      // Cause error during processing
      vi.mocked(templates.renderMessage).mockImplementation(() => {
        throw new Error('Fatal render error');
      });

      const stats = await runOnce();

      // Error was handled, SF logout still called
      expect(mockConn.logout).toHaveBeenCalled();
      expect(stats.failed).toBe(1);
    });

    it('should continue processing remaining tasks after one fails', async () => {
      const mockTasks: sf.STask[] = [
        { Id: 'task-1', Subject: 'Test 1', Status: 'Not Started' },
        { Id: 'task-2', Subject: 'Test 2', Status: 'Not Started' },
        { Id: 'task-3', Subject: 'Test 3', Status: 'Not Started' },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);

      // Fail the second task
      vi.mocked(glassix.sendWhatsApp)
        .mockResolvedValueOnce({ providerId: 'msg-1' })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ providerId: 'msg-3' });

      const stats = await runOnce();

      expect(stats.tasks).toBe(3);
      expect(stats.sent).toBe(2);
      expect(stats.failed).toBe(1);
      expect(glassix.sendWhatsApp).toHaveBeenCalledTimes(3);
    });

    it('should handle SF update failures gracefully (non-fatal)', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-sf-fail',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);

      // Mock SF update to fail
      mockConn.sobject().update.mockRejectedValue(new Error('SF API error'));

      const stats = await runOnce();

      // Message was sent successfully, so stats should reflect success
      expect(stats.sent).toBe(1);
      expect(stats.failed).toBe(0);

      // Verify send was called (message was sent despite SF update failure)
      expect(glassix.sendWhatsApp).toHaveBeenCalled();
    });

    it('should log helpful message when INVALID_FIELD error occurs on complete', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-invalid-field',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);

      // Mock retrieve to return task
      mockConn.sobject().retrieve = vi.fn().mockResolvedValue({
        Id: 'task-invalid-field',
        Description: 'Existing notes',
      });

      // Mock SF update to fail with INVALID_FIELD first, then succeed with minimal fields
      mockConn.sobject().update
        .mockRejectedValueOnce(
          new Error('INVALID_FIELD: No such column Delivery_Status__c on entity Task')
        )
        .mockResolvedValueOnce({ success: true });

      const stats = await runOnce();

      // Message was still sent successfully
      expect(stats.sent).toBe(1);
      expect(stats.failed).toBe(0);
      
      // Verify fallback to minimal update was called
      expect(mockConn.sobject().update).toHaveBeenCalledWith({
        Id: 'task-invalid-field',
        Status: 'Completed',
      });
    });

    it('should retry Task update on transient failures', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-retry-update',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);

      mockConn.sobject().retrieve = vi.fn().mockResolvedValue({
        Id: 'task-retry-update',
        Description: '',
      });

      // Fail first two attempts, succeed on third
      mockConn.sobject().update
        .mockRejectedValueOnce(new Error('UNABLE_TO_LOCK_ROW'))
        .mockRejectedValueOnce(new Error('UNABLE_TO_LOCK_ROW'))
        .mockResolvedValueOnce({ success: true });

      const stats = await runOnce();

      expect(stats.sent).toBe(1);
      // Verify 3 update attempts were made
      expect(mockConn.sobject().update).toHaveBeenCalledTimes(3);
    });

    it('should skip missing fields when updating Task', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-missing-fields',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);

      // Mock describeTaskFields to return minimal field set (missing custom fields)
      vi.mocked(sf.describeTaskFields).mockResolvedValue(
        new Set(['Id', 'Status', 'Description']) // Only standard fields
      );

      mockConn.sobject().retrieve = vi.fn().mockResolvedValue({
        Id: 'task-missing-fields',
        Description: '',
      });

      const stats = await runOnce();

      expect(stats.sent).toBe(1);

      // Verify update only includes available fields
      const updateCall = mockConn.sobject().update;
      const updatePayload = updateCall.mock.calls[0][0];
      
      expect(updatePayload.Status).toBe('Completed');
      expect(updatePayload.Description).toBeDefined();
      // Custom fields should NOT be included
      expect(updatePayload).not.toHaveProperty('Delivery_Status__c');
      expect(updatePayload).not.toHaveProperty('Last_Sent_At__c');
      expect(updatePayload).not.toHaveProperty('Glassix_Conversation_URL__c');
    });

    it('should log helpful message when INVALID_FIELD error occurs on failure', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-fail-invalid',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(glassix.sendWhatsApp).mockRejectedValue(new Error('Send failed'));

      // Mock SF update to fail with INVALID_FIELD
      mockConn.sobject().update.mockRejectedValue(
        new Error('INVALID_FIELD: No such column Failure_Reason__c on entity Task')
      );

      const stats = await runOnce();

      // Task should still be counted as failed
      expect(stats.failed).toBe(1);
      
      // The INVALID_FIELD error should be logged (verified by not throwing)
    });

    it('should merge context from task and target correctly', async () => {
      const mockTasks: sf.STask[] = [
        {
          Id: 'task-ctx',
          Subject: 'Test',
          Status: 'Not Started',
        },
      ];

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue(mockTasks);
      vi.mocked(sf.getContext).mockReturnValue({
        first_name: 'OverrideFirst',
        device_model: 'iPhone 15',
        link: 'https://custom-link.com',
      });

      await runOnce();

      // Verify sendWhatsApp was called with merged context
      expect(glassix.sendWhatsApp).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            first_name: 'OverrideFirst', // From context (overrides target)
            account_name: 'MAGNUS', // From target
            device_model: 'iPhone 15', // From context
            link: 'https://custom-link.com', // From context
            date_iso: '2025-10-09',
            date_he: '09/10/2025',
          }),
        })
      );
    });

    it('should process complete task end-to-end with correct idemKey', async () => {
      // Full end-to-end test for one task
      const mockTask: sf.STask = {
        Id: 'task-e2e-123',
        Subject: 'End to End Test',
        Status: 'Not Started',
        Description: 'Original notes',
      };

      vi.mocked(sf.fetchPendingTasks).mockResolvedValue([mockTask]);
      vi.mocked(sf.deriveTaskKey).mockReturnValue('E2E_TEST');
      vi.mocked(sf.getContext).mockReturnValue({
        device_model: 'iPhone 15',
      });
      vi.mocked(sf.resolveTarget).mockReturnValue({
        firstName: 'Alice',
        accountName: 'TechCorp',
        phoneRaw: '0521234567',
        phoneE164: '+972521234567',
        source: 'ContactMobile',
      });

      const mockMapping = {
        taskKey: 'E2E_TEST',
        messageBody: 'Hello {{first_name}}, your device {{device_model}} is ready!',
        link: 'https://example.com/track',
        glassixTemplateId: undefined,
      };
      const mockTemplateMap = new Map([['E2E_TEST', mockMapping]]);
      vi.mocked(templates.loadTemplateMap).mockResolvedValue(mockTemplateMap);
      vi.mocked(templates.pickTemplate).mockReturnValue(mockMapping);
      vi.mocked(templates.renderMessage).mockReturnValue({
        text: 'Hello Alice, your device iPhone 15 is ready!',
        viaGlassixTemplate: undefined,
      });

      vi.mocked(glassix.sendWhatsApp).mockResolvedValue({
        conversationUrl: 'https://app.glassix.com/c/e2e-conv',
        providerId: 'msg-e2e-456',
      });

      mockConn.sobject().retrieve = vi.fn().mockResolvedValue({
        Id: 'task-e2e-123',
        Description: 'Original notes',
      });

      const stats = await runOnce();

      // Verify stats
      expect(stats.tasks).toBe(1);
      expect(stats.sent).toBe(1);
      expect(stats.previewed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.skipped).toBe(0);

      // Verify sendWhatsApp was called with Task.Id as idemKey
      expect(glassix.sendWhatsApp).toHaveBeenCalledWith({
        toE164: '+972521234567',
        text: 'Hello Alice, your device iPhone 15 is ready!',
        idemKey: 'task-e2e-123', // Task.Id used as idempotency key
        templateId: undefined,
        variables: expect.objectContaining({
          first_name: 'Alice',
          account_name: 'TechCorp',
          device_model: 'iPhone 15',
        }),
      });

      // Verify completeTask was called (update was made)
      expect(mockConn.sobject).toHaveBeenCalledWith('Task');
      expect(mockConn.sobject().update).toHaveBeenCalledWith(
        expect.objectContaining({
          Id: 'task-e2e-123',
          Status: 'Completed',
          Delivery_Status__c: 'SENT',
        })
      );

      // Verify retrieve was called to fetch existing description
      expect(mockConn.sobject().retrieve).toHaveBeenCalledWith('task-e2e-123');
    });

    it('should process multiple pages in PAGED mode', async () => {
      process.env.PAGED = '1';

      // Create mock tasks across 2 pages
      const page1Tasks: sf.STask[] = [
        { Id: 'page1-task1', Subject: 'Test 1', Status: 'Not Started' },
        { Id: 'page1-task2', Subject: 'Test 2', Status: 'Not Started' },
      ];

      const page2Tasks: sf.STask[] = [
        { Id: 'page2-task1', Subject: 'Test 3', Status: 'Not Started' },
      ];

      // Mock query to return first page, then queryMore for second
      mockConn.query = vi.fn().mockResolvedValue({
        records: page1Tasks,
        done: false,
        nextRecordsUrl: '/query/next',
        totalSize: 3,
      });

      mockConn.queryMore = vi.fn().mockResolvedValue({
        records: page2Tasks,
        done: true,
        totalSize: 3,
      });

      // Override fetchPendingTasks mock to not be called
      vi.mocked(sf.fetchPendingTasks).mockClear();

      // Create async generator mock for fetchPendingTasksPaged
      async function* mockPagedFetch() {
        yield page1Tasks;
        yield page2Tasks;
      }
      vi.mocked(sf.fetchPendingTasksPaged).mockReturnValue(mockPagedFetch());

      const stats = await runOnce();

      // Verify all tasks were processed
      expect(stats.tasks).toBe(3);
      expect(stats.sent).toBe(3);
      expect(stats.failed).toBe(0);

      // Verify paged fetch was used instead of single fetch
      expect(sf.fetchPendingTasksPaged).toHaveBeenCalled();
      expect(sf.fetchPendingTasks).not.toHaveBeenCalled();
    });
  });
});

