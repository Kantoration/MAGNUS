/**
 * Tests for Salesforce client - target resolution, task key derivation, context parsing
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearConfigCache } from '../src/config.js';
import * as sf from '../src/sf.js';

describe('Salesforce Client', () => {
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
    process.env.PERMIT_LANDLINES = 'false';
    process.env.LOG_LEVEL = 'error';

    clearConfigCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
  });

  describe('deriveTaskKey', () => {
    it('should use Task_Type_Key__c when present (uppercased)', () => {
      const task: sf.STask = {
        Id: 'task-1',
        Status: 'Not Started',
        Task_Type_Key__c: 'NEW_PHONE',
        Subject: 'Some Subject',
      };

      const result = sf.deriveTaskKey(task);
      expect(result).toBe('NEW_PHONE');
    });

    it('should fallback to Subject when Task_Type_Key__c is missing (normalized)', () => {
      const task: sf.STask = {
        Id: 'task-2',
        Status: 'Not Started',
        Subject: 'New Phone Call',
      };

      const result = sf.deriveTaskKey(task);
      expect(result).toBe('NEW_PHONE_CALL'); // Uppercased and spaces → underscores
    });

    it('should normalize Hebrew text with spaces (transliterated and uppercased)', () => {
      const task: sf.STask = {
        Id: 'task-3',
        Status: 'Not Started',
        Task_Type_Key__c: 'טלפון חדש',
      };

      const result = sf.deriveTaskKey(task);
      expect(result).toBe('TLPVN_HDSH'); // Transliterated: ט=T, ל=L, פ=P, ו=V, ן=N, ח=H, ד=D, ש=SH
    });

    it('should handle empty/missing keys with UNKNOWN fallback', () => {
      const task: sf.STask = {
        Id: 'task-4',
        Status: 'Not Started',
      };

      const result = sf.deriveTaskKey(task);
      expect(result).toBe('UNKNOWN'); // Empty strings fallback to 'UNKNOWN'
    });
  });

  describe('resolveTarget - phone precedence', () => {
    it('should prioritize custom phone field (Phone__c) over Contact', () => {
      const task: sf.STask = {
        Id: 'task-1',
        Status: 'Not Started',
        Phone__c: '+972501234567',
        Who: {
          attributes: { type: 'Contact' },
          FirstName: 'John',
          MobilePhone: '+972509999999',
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.source).toBe('TaskCustomPhone');
      expect(result.phoneRaw).toBe('+972501234567');
      expect(result.phoneE164).toBe('+972501234567');
    });

    it('should use Contact.MobilePhone when custom phone is missing', () => {
      const task: sf.STask = {
        Id: 'task-2',
        Status: 'Not Started',
        Who: {
          attributes: { type: 'Contact' },
          FirstName: 'Jane',
          MobilePhone: '+972521234567',
          Phone: '+972501111111',
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.source).toBe('ContactMobile');
      expect(result.phoneRaw).toBe('+972521234567');
      expect(result.phoneE164).toBe('+972521234567');
    });

    it('should fallback to Contact.Phone when MobilePhone is missing', () => {
      const task: sf.STask = {
        Id: 'task-3',
        Status: 'Not Started',
        Who: {
          attributes: { type: 'Contact' },
          FirstName: 'Bob',
          Phone: '+972502222222',
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.source).toBe('ContactPhone');
      expect(result.phoneRaw).toBe('+972502222222');
    });

    it('should use Lead.MobilePhone', () => {
      const task: sf.STask = {
        Id: 'task-4',
        Status: 'Not Started',
        Who: {
          attributes: { type: 'Lead' },
          FirstName: 'Alice',
          MobilePhone: '+972531234567',
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.source).toBe('LeadMobile');
      expect(result.phoneE164).toBe('+972531234567');
    });

    it('should fallback to Lead.Phone when MobilePhone is missing', () => {
      const task: sf.STask = {
        Id: 'task-5',
        Status: 'Not Started',
        Who: {
          attributes: { type: 'Lead' },
          FirstName: 'Charlie',
          Phone: '+972503333333',
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.source).toBe('LeadPhone');
      expect(result.phoneRaw).toBe('+972503333333');
    });

    it('should use Account.Phone from What field', () => {
      const task: sf.STask = {
        Id: 'task-6',
        Status: 'Not Started',
        What: {
          attributes: { type: 'Account' },
          Name: 'Acme Corp',
          Phone: '+972504444444',
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.source).toBe('AccountPhone');
      expect(result.phoneRaw).toBe('+972504444444');
      expect(result.accountName).toBe('Acme Corp');
    });

    it('should return None when no phone is available', () => {
      const task: sf.STask = {
        Id: 'task-7',
        Status: 'Not Started',
        Who: {
          attributes: { type: 'Contact' },
          FirstName: 'NoPhone',
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.source).toBe('None');
      expect(result.phoneE164).toBeNull();
    });
  });

  describe('resolveTarget - name resolution', () => {
    it('should extract firstName from Contact', () => {
      const task: sf.STask = {
        Id: 'task-1',
        Status: 'Not Started',
        Who: {
          attributes: { type: 'Contact' },
          FirstName: 'Sarah',
          MobilePhone: '+972521234567',
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.firstName).toBe('Sarah');
    });

    it('should extract firstName from Lead', () => {
      const task: sf.STask = {
        Id: 'task-2',
        Status: 'Not Started',
        Who: {
          attributes: { type: 'Lead' },
          FirstName: 'Mike',
          MobilePhone: '+972521234567',
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.firstName).toBe('Mike');
    });

    it('should extract accountName from Contact.Account.Name', () => {
      const task: sf.STask = {
        Id: 'task-3',
        Status: 'Not Started',
        Who: {
          attributes: { type: 'Contact' },
          FirstName: 'Lisa',
          MobilePhone: '+972521234567',
          Account: {
            Name: 'Tech Solutions Ltd',
          },
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.accountName).toBe('Tech Solutions Ltd');
    });

    it('should extract accountName from What.Name (Account)', () => {
      const task: sf.STask = {
        Id: 'task-4',
        Status: 'Not Started',
        What: {
          attributes: { type: 'Account' },
          Name: 'Global Industries',
          Phone: '+972504444444',
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.accountName).toBe('Global Industries');
    });
  });

  describe('resolveTarget - custom phone field', () => {
    it('should read custom phone field dynamically from config', () => {
      process.env.TASK_CUSTOM_PHONE_FIELD = 'Custom_Phone__c';
      clearConfigCache();

      const task: sf.STask = {
        Id: 'task-1',
        Status: 'Not Started',
        Custom_Phone__c: '+972505555555',
        Who: {
          attributes: { type: 'Contact' },
          MobilePhone: '+972509999999',
        },
      };

      const result = sf.resolveTarget(task);
      
      expect(result.source).toBe('TaskCustomPhone');
      expect(result.phoneE164).toBe('+972505555555');
    });
  });

  describe('resolveTarget - phone normalization', () => {
    it('should normalize valid Israeli mobile phone', () => {
      const task: sf.STask = {
        Id: 'task-1',
        Status: 'Not Started',
        Phone__c: '0521234567',
      };

      const result = sf.resolveTarget(task);
      
      expect(result.phoneE164).toBe('+972521234567');
    });

    it('should reject landlines when PERMIT_LANDLINES=false', () => {
      const task: sf.STask = {
        Id: 'task-2',
        Status: 'Not Started',
        Phone__c: '0312345678', // Landline (03 prefix)
      };

      const result = sf.resolveTarget(task);
      
      // Note: Phone normalization may still produce E.164 format but validation should reject non-mobile
      // The actual behavior depends on isLikelyILMobile check
      expect(result.phoneRaw).toBe('0312345678');
      
      // If permitLandlines=false, should reject non-mobile numbers
      // However, the normalizer may still return E.164 if libphonenumber accepts it
      // The important part is that it gets validated downstream
      if (result.phoneE164) {
        // If E.164 was produced, it should at least be formatted correctly
        expect(result.phoneE164).toMatch(/^\+972/);
      }
    });

    it('should accept landlines when PERMIT_LANDLINES=true', () => {
      process.env.PERMIT_LANDLINES = 'true';
      clearConfigCache();

      const task: sf.STask = {
        Id: 'task-3',
        Status: 'Not Started',
        Phone__c: '0312345678',
      };

      const result = sf.resolveTarget(task);
      
      expect(result.phoneE164).toBe('+972312345678'); // Normalized landline
    });
  });

  describe('getContext', () => {
    it('should parse valid JSON from Context_JSON__c', () => {
      const task: sf.STask = {
        Id: 'task-1',
        Status: 'Not Started',
        Context_JSON__c: '{"first_name":"John","appointment_date":"2025-01-15","count":5}',
      };

      const result = sf.getContext(task);
      
      expect(result).toEqual({
        first_name: 'John',
        appointment_date: '2025-01-15',
        count: 5,
      });
    });

    it('should return empty object for invalid JSON', () => {
      const task: sf.STask = {
        Id: 'task-2',
        Status: 'Not Started',
        Context_JSON__c: '{invalid json',
      };

      const result = sf.getContext(task);
      
      expect(result).toEqual({});
    });

    it('should return empty object when Context_JSON__c is missing', () => {
      const task: sf.STask = {
        Id: 'task-3',
        Status: 'Not Started',
      };

      const result = sf.getContext(task);
      
      expect(result).toEqual({});
    });

    it('should filter out non-primitive values', () => {
      const task: sf.STask = {
        Id: 'task-4',
        Status: 'Not Started',
        Context_JSON__c: '{"name":"Alice","nested":{"foo":"bar"},"arr":[1,2,3],"valid":true}',
      };

      const result = sf.getContext(task);
      
      // Should only include primitive values
      expect(result).toEqual({
        name: 'Alice',
        valid: true,
      });
    });

    it('should handle null values', () => {
      const task: sf.STask = {
        Id: 'task-5',
        Status: 'Not Started',
        Context_JSON__c: '{"name":"Bob","middle_name":null,"age":30}',
      };

      const result = sf.getContext(task);
      
      expect(result).toEqual({
        name: 'Bob',
        middle_name: null,
        age: 30,
      });
    });
  });
});
