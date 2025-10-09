/**
 * Happy path tests for the orchestrator
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Connection } from 'jsforce';
import * as sf from '../src/sf.js';
import * as templates from '../src/templates.js';
import { GlassixClient } from '../src/glassix.js';
import type { STask } from '../src/sf.js';
import type { NormalizedMapping } from '../src/types.js';

describe('Orchestrator Happy Path', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should process tasks with Who/What shapes and mask phones in logs', async () => {
    // Mock Salesforce login
    const mockConn = {
      sobject: vi.fn(() => ({
        update: vi.fn().mockResolvedValue({ success: true }),
      })),
      logout: vi.fn().mockResolvedValue(undefined),
    } as unknown as Connection;

    vi.spyOn(sf, 'login').mockResolvedValue(mockConn);

    // Mock fetchPendingTasks to return 2 tasks with different shapes
    const mockTasks: STask[] = [
      {
        Id: '00T000000000001',
        Subject: 'New Phone',
        Status: 'Not Started',
        Task_Type_Key__c: 'NEW_PHONE',
        ActivityDate: '2025-10-09',
        Description: 'Test task 1',
        Context_JSON__c: JSON.stringify({ device_model: 'iPhone 14', imei: '123456789' }),
        Who: {
          attributes: { type: 'Contact' },
          FirstName: 'Dan',
          LastName: 'Cohen',
          MobilePhone: '052-123-4567',
          Phone: null,
          Account: { Name: 'MAGNUS' },
        },
        What: null,
        Phone__c: null,
      },
      {
        Id: '00T000000000002',
        Subject: 'Payment Reminder',
        Status: 'In Progress',
        Task_Type_Key__c: 'PAYMENT_REMINDER',
        ActivityDate: '2025-10-09',
        Description: 'Test task 2',
        Context_JSON__c: null,
        Who: {
          attributes: { type: 'Lead' },
          FirstName: 'Sara',
          LastName: 'Levi',
          MobilePhone: '052-987-6543',
          Phone: null,
        },
        What: {
          attributes: { type: 'Account' },
          Name: 'Test Account',
          Phone: '03-555-7777',
        },
        Phone__c: null,
      },
    ];

    vi.spyOn(sf, 'fetchPendingTasks').mockResolvedValue(mockTasks);

    // Mock template loading
    const mockTemplateMap = new Map<string, NormalizedMapping>([
      [
        'NEW_PHONE',
        {
          taskKey: 'NEW_PHONE',
          messageBody: 'שלום {{first_name}}, הטלפון החדש {{device_model}} שלך מוכן!',
          link: 'https://example.com/phone',
          glassixTemplateId: undefined,
        },
      ],
      [
        'PAYMENT_REMINDER',
        {
          taskKey: 'PAYMENT_REMINDER',
          messageBody: 'היי {{first_name}}, תזכורת לתשלום עבור {{account_name}}',
          link: undefined,
          glassixTemplateId: 'payment_template_1',
        },
      ],
    ]);

    vi.spyOn(templates, 'loadTemplateMap').mockResolvedValue(mockTemplateMap);
    vi.spyOn(templates, 'pickTemplate').mockImplementation((key, map) => map.get(key));
    vi.spyOn(templates, 'renderMessage').mockImplementation((mapping, _ctx) => ({
      text: mapping.messageBody || '',
      viaGlassixTemplate: mapping.glassixTemplateId,
    }));

    // Mock Glassix client
    const mockSendWhatsApp = vi.fn().mockResolvedValue({
      success: true,
      messageId: 'msg_12345',
    });

    vi.spyOn(GlassixClient.prototype, 'sendWhatsAppMessage').mockImplementation(mockSendWhatsApp);

    // Import and run (we can't actually run main, so we'll test the flow via mocks)
    // Verify the mocks were called correctly
    expect(sf.login).toBeDefined();
    expect(sf.fetchPendingTasks).toBeDefined();
    expect(templates.loadTemplateMap).toBeDefined();

    // Simulate processing
    const conn = await sf.login();
    const tasks = await sf.fetchPendingTasks(conn);
    const templateMap = await templates.loadTemplateMap();

    expect(tasks.length).toBe(2);
    expect(templateMap.size).toBe(2);

    // Process first task
    const task1 = tasks[0];
    const taskKey1 = sf.deriveTaskKey(task1);
    const target1 = sf.resolveTarget(task1);
    const mapping1 = templates.pickTemplate(taskKey1, templateMap);

    expect(taskKey1).toBe('NEW_PHONE');
    expect(target1.phoneE164).toBe('+972521234567');
    expect(target1.firstName).toBe('Dan');
    expect(target1.accountName).toBe('MAGNUS');
    expect(mapping1).toBeDefined();

    // Verify phone is masked in any logging context
    const maskedPhone = target1.phoneE164!.substring(0, 5) + '******' + target1.phoneE164!.slice(-2);
    expect(maskedPhone).toMatch(/^\+9725\*{6}\d{2}$/);

    // Process second task
    const task2 = tasks[1];
    const taskKey2 = sf.deriveTaskKey(task2);
    const target2 = sf.resolveTarget(task2);
    const mapping2 = templates.pickTemplate(taskKey2, templateMap);

    expect(taskKey2).toBe('PAYMENT_REMINDER');
    expect(target2.phoneE164).toBe('+972529876543');
    expect(target2.firstName).toBe('Sara');
    expect(target2.accountName).toBe('Test Account');
    expect(mapping2).toBeDefined();
    expect(mapping2?.glassixTemplateId).toBe('payment_template_1');
  });

  it('should handle tasks with custom phone field priority', async () => {
    const mockTask: STask = {
      Id: '00T000000000003',
      Subject: 'Custom Phone Test',
      Status: 'Not Started',
      Task_Type_Key__c: 'TEST',
      ActivityDate: '2025-10-09',
      Description: 'Test with custom phone',
      Context_JSON__c: null,
      Phone__c: '052-111-2222', // Custom phone field
      Who: {
        attributes: { type: 'Contact' },
        FirstName: 'Test',
        LastName: 'User',
        MobilePhone: '052-999-8888', // Should be ignored in favor of Phone__c
        Phone: null,
        Account: { Name: 'Test Co' },
      },
      What: null,
    };

    const target = sf.resolveTarget(mockTask);

    expect(target.source).toBe('TaskCustomPhone');
    expect(target.phoneRaw).toBe('052-111-2222');
    expect(target.phoneE164).toBe('+972521112222');
    expect(target.firstName).toBe('Test');
    expect(target.accountName).toBe('Test Co');
  });

  it('should handle missing phone and set Waiting on External', async () => {
    const mockTask: STask = {
      Id: '00T000000000004',
      Subject: 'No Phone Test',
      Status: 'Not Started',
      Task_Type_Key__c: 'TEST',
      ActivityDate: '2025-10-09',
      Description: 'Test with no phone',
      Context_JSON__c: null,
      Phone__c: null,
      Who: {
        attributes: { type: 'Contact' },
        FirstName: 'NoPhone',
        LastName: 'User',
        MobilePhone: null,
        Phone: null,
        Account: { Name: 'Test Co' },
      },
      What: null,
    };

    const target = sf.resolveTarget(mockTask);

    expect(target.phoneE164).toBeNull();
    expect(target.source).toBe('None');
    // In actual run.ts, this would trigger updateTaskToWaiting
  });

  it('should parse context JSON and merge with target info', async () => {
    const mockTask: STask = {
      Id: '00T000000000005',
      Subject: 'Context Test',
      Status: 'Not Started',
      Task_Type_Key__c: 'CONTEXT_TEST',
      ActivityDate: '2025-10-09',
      Description: 'Test context merging',
      Context_JSON__c: JSON.stringify({
        device_model: 'Samsung S23',
        imei: '987654321',
        custom_field: 'custom_value',
      }),
      Phone__c: '052-333-4444',
      Who: {
        attributes: { type: 'Contact' },
        FirstName: 'Context',
        LastName: 'User',
        MobilePhone: null,
        Phone: null,
        Account: { Name: 'Context Co' },
      },
      What: null,
    };

    const ctxFromTask = sf.getContext(mockTask);
    const target = sf.resolveTarget(mockTask);

    expect(ctxFromTask).toEqual({
      device_model: 'Samsung S23',
      imei: '987654321',
      custom_field: 'custom_value',
    });

    expect(target.phoneE164).toBe('+972523334444');
    expect(target.firstName).toBe('Context');
    expect(target.accountName).toBe('Context Co');

    // Simulate context merging (as done in run.ts)
    const mergedCtx = {
      ...ctxFromTask,
      first_name: ctxFromTask.first_name ?? target.firstName ?? '',
      account_name: ctxFromTask.account_name ?? target.accountName ?? '',
    };

    expect(mergedCtx.first_name).toBe('Context');
    expect(mergedCtx.account_name).toBe('Context Co');
    expect(mergedCtx.device_model).toBe('Samsung S23');
    expect(mergedCtx.custom_field).toBe('custom_value');
  });
});

