/**
 * Tests for orchestrator error scenarios - invalid phone, missing template, send failures
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearConfigCache } from '../src/config.js';

describe('Run Orchestrator - Error Scenarios', () => {
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
    delete process.env.DRY_RUN;

    clearConfigCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
    vi.restoreAllMocks();
  });

  it('should skip task with missing/invalid phone and call failTask', async () => {
    // Import modules first
    const sf = await import('../src/sf.js');
    const templates = await import('../src/templates.js');
    
    const mockUpdate = vi.fn().mockResolvedValue({ success: true });
    const mockConn = {
      login: vi.fn(),
      sobject: vi.fn(() => ({ update: mockUpdate })),
      logout: vi.fn(),
      userInfo: { id: 'user-123' },
    };

    // Set up all mocks before importing runOnce
    vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);
    vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(
      new Set(['Id', 'Status', 'Failure_Reason__c', 'Ready_for_Automation__c'])
    );

    // Task with invalid phone (landline when PERMIT_LANDLINES=false)
    vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([
      {
        Id: 'task-no-phone',
        Status: 'Not Started',
        Task_Type_Key__c: 'TEST_KEY',
        Phone__c: '0312345678', // Landline
      },
    ] as any);

    vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
      new Map([['TEST_KEY', { name: 'TEST_KEY' }]]) as any
    );
    vi.spyOn(templates, 'pickTemplate').mockReturnValue({ name: 'TEST_KEY', hebrewMessage: 'test', englishMessage: 'test' } as any);

    // Import runOnce after mocks are set up
    const { runOnce } = await import('../src/run.js');
    const stats = await runOnce();

    // Should skip the task
    expect(stats.tasks).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.sent).toBe(0);
    expect(stats.failed).toBe(0);

    // Should call failTask with "Missing/invalid phone" reason
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        Id: 'task-no-phone',
        Status: 'Waiting on External',
        Failure_Reason__c: expect.stringContaining('Missing/invalid phone'),
      })
    );
  });

  it('should skip task when template not found and call failTask', async () => {
    // Import modules first
    const sf = await import('../src/sf.js');
    const templates = await import('../src/templates.js');

    const mockUpdate = vi.fn().mockResolvedValue({ success: true });
    const mockConn = {
      login: vi.fn(),
      sobject: vi.fn(() => ({ update: mockUpdate })),
      logout: vi.fn(),
      userInfo: { id: 'user-123' },
    };

    // Set up mocks before importing runOnce
    vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);
    vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(
      new Set(['Id', 'Status', 'Failure_Reason__c'])
    );

    vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([
      {
        Id: 'task-no-template',
        Status: 'Not Started',
        Task_Type_Key__c: 'UNKNOWN_KEY',
        Phone__c: '+972521234567',
      },
    ] as any);

    vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(new Map());
    vi.spyOn(templates, 'pickTemplate').mockReturnValue(undefined);

    const { runOnce } = await import('../src/run.js');
    const stats = await runOnce();

    // Should skip
    expect(stats.skipped).toBe(1);

    // Should call failTask with "Template not found" reason
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        Id: 'task-no-template',
        Status: 'Waiting on External',
        Failure_Reason__c: expect.stringContaining('Template not found: UNKNOWN_KEY'),
      })
    );
  });

  it('should handle sendWhatsApp error and truncate to 1000 chars', async () => {
    // Import modules first
    const sf = await import('../src/sf.js');
    const glassix = await import('../src/glassix.js');
    const templates = await import('../src/templates.js');

    const mockUpdate = vi.fn().mockResolvedValue({ success: true });
    const mockConn = {
      login: vi.fn(),
      sobject: vi.fn(() => ({ update: mockUpdate })),
      logout: vi.fn(),
      userInfo: { id: 'user-123' },
    };

    vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);
    vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(
      new Set(['Id', 'Status', 'Failure_Reason__c'])
    );

    vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([
      {
        Id: 'task-send-fail',
        Status: 'Not Started',
        Task_Type_Key__c: 'TEST_KEY',
        Phone__c: '+972521234567',
      },
    ] as any);

    vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
      new Map([['TEST_KEY', { name: 'TEST_KEY', englishMessage: 'Test' }]]) as any
    );
    vi.spyOn(templates, 'pickTemplate').mockReturnValue({ name: 'TEST_KEY', hebrewMessage: 'test', englishMessage: 'Test' } as any);
    vi.spyOn(templates, 'renderMessage').mockReturnValue({ text: 'Test', viaGlassixTemplate: undefined });

    // Create a very long error message (> 1000 chars)
    const longError = 'Error: ' + 'x'.repeat(2000);
    vi.spyOn(glassix, 'sendWhatsApp').mockRejectedValue(new Error(longError));

    const { runOnce } = await import('../src/run.js');
    const stats = await runOnce();

    // Should mark as failed
    expect(stats.failed).toBe(1);
    expect(stats.sent).toBe(0);

    // Should truncate error to 1000 chars
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        Id: 'task-send-fail',
        Status: 'Waiting on External',
        Failure_Reason__c: expect.any(String),
      })
    );

    const failureReason = mockUpdate.mock.calls[0][0].Failure_Reason__c;
    expect(failureReason.length).toBeLessThanOrEqual(1000);
  });

  it('should keep Ready_for_Automation__c=true when KEEP_READY_ON_FAIL=true', async () => {
    process.env.KEEP_READY_ON_FAIL = 'true';
    clearConfigCache();

    // Import modules first
    const sf = await import('../src/sf.js');
    const glassix = await import('../src/glassix.js');
    const templates = await import('../src/templates.js');

    const mockUpdate = vi.fn().mockResolvedValue({ success: true });
    const mockConn = {
      login: vi.fn(),
      sobject: vi.fn(() => ({ update: mockUpdate })),
      logout: vi.fn(),
      userInfo: { id: 'user-123' },
    };

    vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);
    vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(
      new Set(['Id', 'Status', 'Failure_Reason__c', 'Ready_for_Automation__c'])
    );

    vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([
      {
        Id: 'task-fail-keep-ready',
        Status: 'Not Started',
        Task_Type_Key__c: 'TEST_KEY',
        Phone__c: '+972521234567',
      },
    ] as any);

    vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
      new Map([['TEST_KEY', { name: 'TEST_KEY' }]]) as any
    );
    vi.spyOn(templates, 'pickTemplate').mockReturnValue({ name: 'TEST_KEY', hebrewMessage: 'test' } as any);
    vi.spyOn(templates, 'renderMessage').mockReturnValue({ text: 'Test', viaGlassixTemplate: undefined });
    vi.spyOn(glassix, 'sendWhatsApp').mockRejectedValue(new Error('Send failed'));

    const { runOnce } = await import('../src/run.js');
    await runOnce();

    // Should keep Ready_for_Automation__c = true
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        Id: 'task-fail-keep-ready',
        Status: 'Waiting on External',
        Ready_for_Automation__c: true,
      })
    );
  });
});

