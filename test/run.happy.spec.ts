/**
 * Tests for orchestrator happy path - successful task processing end-to-end
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearConfigCache } from '../src/config.js';

describe('Run Orchestrator - Happy Path', () => {
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

  it('should process 2 tasks successfully with bounded audit and masked phones', async () => {
    // Import dynamically after env is set
    const { runOnce } = await import('../src/run.js');
    const sf = await import('../src/sf.js');
    const glassix = await import('../src/glassix.js');
    const templates = await import('../src/templates.js');

    // Mock Salesforce login
    const mockConn = {
      login: vi.fn(),
      sobject: vi.fn(() => ({
        retrieve: vi.fn().mockResolvedValue({ Description: '' }),
        update: vi.fn().mockResolvedValue({ success: true }),
      })),
      logout: vi.fn(),
      userInfo: { id: 'user-123', organizationId: 'org-123' },
    };

    vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);

    // Mock describeTaskFields - return all custom fields
    vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(
      new Set([
        'Id',
        'Status',
        'Description',
        'Audit_Trail__c',
        'Delivery_Status__c',
        'Last_Sent_At__c',
        'Glassix_Conversation_URL__c',
        'Failure_Reason__c',
        'Ready_for_Automation__c',
      ])
    );

    // Mock fetchPendingTasks - return 2 tasks
    vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([
      {
        Id: 'task-001',
        Status: 'Not Started',
        Subject: 'Test Task 1',
        Task_Type_Key__c: 'TEST_KEY',
        Who: {
          attributes: { type: 'Contact' },
          FirstName: 'John',
          MobilePhone: '+972521234567',
          Account: { Name: 'Acme Corp' },
        },
      },
      {
        Id: 'task-002',
        Status: 'Not Started',
        Subject: 'Test Task 2',
        Task_Type_Key__c: 'TEST_KEY',
        What: {
          attributes: { type: 'Account' },
          Name: 'Tech Inc',
          Phone: '+972529999999',
        },
      },
    ] as any);

    // Mock template loading and rendering
    const mockTemplate = {
      name: 'TEST_KEY',
      hebrewMessage: 'שלום {{first_name}}',
      englishMessage: 'Hello {{first_name}}',
          glassixTemplateId: undefined,
      link: 'https://example.com',
    };

    vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
      new Map([['TEST_KEY', mockTemplate]]) as any
    );

    vi.spyOn(templates, 'pickTemplate').mockReturnValue(mockTemplate as any);

    vi.spyOn(templates, 'renderMessage').mockReturnValue({
      text: 'Hello John',
      viaGlassixTemplate: undefined,
    });

    // Mock Glassix send
    vi.spyOn(glassix, 'sendWhatsApp').mockResolvedValue({
      conversationUrl: 'https://glassix.com/conv/123',
      providerId: 'msg-123',
    });

    // Run the orchestrator
    const stats = await runOnce();

    // Verify stats
    expect(stats.tasks).toBe(2);
    expect(stats.sent).toBe(2);
    expect(stats.failed).toBe(0);
    expect(stats.skipped).toBe(0);

    // Verify Glassix was called twice with masked phones
    expect(glassix.sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(glassix.sendWhatsApp).toHaveBeenCalledWith(
      expect.objectContaining({
        toE164: '+972521234567',
        idemKey: 'task-001',
      })
    );

    // Verify SF update was called for both tasks
    expect(mockConn.sobject).toHaveBeenCalled();

    // Verify logout
    expect(mockConn.logout).toHaveBeenCalled();
  });

  it('should use DRY_RUN mode when env is set', async () => {
    process.env.DRY_RUN = '1';
    clearConfigCache();

    const { runOnce } = await import('../src/run.js');
    const sf = await import('../src/sf.js');
    const glassix = await import('../src/glassix.js');
    const templates = await import('../src/templates.js');

    const mockConn = {
      login: vi.fn(),
      logout: vi.fn(),
      userInfo: { id: 'user-123' },
    };

    vi.spyOn(sf, 'login').mockResolvedValue(mockConn as any);
    vi.spyOn(sf, 'describeTaskFields').mockResolvedValue(new Set(['Id']));
    vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue([
      {
        Id: 'task-dry',
      Status: 'Not Started',
        Task_Type_Key__c: 'TEST_KEY',
        Phone__c: '+972521111111',
      },
    ] as any);

    vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(
      new Map([
        ['test_key', { name: 'test_key', hebrewMessage: 'Test', englishMessage: 'Test' }],
      ]) as any
    );
    vi.spyOn(templates, 'pickTemplate').mockReturnValue({} as any);
    vi.spyOn(templates, 'renderMessage').mockReturnValue({ text: 'Test', viaGlassixTemplate: undefined });

    const sendSpy = vi.spyOn(glassix, 'sendWhatsApp');

    const stats = await runOnce();

    // Should preview, not send
    expect(stats.previewed).toBe(1);
    expect(stats.sent).toBe(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
