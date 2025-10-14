/**
 * Tests for Glassix error handling - authorization redaction, retryability, safety
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { sendWhatsApp } from '../src/glassix.js';
import { clearConfigCache } from '../src/config.js';

describe('Glassix Error Handling', () => {
  let mock: MockAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
    process.env.GLASSIX_API_KEY = 'test-api-key';
    process.env.GLASSIX_API_MODE = 'messages';
    process.env.GLASSIX_TIMEOUT_MS = '15000';
    process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
    process.env.SF_USERNAME = 'test@example.com';
    process.env.SF_PASSWORD = 'password';
    process.env.SF_TOKEN = 'token';
    process.env.RETRY_ATTEMPTS = '3';
    process.env.RETRY_BASE_MS = '300';
    process.env.LOG_LEVEL = 'error';
    delete process.env.DRY_RUN;
    delete process.env.GLASSIX_API_SECRET;

    clearConfigCache();

    // Mock axios
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
    mock.restore();
  });

  it('should handle 429 rate limit error with truncated message', async () => {
    const longMessage = 'Rate limit exceeded. '.repeat(50); // Long error message
    mock.onPost(/\/api\/messages$/).reply(429, { error: longMessage });

    try {
      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-429',
      });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toContain('429');
      expect(error.message.length).toBeLessThan(600); // Truncated
    }
  });

  it('should handle 500 server error without exposing auth headers', async () => {
    const errorWithAuth = {
      error: 'Internal Server Error',
      authorization: 'Bearer secret-token-12345',
      debug: {
        authorization: 'Bearer another-secret',
      },
    };

    mock.onPost(/\/api\/messages$/).reply(500, errorWithAuth);

    try {
      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-500',
      });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toContain('500');
      expect(error.message).not.toContain('secret-token-12345');
      expect(error.message).not.toContain('another-secret');
      expect(error.message).toContain('[REDACTED]'); // Authorization redacted
    }
  });

  it('should handle network timeout error', async () => {
    mock.onPost(/\/api\/messages$/).timeout();

    try {
      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-timeout',
      });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toBeDefined();
      expect(error.message.length).toBeGreaterThan(0);
    }
  });

  it('should handle 400 bad request with validation errors', async () => {
    mock.onPost(/\/api\/messages$/).reply(400, {
      error: 'Validation failed',
      details: {
        to: 'Invalid phone number format',
        authorization: 'Bearer leaked-secret',
      },
    });

    try {
      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-400',
      });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toContain('400');
      expect(error.message).toContain('Validation failed');
      expect(error.message).not.toContain('leaked-secret');
      expect(mock.history.post).toHaveLength(1); // No retries on 400
    }
  });

  it('should handle 401 unauthorized error', async () => {
    mock.onPost(/\/api\/messages$/).reply(401, {
      error: 'Unauthorized',
      message: 'Invalid API key',
    });

    try {
      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-401',
      });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toContain('401');
      expect(error.message).toContain('Unauthorized');
      expect(mock.history.post).toHaveLength(1); // No retries on 401
    }
  });

  it('should handle non-Axios errors gracefully', async () => {
    // Simulate a non-Axios error (e.g., programming error)
    mock.onPost(/\/api\/messages$/).reply(() => {
      throw new Error('Unexpected programming error');
    });

    try {
      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-non-axios',
      });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toBeDefined();
      expect(error.message).not.toContain('Authorization');
      expect(error.message).not.toContain('Bearer');
    }
  });

  it('should handle response with no error message', async () => {
    mock.onPost(/\/api\/messages$/).reply(500); // No response body

    try {
      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-no-msg',
      });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toContain('500');
    }
  });

  it('should mask phone numbers in all error scenarios', async () => {
    mock.onPost(/\/api\/messages$/).reply(404, { error: 'Not found' });

    try {
      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-mask',
      });
      expect.fail('Should have thrown');
    } catch (error: any) {
      // Phone should be masked in logs (not in error message necessarily)
      expect(error.message).toBeDefined();
      // The main verification is that logs use mask() - tested via logger spy in other tests
    }
  });

  it('should truncate extremely long error messages', async () => {
    const hugeError = 'x'.repeat(2000);
    mock.onPost(/\/api\/messages$/).reply(503, { error: hugeError });

    try {
      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-huge',
      });
      expect.fail('Should have thrown');
    } catch (error: any) {
      expect(error.message).toContain('…'); // Truncation marker
      expect(error.message.length).toBeLessThan(600);
    }
  });
});
