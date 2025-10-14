/**
 * Tests for Prometheus metrics functionality
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  trackRateLimit,
  recordSendResult,
  recordTaskResult,
  updateRunStats,
  glassixSendsTotal,
  glassixRateLimitRemaining,
  glassixRateLimitReset,
  tasksProcessedTotal,
  currentRunTasks,
  currentRunSent,
  currentRunFailed,
  resetMetrics,
  startMetricsServer,
  stopMetricsServer,
} from '../src/metrics.js';
import { getLogger } from '../src/logger.js';

describe('Metrics', () => {
  const logger = getLogger();

  beforeEach(() => {
    // Reset metrics before each test
    resetMetrics();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up any running servers
    try {
      await stopMetricsServer();
    } catch {
      // Ignore if not running
    }
  });

  describe('trackRateLimit', () => {
    it('should update gauge from X-RateLimit-Remaining header', async () => {
      const headers = {
        'x-ratelimit-remaining': '50',
        'x-ratelimit-reset': '1234567890',
      };

      trackRateLimit(headers);

      // Verify gauge was updated by checking the metric value
      const value = await glassixRateLimitRemaining.get();
      expect(value.values.length).toBeGreaterThan(0);
      expect(value.values[0].value).toBe(50);
    });

    it('should update reset timestamp from X-RateLimit-Reset header', () => {
      const headers = {
        'x-ratelimit-remaining': '100',
        'x-ratelimit-reset': '1700000000',
      };

      trackRateLimit(headers);

      const metrics = glassixRateLimitReset.get();
      expect(metrics.values[0].value).toBe(1700000000);
    });

    it('should log warning when remaining < 10', () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      const headers = {
        'x-ratelimit-remaining': '5',
        'x-ratelimit-reset': '1234567890',
      };

      trackRateLimit(headers);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          remaining: 5,
        }),
        'Approaching Glassix rate limit'
      );
    });

    it('should not log warning when remaining >= 10', () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      const headers = {
        'x-ratelimit-remaining': '10',
        'x-ratelimit-reset': '1234567890',
      };

      trackRateLimit(headers);

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should handle missing headers gracefully', () => {
      const headers = {};

      expect(() => trackRateLimit(headers)).not.toThrow();
    });

    it('should handle array header values', () => {
      const headers: Record<string, unknown> = {
        'x-ratelimit-remaining': ['25'],
        'x-ratelimit-reset': ['1234567890'],
      };

      expect(() => trackRateLimit(headers)).not.toThrow();
    });

    it('should handle invalid numeric values', () => {
      const headers = {
        'x-ratelimit-remaining': 'invalid',
        'x-ratelimit-reset': 'not-a-number',
      };

      expect(() => trackRateLimit(headers)).not.toThrow();
    });
  });

  describe('recordSendResult', () => {
    it('should increment ok counter', () => {
      recordSendResult('ok');

      const metrics = glassixSendsTotal.get();
      const okMetric = metrics.values.find((v) => v.labels.status === 'ok');
      expect(okMetric?.value).toBe(1);
    });

    it('should increment retry counter', () => {
      recordSendResult('retry');
      recordSendResult('retry');

      const metrics = glassixSendsTotal.get();
      const retryMetric = metrics.values.find((v) => v.labels.status === 'retry');
      expect(retryMetric?.value).toBe(2);
    });

    it('should increment fail counter', () => {
      recordSendResult('fail');

      const metrics = glassixSendsTotal.get();
      const failMetric = metrics.values.find((v) => v.labels.status === 'fail');
      expect(failMetric?.value).toBe(1);
    });

    it('should track multiple statuses independently', () => {
      recordSendResult('ok');
      recordSendResult('ok');
      recordSendResult('retry');
      recordSendResult('fail');

      const metrics = glassixSendsTotal.get();
      
      const okMetric = metrics.values.find((v) => v.labels.status === 'ok');
      const retryMetric = metrics.values.find((v) => v.labels.status === 'retry');
      const failMetric = metrics.values.find((v) => v.labels.status === 'fail');

      expect(okMetric?.value).toBe(2);
      expect(retryMetric?.value).toBe(1);
      expect(failMetric?.value).toBe(1);
    });
  });

  describe('recordTaskResult', () => {
    it('should increment sent counter', () => {
      recordTaskResult('sent');
      recordTaskResult('sent');

      const metrics = tasksProcessedTotal.get();
      const sentMetric = metrics.values.find((v) => v.labels.status === 'sent');
      expect(sentMetric?.value).toBe(2);
    });

    it('should increment failed counter', () => {
      recordTaskResult('failed');

      const metrics = tasksProcessedTotal.get();
      const failedMetric = metrics.values.find((v) => v.labels.status === 'failed');
      expect(failedMetric?.value).toBe(1);
    });

    it('should increment skipped counter', () => {
      recordTaskResult('skipped');
      recordTaskResult('skipped');
      recordTaskResult('skipped');

      const metrics = tasksProcessedTotal.get();
      const skippedMetric = metrics.values.find((v) => v.labels.status === 'skipped');
      expect(skippedMetric?.value).toBe(3);
    });
  });

  describe('updateRunStats', () => {
    it('should update all run stat gauges', () => {
      updateRunStats({
        tasks: 100,
        sent: 85,
        failed: 15,
      });

      expect(currentRunTasks.get().values[0].value).toBe(100);
      expect(currentRunSent.get().values[0].value).toBe(85);
      expect(currentRunFailed.get().values[0].value).toBe(15);
    });

    it('should overwrite previous values', () => {
      updateRunStats({ tasks: 10, sent: 5, failed: 5 });
      updateRunStats({ tasks: 20, sent: 15, failed: 5 });

      expect(currentRunTasks.get().values[0].value).toBe(20);
      expect(currentRunSent.get().values[0].value).toBe(15);
      expect(currentRunFailed.get().values[0].value).toBe(5);
    });
  });

  describe('startMetricsServer', () => {
    it('should start HTTP server on specified port', async () => {
      const port = 9091; // Use non-default port for testing

      await startMetricsServer(port);

      // Verify server is running by making a request
      const response = await fetch(`http://localhost:${port}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('ok');

      await stopMetricsServer();
    });

    it('should serve metrics endpoint', async () => {
      const port = 9092;

      await startMetricsServer(port);

      // Record some metrics
      recordSendResult('ok');
      recordTaskResult('sent');

      // Fetch metrics
      const response = await fetch(`http://localhost:${port}/metrics`);
      expect(response.status).toBe(200);

      const metrics = await response.text();
      expect(metrics).toContain('automessager_glassix_sends_total');
      expect(metrics).toContain('automessager_tasks_processed_total');

      await stopMetricsServer();
    });

    it('should return 404 for unknown endpoints', async () => {
      const port = 9093;

      await startMetricsServer(port);

      const response = await fetch(`http://localhost:${port}/unknown`);
      expect(response.status).toBe(404);

      await stopMetricsServer();
    });

    it('should not start multiple servers', async () => {
      const warnSpy = vi.spyOn(logger, 'warn');
      const port = 9094;

      await startMetricsServer(port);
      await startMetricsServer(port); // Try to start again

      expect(warnSpy).toHaveBeenCalledWith('Metrics server already running');

      await stopMetricsServer();
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to zero', () => {
      // Record some metrics
      recordSendResult('ok');
      recordSendResult('fail');
      recordTaskResult('sent');
      updateRunStats({ tasks: 100, sent: 50, failed: 50 });

      // Reset
      resetMetrics();

      // Verify all counters are reset
      const sendsMetrics = glassixSendsTotal.get();
      expect(sendsMetrics.values.length).toBe(0);

      const tasksMetrics = tasksProcessedTotal.get();
      expect(tasksMetrics.values.length).toBe(0);

      const runTasksMetric = currentRunTasks.get();
      expect(runTasksMetric.values.length).toBe(0);
    });
  });
});

