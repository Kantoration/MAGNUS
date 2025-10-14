/**
 * Prometheus metrics for AutoMessager observability
 * Provides counters, gauges, and histograms for monitoring Glassix API performance
 */
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { getLogger } from './logger.js';

const logger = getLogger();

/**
 * Custom metrics registry
 */
export const register = new Registry();

/**
 * Enable default Node.js metrics (CPU, memory, etc.)
 */
collectDefaultMetrics({ register });

/**
 * Counter: Total Glassix API sends
 * Labels: status (ok, retry, fail)
 */
export const glassixSendsTotal = new Counter({
  name: 'automessager_glassix_sends_total',
  help: 'Total number of Glassix API send attempts',
  labelNames: ['status'],
  registers: [register],
});

/**
 * Gauge: Current rate limit remaining
 * Updated from X-RateLimit-Remaining header
 */
export const glassixRateLimitRemaining = new Gauge({
  name: 'automessager_glassix_rate_limit_remaining',
  help: 'Remaining API calls before rate limit (from X-RateLimit-Remaining header)',
  registers: [register],
});

/**
 * Gauge: Rate limit reset timestamp
 * Updated from X-RateLimit-Reset header
 */
export const glassixRateLimitReset = new Gauge({
  name: 'automessager_glassix_rate_limit_reset',
  help: 'Unix timestamp when rate limit resets (from X-RateLimit-Reset header)',
  registers: [register],
});

/**
 * Histogram: Glassix API send latency
 * Buckets optimized for typical API response times
 */
export const glassixSendLatency = new Histogram({
  name: 'automessager_glassix_send_latency_seconds',
  help: 'Latency of Glassix API send requests in seconds',
  buckets: [0.1, 0.3, 0.5, 1, 2, 5, 10], // 100ms to 10s
  registers: [register],
});

/**
 * Counter: Total tasks processed
 * Labels: status (sent, failed, skipped)
 */
export const tasksProcessedTotal = new Counter({
  name: 'automessager_tasks_processed_total',
  help: 'Total number of Salesforce tasks processed',
  labelNames: ['status'],
  registers: [register],
});

/**
 * Histogram: Task processing duration
 */
export const taskProcessingDuration = new Histogram({
  name: 'automessager_task_processing_duration_seconds',
  help: 'Duration of individual task processing in seconds',
  buckets: [0.5, 1, 2, 5, 10, 30], // 500ms to 30s
  registers: [register],
});

/**
 * Gauge: Current run statistics
 */
export const currentRunTasks = new Gauge({
  name: 'automessager_current_run_tasks',
  help: 'Number of tasks in current run',
  registers: [register],
});

export const currentRunSent = new Gauge({
  name: 'automessager_current_run_sent',
  help: 'Number of messages sent in current run',
  registers: [register],
});

export const currentRunFailed = new Gauge({
  name: 'automessager_current_run_failed',
  help: 'Number of failed tasks in current run',
  registers: [register],
});

/**
 * Track rate limit from response headers
 * Logs warning if approaching limit
 */
export function trackRateLimit(headers: any): void {
  const remaining = headers['x-ratelimit-remaining'];
  const reset = headers['x-ratelimit-reset'];

  if (remaining) {
    const remainingValue = typeof remaining === 'string' ? parseInt(remaining, 10) : NaN;
    
    if (!isNaN(remainingValue)) {
      glassixRateLimitRemaining.set(remainingValue);

      // Warn if approaching rate limit
      if (remainingValue < 10) {
        const resetTime = reset 
          ? new Date(typeof reset === 'string' ? parseInt(reset, 10) * 1000 : 0).toISOString()
          : 'unknown';
        
        logger.warn(
          { remaining: remainingValue, reset: resetTime },
          'Approaching Glassix rate limit'
        );
      }
    }
  }

  if (reset) {
    const resetValue = typeof reset === 'string' ? parseInt(reset, 10) : NaN;
    
    if (!isNaN(resetValue)) {
      glassixRateLimitReset.set(resetValue);
    }
  }
}

/**
 * Record API send result
 */
export function recordSendResult(status: 'ok' | 'retry' | 'fail'): void {
  glassixSendsTotal.inc({ status });
}

/**
 * Record task processing result
 */
export function recordTaskResult(status: 'sent' | 'failed' | 'skipped'): void {
  tasksProcessedTotal.inc({ status });
}

/**
 * Update current run statistics
 */
export function updateRunStats(stats: { tasks: number; sent: number; failed: number }): void {
  currentRunTasks.set(stats.tasks);
  currentRunSent.set(stats.sent);
  currentRunFailed.set(stats.failed);
}

/**
 * HTTP server for Prometheus scraping
 */
let metricsServer: ReturnType<typeof createServer> | null = null;

/**
 * Start Prometheus metrics server
 * Serves /metrics endpoint for scraping
 */
export async function startMetricsServer(port: number = 9090): Promise<void> {
  if (metricsServer) {
    logger.warn('Metrics server already running');
    return;
  }

  metricsServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/metrics') {
      try {
        res.setHeader('Content-Type', register.contentType);
        const metrics = await register.metrics();
        res.end(metrics);
      } catch (error) {
        res.statusCode = 500;
        res.end('Error collecting metrics');
        logger.error({ error }, 'Failed to collect metrics');
      }
    } else if (req.url === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok' }));
    } else {
      res.statusCode = 404;
      res.end('Not Found. Available endpoints: /metrics, /health');
    }
  });

  metricsServer.listen(port, () => {
    logger.info({ port }, 'Metrics server started');
    logger.info(`Prometheus metrics available at http://localhost:${port}/metrics`);
  });
}

/**
 * Stop metrics server
 */
export async function stopMetricsServer(): Promise<void> {
  if (metricsServer) {
    return new Promise((resolve, reject) => {
      metricsServer!.close((err) => {
        if (err) {
          logger.error({ error: err }, 'Error stopping metrics server');
          reject(err);
        } else {
          logger.info('Metrics server stopped');
          metricsServer = null;
          resolve();
        }
      });
    });
  }
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  register.resetMetrics();
}

