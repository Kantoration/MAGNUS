/**
 * Contract tests for Glassix API
 * Verifies schema validation at API boundaries
 * Ensures graceful handling of invalid/unexpected responses
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import { clearConfigCache } from '../../src/config.js';
import {
  parseAccessTokenResponse,
  parseSendResponse,
  AccessTokenResponseSchema,
  SendResponseSchema,
  GlassixValidationError,
} from '../../src/types/glassix.js';

describe('Glassix API Contract Tests', () => {
  beforeEach(() => {
    clearConfigCache();
    vi.clearAllMocks();

    // Set up test environment
    process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
    process.env.SF_USERNAME = 'test@example.com';
    process.env.SF_PASSWORD = 'password123';
    process.env.SF_TOKEN = 'token123';
    process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
    process.env.GLASSIX_API_KEY = 'test-key';
    process.env.GLASSIX_API_SECRET = 'test-secret';
    process.env.LOG_LEVEL = 'error';
  });

  afterEach(() => {
    clearConfigCache();
    vi.restoreAllMocks();
  });

  describe('AccessTokenResponse Schema', () => {
    it('should accept valid access token response', () => {
      const validResponse = {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: 10800,
      };

      const result = AccessTokenResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.accessToken).toBe(validResponse.accessToken);
        expect(result.data.expiresIn).toBe(10800);
      }
    });

    it('should accept response without expiresIn (optional)', () => {
      const minimalResponse = {
        accessToken: 'token-123',
      };

      const result = AccessTokenResponseSchema.safeParse(minimalResponse);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.expiresIn).toBeUndefined();
      }
    });

    it('should reject response with missing accessToken', () => {
      const invalidResponse = {
        expiresIn: 10800,
      };

      const result = AccessTokenResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject response with empty accessToken', () => {
      const invalidResponse = {
        accessToken: '',
        expiresIn: 10800,
      };

      const result = AccessTokenResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject response with non-number expiresIn', () => {
      const invalidResponse = {
        accessToken: 'token-123',
        expiresIn: 'not-a-number',
      };

      const result = AccessTokenResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject response with negative expiresIn', () => {
      const invalidResponse = {
        accessToken: 'token-123',
        expiresIn: -100,
      };

      const result = AccessTokenResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('SendResponse Schema', () => {
    it('should accept valid send response (format 1: providerId)', () => {
      const validResponse = {
        providerId: 'msg-12345',
        conversationUrl: 'https://app.glassix.com/conversations/msg-12345',
        status: 'sent',
      };

      const result = SendResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should accept valid send response (format 2: messageId)', () => {
      const validResponse = {
        messageId: 'msg-67890',
        conversation_link: 'https://app.glassix.com/c/67890',
      };

      const result = SendResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should accept valid send response (format 3: nested conversation)', () => {
      const validResponse = {
        id: 'msg-abc',
        conversation: {
          id: 'conv-123',
          url: 'https://app.glassix.com/conversations/conv-123',
        },
      };

      const result = SendResponseSchema.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('should accept empty response (all fields optional)', () => {
      const emptyResponse = {};

      const result = SendResponseSchema.safeParse(emptyResponse);
      expect(result.success).toBe(true);
    });

    it('should accept response with extra fields (passthrough)', () => {
      const responseWithExtras = {
        providerId: 'msg-123',
        newField: 'future-api-field',
        metadata: { someData: 'value' },
      };

      const result = SendResponseSchema.safeParse(responseWithExtras);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL in conversationUrl', () => {
      const invalidResponse = {
        providerId: 'msg-123',
        conversationUrl: 'not-a-valid-url',
      };

      const result = SendResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('should reject invalid URL in conversation_link', () => {
      const invalidResponse = {
        providerId: 'msg-123',
        conversation_link: 'javascript:alert(1)', // XSS attempt
      };

      const result = SendResponseSchema.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  describe('parseAccessTokenResponse', () => {
    it('should parse valid response', () => {
      const validResponse = {
        accessToken: 'token-abc-123',
        expiresIn: 3600,
      };

      const result = parseAccessTokenResponse(validResponse);
      expect(result.accessToken).toBe('token-abc-123');
      expect(result.expiresIn).toBe(3600);
    });

    it('should throw GlassixValidationError on invalid response', () => {
      const invalidResponse = {
        wrongField: 'value',
      };

      expect(() => parseAccessTokenResponse(invalidResponse)).toThrow(GlassixValidationError);
      
      try {
        parseAccessTokenResponse(invalidResponse);
      } catch (error) {
        expect(error).toBeInstanceOf(GlassixValidationError);
        const validationError = error as GlassixValidationError;
        expect(validationError.getDetails()).toContain('accessToken');
      }
    });

    it('should provide detailed error information', () => {
      const invalidResponse = {
        accessToken: '', // Empty string (invalid)
      };

      try {
        parseAccessTokenResponse(invalidResponse);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GlassixValidationError);
        const validationError = error as GlassixValidationError;
        expect(validationError.zodErrors.length).toBeGreaterThan(0);
        expect(validationError.message).toBe('Invalid access token response');
      }
    });
  });

  describe('parseSendResponse', () => {
    it('should extract providerId from multiple field names', () => {
      const formats = [
        { providerId: 'msg-1' },
        { id: 'msg-2' },
        { messageId: 'msg-3' },
        { sid: 'msg-4' },
        { conversation: { id: 'msg-5' } },
      ];

      const results = formats.map(parseSendResponse);
      
      expect(results[0].providerId).toBe('msg-1');
      expect(results[1].providerId).toBe('msg-2');
      expect(results[2].providerId).toBe('msg-3');
      expect(results[3].providerId).toBe('msg-4');
      expect(results[4].providerId).toBe('msg-5');
    });

    it('should extract conversationUrl from multiple field names', () => {
      const formats = [
        { conversationUrl: 'https://app.glassix.com/c/1' },
        { conversation_link: 'https://app.glassix.com/c/2' },
        { conversation: { url: 'https://app.glassix.com/c/3' } },
      ];

      const results = formats.map(parseSendResponse);
      
      expect(results[0].conversationUrl).toBe('https://app.glassix.com/c/1');
      expect(results[1].conversationUrl).toBe('https://app.glassix.com/c/2');
      expect(results[2].conversationUrl).toBe('https://app.glassix.com/c/3');
    });

    it('should handle empty response gracefully', () => {
      const result = parseSendResponse({});
      
      expect(result.providerId).toBeUndefined();
      expect(result.conversationUrl).toBeUndefined();
    });

    it('should throw GlassixValidationError on invalid URL', () => {
      const invalidResponse = {
        providerId: 'msg-123',
        conversationUrl: 'not-a-url',
      };

      expect(() => parseSendResponse(invalidResponse)).toThrow(GlassixValidationError);
    });
  });

  describe('Integration: getAccessToken with validation', () => {
    it('should throw GlassixValidationError when API returns invalid response', async () => {
      const axiosPostSpy = vi.spyOn(axios, 'post');
      
      // Mock invalid response (missing accessToken)
      axiosPostSpy.mockResolvedValue({
        data: {
          wrongField: 'value',
        },
      });

      const { getAccessToken } = await import('../../src/glassix.js');

      await expect(getAccessToken()).rejects.toThrow(GlassixValidationError);

      axiosPostSpy.mockRestore();
    });

    it('should throw GlassixValidationError when API returns empty accessToken', async () => {
      const axiosPostSpy = vi.spyOn(axios, 'post');
      
      axiosPostSpy.mockResolvedValue({
        data: {
          accessToken: '', // Invalid: empty string
          expiresIn: 10800,
        },
      });

      const { getAccessToken } = await import('../../src/glassix.js');

      await expect(getAccessToken()).rejects.toThrow(GlassixValidationError);

      axiosPostSpy.mockRestore();
    });
  });

  describe('Integration: sendWhatsApp with validation', () => {
    it('should handle valid send response', async () => {
      const axiosPostSpy = vi.spyOn(axios, 'post');
      
      axiosPostSpy.mockResolvedValue({
        data: {
          providerId: 'msg-test-123',
          conversationUrl: 'https://app.glassix.com/c/test-123',
        },
        headers: {},
      });

      const { sendWhatsApp } = await import('../../src/glassix.js');

      const result = await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test message',
        idemKey: 'test-123',
      });

      expect(result.providerId).toBe('msg-test-123');
      expect(result.conversationUrl).toBe('https://app.glassix.com/c/test-123');

      axiosPostSpy.mockRestore();
    });

    it('should throw when API returns response with invalid URL', async () => {
      const axiosPostSpy = vi.spyOn(axios, 'post');
      
      axiosPostSpy.mockResolvedValue({
        data: {
          providerId: 'msg-123',
          conversationUrl: 'javascript:alert(1)', // Invalid protocol
        },
        headers: {},
      });

      const { sendWhatsApp } = await import('../../src/glassix.js');

      await expect(
        sendWhatsApp({
          toE164: '+972521234567',
          text: 'Test',
          idemKey: 'xss-test',
        })
      ).rejects.toThrow(GlassixValidationError);

      axiosPostSpy.mockRestore();
    });

    it('should handle response with extra unknown fields', async () => {
      const axiosPostSpy = vi.spyOn(axios, 'post');
      
      // Future API version with new fields
      axiosPostSpy.mockResolvedValue({
        data: {
          providerId: 'msg-future',
          conversationUrl: 'https://app.glassix.com/c/future',
          newField2025: 'some-value',
          metadata: { futureData: true },
        },
        headers: {},
      });

      const { sendWhatsApp } = await import('../../src/glassix.js');

      const result = await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Future test',
        idemKey: 'future-123',
      });

      // Should extract known fields and ignore extras
      expect(result.providerId).toBe('msg-future');
      expect(result.conversationUrl).toBe('https://app.glassix.com/c/future');

      axiosPostSpy.mockRestore();
    });
  });

  describe('Error Response Handling', () => {
    it('should handle API error response gracefully', async () => {
      const axiosPostSpy = vi.spyOn(axios, 'post');
      
      axiosPostSpy.mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: 'Invalid phone number',
            code: 'INVALID_PHONE',
          },
        },
        isAxiosError: true,
      });

      const { sendWhatsApp } = await import('../../src/glassix.js');

      await expect(
        sendWhatsApp({
          toE164: '+972521234567',
          text: 'Test',
          idemKey: 'error-test',
        })
      ).rejects.toThrow();

      axiosPostSpy.mockRestore();
    });

    it('should handle network timeout gracefully', async () => {
      const axiosPostSpy = vi.spyOn(axios, 'post');
      
      axiosPostSpy.mockRejectedValue({
        code: 'ECONNABORTED',
        message: 'timeout of 15000ms exceeded',
        isAxiosError: true,
      });

      const { sendWhatsApp } = await import('../../src/glassix.js');

      await expect(
        sendWhatsApp({
          toE164: '+972521234567',
          text: 'Test',
          idemKey: 'timeout-test',
        })
      ).rejects.toThrow();

      axiosPostSpy.mockRestore();
    });
  });

  describe('Response Format Variations', () => {
    it('should handle messages API format', () => {
      const messagesFormat = {
        id: 'msg-messages-123',
        conversationUrl: 'https://app.glassix.com/conversations/msg-messages-123',
        status: 'sent',
      };

      const result = parseSendResponse(messagesFormat);
      expect(result.providerId).toBe('msg-messages-123');
      expect(result.conversationUrl).toBe('https://app.glassix.com/conversations/msg-messages-123');
    });

    it('should handle protocols API format', () => {
      const protocolsFormat = {
        sid: 'proto-456',
        conversation: {
          id: 'conv-789',
          url: 'https://app.glassix.com/c/conv-789',
        },
      };

      const result = parseSendResponse(protocolsFormat);
      expect(result.providerId).toBe('proto-456');
      expect(result.conversationUrl).toBe('https://app.glassix.com/c/conv-789');
    });

    it('should handle legacy format with conversation_link', () => {
      const legacyFormat = {
        messageId: 'legacy-msg',
        conversation_link: 'https://app.glassix.com/old/legacy-msg',
      };

      const result = parseSendResponse(legacyFormat);
      expect(result.providerId).toBe('legacy-msg');
      expect(result.conversationUrl).toBe('https://app.glassix.com/old/legacy-msg');
    });
  });

  describe('GlassixValidationError', () => {
    it('should provide helpful error details', () => {
      try {
        parseAccessTokenResponse({ invalid: 'data' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GlassixValidationError);
        const validationError = error as GlassixValidationError;
        
        expect(validationError.name).toBe('GlassixValidationError');
        expect(validationError.message).toBe('Invalid access token response');
        expect(validationError.zodErrors).toBeInstanceOf(Array);
        expect(validationError.getDetails()).toBeTruthy();
      }
    });

    it('should format multiple errors', () => {
      try {
        parseAccessTokenResponse({
          accessToken: '', // Invalid: empty
          expiresIn: 'not-a-number', // Invalid: not a number
        });
        expect.fail('Should have thrown');
      } catch (error) {
        const validationError = error as GlassixValidationError;
        const details = validationError.getDetails();
        
        // Should mention both errors
        expect(details).toContain('accessToken');
      }
    });
  });
});

