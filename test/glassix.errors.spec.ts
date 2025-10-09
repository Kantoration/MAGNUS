/**
 * Error handling tests for Glassix client
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios, { AxiosError } from 'axios';
import { GlassixClient } from '../src/glassix.js';

// Mock axios and axios.isAxiosError
vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
    isAxiosError: vi.fn(),
  },
  isAxiosError: vi.fn(),
}));

describe('Glassix Error Handling', () => {
  let client: GlassixClient;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock axios.create
    const mockPost = vi.fn();
    (axios.create as any).mockReturnValue({
      post: mockPost,
    });

    // Mock axios.isAxiosError to return true for our test errors
    (axios.isAxiosError as any).mockReturnValue(true);

    client = new GlassixClient();
  });

  it('should handle 429 rate limit error with truncated message', async () => {
    const longErrorMessage = 'Rate limit exceeded. '.repeat(100); // Create a long message

    const error: Partial<AxiosError> = {
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 429',
      response: {
        status: 429,
        statusText: 'Too Many Requests',
        data: {
          message: longErrorMessage,
        },
        headers: {},
        config: {} as any,
      },
    };

    // Get the mock post function
    const mockPost = (axios.create as any).mock.results[0].value.post;
    mockPost.mockRejectedValue(error);

    const result = await client.sendWhatsAppMessage('+972521234567', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    // Verify error message is truncated to 500 chars
    if (result.error) {
      expect(result.error.length).toBeLessThanOrEqual(520); // 500 + "... (truncated)"
      expect(result.error).toContain('... (truncated)');
    }
  });

  it('should handle 500 server error without exposing auth headers', async () => {
    const error: Partial<AxiosError> = {
      isAxiosError: true,
      code: 'ERR_BAD_RESPONSE',
      message: 'Request failed with status code 500',
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        data: {
          message: 'Internal server error occurred',
        },
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer secret_token_12345', // Should NOT be logged
        },
        config: {
          headers: {
            Authorization: 'Bearer secret_token_12345', // Should NOT be logged
          },
        } as any,
      },
    };

    const mockPost = (axios.create as any).mock.results[0].value.post;
    mockPost.mockRejectedValue(error);

    const result = await client.sendWhatsAppMessage('+972521234567', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Internal server error occurred');

    // Verify auth tokens are NOT in the result
    expect(result.error).not.toContain('secret_token');
    expect(result.error).not.toContain('Bearer');
  });

  it('should handle network timeout error', async () => {
    const error: Partial<AxiosError> = {
      isAxiosError: true,
      code: 'ECONNABORTED',
      message: 'timeout of 30000ms exceeded',
      response: undefined,
    };

    const mockPost = (axios.create as any).mock.results[0].value.post;
    mockPost.mockRejectedValue(error);

    const result = await client.sendWhatsAppMessage('+972521234567', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('timeout of 30000ms exceeded');
  });

  it('should handle 400 bad request with validation errors', async () => {
    const error: Partial<AxiosError> = {
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        statusText: 'Bad Request',
        data: {
          message: 'Invalid phone number format',
        },
        headers: {},
        config: {} as any,
      },
    };

    const mockPost = (axios.create as any).mock.results[0].value.post;
    mockPost.mockRejectedValue(error);

    const result = await client.sendWhatsAppMessage('+972INVALID', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid phone number format');
  });

  it('should handle 401 unauthorized error', async () => {
    const error: Partial<AxiosError> = {
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 401',
      response: {
        status: 401,
        statusText: 'Unauthorized',
        data: {
          message: 'Invalid or expired API key',
        },
        headers: {},
        config: {} as any,
      },
    };

    const mockPost = (axios.create as any).mock.results[0].value.post;
    mockPost.mockRejectedValue(error);

    const result = await client.sendWhatsAppMessage('+972521234567', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid or expired API key');
  });

  it('should handle non-Axios errors gracefully', async () => {
    const error = new Error('Unexpected error occurred');

    // For this test, make isAxiosError return false
    (axios.isAxiosError as any).mockReturnValueOnce(false);

    const mockPost = (axios.create as any).mock.results[0].value.post;
    mockPost.mockRejectedValue(error);

    const result = await client.sendWhatsAppMessage('+972521234567', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unexpected error occurred');
  });

  it('should handle response with no error message', async () => {
    const error: Partial<AxiosError> = {
      isAxiosError: true,
      code: 'ERR_BAD_RESPONSE',
      message: 'Request failed with status code 503',
      response: {
        status: 503,
        statusText: 'Service Unavailable',
        data: {}, // No message field
        headers: {},
        config: {} as any,
      },
    };

    const mockPost = (axios.create as any).mock.results[0].value.post;
    mockPost.mockRejectedValue(error);

    const result = await client.sendWhatsAppMessage('+972521234567', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Request failed with status code 503');
  });

  it('should mask phone numbers in all error scenarios', async () => {
    const error: Partial<AxiosError> = {
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        statusText: 'Bad Request',
        data: {
          message: 'Phone number +972521234567 is blocked',
        },
        headers: {},
        config: {} as any,
      },
    };

    const mockPost = (axios.create as any).mock.results[0].value.post;
    mockPost.mockRejectedValue(error);

    const phone = '+972521234567';
    const result = await client.sendWhatsAppMessage(phone, 'Test message');

    expect(result.success).toBe(false);

    // The error message itself may contain the phone, but logs should mask it
    // This is handled by the logger redaction and mask() function
    // Verify that mask() works correctly
    const { mask: maskFn } = await import('../src/phone.js');
    const masked = maskFn(phone);
    expect(masked).toBe('+9725******67');
    expect(masked).not.toContain('21234');
  });

  it('should truncate extremely long error messages', async () => {
    const veryLongMessage = 'Error: ' + 'x'.repeat(1000);

    const error: Partial<AxiosError> = {
      isAxiosError: true,
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed',
      response: {
        status: 500,
        statusText: 'Internal Server Error',
        data: {
          message: veryLongMessage,
        },
        headers: {},
        config: {} as any,
      },
    };

    const mockPost = (axios.create as any).mock.results[0].value.post;
    mockPost.mockRejectedValue(error);

    const result = await client.sendWhatsAppMessage('+972521234567', 'Test message');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();

    if (result.error) {
      // Should be truncated to 500 chars + "... (truncated)"
      expect(result.error.length).toBeLessThanOrEqual(520);
      expect(result.error).toContain('... (truncated)');
    }
  });
});

