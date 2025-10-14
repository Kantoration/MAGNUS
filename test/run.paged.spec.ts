/**
 * Tests for orchestrator paged mode - verify queryMore paging works correctly
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearConfigCache } from '../src/config.js';

describe('Run Orchestrator - Paged Mode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
    process.env.GLASSIX_API_KEY = 'test-key';
    process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
    process.env.SF_USERNAME = 'test@example.com';
    process.env.SF_PASSWORD = 'password';
    process.env.SF_TOKEN = 'token';
    process.env.TASK_CUSTOM_PHONE_FIELD = 'Phone__c';
    process.env.LOG_LEVEL = 'error';
    process.env.XSLX_MAPPING_PATH = './massege_maping.xlsx';
    process.env.PAGED = '1'; // Enable paged mode
    delete process.env.DRY_RUN;

    clearConfigCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
    vi.restoreAllMocks();
  });

  it('should process multiple pages and aggregate stats correctly', async () => {
    const { runOnce } = await import('../src/run.js');
    const sf = await import('../src/sf.js');
    const glassix = await import('../src/glassix.js');
    const templates = await import('../src/templates.js');

    const mockConn = {
      login: vi.fn(),
      sobject: vi.fn(() => ({
        retrieve: vi.fn().mockResolvedValue({ Audit_Trail__c: '' }),
        update: vi.fn().mockResolvedValue({ success: true }),
      })),
      logout: vi.fn(),
      userInfo: { id: 'user-123' },
    };

    vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);
    vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(
      new Set(['Id', 'Status', 'Audit_Trail__c', 'Delivery_Status__c'])
    );

    // Mock async generator to yield 2 pages
    async function* mockPages() {
      // Page 1: 2 tasks
      yield [
        {
          Id: 'task-page1-1',
          Status: 'Not Started',
          Task_Type_Key__c: 'TEST_KEY',
          Phone__c: '+972521111111',
        },
        {
          Id: 'task-page1-2',
          Status: 'Not Started',
          Task_Type_Key__c: 'TEST_KEY',
          Phone__c: '+972522222222',
        },
      ];

      // Page 2: 1 task
      yield [
        {
          Id: 'task-page2-1',
          Status: 'Not Started',
          Task_Type_Key__c: 'TEST_KEY',
          Phone__c: '+972523333333',
        },
      ];
    }

    vi.spyOn(sf, 'fetchPendingTasksPaged').mockReturnValue(mockPages() as any);

    vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
      new Map([['test_key', { name: 'test_key', englishMessage: 'Test' }]]) as any
    );
    vi.spyOn(templates, 'pickTemplate').mockReturnValue({ name: 'test_key' } as any);
    vi.spyOn(templates, 'renderMessage').mockReturnValue({ text: 'Test', viaGlassixTemplate: undefined });

    vi.spyOn(glassix, 'sendWhatsApp').mockResolvedValue({
      conversationUrl: 'https://glassix.com/conv/1',
      providerId: 'msg-1',
    });

    const stats = await runOnce();

    // Should process all 3 tasks across 2 pages
    expect(stats.tasks).toBe(3);
    expect(stats.sent).toBe(3);
    expect(stats.failed).toBe(0);
    expect(stats.skipped).toBe(0);

    // Verify all tasks were sent
    expect(glassix.sendWhatsApp).toHaveBeenCalledTimes(3);
    expect(glassix.sendWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ toE164: '+972521111111' })
    );
    expect(glassix.sendWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ toE164: '+972522222222' })
    );
    expect(glassix.sendWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({ toE164: '+972523333333' })
    );

    expect(mockConn.logout).toHaveBeenCalled();
  });

  it('should handle empty pages gracefully', async () => {
    const { runOnce } = await import('../src/run.js');
    const sf = await import('../src/sf.js');
    const templates = await import('../src/templates.js');

    const mockConn = {
      login: vi.fn(),
      sobject: vi.fn(),
      logout: vi.fn(),
      userInfo: { id: 'user-123' },
    };

    vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);
    vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(new Set(['Id']));

    // Mock async generator with no tasks
    async function* mockEmptyPages() {
      yield [];
    }

    vi.spyOn(sf, 'fetchPendingTasksPaged').mockReturnValue(mockEmptyPages() as any);
    vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(new Map());

    const stats = await runOnce();

    // Should handle empty gracefully
    expect(stats.tasks).toBe(0);
    expect(stats.sent).toBe(0);

    expect(mockConn.logout).toHaveBeenCalled();
  });

  it('should process pages with mixed success and failures', async () => {
    const { runOnce } = await import('../src/run.js');
    const sf = await import('../src/sf.js');
    const glassix = await import('../src/glassix.js');
    const templates = await import('../src/templates.js');

    const mockConn = {
      login: vi.fn(),
      sobject: vi.fn(() => ({
        retrieve: vi.fn().mockResolvedValue({ Audit_Trail__c: '' }),
        update: vi.fn().mockResolvedValue({ success: true }),
      })),
      logout: vi.fn(),
      userInfo: { id: 'user-123' },
    };

    vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);
    vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(
      new Set(['Id', 'Status', 'Audit_Trail__c', 'Failure_Reason__c'])
    );

    // Mock async generator with 2 pages
    async function* mockMixedPages() {
      yield [
        {
          Id: 'task-success',
          Status: 'Not Started',
          Task_Type_Key__c: 'TEST_KEY',
          Phone__c: '+972521111111',
        },
        {
          Id: 'task-fail',
          Status: 'Not Started',
          Task_Type_Key__c: 'TEST_KEY',
          Phone__c: '+972522222222',
        },
      ];
    }

    vi.spyOn(sf, 'fetchPendingTasksPaged').mockReturnValue(mockMixedPages() as any);

    vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
      new Map([['test_key', { name: 'test_key' }]]) as any
    );
    vi.spyOn(templates, 'pickTemplate').mockReturnValue({} as any);
    vi.spyOn(templates, 'renderMessage').mockReturnValue({ text: 'Test', viaGlassixTemplate: undefined });

    // First succeeds, second fails
    vi.spyOn(glassix, 'sendWhatsApp')
      .mockResolvedValueOnce({ conversationUrl: 'https://glassix.com/conv/1', providerId: 'msg-1' })
      .mockRejectedValueOnce(new Error('Send failed'));

    const stats = await runOnce();

    // Should have 1 success, 1 failure
    expect(stats.tasks).toBe(2);
    expect(stats.sent).toBe(1);
    expect(stats.failed).toBe(1);
  });
});

