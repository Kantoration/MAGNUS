/**
 * Operations & Monitoring Dashboard Tests
 * 
 * Tests for the metrics and monitoring components that feed the dashboard:
 * - Sends/Success % by task key (9 lines)
 * - Blocks vs Skips by taxonomy code (stacked)
 * - Retry rate & final failure rate (SLA early-warning)
 * - Duplicates prevented (daily)
 * - Median end-to-end latency (task fetch → SFDC audit written)
 * - Top 5 failure reasons (24h) with sample TaskIds for triage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearConfigCache } from '../src/config.js';
import { generateErrorSummary } from '../src/error-taxonomy.js';
import type { ErrorCategory, ErrorSeverity } from '../src/error-taxonomy.js';

// Mock metrics data for dashboard testing
const MOCK_METRICS_DATA = {
  taskMetrics: {
    'NEW_PHONE_READY': { sent: 45, failed: 2, skipped: 3, total: 50 },
    'PAYMENT_REMINDER': { sent: 38, failed: 1, skipped: 1, total: 40 },
    'APPOINTMENT_CONFIRMATION': { sent: 52, failed: 0, skipped: 2, total: 54 },
    'WELCOME_MESSAGE': { sent: 28, failed: 1, skipped: 1, total: 30 },
    'SERVICE_REMINDER': { sent: 33, failed: 2, skipped: 0, total: 35 },
    'DELIVERY_NOTIFICATION': { sent: 41, failed: 1, skipped: 3, total: 45 },
    'CANCELLATION_NOTICE': { sent: 19, failed: 0, skipped: 1, total: 20 },
    'RENEWAL_REMINDER': { sent: 37, failed: 3, skipped: 2, total: 42 },
    'SURVEY_INVITATION': { sent: 44, failed: 1, skipped: 0, total: 45 }
  },
  errorMetrics: [
    { taskId: 'TASK_001', reason: 'TEMPLATE_NOT_FOUND: No template found', timestamp: '2024-10-09T10:00:00Z' },
    { taskId: 'TASK_002', reason: 'PHONE_UNAVAILABLE: Missing phone number', timestamp: '2024-10-09T10:05:00Z' },
    { taskId: 'TASK_003', reason: 'GLASSIX_API_ERROR: Rate limit exceeded', timestamp: '2024-10-09T10:10:00Z' },
    { taskId: 'TASK_004', reason: 'DAILY_DEDUPLICATION: Duplicate message', timestamp: '2024-10-09T10:15:00Z' },
    { taskId: 'TASK_005', reason: 'TEMPLATE_VALIDATION_FAILED: Parameter mismatch', timestamp: '2024-10-09T10:20:00Z' },
    { taskId: 'TASK_006', reason: 'NO_TEMPLATE_MATCH: No approved template', timestamp: '2024-10-09T10:25:00Z' },
    { taskId: 'TASK_007', reason: 'NETWORK_TIMEOUT: Connection timeout', timestamp: '2024-10-09T10:30:00Z' },
    { taskId: 'TASK_008', reason: 'SF_API_ERROR: Salesforce API error', timestamp: '2024-10-09T10:35:00Z' },
    { taskId: 'TASK_009', reason: 'Unknown error occurred', timestamp: '2024-10-09T10:40:00Z' }
  ],
  latencyMetrics: [
    { taskId: 'TASK_001', latencyMs: 1250 },
    { taskId: 'TASK_002', latencyMs: 2100 },
    { taskId: 'TASK_003', latencyMs: 890 },
    { taskId: 'TASK_004', latencyMs: 1450 },
    { taskId: 'TASK_005', latencyMs: 3200 },
    { taskId: 'TASK_006', latencyMs: 980 },
    { taskId: 'TASK_007', latencyMs: 1100 },
    { taskId: 'TASK_008', latencyMs: 2800 },
    { taskId: 'TASK_009', latencyMs: 1650 }
  ],
  retryMetrics: {
    totalAttempts: 450,
    retryAttempts: 45,
    finalFailures: 12,
    successAfterRetry: 33
  },
  deduplicationMetrics: {
    duplicatesPrevented: 23,
    timeWindow: '24h',
    lastUpdated: '2024-10-09T11:00:00Z'
  }
};

describe('Operations & Monitoring Dashboard Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LOG_LEVEL = 'error';
    clearConfigCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
    vi.restoreAllMocks();
  });

  describe('Sends/Success % by Task Key (9 lines)', () => {
    it('should calculate success rates for all 9 task types', () => {
      const taskKeys = Object.keys(MOCK_METRICS_DATA.taskMetrics);
      expect(taskKeys).toHaveLength(9);

      const successRates = taskKeys.map(key => {
        const metrics = MOCK_METRICS_DATA.taskMetrics[key as keyof typeof MOCK_METRICS_DATA.taskMetrics];
        const successRate = ((metrics.sent / metrics.total) * 100).toFixed(1);
        return { taskKey: key, successRate: parseFloat(successRate) };
      });

      // Verify all task types have metrics
      expect(successRates).toHaveLength(9);
      
      // Check specific success rates
      expect(successRates.find(r => r.taskKey === 'NEW_PHONE_READY')?.successRate).toBe(90.0); // 45/50
      expect(successRates.find(r => r.taskKey === 'APPOINTMENT_CONFIRMATION')?.successRate).toBe(96.3); // 52/54
      expect(successRates.find(r => r.taskKey === 'CANCELLATION_NOTICE')?.successRate).toBe(95.0); // 19/20
    });

    it('should identify task types with low success rates', () => {
      const lowSuccessTasks = Object.entries(MOCK_METRICS_DATA.taskMetrics)
        .filter(([_, metrics]) => (metrics.sent / metrics.total) < 0.95)
        .map(([key, metrics]) => ({
          taskKey: key,
          successRate: (metrics.sent / metrics.total) * 100,
          failedCount: metrics.failed,
          skippedCount: metrics.skipped
        }));

      // Should identify tasks with success rate < 95%
      expect(lowSuccessTasks.length).toBeGreaterThan(0);
      
      // NEW_PHONE_READY has 90% success rate (45/50)
      const newPhoneTask = lowSuccessTasks.find(t => t.taskKey === 'NEW_PHONE_READY');
      expect(newPhoneTask).toBeDefined();
      expect(newPhoneTask?.successRate).toBe(90.0);
      expect(newPhoneTask?.failedCount).toBe(2);
      expect(newPhoneTask?.skippedCount).toBe(3);
    });

    it('should calculate total system success rate', () => {
      const totalMetrics = Object.values(MOCK_METRICS_DATA.taskMetrics).reduce(
        (acc, metrics) => ({
          sent: acc.sent + metrics.sent,
          failed: acc.failed + metrics.failed,
          skipped: acc.skipped + metrics.skipped,
          total: acc.total + metrics.total
        }),
        { sent: 0, failed: 0, skipped: 0, total: 0 }
      );

      const overallSuccessRate = (totalMetrics.sent / totalMetrics.total) * 100;
      expect(overallSuccessRate).toBeCloseTo(93.8, 1); // 337/361
    });
  });

  describe('Blocks vs Skips by Taxonomy Code (Stacked)', () => {
    it('should categorize errors by taxonomy code', () => {
      const errorSummary = generateErrorSummary(MOCK_METRICS_DATA.errorMetrics);

      // Verify error categorization
      expect(errorSummary.total).toBe(9);
      expect(errorSummary.byCategory.VALIDATION).toBeGreaterThan(0);
      expect(errorSummary.byCategory.TEMPLATE).toBeGreaterThan(0);
      expect(errorSummary.byCategory.PHONE).toBeGreaterThan(0);
      expect(errorSummary.byCategory.GLASSIX_API).toBeGreaterThan(0);
      expect(errorSummary.byCategory.DEDUPLICATION).toBeGreaterThan(0);
      expect(errorSummary.byCategory.NETWORK).toBeGreaterThan(0);
      expect(errorSummary.byCategory.SALESFORCE_API).toBeGreaterThan(0);
      expect(errorSummary.byCategory.UNKNOWN).toBeGreaterThan(0);
    });

    it('should separate blocks from skips', () => {
      const errorSummary = generateErrorSummary(MOCK_METRICS_DATA.errorMetrics);
      
      // Count actionable (blocks) vs non-actionable (skips)
      const blocks = MOCK_METRICS_DATA.errorMetrics.filter(error => {
        const summary = generateErrorSummary([error]);
        return summary.actionable > 0;
      });

      const skips = MOCK_METRICS_DATA.errorMetrics.filter(error => {
        const summary = generateErrorSummary([error]);
        return summary.actionable === 0;
      });

      expect(blocks.length + skips.length).toBe(9);
      expect(blocks.length).toBeGreaterThan(0);
      expect(skips.length).toBeGreaterThan(0);
    });

    it('should provide stacked chart data by taxonomy', () => {
      const taxonomyCounts: Record<string, { blocks: number; skips: number }> = {};
      
      MOCK_METRICS_DATA.errorMetrics.forEach(error => {
        const summary = generateErrorSummary([error]);
        const category = Object.keys(summary.byCategory).find(cat => 
          summary.byCategory[cat as ErrorCategory] > 0
        ) || 'UNKNOWN';
        
        if (!taxonomyCounts[category]) {
          taxonomyCounts[category] = { blocks: 0, skips: 0 };
        }
        
        const isActionable = summary.actionable > 0;
        if (isActionable) {
          taxonomyCounts[category].blocks++;
        } else {
          taxonomyCounts[category].skips++;
        }
      });

      // Verify taxonomy distribution
      expect(Object.keys(taxonomyCounts).length).toBeGreaterThan(5);
      
      // TEMPLATE category should have blocks
      expect(taxonomyCounts.TEMPLATE?.blocks).toBeGreaterThan(0);
      
      // DEDUPLICATION should be skips (non-actionable)
      expect(taxonomyCounts.DEDUPLICATION?.skips).toBeGreaterThan(0);
    });
  });

  describe('Retry Rate & Final Failure Rate (SLA Early-warning)', () => {
    it('should calculate retry rate', () => {
      const retryRate = (MOCK_METRICS_DATA.retryMetrics.retryAttempts / MOCK_METRICS_DATA.retryMetrics.totalAttempts) * 100;
      expect(retryRate).toBe(10.0); // 45/450
    });

    it('should calculate final failure rate', () => {
      const finalFailureRate = (MOCK_METRICS_DATA.retryMetrics.finalFailures / MOCK_METRICS_DATA.retryMetrics.totalAttempts) * 100;
      expect(finalFailureRate).toBe(2.7); // 12/450
    });

    it('should calculate success rate after retries', () => {
      const successAfterRetry = (MOCK_METRICS_DATA.retryMetrics.successAfterRetry / MOCK_METRICS_DATA.retryMetrics.retryAttempts) * 100;
      expect(successAfterRetry).toBe(73.3); // 33/45
    });

    it('should trigger SLA warnings for high retry rates', () => {
      const retryRate = (MOCK_METRICS_DATA.retryMetrics.retryAttempts / MOCK_METRICS_DATA.retryMetrics.totalAttempts) * 100;
      const finalFailureRate = (MOCK_METRICS_DATA.retryMetrics.finalFailures / MOCK_METRICS_DATA.retryMetrics.totalAttempts) * 100;
      
      // SLA thresholds
      const HIGH_RETRY_THRESHOLD = 15.0;
      const HIGH_FAILURE_THRESHOLD = 5.0;
      
      const retryWarning = retryRate > HIGH_RETRY_THRESHOLD;
      const failureWarning = finalFailureRate > HIGH_FAILURE_THRESHOLD;
      
      expect(retryWarning).toBe(false); // 10% < 15%
      expect(failureWarning).toBe(false); // 2.7% < 5%
    });

    it('should trigger SLA warnings for high failure rates', () => {
      // Simulate high failure scenario
      const highFailureMetrics = {
        totalAttempts: 100,
        retryAttempts: 25,
        finalFailures: 8,
        successAfterRetry: 17
      };
      
      const retryRate = (highFailureMetrics.retryAttempts / highFailureMetrics.totalAttempts) * 100;
      const finalFailureRate = (highFailureMetrics.finalFailures / highFailureMetrics.totalAttempts) * 100;
      
      const HIGH_RETRY_THRESHOLD = 15.0;
      const HIGH_FAILURE_THRESHOLD = 5.0;
      
      const retryWarning = retryRate > HIGH_RETRY_THRESHOLD;
      const failureWarning = finalFailureRate > HIGH_FAILURE_THRESHOLD;
      
      expect(retryWarning).toBe(true); // 25% > 15%
      expect(failureWarning).toBe(true); // 8% > 5%
    });
  });

  describe('Duplicates Prevented (Daily)', () => {
    it('should track daily deduplication metrics', () => {
      const dedupeMetrics = MOCK_METRICS_DATA.deduplicationMetrics;
      
      expect(dedupeMetrics.duplicatesPrevented).toBe(23);
      expect(dedupeMetrics.timeWindow).toBe('24h');
      expect(dedupeMetrics.lastUpdated).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });

    it('should calculate deduplication effectiveness', () => {
      const totalAttempts = MOCK_METRICS_DATA.retryMetrics.totalAttempts;
      const duplicatesPrevented = MOCK_METRICS_DATA.deduplicationMetrics.duplicatesPrevented;
      
      const deduplicationRate = (duplicatesPrevented / totalAttempts) * 100;
      expect(deduplicationRate).toBe(5.1); // 23/450
    });

    it('should track deduplication by time window', () => {
      const timeWindows = ['1h', '6h', '12h', '24h'];
      const dedupeByWindow = timeWindows.map(window => ({
        window,
        duplicatesPrevented: Math.floor(Math.random() * 10),
        lastUpdated: new Date().toISOString()
      }));
      
      expect(dedupeByWindow).toHaveLength(4);
      expect(dedupeByWindow.every(d => d.duplicatesPrevented >= 0)).toBe(true);
    });
  });

  describe('Median End-to-End Latency (Task Fetch → SFDC Audit Written)', () => {
    it('should calculate median latency', () => {
      const latencies = MOCK_METRICS_DATA.latencyMetrics.map(m => m.latencyMs);
      latencies.sort((a, b) => a - b);
      
      const median = latencies.length % 2 === 0
        ? (latencies[latencies.length / 2 - 1] + latencies[latencies.length / 2]) / 2
        : latencies[Math.floor(latencies.length / 2)];
      
      expect(median).toBe(1450); // Median of sorted latencies
    });

    it('should calculate P50, P95, P99 latencies', () => {
      const latencies = MOCK_METRICS_DATA.latencyMetrics.map(m => m.latencyMs);
      latencies.sort((a, b) => a - b);
      
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];
      
      expect(p50).toBe(1450); // P50
      expect(p95).toBe(3200); // P95
      expect(p99).toBe(3200); // P99 (same as max in this dataset)
    });

    it('should identify high latency tasks', () => {
      const HIGH_LATENCY_THRESHOLD = 2000; // 2 seconds
      
      const highLatencyTasks = MOCK_METRICS_DATA.latencyMetrics
        .filter(m => m.latencyMs > HIGH_LATENCY_THRESHOLD)
        .map(m => ({
          taskId: m.taskId,
          latencyMs: m.latencyMs,
          latencySeconds: (m.latencyMs / 1000).toFixed(1)
        }));
      
      expect(highLatencyTasks.length).toBe(2); // TASK_002 (2.1s) and TASK_005 (3.2s)
      expect(highLatencyTasks.find(t => t.taskId === 'TASK_005')?.latencySeconds).toBe('3.2');
    });

    it('should track latency by task type', () => {
      const latencyByTaskType = MOCK_METRICS_DATA.latencyMetrics.reduce((acc, metric) => {
        const taskType = metric.taskId.replace('TASK_', '');
        if (!acc[taskType]) {
          acc[taskType] = [];
        }
        acc[taskType].push(metric.latencyMs);
        return acc;
      }, {} as Record<string, number[]>);
      
      // Calculate average latency per task type
      const avgLatencyByType = Object.entries(latencyByTaskType).map(([type, latencies]) => ({
        taskType: type,
        avgLatencyMs: latencies.reduce((sum, l) => sum + l, 0) / latencies.length
      }));
      
      expect(avgLatencyByType).toHaveLength(9);
      expect(avgLatencyByType.every(l => l.avgLatencyMs > 0)).toBe(true);
    });
  });

  describe('Top 5 Failure Reasons (24h) with Sample TaskIds for Triage', () => {
    it('should identify top 5 failure reasons', () => {
      const failureReasons = MOCK_METRICS_DATA.errorMetrics.map(error => {
        const summary = generateErrorSummary([error]);
        const category = Object.keys(summary.byCategory).find(cat => 
          summary.byCategory[cat as ErrorCategory] > 0
        ) || 'UNKNOWN';
        
        return {
          taskId: error.taskId,
          reason: error.reason,
          category,
          severity: Object.keys(summary.bySeverity).find(sev =>
            summary.bySeverity[sev as ErrorSeverity] > 0
          ) || 'MEDIUM',
          actionable: summary.actionable > 0,
          timestamp: error.timestamp
        };
      });
      
      // Group by reason and count occurrences
      const reasonCounts = failureReasons.reduce((acc, error) => {
        const key = error.category;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      // Sort by count and take top 5
      const top5Reasons = Object.entries(reasonCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));
      
      expect(top5Reasons).toHaveLength(5);
      expect(top5Reasons[0].count).toBeGreaterThanOrEqual(top5Reasons[4].count);
    });

    it('should provide sample TaskIds for each failure reason', () => {
      const failureReasons = MOCK_METRICS_DATA.errorMetrics.map(error => {
        const summary = generateErrorSummary([error]);
        const category = Object.keys(summary.byCategory).find(cat => 
          summary.byCategory[cat as ErrorCategory] > 0
        ) || 'UNKNOWN';
        
        return {
          taskId: error.taskId,
          reason: error.reason,
          category,
          actionable: summary.actionable > 0
        };
      });
      
      // Group by category and collect sample TaskIds
      const samplesByReason = failureReasons.reduce((acc, error) => {
        if (!acc[error.category]) {
          acc[error.category] = [];
        }
        acc[error.category].push(error.taskId);
        return acc;
      }, {} as Record<string, string[]>);
      
      // Verify each failure reason has sample TaskIds
      Object.entries(samplesByReason).forEach(([reason, taskIds]) => {
        expect(taskIds.length).toBeGreaterThan(0);
        expect(taskIds.every(id => id.startsWith('TASK_'))).toBe(true);
      });
      
      expect(Object.keys(samplesByReason).length).toBeGreaterThan(5);
    });

    it('should prioritize actionable failures for triage', () => {
      const actionableFailures = MOCK_METRICS_DATA.errorMetrics
        .map(error => {
          const summary = generateErrorSummary([error]);
          return {
            taskId: error.taskId,
            reason: error.reason,
            actionable: summary.actionable > 0,
            severity: Object.keys(summary.bySeverity).find(sev =>
              summary.bySeverity[sev as ErrorSeverity] > 0
            ) || 'MEDIUM'
          };
        })
        .filter(error => error.actionable)
        .sort((a, b) => {
          const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          return severityOrder[b.severity as keyof typeof severityOrder] - 
                 severityOrder[a.severity as keyof typeof severityOrder];
        });
      
      expect(actionableFailures.length).toBeGreaterThan(0);
      expect(actionableFailures.every(f => f.actionable)).toBe(true);
    });

    it('should provide 24-hour time window context', () => {
      const now = new Date('2024-10-09T12:00:00Z');
      const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
      
      const recentErrors = MOCK_METRICS_DATA.errorMetrics.filter(error => {
        const errorTime = new Date(error.timestamp);
        return errorTime >= twentyFourHoursAgo && errorTime <= now;
      });
      
      expect(recentErrors.length).toBe(9); // All errors are within 24h window
      
      // Verify time range
      recentErrors.forEach(error => {
        const errorTime = new Date(error.timestamp);
        expect(errorTime).toBeGreaterThanOrEqual(twentyFourHoursAgo);
        expect(errorTime).toBeLessThanOrEqual(now);
      });
    });
  });

  describe('Dashboard Data Export', () => {
    it('should export complete dashboard data structure', () => {
      const dashboardData = {
        timestamp: new Date().toISOString(),
        timeWindow: '24h',
        taskSuccessRates: Object.entries(MOCK_METRICS_DATA.taskMetrics).map(([key, metrics]) => ({
          taskKey: key,
          sent: metrics.sent,
          failed: metrics.failed,
          skipped: metrics.skipped,
          total: metrics.total,
          successRate: ((metrics.sent / metrics.total) * 100).toFixed(1)
        })),
        errorBreakdown: generateErrorSummary(MOCK_METRICS_DATA.errorMetrics),
        retryMetrics: {
          retryRate: (MOCK_METRICS_DATA.retryMetrics.retryAttempts / MOCK_METRICS_DATA.retryMetrics.totalAttempts * 100).toFixed(1),
          finalFailureRate: (MOCK_METRICS_DATA.retryMetrics.finalFailures / MOCK_METRICS_DATA.retryMetrics.totalAttempts * 100).toFixed(1),
          successAfterRetry: (MOCK_METRICS_DATA.retryMetrics.successAfterRetry / MOCK_METRICS_DATA.retryMetrics.retryAttempts * 100).toFixed(1)
        },
        latencyMetrics: {
          median: 1450,
          p95: 3200,
          p99: 3200,
          highLatencyTasks: MOCK_METRICS_DATA.latencyMetrics.filter(m => m.latencyMs > 2000).length
        },
        deduplicationMetrics: MOCK_METRICS_DATA.deduplicationMetrics,
        topFailureReasons: Object.entries(
          MOCK_METRICS_DATA.errorMetrics.reduce((acc, error) => {
            const summary = generateErrorSummary([error]);
            const category = Object.keys(summary.byCategory).find(cat => 
              summary.byCategory[cat as ErrorCategory] > 0
            ) || 'UNKNOWN';
            acc[category] = (acc[category] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        )
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([reason, count]) => ({ reason, count }))
      };
      
      // Verify complete structure
      expect(dashboardData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      expect(dashboardData.taskSuccessRates).toHaveLength(9);
      expect(dashboardData.errorBreakdown.total).toBe(9);
      expect(dashboardData.retryMetrics.retryRate).toBe('10.0');
      expect(dashboardData.latencyMetrics.median).toBe(1450);
      expect(dashboardData.topFailureReasons).toHaveLength(5);
    });
  });
});
