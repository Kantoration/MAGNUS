/**
 * Tests for Glassix authentication and token flow
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { clearConfigCache } from '../src/config.js';

describe('Glassix Authentication', () => {
  beforeEach(() => {
    // Clear config cache before each test
    clearConfigCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.GLASSIX_API_SECRET;
    clearConfigCache();
  });

  describe('Token Flow', () => {
    it('should obtain token once and reuse until near expiry', async () => {
      // Set up environment for modern mode
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'key123';
      process.env.GLASSIX_API_SECRET = 'secret123';

      // Mock axios.post for token exchange
      const axiosPostSpy = vi.spyOn(axios, 'post');
      axiosPostSpy.mockResolvedValue({
        data: {
          accessToken: 'temp-token-abc123',
          expiresIn: 10800, // 3 hours
        },
      });

      // Import after env is set
      const { getAccessToken } = await import('../src/glassix.js');
      const { USE_ACCESS_TOKEN_FLOW } = await import('../src/config.js');

      expect(USE_ACCESS_TOKEN_FLOW).toBe(true);

      // First call should fetch token
      const token1 = await getAccessToken();
      expect(token1).toBe('temp-token-abc123');
      expect(axiosPostSpy).toHaveBeenCalledTimes(1);

      // Second call should reuse cached token
      const token2 = await getAccessToken();
      expect(token2).toBe('temp-token-abc123');
      expect(axiosPostSpy).toHaveBeenCalledTimes(1); // Still 1, not 2

      axiosPostSpy.mockRestore();
    });

    it('should refresh token when cache expires', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'key123';
      process.env.GLASSIX_API_SECRET = 'secret123';

      const axiosPostSpy = vi.spyOn(axios, 'post');
      
      // First token with short TTL
      axiosPostSpy.mockResolvedValueOnce({
        data: {
          accessToken: 'token-1',
          expiresIn: 1, // 1 second (will expire immediately)
        },
      });
      
      // Second token
      axiosPostSpy.mockResolvedValueOnce({
        data: {
          accessToken: 'token-2',
          expiresIn: 10800,
        },
      });

      const { getAccessToken } = await import('../src/glassix.js');

      // First call
      const token1 = await getAccessToken();
      expect(token1).toBe('token-1');

      // Wait for expiry
      await new Promise((r) => setTimeout(r, 100));

      // Second call should refresh
      const token2 = await getAccessToken();
      expect(token2).toBe('token-2');
      expect(axiosPostSpy).toHaveBeenCalledTimes(2);

      axiosPostSpy.mockRestore();
    });
  });

  describe('Timeout Configuration', () => {
    it('should honor GLASSIX_TIMEOUT_MS in token exchange', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'key123';
      process.env.GLASSIX_API_SECRET = 'secret123';
      process.env.GLASSIX_TIMEOUT_MS = '5000';

      const axiosPostSpy = vi.spyOn(axios, 'post');
      axiosPostSpy.mockResolvedValue({
        data: {
          accessToken: 'token',
          expiresIn: 10800,
        },
      });

      const { getAccessToken } = await import('../src/glassix.js');
      await getAccessToken();

      // Verify timeout was passed to axios
      expect(axiosPostSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 5000,
        })
      );

      axiosPostSpy.mockRestore();
    });
  });

  describe('Retry Configuration', () => {
    it('should use configured RETRY_ATTEMPTS', async () => {
      process.env.RETRY_ATTEMPTS = '2';
      
      const { getConfig } = await import('../src/config.js');
      const config = getConfig();

      expect(config.RETRY_ATTEMPTS).toBe(2);
    });

    it('should use configured RETRY_BASE_MS', async () => {
      process.env.RETRY_BASE_MS = '500';
      
      const { getConfig } = await import('../src/config.js');
      const config = getConfig();

      expect(config.RETRY_BASE_MS).toBe(500);
    });

    it('should calculate backoff with jitter', () => {
      const { calculateBackoff } = require('../src/http-error.js');
      
      const baseMs = 300;
      const backoff = calculateBackoff(2, baseMs);
      
      // Attempt 2: 600ms base + 0-100ms jitter
      expect(backoff).toBeGreaterThanOrEqual(600);
      expect(backoff).toBeLessThan(700);
    });
  });

  describe('Mode Switching', () => {
    it('should enable access token flow when both key and secret present', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'key123';
      process.env.GLASSIX_API_SECRET = 'secret123';

      const { USE_ACCESS_TOKEN_FLOW, getConfig } = await import('../src/config.js');
      getConfig(); // Trigger config load

      expect(USE_ACCESS_TOKEN_FLOW).toBe(true);
    });

    it('should use legacy mode when only key present', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'key123';
      delete process.env.GLASSIX_API_SECRET;

      clearConfigCache();
      const { USE_ACCESS_TOKEN_FLOW, getConfig } = await import('../src/config.js');
      getConfig(); // Trigger config load

      expect(USE_ACCESS_TOKEN_FLOW).toBe(false);
    });
  });

  describe('Secret Scrubbing in Error Messages', () => {
    it('should redact apiKey and secret from access token exchange errors', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'super-secret-key-12345';
      process.env.GLASSIX_API_SECRET = 'super-secret-value-67890';

      // Mock axios.post to reject with an error that contains secrets
      const axiosPostSpy = vi.spyOn(axios, 'post');
      axiosPostSpy.mockRejectedValue({
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: {
            message: 'Authentication failed',
            details: '{"apiKey":"super-secret-key-12345","secret":"super-secret-value-67890"}',
          },
        },
        isAxiosError: true,
      });

      const { getAccessToken } = await import('../src/glassix.js');

      // Attempt to get access token (should fail)
      await expect(getAccessToken()).rejects.toThrow();

      try {
        await getAccessToken();
      } catch (error: any) {
        const errorMessage = error.message;

        // Verify secrets are NOT in the error message
        expect(errorMessage).not.toContain('super-secret-key-12345');
        expect(errorMessage).not.toContain('super-secret-value-67890');

        // Verify [REDACTED] placeholders are present
        expect(errorMessage).toContain('[REDACTED]');
        
        // Should still contain generic error info
        expect(errorMessage).toContain('Access token exchange failed');
      }

      axiosPostSpy.mockRestore();
    });

    it('should redact secrets from errors with various JSON formats', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'test-key';
      process.env.GLASSIX_API_SECRET = 'test-secret';

      const axiosPostSpy = vi.spyOn(axios, 'post');
      
      // Test with different JSON spacing formats
      axiosPostSpy.mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: 'Invalid request: "apiKey":"test-key", "secret":"test-secret"',
          },
        },
        isAxiosError: true,
      });

      const { getAccessToken } = await import('../src/glassix.js');

      try {
        await getAccessToken();
        // Should not reach here
        expect.fail('Expected getAccessToken to throw');
      } catch (error: any) {
        // Verify secrets are redacted
        expect(error.message).not.toContain('test-key');
        expect(error.message).not.toContain('test-secret');
        expect(error.message).toContain('[REDACTED]');
      }

      axiosPostSpy.mockRestore();
    });

    it('should redact secrets with no spacing in JSON', async () => {
      process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password123';
      process.env.SF_TOKEN = 'token123';
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'compact-key-123';
      process.env.GLASSIX_API_SECRET = 'compact-secret-456';

      const axiosPostSpy = vi.spyOn(axios, 'post');
      
      // Compact JSON format (no spaces)
      axiosPostSpy.mockRejectedValue({
        response: {
          status: 500,
          data: '{"apiKey":"compact-key-123","secret":"compact-secret-456"}',
        },
        isAxiosError: true,
      });

      const { getAccessToken } = await import('../src/glassix.js');

      try {
        await getAccessToken();
        expect.fail('Expected getAccessToken to throw');
      } catch (error: any) {
        // Verify compact format secrets are also redacted
        expect(error.message).not.toContain('compact-key-123');
        expect(error.message).not.toContain('compact-secret-456');
        expect(error.message).toContain('[REDACTED]');
      }

      axiosPostSpy.mockRestore();
    });
  });
});

