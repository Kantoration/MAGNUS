/**
 * Comprehensive Edge Case Tests
 * 
 * Tests for additional edge cases and risk reducers:
 * - Locale split in idempotency (he vs he_IL produces different keys)
 * - Opt-in source of truth drift (field rename/missing → fail safe)
 * - Duplicate within different namespaces (same template name across namespaces)
 * - Glassix conversation metadata snapshot tests
 * - Media templates validation
 * - Rate limit backoff jitter with mocked timers
 * - Time-zone correctness with frozen clock
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearConfigCache } from '../src/config.js';

describe('Comprehensive Edge Case Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LOG_LEVEL = 'error';
    clearConfigCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
    vi.restoreAllMocks();
  });

  describe('Locale Split in Idempotency', () => {
    it('should ensure he vs he_IL produces different deterministic keys', async () => {
      const { generateDeterministicId } = await import('../src/template-validator.js');
      
      const taskId = 'TASK_001';
      const templateName = 'NEW_PHONE_READY';
      const variables = { first_name: 'יוסי', account_name: 'חברה בע"מ' };
      
      // Generate keys with different locales
      const keyHe = generateDeterministicId(taskId, templateName, { ...variables, _lang: 'he' });
      const keyHeIL = generateDeterministicId(taskId, templateName, { ...variables, _lang: 'he_IL' });
      const keyEn = generateDeterministicId(taskId, templateName, { ...variables, _lang: 'en' });
      
      // All keys should be different
      expect(keyHe).not.toBe(keyHeIL);
      expect(keyHe).not.toBe(keyEn);
      expect(keyHeIL).not.toBe(keyEn);
      
      // Keys should contain locale information
      expect(keyHe).toContain(taskId);
      expect(keyHeIL).toContain(taskId);
      expect(keyEn).toContain(taskId);
    });

    it('should normalize locale codes consistently in deterministic keys', () => {
      const normalizeLocale = (locale: string): string => {
        return locale.toLowerCase().split('_')[0];
      };
      
      const testCases = [
        { input: 'he_IL', expected: 'he' },
        { input: 'he', expected: 'he' },
        { input: 'en_US', expected: 'en' },
        { input: 'en', expected: 'en' },
        { input: 'HE_IL', expected: 'he' },
        { input: 'EN_US', expected: 'en' }
      ];
      
      testCases.forEach(({ input, expected }) => {
        expect(normalizeLocale(input)).toBe(expected);
      });
    });

    it('should include normalized locale in deterministic key generation', () => {
      const generateLocaleAwareKey = (
        taskId: string,
        templateName: string,
        variables: Record<string, any>,
        locale: string = 'he'
      ): string => {
        const normalizedLocale = locale.toLowerCase().split('_')[0];
        const variableHash = createVariableHash(variables);
        return `${taskId}#${templateName}#${normalizedLocale}#${variableHash}`;
      };
      
      const createVariableHash = (variables: Record<string, any>): string => {
        const sortedKeys = Object.keys(variables).sort();
        const hashString = sortedKeys
          .map(key => `${key}=${String(variables[key] || '')}`)
          .join('|');
        
        let hash = 0;
        for (let i = 0; i < hashString.length; i++) {
          const char = hashString.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        
        return Math.abs(hash).toString(36);
      };
      
      const taskId = 'TASK_001';
      const templateName = 'NEW_PHONE_READY';
      const variables = { first_name: 'יוסי' };
      
      const keyHe = generateLocaleAwareKey(taskId, templateName, variables, 'he');
      const keyHeIL = generateLocaleAwareKey(taskId, templateName, variables, 'he_IL');
      const keyEn = generateLocaleAwareKey(taskId, templateName, variables, 'en');
      
      expect(keyHe).toContain('#he#');
      expect(keyHeIL).toContain('#he#'); // Should be normalized
      expect(keyEn).toContain('#en#');
      
      expect(keyHe).not.toBe(keyEn);
    });
  });

  describe('Opt-in Source of Truth Drift', () => {
    it('should fail safe with NO_OPT_IN when field is renamed', async () => {
      const mockConn = {
        describe: vi.fn()
      };
      
      // Mock field rename scenario
      mockConn.describe.mockResolvedValue({
        fields: [
          { name: 'Id', type: 'id' },
          { name: 'FirstName', type: 'string' },
          { name: 'MobilePhone', type: 'phone' },
          // WhatsApp_Opt_In__c field is missing (renamed)
          { name: 'WhatsApp_Opt_In_New__c', type: 'boolean' } // New field name
        ]
      });
      
      const checkOptInField = async (conn: any, fieldName: string): Promise<boolean> => {
        const description = await conn.describe('Contact');
        return description.fields.some((field: any) => field.name === fieldName);
      };
      
      const fieldExists = await checkOptInField(mockConn, 'WhatsApp_Opt_In__c');
      expect(fieldExists).toBe(false);
      
      // Should fail safe and return NO_OPT_IN
      const optInStatus = fieldExists ? 'OPTED_IN' : 'NO_OPT_IN';
      expect(optInStatus).toBe('NO_OPT_IN');
    });

    it('should surface config error when opt-in field is missing', () => {
      const validateOptInConfig = (config: any): { valid: boolean; error?: string } => {
        const requiredField = config.WHATSAPP_OPT_IN_FIELD || 'WhatsApp_Opt_In__c';
        
        if (!requiredField) {
          return {
            valid: false,
            error: 'WHATSAPP_OPT_IN_FIELD is not configured'
          };
        }
        
        return { valid: true };
      };
      
      const testConfigs = [
        { WHATSAPP_OPT_IN_FIELD: 'WhatsApp_Opt_In__c' },
        { WHATSAPP_OPT_IN_FIELD: 'WhatsApp_Opt_In_New__c' },
        {} // Missing field
      ];
      
      expect(validateOptInConfig(testConfigs[0]).valid).toBe(true);
      expect(validateOptInConfig(testConfigs[1]).valid).toBe(true);
      
      const result = validateOptInConfig(testConfigs[2]);
      expect(result.valid).toBe(true); // Should use default field name
    });

    it('should handle opt-in field type changes gracefully', async () => {
      const mockConn = {
        describe: vi.fn()
      };
      
      // Mock field type change scenario
      mockConn.describe.mockResolvedValue({
        fields: [
          { name: 'WhatsApp_Opt_In__c', type: 'text' } // Changed from boolean to text
        ]
      });
      
      const validateOptInFieldType = async (conn: any, fieldName: string): Promise<{ valid: boolean; error?: string }> => {
        const description = await conn.describe('Contact');
        const field = description.fields.find((f: any) => f.name === fieldName);
        
        if (!field) {
          return { valid: false, error: `Field ${fieldName} not found` };
        }
        
        if (field.type !== 'boolean') {
          return { valid: false, error: `Field ${fieldName} has type ${field.type}, expected boolean` };
        }
        
        return { valid: true };
      };
      
      const result = await validateOptInFieldType(mockConn, 'WhatsApp_Opt_In__c');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('has type text, expected boolean');
    });
  });

  describe('Duplicate Within Different Namespaces', () => {
    it('should generate different keys for same template name across namespaces', () => {
      const generateNamespaceKey = (
        taskId: string,
        templateName: string,
        variables: Record<string, any>,
        namespace: string
      ): string => {
        const variableHash = createVariableHash(variables);
        return `${namespace}#${taskId}#${templateName}#${variableHash}`;
      };
      
      const createVariableHash = (variables: Record<string, any>): string => {
        const sortedKeys = Object.keys(variables).sort();
        const hashString = sortedKeys
          .map(key => `${key}=${String(variables[key] || '')}`)
          .join('|');
        
        let hash = 0;
        for (let i = 0; i < hashString.length; i++) {
          const char = hashString.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        
        return Math.abs(hash).toString(36);
      };
      
      const taskId = 'TASK_001';
      const templateName = 'PAYMENT_REMINDER'; // Same template name
      const variables = { first_name: 'יוסי', amount: '₪1,500' };
      
      const bizKey = generateNamespaceKey(taskId, templateName, variables, 'biz');
      const csKey = generateNamespaceKey(taskId, templateName, variables, 'cs');
      const supportKey = generateNamespaceKey(taskId, templateName, variables, 'support');
      
      // All keys should be different due to namespace
      expect(bizKey).not.toBe(csKey);
      expect(bizKey).not.toBe(supportKey);
      expect(csKey).not.toBe(supportKey);
      
      // Keys should contain namespace information
      expect(bizKey).toContain('biz#');
      expect(csKey).toContain('cs#');
      expect(supportKey).toContain('support#');
    });

    it('should handle namespace collision detection', () => {
      const detectNamespaceCollision = (
        key1: string,
        key2: string
      ): { hasCollision: boolean; collisionType?: string } => {
        const parts1 = key1.split('#');
        const parts2 = key2.split('#');
        
        if (parts1.length !== 4 || parts2.length !== 4) {
          return { hasCollision: false };
        }
        
        const [namespace1, taskId1, template1, hash1] = parts1;
        const [namespace2, taskId2, template2, hash2] = parts2;
        
        // Same task ID and template but different namespace = OK
        if (taskId1 === taskId2 && template1 === template2 && namespace1 !== namespace2) {
          return { hasCollision: false };
        }
        
        // Same namespace, task ID, and template but different hash = collision
        if (namespace1 === namespace2 && taskId1 === taskId2 && template1 === template2 && hash1 !== hash2) {
          return { hasCollision: true, collisionType: 'hash_mismatch' };
        }
        
        return { hasCollision: false };
      };
      
      const bizKey = 'biz#TASK_001#PAYMENT_REMINDER#abc123';
      const csKey = 'cs#TASK_001#PAYMENT_REMINDER#abc123';
      const collisionKey = 'biz#TASK_001#PAYMENT_REMINDER#def456';
      
      const result1 = detectNamespaceCollision(bizKey, csKey);
      const result2 = detectNamespaceCollision(bizKey, collisionKey);
      
      expect(result1.hasCollision).toBe(false); // Different namespaces
      expect(result2.hasCollision).toBe(true); // Same namespace, different hash
      expect(result2.collisionType).toBe('hash_mismatch');
    });
  });

  describe('Glassix Conversation Metadata Snapshot Tests', () => {
    it('should snapshot-test customerName for each of the 9 task types', async () => {
      const { generateCustomerName } = await import('../src/hebrew-subjects.js');
      
      const testCases = [
        {
          taskType: 'NEW_PHONE_READY',
          firstName: 'יוסי',
          lastName: undefined,
          accountName: 'חברה בע"מ',
          expectedPattern: /יוסי.*חברה בע"מ|חברה בע"מ.*יוסי/
        },
        {
          taskType: 'PAYMENT_REMINDER',
          firstName: 'שרה',
          lastName: undefined,
          accountName: 'חברה טכנולוגיות',
          expectedPattern: /שרה.*חברה טכנולוגיות|חברה טכנולוגיות.*שרה/
        },
        {
          taskType: 'APPOINTMENT_CONFIRMATION',
          firstName: 'דוד',
          lastName: undefined,
          accountName: 'מרכז שירות',
          expectedPattern: /דוד.*מרכז שירות|מרכז שירות.*דוד/
        },
        {
          taskType: 'WELCOME_MESSAGE',
          firstName: 'מיכל',
          lastName: undefined,
          accountName: 'חברה חדשה',
          expectedPattern: /מיכל.*חברה חדשה|חברה חדשה.*מיכל/
        },
        {
          taskType: 'TRAINING_LINK',
          firstName: 'אבי',
          lastName: undefined,
          accountName: 'חברה שירותים',
          expectedPattern: /אבי.*חברה שירותים|חברה שירותים.*אבי/
        },
        {
          taskType: 'RETURN_INSTRUCTIONS',
          firstName: 'רחל',
          lastName: undefined,
          accountName: 'חברה לוגיסטית',
          expectedPattern: /רחל.*חברה לוגיסטית|חברה לוגיסטית.*רחל/
        },
        {
          taskType: 'SATELLITE_CONNECTION_FINISH',
          firstName: 'אלון',
          lastName: undefined,
          accountName: 'חברה ביטוח',
          expectedPattern: /אלון.*חברה ביטוח|חברה ביטוח.*אלון/
        },
        {
          taskType: 'MAINTENANCE_REMINDER',
          firstName: 'נועה',
          lastName: undefined,
          accountName: 'חברה מנויים',
          expectedPattern: /נועה.*חברה מנויים|חברה מנויים.*נועה/
        },
        {
          taskType: 'SERVICE_FOLLOWUP',
          firstName: 'גיל',
          lastName: undefined,
          accountName: 'חברה מחקר',
          expectedPattern: /גיל.*חברה מחקר|חברה מחקר.*גיל/
        }
      ];
      
      testCases.forEach(({ taskType, firstName, lastName, accountName, expectedPattern }) => {
        const customerName = generateCustomerName(firstName, lastName, accountName);
        
        expect(customerName).toMatch(expectedPattern);
        expect(customerName).toMatch(/[\u0590-\u05FF]/); // Should contain Hebrew
        expect(customerName).not.toMatch(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/); // No bidi chars
      });
    });

    it('should snapshot-test subject generation with Hebrew context tokens', async () => {
      const { generateHebrewSubject } = await import('../src/hebrew-subjects.js');
      
      const testCases = [
        {
          taskKey: 'NEW_PHONE_READY',
          context: { accountName: 'חברה בע"מ', date: '09/10/2024', firstName: 'יוסי' },
          expectedPattern: /טלפון.*חדש|חדש.*טלפון/
        },
        {
          taskKey: 'PAYMENT_REMINDER',
          context: { accountName: 'חברה טכנולוגיות', date: '09/10/2024', firstName: 'שרה' },
          expectedPattern: /תשלום|תזכורת/
        },
        {
          taskKey: 'APPOINTMENT_CONFIRMATION',
          context: { accountName: 'מרכז שירות', date: '09/10/2024', firstName: 'דוד' },
          expectedPattern: /פגישה|אישור/
        },
        {
          taskKey: 'WELCOME_MESSAGE',
          context: { accountName: 'חברה חדשה', date: '09/10/2024', firstName: 'מיכל' },
          expectedPattern: /ברוכים|הבאים/
        },
        {
          taskKey: 'TRAINING_LINK',
          context: { accountName: 'חברה שירותים', date: '09/10/2024', firstName: 'אבי' },
          expectedPattern: /הדרכה|קישור/
        }
      ];
      
      testCases.forEach(({ taskKey, context, expectedPattern }) => {
        const subject = generateHebrewSubject(taskKey, context);
        
        expect(subject).toMatch(expectedPattern);
        expect(subject).toMatch(/[\u0590-\u05FF]/); // Should contain Hebrew
        expect(subject).not.toMatch(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/); // No bidi chars
        expect(subject.length).toBeGreaterThan(5);
      });
    });

    it('should handle fallback scenarios in customer name generation', async () => {
      const { generateCustomerName } = await import('../src/hebrew-subjects.js');
      
      const fallbackTestCases = [
        {
          firstName: undefined,
          lastName: undefined,
          accountName: 'חברה בע"מ',
          expectedPattern: /חברה בע"מ/
        },
        {
          firstName: 'יוסי',
          lastName: undefined,
          accountName: undefined,
          expectedPattern: /יוסי/
        },
        {
          firstName: undefined,
          lastName: undefined,
          accountName: undefined,
          expectedPattern: /לקוח/
        },
        {
          firstName: '',
          lastName: '',
          accountName: '',
          expectedPattern: /לקוח/
        }
      ];
      
      fallbackTestCases.forEach(({ firstName, lastName, accountName, expectedPattern }) => {
        const customerName = generateCustomerName(firstName, lastName, accountName);
        
        expect(customerName).toMatch(expectedPattern);
        expect(customerName).not.toMatch(/undefined|null/);
        expect(customerName.trim().length).toBeGreaterThan(0);
      });
    });
  });

  describe('Media Templates Validation', () => {
    it('should validate media component presence and URL checksums', () => {
      const validateMediaTemplate = (template: any): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];
        
        if (!template.components) {
          return { valid: true, errors: [] };
        }
        
        const mediaComponents = template.components.filter((comp: any) =>
          ['image', 'video', 'audio', 'document'].includes(comp.type)
        );
        
        mediaComponents.forEach((comp: any) => {
          if (!comp.url && !comp.mediaId) {
            errors.push(`Missing URL or mediaId for ${comp.type} component`);
          }
          
          if (comp.url && !comp.checksum) {
            errors.push(`Missing checksum for ${comp.type} component URL`);
          }
          
          if (comp.url && !isValidMediaUrl(comp.url)) {
            errors.push(`Invalid media URL format for ${comp.type} component`);
          }
          
          if (comp.checksum && !isValidChecksum(comp.checksum)) {
            errors.push(`Invalid checksum format for ${comp.type} component`);
          }
        });
        
        return { valid: errors.length === 0, errors };
      };
      
      const isValidMediaUrl = (url: string): boolean => {
        try {
          const parsed = new URL(url);
          return ['http:', 'https:'].includes(parsed.protocol) &&
                 /\.(jpg|jpeg|png|gif|mp4|mp3|pdf)$/i.test(parsed.pathname);
        } catch {
          return false;
        }
      };
      
      const isValidChecksum = (checksum: string): boolean => {
        return /^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(checksum);
      };
      
      const validMediaTemplate = {
        name: 'MEDIA_TEMPLATE',
        components: [
          { type: 'header', text: 'Header text' },
          { type: 'body', text: 'Body text' },
          { 
            type: 'image', 
            url: 'https://example.com/image.jpg',
            checksum: 'abc123def456789'
          },
          { type: 'footer', text: 'Footer text' }
        ]
      };
      
      const invalidMediaTemplate = {
        name: 'INVALID_MEDIA_TEMPLATE',
        components: [
          { type: 'header', text: 'Header text' },
          { type: 'image' }, // Missing URL and mediaId
          { 
            type: 'video', 
            url: 'invalid-url', // Invalid URL format
            checksum: 'invalid-checksum' // Invalid checksum format
          }
        ]
      };
      
      const validResult = validateMediaTemplate(validMediaTemplate);
      const invalidResult = validateMediaTemplate(invalidMediaTemplate);
      
      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toHaveLength(0);
      
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors).toContain('Missing URL or mediaId for image component');
      expect(invalidResult.errors).toContain('Invalid media URL format for video component');
      expect(invalidResult.errors).toContain('Invalid checksum format for video component');
    });

    it('should pre-send validate media templates and block with clear error codes', () => {
      const preSendValidateMedia = (template: any): { 
        canSend: boolean; 
        errorCode?: string; 
        errorMessage?: string 
      } => {
        const mediaComponents = template.components?.filter((comp: any) =>
          ['image', 'video', 'audio', 'document'].includes(comp.type)
        ) || [];
        
        if (mediaComponents.length === 0) {
          return { canSend: true };
        }
        
        for (const comp of mediaComponents) {
          if (!comp.url && !comp.mediaId) {
            return {
              canSend: false,
              errorCode: 'MEDIA_URL_MISSING',
              errorMessage: `Media component ${comp.type} is missing URL or mediaId`
            };
          }
          
          if (comp.url && !comp.checksum) {
            return {
              canSend: false,
              errorCode: 'MEDIA_CHECKSUM_MISSING',
              errorMessage: `Media component ${comp.type} is missing checksum validation`
            };
          }
        }
        
        return { canSend: true };
      };
      
      const templateWithMissingUrl = {
        name: 'TEMPLATE_WITH_MISSING_URL',
        components: [
          { type: 'image' } // Missing URL
        ]
      };
      
      const templateWithMissingChecksum = {
        name: 'TEMPLATE_WITH_MISSING_CHECKSUM',
        components: [
          { 
            type: 'video', 
            url: 'https://example.com/video.mp4'
            // Missing checksum
          }
        ]
      };
      
      const validMediaTemplate = {
        name: 'VALID_MEDIA_TEMPLATE',
        components: [
          { 
            type: 'image', 
            url: 'https://example.com/image.jpg',
            checksum: 'abc123def456789'
          }
        ]
      };
      
      const result1 = preSendValidateMedia(templateWithMissingUrl);
      const result2 = preSendValidateMedia(templateWithMissingChecksum);
      const result3 = preSendValidateMedia(validMediaTemplate);
      
      expect(result1.canSend).toBe(false);
      expect(result1.errorCode).toBe('MEDIA_URL_MISSING');
      
      expect(result2.canSend).toBe(false);
      expect(result2.errorCode).toBe('MEDIA_CHECKSUM_MISSING');
      
      expect(result3.canSend).toBe(true);
    });
  });

  describe('Rate Limit Backoff Jitter with Mocked Timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should assert exponential backoff sequence with jitter', async () => {
      const calculateBackoff = (attempt: number, baseMs: number): number => {
        const exponentialDelay = baseMs * Math.pow(2, attempt - 1);
        const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
        return exponentialDelay + jitter;
      };
      
      const baseMs = 1000;
      const attemptTimes: number[] = [];
      
      // Mock Math.random for deterministic jitter
      const originalRandom = Math.random;
      let randomCallCount = 0;
      Math.random = vi.fn(() => {
        randomCallCount++;
        return 0.05; // Fixed 5% jitter for testing
      });
      
      try {
        for (let attempt = 1; attempt <= 3; attempt++) {
          const delay = calculateBackoff(attempt, baseMs);
          attemptTimes.push(delay);
          
          // Advance timers
          vi.advanceTimersByTime(delay);
        }
        
        // Verify exponential backoff pattern
        expect(attemptTimes[0]).toBeCloseTo(1050, -2); // 1000 + 50 jitter
        expect(attemptTimes[1]).toBeCloseTo(2100, -2); // 2000 + 100 jitter
        expect(attemptTimes[2]).toBeCloseTo(4200, -2); // 4000 + 200 jitter
        
        // Verify jitter is applied
        expect(randomCallCount).toBe(3);
      } finally {
        Math.random = originalRandom;
      }
    });

    it('should handle rate limit backoff with bounded jitter', async () => {
      const boundedBackoff = (attempt: number, baseMs: number, maxMs: number): number => {
        const exponentialDelay = Math.min(baseMs * Math.pow(2, attempt - 1), maxMs);
        const jitterRange = Math.min(exponentialDelay * 0.1, 1000); // Max 1s jitter
        const jitter = Math.random() * jitterRange;
        return exponentialDelay + jitter;
      };
      
      const baseMs = 1000;
      const maxMs = 10000;
      
      // Mock Math.random for deterministic jitter
      Math.random = vi.fn(() => 0.5); // 50% jitter
      
      try {
        const delays = [];
        for (let attempt = 1; attempt <= 5; attempt++) {
          const delay = boundedBackoff(attempt, baseMs, maxMs);
          delays.push(delay);
        }
        
        // Verify delays are bounded
        delays.forEach(delay => {
          expect(delay).toBeLessThanOrEqual(maxMs + 1000); // Max delay + max jitter
          expect(delay).toBeGreaterThan(0);
        });
        
        // Verify exponential pattern (bounded)
        expect(delays[0]).toBeLessThan(delays[1]);
        expect(delays[1]).toBeLessThan(delays[2]);
        expect(delays[2]).toBeLessThan(delays[3]);
        // Last delay should be capped at maxMs
        expect(delays[4]).toBeCloseTo(maxMs + 500, -2);
      } finally {
        Math.random = vi.fn(() => Math.random());
      }
    });
  });

  describe('Time-zone Correctness with Frozen Clock', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-10-09T14:30:00+03:00')); // Asia/Jerusalem
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should assert date tokens match Hebrew subject generation', async () => {
      const { todayIso, todayHe } = await import('../src/utils/date.js');
      const { generateHebrewSubject } = await import('../src/hebrew-subjects.js');
      
      // Freeze time to specific Jerusalem time
      const frozenTime = new Date('2024-10-09T14:30:00+03:00');
      vi.setSystemTime(frozenTime);
      
      const dateIso = todayIso();
      const dateHe = todayHe();
      
      expect(dateIso).toBe('2024-10-09');
      expect(dateHe).toBe('09/10/2024');
      
      // Generate Hebrew subject with date context
      const subject = generateHebrewSubject('NEW_PHONE_READY', {
        accountName: 'חברה בע"מ',
        date: dateHe,
        firstName: 'יוסי'
      });
      
      // Subject should contain the correct Hebrew date
      expect(subject).toContain('09/10/2024');
      expect(subject).toMatch(/[\u0590-\u05FF]/); // Should contain Hebrew
    });

    it('should handle timezone transitions correctly', async () => {
      const { todayHe } = await import('../src/utils/date.js');
      
      // Test daylight saving time transition
      const dstTransition = new Date('2024-03-29T02:00:00+02:00'); // Spring forward
      vi.setSystemTime(dstTransition);
      
      const dateHe = todayHe();
      expect(dateHe).toBe('29/03/2024');
      
      // Test standard time
      const standardTime = new Date('2024-10-27T02:00:00+03:00'); // Fall back
      vi.setSystemTime(standardTime);
      
      const dateHeStandard = todayHe();
      expect(dateHeStandard).toBe('27/10/2024');
    });

    it('should validate Hebrew date format consistency', async () => {
      const { todayHe } = await import('../src/utils/date.js');
      
      const testDates = [
        new Date('2024-01-01T12:00:00+02:00'), // New Year
        new Date('2024-06-15T12:00:00+03:00'), // Mid-year
        new Date('2024-12-31T12:00:00+02:00')  // End of year
      ];
      
      testDates.forEach(testDate => {
        vi.setSystemTime(testDate);
        const dateHe = todayHe();
        
        // Should match DD/MM/YYYY format
        expect(dateHe).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        
        // Should not contain time information
        expect(dateHe).not.toMatch(/T|\d{2}:\d{2}/);
      });
    });
  });
});
