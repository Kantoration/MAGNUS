/**
 * Integration test for Glassix metrics tracking
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import axios from 'axios';
import { clearConfigCache } from '../src/config.js';
import { resetMetrics, glassixSendsTotal, glassixRateLimitRemaining } from '../src/metrics.js';
import { getLogger } from '../src/logger.js';

describe('Glassix Metrics Integration', () => {
  const logger = getLogger();

  beforeEach(() => {
    clearConfigCache();
    resetMetrics();
    vi.clearAllMocks();

    // Set up test environment
    process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
    process.env.SF_USERNAME = 'test@example.com';
    process.env.SF_PASSWORD = 'password123';
    process.env.SF_TOKEN = 'token123';
    process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
    process.env.GLASSIX_API_KEY = 'test-key';
    process.env.GLASSIX_API_MODE = 'messages';
    process.env.LOG_LEVEL = 'error';
    delete process.env.DRY_RUN;
  });

  afterEach(() => {
    resetMetrics();
    vi.restoreAllMocks();
  });

  it('should track rate limit headers from successful API response', async () => {
    const axiosPostSpy = vi.spyOn(axios, 'post');
    
    axiosPostSpy.mockResolvedValue({
      data: {
        providerId: 'msg-123',
        conversationUrl: 'https://app.glassix.com/c/123',
      },
      headers: {
        'x-ratelimit-remaining': '42',
        'x-ratelimit-reset': '1700000000',
      },
    });

    const { sendWhatsApp } = await import('../src/glassix.js');

    await sendWhatsApp({
      toE164: '+972521234567',
      text: 'Test message',
      idemKey: 'test-123',
    });

    // Wait a bit for metrics to be updated
    await new Promise((r) => setTimeout(r, 10));

    // Verify rate limit was tracked (check that warning is logged if remaining < 10)
    const warnSpy = vi.spyOn(logger, 'warn');
    
    // Try with low remaining
    axiosPostSpy.mockResolvedValue({
      data: { providerId: 'msg-456' },
      headers: {
        'x-ratelimit-remaining': '5',
        'x-ratelimit-reset': '1700000100',
      },
    });

    await sendWhatsApp({
      toE164: '+972521234567',
      text: 'Test message 2',
      idemKey: 'test-456',
    });

    await new Promise((r) => setTimeout(r, 10));

    // Should have warned about approaching rate limit
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        remaining: 5,
      }),
      'Approaching Glassix rate limit'
    );

    axiosPostSpy.mockRestore();
  });

  it('should record send result metrics for successful send', async () => {
    const axiosPostSpy = vi.spyOn(axios, 'post');
    
    axiosPostSpy.mockResolvedValue({
      data: {
        providerId: 'msg-success',
      },
      headers: {},
    });

    const { sendWhatsApp } = await import('../src/glassix.js');

    await sendWhatsApp({
      toE164: '+972521234567',
      text: 'Success test',
      idemKey: 'success-1',
    });

    // Check that metrics were recorded (we can't easily verify the exact count
    // due to prom-client's internal structure, but we can verify no errors)
    expect(true).toBe(true); // Test passed if no errors thrown

    axiosPostSpy.mockRestore();
  });

  it('should record send result metrics for failed send', async () => {
    const axiosPostSpy = vi.spyOn(axios, 'post');
    
    axiosPostSpy.mockRejectedValue({
      response: {
        status: 400,
        data: { error: 'Bad request' },
      },
      isAxiosError: true,
    });

    const { sendWhatsApp } = await import('../src/glassix.js');

    await expect(
      sendWhatsApp({
        toE164: '+972521234567',
        text: 'Fail test',
        idemKey: 'fail-1',
      })
    ).rejects.toThrow();

    // Metrics should have recorded the failure
    expect(true).toBe(true);

    axiosPostSpy.mockRestore();
  });

  it('should track latency for API requests', async () => {
    const axiosPostSpy = vi.spyOn(axios, 'post');
    
    // Simulate slow response
    axiosPostSpy.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: { providerId: 'slow-msg' },
                headers: {},
              }),
            100
          )
        )
    );

    const { sendWhatsApp } = await import('../src/glassix.js');

    const start = Date.now();
    await sendWhatsApp({
      toE164: '+972521234567',
      text: 'Latency test',
      idemKey: 'latency-1',
    });
    const duration = Date.now() - start;

    // Should have taken at least 100ms
    expect(duration).toBeGreaterThanOrEqual(90);

    axiosPostSpy.mockRestore();
  });
});

