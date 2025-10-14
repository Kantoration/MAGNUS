/**
 * Tests for configuration security features
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { clearConfigCache } from '../src/config.js';

describe('Configuration Security', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  describe('SAFE_MODE_STRICT', () => {
    it('should block legacy bearer mode by default', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'key123';
      delete process.env.GLASSIX_API_SECRET;
      delete process.env.ALLOW_LEGACY_BEARER;
      delete process.env.SAFE_MODE_STRICT;

      clearConfigCache();
      const { assertSecureAuth } = await import('../src/config.js');

      expect(() => assertSecureAuth()).toThrow('Secure authentication required');
      expect(() => assertSecureAuth()).toThrow('GLASSIX_API_SECRET is missing');
    });

    it('should allow legacy bearer with explicit opt-in', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'key123';
      delete process.env.GLASSIX_API_SECRET;
      process.env.ALLOW_LEGACY_BEARER = 'true';

      clearConfigCache();
      const { assertSecureAuth } = await import('../src/config.js');

      expect(() => assertSecureAuth()).not.toThrow();
    });

    it('should allow modern mode (with secret)', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'key123';
      process.env.GLASSIX_API_SECRET = 'secret123';

      clearConfigCache();
      const { assertSecureAuth } = await import('../src/config.js');

      expect(() => assertSecureAuth()).not.toThrow();
    });
  });

  describe('getRedactedEnvSnapshot', () => {
    it('should mask all secrets', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123456';
      process.env.SF_TOKEN = 'token123456';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'key123456';
      process.env.GLASSIX_API_SECRET = 'secret123456';

      clearConfigCache();
      const { getRedactedEnvSnapshot } = await import('../src/config.js');
      
      const snapshot = getRedactedEnvSnapshot();

      // Secrets should be masked
      expect(snapshot.SF_PASSWORD).toBe('****3456');
      expect(snapshot.SF_TOKEN).toBe('****3456');
      expect(snapshot.GLASSIX_API_KEY).toBe('****3456');
      expect(snapshot.GLASSIX_API_SECRET).toBe('****3456');

      // Non-secrets should be visible
      expect(snapshot.SF_USERNAME).toBe('test@example.com');
      expect(snapshot.SF_LOGIN_URL).toContain('salesforce.com');
    });

    it('should handle missing secrets gracefully', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'key123';
      delete process.env.GLASSIX_API_SECRET;
      process.env.ALLOW_LEGACY_BEARER = 'true';

      clearConfigCache();
      const { getRedactedEnvSnapshot } = await import('../src/config.js');
      
      const snapshot = getRedactedEnvSnapshot();

      expect(snapshot.GLASSIX_API_SECRET).toBe('<not-set>');
    });
  });
});

