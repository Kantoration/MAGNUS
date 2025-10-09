/**
 * Unit tests for Salesforce client functions
 */
import { describe, it, expect } from 'vitest';
import { deriveTaskKey, getContext, resolveTarget } from '../src/sf.js';
import type { STask } from '../src/sf.js';

describe('deriveTaskKey', () => {
  it('should normalize Task_Type_Key__c if present', () => {
    const task: STask = {
      Id: '00T000000000001',
      Status: 'Not Started',
      Task_Type_Key__c: 'New Phone',
      Subject: 'Something else',
    };

    expect(deriveTaskKey(task)).toBe('NEW_PHONE');
  });

  it('should normalize Subject if Task_Type_Key__c is absent', () => {
    const task: STask = {
      Id: '00T000000000002',
      Status: 'Not Started',
      Subject: 'new-phone',
    };

    expect(deriveTaskKey(task)).toBe('NEW_PHONE');
  });

  it('should handle multiple spaces and hyphens', () => {
    const task: STask = {
      Id: '00T000000000003',
      Status: 'Not Started',
      Subject: 'NEW   PHONE',
    };

    expect(deriveTaskKey(task)).toBe('NEW_PHONE');
  });

  it('should strip non-alphanumeric characters except underscores', () => {
    const task: STask = {
      Id: '00T000000000004',
      Status: 'Not Started',
      Subject: 'New Phone! @2023',
    };

    expect(deriveTaskKey(task)).toBe('NEW_PHONE_2023');
  });

  it('should return UNKNOWN for empty Subject and Task_Type_Key__c', () => {
    const task: STask = {
      Id: '00T000000000005',
      Status: 'Not Started',
    };

    expect(deriveTaskKey(task)).toBe('UNKNOWN');
  });

  it('should transliterate Hebrew characters', () => {
    const task: STask = {
      Id: '00T000000000006',
      Status: 'Not Started',
      Subject: 'טלפון חדש NEW_PHONE',
    };

    // טלפון = TLPVN, חדש = HDSH, separated by underscores
    expect(deriveTaskKey(task)).toBe('TLPVN_HDSH_NEW_PHONE');
  });
});

describe('getContext', () => {
  it('should parse valid JSON from Context_JSON__c', () => {
    const task: STask = {
      Id: '00T000000000001',
      Status: 'Not Started',
      Context_JSON__c: '{"deviceModel":"iPhone 14","imei":"123456789"}',
    };

    const context = getContext(task);
    expect(context).toEqual({
      deviceModel: 'iPhone 14',
      imei: '123456789',
    });
  });

  it('should return empty object if Context_JSON__c is missing', () => {
    const task: STask = {
      Id: '00T000000000002',
      Status: 'Not Started',
    };

    const context = getContext(task);
    expect(context).toEqual({});
  });

  it('should return empty object on invalid JSON', () => {
    const task: STask = {
      Id: '00T000000000003',
      Status: 'Not Started',
      Context_JSON__c: 'invalid json{',
    };

    const context = getContext(task);
    expect(context).toEqual({});
  });

  it('should return empty object if JSON is not an object', () => {
    const task: STask = {
      Id: '00T000000000004',
      Status: 'Not Started',
      Context_JSON__c: '"just a string"',
    };

    const context = getContext(task);
    expect(context).toEqual({});
  });

  it('should return empty object if JSON is null', () => {
    const task: STask = {
      Id: '00T000000000005',
      Status: 'Not Started',
      Context_JSON__c: 'null',
    };

    const context = getContext(task);
    expect(context).toEqual({});
  });
});

describe('resolveTarget', () => {
  it('should prioritize Task custom phone field', () => {
    const task: STask = {
      Id: '00T000000000001',
      Status: 'Not Started',
      Phone__c: '052-123-4567',
      Who: {
        attributes: { type: 'Contact' },
        FirstName: 'Dan',
        MobilePhone: '052-999-8888',
        Phone: null,
        Account: { Name: 'MAGNUS' },
      },
    };

    const result = resolveTarget(task);

    expect(result.source).toBe('TaskCustomPhone');
    expect(result.phoneRaw).toBe('052-123-4567');
    expect(result.phoneE164).toBe('+972521234567');
    expect(result.firstName).toBe('Dan');
    expect(result.accountName).toBe('MAGNUS');
  });

  it('should use Contact MobilePhone if task custom field is empty', () => {
    const task: STask = {
      Id: '00T000000000002',
      Status: 'Not Started',
      Who: {
        attributes: { type: 'Contact' },
        FirstName: 'Dan',
        MobilePhone: '052-123-4567',
        Phone: '03-555-7777',
        Account: { Name: 'MAGNUS' },
      },
    };

    const result = resolveTarget(task);

    expect(result.source).toBe('ContactMobile');
    expect(result.phoneRaw).toBe('052-123-4567');
    expect(result.phoneE164).toBe('+972521234567');
    expect(result.firstName).toBe('Dan');
    expect(result.accountName).toBe('MAGNUS');
  });

  it('should use Contact Phone if MobilePhone is empty', () => {
    const task: STask = {
      Id: '00T000000000003',
      Status: 'Not Started',
      Who: {
        attributes: { type: 'Contact' },
        FirstName: 'Dan',
        MobilePhone: null,
        Phone: '052-222-3333',
        Account: { Name: 'MAGNUS' },
      },
    };

    const result = resolveTarget(task);

    expect(result.source).toBe('ContactPhone');
    expect(result.phoneRaw).toBe('052-222-3333');
    expect(result.phoneE164).toBe('+972522223333');
    expect(result.firstName).toBe('Dan');
    expect(result.accountName).toBe('MAGNUS');
  });

  it('should use Lead MobilePhone if Contact is not available', () => {
    const task: STask = {
      Id: '00T000000000004',
      Status: 'Not Started',
      Who: {
        attributes: { type: 'Lead' },
        FirstName: 'Dana',
        MobilePhone: '052-222-3333',
        Phone: null,
      },
    };

    const result = resolveTarget(task);

    expect(result.source).toBe('LeadMobile');
    expect(result.phoneRaw).toBe('052-222-3333');
    expect(result.phoneE164).toBe('+972522223333');
    expect(result.firstName).toBe('Dana');
    expect(result.accountName).toBeUndefined();
  });

  it('should use Lead Phone if MobilePhone is empty', () => {
    const task: STask = {
      Id: '00T000000000005',
      Status: 'Not Started',
      Who: {
        attributes: { type: 'Lead' },
        FirstName: 'Dana',
        MobilePhone: null,
        Phone: '052-444-5555',
      },
    };

    const result = resolveTarget(task);

    expect(result.source).toBe('LeadPhone');
    expect(result.phoneRaw).toBe('052-444-5555');
    expect(result.phoneE164).toBe('+972524445555');
    expect(result.firstName).toBe('Dana');
  });

  it('should use Account Phone if Who is not available', () => {
    const task: STask = {
      Id: '00T000000000006',
      Status: 'Not Started',
      What: {
        attributes: { type: 'Account' },
        Name: 'MAGNUS LTD',
        Phone: '03-555-7777',
      },
    };

    const result = resolveTarget(task);

    expect(result.source).toBe('AccountPhone');
    expect(result.phoneRaw).toBe('03-555-7777');
    expect(result.phoneE164).toBeNull(); // Landline, should be rejected
    expect(result.firstName).toBeUndefined();
    expect(result.accountName).toBe('MAGNUS LTD');
  });

  it('should return None if no phone is available', () => {
    const task: STask = {
      Id: '00T000000000007',
      Status: 'Not Started',
      Who: {
        attributes: { type: 'Contact' },
        FirstName: 'Dan',
        MobilePhone: null,
        Phone: null,
        Account: { Name: 'MAGNUS' },
      },
    };

    const result = resolveTarget(task);

    expect(result.source).toBe('None');
    expect(result.phoneRaw).toBeUndefined();
    expect(result.phoneE164).toBeNull();
    expect(result.firstName).toBe('Dan');
    expect(result.accountName).toBe('MAGNUS');
  });

  it('should extract accountName from Contact.Account.Name', () => {
    const task: STask = {
      Id: '00T000000000008',
      Status: 'Not Started',
      Who: {
        attributes: { type: 'Contact' },
        FirstName: 'Dan',
        MobilePhone: '052-123-4567',
        Phone: null,
        Account: { Name: 'MAGNUS' },
      },
    };

    const result = resolveTarget(task);

    expect(result.accountName).toBe('MAGNUS');
  });

  it('should extract accountName from What.Name when it is Account', () => {
    const task: STask = {
      Id: '00T000000000009',
      Status: 'Not Started',
      What: {
        attributes: { type: 'Account' },
        Name: 'MAGNUS LTD',
        Phone: '052-123-4567',
      },
    };

    const result = resolveTarget(task);

    expect(result.accountName).toBe('MAGNUS LTD');
  });

  it('should handle international Israeli phone format', () => {
    const task: STask = {
      Id: '00T000000000010',
      Status: 'Not Started',
      Who: {
        attributes: { type: 'Contact' },
        FirstName: 'Dan',
        MobilePhone: '+972521234567',
        Phone: null,
        Account: { Name: 'MAGNUS' },
      },
    };

    const result = resolveTarget(task);

    expect(result.phoneE164).toBe('+972521234567');
  });

  it('should handle phone without dashes', () => {
    const task: STask = {
      Id: '00T000000000011',
      Status: 'Not Started',
      Who: {
        attributes: { type: 'Contact' },
        FirstName: 'Dan',
        MobilePhone: '0521234567',
        Phone: null,
        Account: { Name: 'MAGNUS' },
      },
    };

    const result = resolveTarget(task);

    expect(result.phoneE164).toBe('+972521234567');
  });
});

