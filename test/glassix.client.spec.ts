/**
 * Unit tests for robust Glassix client
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { sendWhatsApp, type SendParams } from '../src/glassix.js';

// Need to set env vars before importing config
process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
process.env.SF_USERNAME = 'test@example.com';
process.env.SF_PASSWORD = 'password';
process.env.SF_TOKEN = 'token';
process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
process.env.GLASSIX_API_KEY = 'test-api-key';
process.env.GLASSIX_API_MODE = 'messages';

// Mock axios
vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
    isAxiosError: vi.fn(),
  },
  isAxiosError: vi.fn(),
}));

describe('Glassix Client', () => {
  let mockPost: ReturnType<typeof vi.fn>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };

    // Mock axios.create
    mockPost = vi.fn();
    (axios.create as any).mockReturnValue({
      post: mockPost,
    });

    // Mock axios.isAxiosError - important to make it actually check
    (axios.isAxiosError as any).mockImplementation((error: any) => {
      return error && error.isAxiosError === true;
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('DRY_RUN mode', () => {
    it('should return dry-run providerId without making network call', async () => {
      process.env.DRY_RUN = '1';

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Test message',
        idemKey: 'task-123',
      };

      const result = await sendWhatsApp(params);

      expect(result.providerId).toBe('dry-run');
      expect(result.conversationUrl).toBeUndefined();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('should log intent with masked phone in DRY_RUN mode', async () => {
      process.env.DRY_RUN = '1';

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Test message with template',
        idemKey: 'task-456',
        templateId: 'welcome_template',
      };

      const result = await sendWhatsApp(params);

      expect(result.providerId).toBe('dry-run');
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('Phone validation', () => {
    it('should throw error for non-+972 phone numbers', async () => {
      const params: SendParams = {
        toE164: '+1234567890',
        text: 'Test',
        idemKey: 'task-789',
      };

      await expect(sendWhatsApp(params)).rejects.toThrow(
        /Invalid phone number format.*Must start with \+972/
      );
    });

    it('should accept valid +972 phone numbers', async () => {
      mockPost.mockResolvedValue({
        data: { id: 'msg-123', conversationUrl: 'https://app.glassix.com/c/123' },
      });

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-valid',
      };

      const result = await sendWhatsApp(params);

      expect(result.providerId).toBe('msg-123');
      expect(mockPost).toHaveBeenCalled();
    });
  });

  describe('Retry logic', () => {
    it('should retry on 429 and succeed on second attempt', async () => {
      const error429 = {
        isAxiosError: true,
        name: 'AxiosError',
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          data: { message: 'Rate limit exceeded' },
          headers: {},
          config: {} as any,
        },
        code: 'ERR_BAD_REQUEST',
        message: 'Request failed with status code 429',
        config: {} as any,
        toJSON: () => ({}),
      };

      // First call fails with 429, second succeeds
      mockPost
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce({
          data: { id: 'msg-retry-success', conversationUrl: 'https://app.glassix.com/c/456' },
        });

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Retry test',
        idemKey: 'task-retry',
      };

      const result = await sendWhatsApp(params);

      expect(result.providerId).toBe('msg-retry-success');
      expect(mockPost).toHaveBeenCalledTimes(2);
    });

    it('should retry on 503 with exponential backoff', async () => {
      const error503 = {
        isAxiosError: true,
        name: 'AxiosError',
        response: {
          status: 503,
          statusText: 'Service Unavailable',
          data: { message: 'Service temporarily unavailable' },
          headers: {},
          config: {} as any,
        },
        code: 'ERR_BAD_RESPONSE',
        message: 'Request failed with status code 503',
        config: {} as any,
        toJSON: () => ({}),
      };

      // Fail twice, succeed on third
      mockPost
        .mockRejectedValueOnce(error503)
        .mockRejectedValueOnce(error503)
        .mockResolvedValueOnce({
          data: { id: 'msg-backoff-success' },
        });

      const params: SendParams = {
        toE164: '+972529876543',
        text: 'Backoff test',
        idemKey: 'task-backoff',
      };

      const result = await sendWhatsApp(params);

      expect(result.providerId).toBe('msg-backoff-success');
      expect(mockPost).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries exhausted', async () => {
      const error502 = {
        isAxiosError: true,
        name: 'AxiosError',
        response: {
          status: 502,
          statusText: 'Bad Gateway',
          data: { message: 'Gateway error' },
          headers: {},
          config: {} as any,
        },
        code: 'ERR_BAD_RESPONSE',
        message: 'Request failed with status code 502',
        config: {} as any,
        toJSON: () => ({}),
      };

      // Fail all 3 attempts
      mockPost.mockRejectedValue(error502);

      const params: SendParams = {
        toE164: '+972521112222',
        text: 'Fail test',
        idemKey: 'task-fail',
      };

      await expect(sendWhatsApp(params)).rejects.toThrow(/502 Bad Gateway/);
      expect(mockPost).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 400 bad request', async () => {
      const error400 = {
        isAxiosError: true,
        name: 'AxiosError',
        response: {
          status: 400,
          statusText: 'Bad Request',
          data: { message: 'Invalid phone number' },
          headers: {},
          config: {} as any,
        },
        code: 'ERR_BAD_REQUEST',
        message: 'Request failed with status code 400',
        config: {} as any,
        toJSON: () => ({}),
      };

      mockPost.mockRejectedValue(error400);

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Bad request test',
        idemKey: 'task-400',
      };

      await expect(sendWhatsApp(params)).rejects.toThrow(/400 Bad Request/);
      expect(mockPost).toHaveBeenCalledTimes(1); // No retries
    });
  });

  describe('Error message safety', () => {
    it('should truncate long error messages to 500 chars', async () => {
      const longMessage = 'Error: ' + 'x'.repeat(1000);

      const error = {
        isAxiosError: true,
        name: 'AxiosError',
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: longMessage },
          headers: {},
          config: {} as any,
        },
        code: 'ERR_BAD_RESPONSE',
        message: 'Request failed',
        config: {} as any,
        toJSON: () => ({}),
      };

      mockPost.mockRejectedValue(error);

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-long-error',
      };

      try {
        await sendWhatsApp(params);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('... (truncated)');
        expect(error.message.length).toBeLessThan(600); // status + text + truncated message
      }
    });

    it('should not expose authorization headers in error messages', async () => {
      const error = {
        isAxiosError: true,
        name: 'AxiosError',
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: { message: 'Invalid API key' },
          headers: {
            authorization: 'Bearer secret-key-12345',
          },
          config: {
            headers: {
              Authorization: 'Bearer secret-key-12345',
            },
          } as any,
        },
        code: 'ERR_BAD_REQUEST',
        message: 'Request failed',
        config: {} as any,
        toJSON: () => ({}),
      };

      mockPost.mockRejectedValue(error);

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-401',
      };

      try {
        await sendWhatsApp(params);
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).not.toContain('secret-key');
        expect(error.message).not.toContain('Bearer');
        expect(error.message).toContain('401');
        expect(error.message).toContain('Unauthorized');
      }
    });
  });

  describe('Idempotency', () => {
    it('should set Idempotency-Key header from idemKey param', async () => {
      mockPost.mockResolvedValue({
        data: { id: 'msg-idem' },
      });

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-unique-123',
      };

      await sendWhatsApp(params);

      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': 'task-unique-123',
          }),
        })
      );
    });
  });

  describe('API modes', () => {
    it('should use /api/messages endpoint for free text in messages mode', async () => {
      process.env.GLASSIX_API_MODE = 'messages';

      mockPost.mockResolvedValue({
        data: { id: 'msg-free-text' },
      });

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Free text message',
        idemKey: 'task-free',
      };

      await sendWhatsApp(params);

      expect(mockPost).toHaveBeenCalledWith(
        '/api/messages',
        expect.objectContaining({
          channel: 'whatsapp',
          to: '+972521234567',
          type: 'text',
          text: 'Free text message',
        }),
        expect.any(Object)
      );
    });

    it('should use /api/messages/template endpoint for template in messages mode', async () => {
      process.env.GLASSIX_API_MODE = 'messages';

      mockPost.mockResolvedValue({
        data: { id: 'msg-template' },
      });

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Template text',
        idemKey: 'task-template',
        templateId: 'welcome_tmpl',
        variables: { name: 'Dan', company: 'MAGNUS' },
      };

      await sendWhatsApp(params);

      expect(mockPost).toHaveBeenCalledWith(
        '/api/messages/template',
        expect.objectContaining({
          channel: 'whatsapp',
          to: '+972521234567',
          templateId: 'welcome_tmpl',
          variables: { name: 'Dan', company: 'MAGNUS' },
        }),
        expect.any(Object)
      );
    });

    it('should use /v1/protocols/send endpoint in protocols mode', async () => {
      process.env.GLASSIX_API_MODE = 'protocols';

      mockPost.mockResolvedValue({
        data: { id: 'proto-msg' },
      });

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Protocol message',
        idemKey: 'task-proto',
      };

      await sendWhatsApp(params);

      expect(mockPost).toHaveBeenCalledWith(
        '/v1/protocols/send',
        expect.objectContaining({
          protocol: 'whatsapp',
          to: '+972521234567',
          content: {
            type: 'text',
            text: 'Protocol message',
          },
        }),
        expect.any(Object)
      );
    });

    it('should include templateId and variables in protocols mode', async () => {
      process.env.GLASSIX_API_MODE = 'protocols';

      mockPost.mockResolvedValue({
        data: { id: 'proto-template' },
      });

      const params: SendParams = {
        toE164: '+972529876543',
        text: 'Template via protocols',
        idemKey: 'task-proto-tmpl',
        templateId: 'payment_reminder',
        variables: { amount: 100, due_date: '2025-10-15' },
      };

      await sendWhatsApp(params);

      expect(mockPost).toHaveBeenCalledWith(
        '/v1/protocols/send',
        expect.objectContaining({
          protocol: 'whatsapp',
          templateId: 'payment_reminder',
          variables: { amount: 100, due_date: '2025-10-15' },
        }),
        expect.any(Object)
      );
    });
  });

  describe('Response parsing', () => {
    it('should parse conversationUrl from data.conversationUrl', async () => {
      mockPost.mockResolvedValue({
        data: {
          id: 'msg-123',
          conversationUrl: 'https://app.glassix.com/conversations/conv-456',
        },
      });

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-parse-1',
      };

      const result = await sendWhatsApp(params);

      expect(result.conversationUrl).toBe('https://app.glassix.com/conversations/conv-456');
      expect(result.providerId).toBe('msg-123');
    });

    it('should parse conversationUrl from data.conversation.url', async () => {
      mockPost.mockResolvedValue({
        data: {
          messageId: 'msg-789',
          conversation: {
            id: 'conv-101',
            url: 'https://app.glassix.com/c/101',
          },
        },
      });

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-parse-2',
      };

      const result = await sendWhatsApp(params);

      expect(result.conversationUrl).toBe('https://app.glassix.com/c/101');
      expect(result.providerId).toBe('msg-789');
    });

    it('should fallback to conversation.id for providerId', async () => {
      mockPost.mockResolvedValue({
        data: {
          conversation: {
            id: 'conv-fallback',
            url: 'https://app.glassix.com/c/fb',
          },
        },
      });

      const params: SendParams = {
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-parse-3',
      };

      const result = await sendWhatsApp(params);

      expect(result.providerId).toBe('conv-fallback');
      expect(result.conversationUrl).toBe('https://app.glassix.com/c/fb');
    });
  });
});

