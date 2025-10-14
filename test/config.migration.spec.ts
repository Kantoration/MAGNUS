/**
 * Tests for config migration, validation, and defaults
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfig, clearConfigCache, USE_ACCESS_TOKEN_FLOW } from '../src/config.js';

describe('Config Migration & Validation', () => {
  const originalEnv = process.env;
  let consoleWarnSpy: any;
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    clearConfigCache();
    
    // Spy on console.warn to verify legacy warning
    originalWarn = console.warn;
    consoleWarnSpy = { calls: [] as string[][] };
    console.warn = (...args: any[]) => {
      consoleWarnSpy.calls.push(args);
      // Don't call original to avoid noise in test output
    };
  });

  afterEach(() => {
    // Restore original environment and console
    process.env = originalEnv;
    console.warn = originalWarn;
    clearConfigCache();
  });

  describe('Legacy GLASSIXAPIKEY migration', () => {
    it('should migrate legacy GLASSIXAPIKEY to GLASSIX_API_KEY', () => {
      // Set up environment with only legacy key
      process.env.GLASSIXAPIKEY = 'legacy-api-key-12345';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
      process.env.SF_USERNAME = 'user@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.LOG_LEVEL = 'error';

      // Clear any modern keys
      delete process.env.GLASSIX_API_KEY;
      delete process.env.GLASSIX_API_SECRET;

      const config = getConfig();

      // Verify migration
      expect(config.GLASSIX_API_KEY).toBe('legacy-api-key-12345');
      expect(config.GLASSIX_API_SECRET).toBeUndefined();
    });

    it('should emit WARN exactly once when using legacy GLASSIXAPIKEY', () => {
      process.env.GLASSIXAPIKEY = 'legacy-key';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
      process.env.SF_USERNAME = 'user@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.LOG_LEVEL = 'error'; // Suppress logger initialization

      delete process.env.GLASSIX_API_KEY;
      delete process.env.GLASSIX_API_SECRET;

      // First call
      getConfig();
      
      // Filter to only legacy warnings (ignore any logger-related warnings)
      const legacyWarnings = consoleWarnSpy.calls.filter((call: any[]) => 
        call[0] && call[0].includes('legacy GLASSIXAPIKEY')
      );
      
      expect(legacyWarnings).toHaveLength(1);
      expect(legacyWarnings[0][0]).toContain('migrate to GLASSIX_API_KEY/GLASSIX_API_SECRET');

      // Second call should not emit another warning
      const beforeSecondCall = legacyWarnings.length;
      getConfig();
      
      const legacyWarningsAfter = consoleWarnSpy.calls.filter((call: any[]) => 
        call[0] && call[0].includes('legacy GLASSIXAPIKEY')
      );
      expect(legacyWarningsAfter).toHaveLength(beforeSecondCall); // Still only 1
    });

    it('should set USE_ACCESS_TOKEN_FLOW to false with legacy key only', async () => {
      process.env.GLASSIXAPIKEY = 'legacy-key';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
      process.env.SF_USERNAME = 'user@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.LOG_LEVEL = 'error';

      delete process.env.GLASSIX_API_KEY;
      delete process.env.GLASSIX_API_SECRET;

      getConfig();

      // Import the exported flag dynamically
      const configModule = await import('../src/config.js');
      expect(configModule.USE_ACCESS_TOKEN_FLOW).toBe(false);
    });
  });

  describe('Modern access token flow', () => {
    it('should set USE_ACCESS_TOKEN_FLOW to true with GLASSIX_API_SECRET', async () => {
      process.env.GLASSIX_API_KEY = 'modern-key';
      process.env.GLASSIX_API_SECRET = 'secret-12345';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
      process.env.SF_USERNAME = 'user@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.LOG_LEVEL = 'error';

      delete process.env.GLASSIXAPIKEY;

      getConfig();

      const configModule = await import('../src/config.js');
      expect(configModule.USE_ACCESS_TOKEN_FLOW).toBe(true);
    });

    it('should NOT emit legacy warning with modern keys', () => {
      process.env.GLASSIX_API_KEY = 'modern-key';
      process.env.GLASSIX_API_SECRET = 'secret-12345';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
      process.env.SF_USERNAME = 'user@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.LOG_LEVEL = 'error';

      delete process.env.GLASSIXAPIKEY;

      getConfig();

      expect(consoleWarnSpy.calls).toHaveLength(0);
    });
  });

  describe('Default values', () => {
    beforeEach(() => {
      // Set required fields
      process.env.GLASSIX_API_KEY = 'test-key';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
      process.env.SF_USERNAME = 'user@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.LOG_LEVEL = 'error';
    });

    it('should apply GLASSIX_API_MODE default to "messages"', () => {
      delete process.env.GLASSIX_API_MODE;
      const config = getConfig();
      expect(config.GLASSIX_API_MODE).toBe('messages');
    });

    it('should apply GLASSIX_TIMEOUT_MS default to 15000', () => {
      delete process.env.GLASSIX_TIMEOUT_MS;
      const config = getConfig();
      expect(config.GLASSIX_TIMEOUT_MS).toBe(15000);
    });

    it('should apply TASKS_QUERY_LIMIT default to 200', () => {
      delete process.env.TASKS_QUERY_LIMIT;
      const config = getConfig();
      expect(config.TASKS_QUERY_LIMIT).toBe(200);
    });

    it('should apply TASK_CUSTOM_PHONE_FIELD default to "Phone__c"', () => {
      delete process.env.TASK_CUSTOM_PHONE_FIELD;
      const config = getConfig();
      expect(config.TASK_CUSTOM_PHONE_FIELD).toBe('Phone__c');
    });

    it('should apply KEEP_READY_ON_FAIL default to true', () => {
      delete process.env.KEEP_READY_ON_FAIL;
      const config = getConfig();
      expect(config.KEEP_READY_ON_FAIL).toBe(true);
    });

    it('should apply PERMIT_LANDLINES default to false', () => {
      delete process.env.PERMIT_LANDLINES;
      const config = getConfig();
      expect(config.PERMIT_LANDLINES).toBe(false);
    });

    it('should apply RETRY_ATTEMPTS default to 3', () => {
      delete process.env.RETRY_ATTEMPTS;
      const config = getConfig();
      expect(config.RETRY_ATTEMPTS).toBe(3);
    });

    it('should apply RETRY_BASE_MS default to 300', () => {
      delete process.env.RETRY_BASE_MS;
      const config = getConfig();
      expect(config.RETRY_BASE_MS).toBe(300);
    });

    it('should apply LOG_LEVEL default to "info"', () => {
      delete process.env.LOG_LEVEL;
      const config = getConfig();
      expect(config.LOG_LEVEL).toBe('info');
    });

    it('should accept GLASSIX_API_MODE as "protocols"', () => {
      process.env.GLASSIX_API_MODE = 'protocols';
      const config = getConfig();
      expect(config.GLASSIX_API_MODE).toBe('protocols');
    });
  });

  describe('Validation', () => {
    it('should reject invalid GLASSIX_API_MODE', () => {
      process.env.GLASSIX_API_KEY = 'test-key';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_MODE = 'invalid-mode';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
      process.env.SF_USERNAME = 'user@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';

      expect(() => getConfig()).toThrow('Invalid environment configuration');
    });

    it('should require GLASSIX_API_KEY at minimum', () => {
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
      process.env.SF_USERNAME = 'user@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';

      delete process.env.GLASSIX_API_KEY;
      delete process.env.GLASSIX_API_SECRET;
      delete process.env.GLASSIXAPIKEY;

      expect(() => getConfig()).toThrow('GLASSIX_API_KEY is required');
    });

    it('should require GLASSIX_API_KEY when GLASSIX_API_SECRET is provided', () => {
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_SECRET = 'secret-only';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
      process.env.SF_USERNAME = 'user@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';

      delete process.env.GLASSIX_API_KEY;
      delete process.env.GLASSIXAPIKEY;

      expect(() => getConfig()).toThrow('GLASSIX_API_KEY is required when using GLASSIX_API_SECRET');
    });

    it('should require SF_LOGIN_URL to be a valid URL', () => {
      process.env.GLASSIX_API_KEY = 'test-key';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.SF_LOGIN_URL = 'not-a-url';
      process.env.SF_USERNAME = 'user@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';

      expect(() => getConfig()).toThrow('Invalid environment configuration');
    });

    it('should require SF_USERNAME to be an email', () => {
      process.env.GLASSIX_API_KEY = 'test-key';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
      process.env.SF_USERNAME = 'not-an-email';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';

      expect(() => getConfig()).toThrow('Invalid environment configuration');
    });
  });
});

