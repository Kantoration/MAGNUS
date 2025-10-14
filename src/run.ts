/**
 * Main orchestrator for the automation worker
 * Clean, testable design with proper separation of concerns
 */
import type { Connection } from 'jsforce';
import { randomUUID } from 'crypto';
import { pathToFileURL } from 'url';
import { promises as fs } from 'fs';
import path from 'path';
import pMap from 'p-map';
import { getConfig } from './config.js';
import { getLogger, withRid } from './logger.js';
import * as sf from './sf.js';
import { sendWhatsApp } from './glassix.js';
import { loadTemplateMap, pickTemplate, renderMessage } from './templates.js';
import { todayIso, todayHe } from './utils/date.js';
import { mask } from './phone.js';
import type { NormalizedMapping } from './types.js';
import { startMetricsServer, stopMetricsServer, updateRunStats, recordTaskResult } from './metrics.js';
import { SalesforceTaskUpdater, buildFieldMap } from './sf-updater.js';

const logger = getLogger();

/**
 * Processing statistics
 */
export interface RunStats {
  tasks: number;  // Renamed from 'total' for clarity
  sent: number;
  previewed: number;
  failed: number;
  skipped: number;
  retryCount: number;  // Track total retry attempts
  errors: Array<{ taskId: string; reason: string }>;  // Detailed error log
  durationMs?: number;  // Run duration in milliseconds
}

/**
 * Write metrics to JSONL file (opt-in via METRICS_PATH env var)
 */
async function writeMetrics(stats: RunStats, startTime: number): Promise<void> {
  const metricsPath = process.env.METRICS_PATH;
  
  if (!metricsPath) {
    // Metrics disabled
    return;
  }

  try {
    const durationMs = Date.now() - startTime;
    const isDryRun = process.env.DRY_RUN === '1';
    
    const metricsRecord = {
      ts: new Date().toISOString(),
      version: '1.0.0', // TODO: read from package.json dynamically
      platform: process.platform,
      mode: isDryRun ? 'dry-run' : 'live',
      tasks: stats.tasks,
      sent: stats.sent,
      failed: stats.failed,
      skipped: stats.skipped,
      retryCount: stats.retryCount,
      durationMs,
    };

    // Append as JSONL (one JSON object per line)
    const jsonLine = JSON.stringify(metricsRecord) + '\n';
    
    // Ensure parent directory exists
    const metricsDir = path.dirname(metricsPath);
    await fs.mkdir(metricsDir, { recursive: true });
    
    // Append to file
    await fs.appendFile(metricsPath, jsonLine, 'utf-8');
    
    logger.debug({ metricsPath }, 'Metrics written');
  } catch (error) {
    // Non-fatal: log but don't throw
    logger.warn({ error, metricsPath: metricsPath }, 'Failed to write metrics');
  }
}

/**
 * Main orchestration loop - processes all pending tasks once
 */
export async function runOnce(): Promise<RunStats> {
  const startTime = Date.now();
  const rid = randomUUID();
  const log = withRid(rid);
  const config = getConfig();
  const isDryRun = process.env.DRY_RUN === '1';

  // Step 1: Startup
  log.info(
    {
      mode: config.GLASSIX_API_MODE,
      limit: config.TASKS_QUERY_LIMIT,
      dryRun: isDryRun,
    },
    'AutoMessager starting'
  );

  const stats: RunStats = {
    tasks: 0,
    sent: 0,
    previewed: 0,
    failed: 0,
    skipped: 0,
    retryCount: 0,
    errors: [],
  };

  let conn: Connection | null = null;

  // Start metrics server if enabled
  if (config.METRICS_ENABLED) {
    try {
      await startMetricsServer(config.METRICS_PORT);
      log.info({ port: config.METRICS_PORT }, 'Metrics server started');
    } catch (error) {
      log.warn({ error }, 'Failed to start metrics server (non-fatal)');
    }
  }

  try {
    // Step 2: Load template map
    const templateMap = await loadTemplateMap();
    log.info({ templateCount: templateMap.size }, 'Templates loaded');

    // Step 3: Connect to Salesforce
    conn = await sf.login();

    // Step 3a: Probe Task fields to avoid INVALID_FIELD errors
    const availableFields = await sf.describeTaskFields(conn);

    // Step 3b: Build field map for updater (once per run for performance)
    const fieldMap = buildFieldMap(availableFields);

    // Step 3c: Create Salesforce updater
    const updater = new SalesforceTaskUpdater(conn, fieldMap, config);

    // Step 4: Fetch tasks (single SOQL or paged depending on config)
    if (config.PAGED) {
      // Paged mode: process page by page
      log.info('Using paged mode for task fetching');
      
      const connection = conn; // Assert non-null for closure
      let pageNum = 0;
      
      for await (const taskPage of sf.fetchPendingTasksPaged(conn)) {
        pageNum++;
        const pageSize = taskPage.length;
        
        if (pageSize === 0) {
          continue;
        }
        
        stats.tasks += pageSize;
        log.debug({ pageNum, pageSize, totalSoFar: stats.tasks }, 'Processing task page');
        
        // Process this page with concurrency
        await pMap(
          taskPage,
          async (task) => {
            try {
              await processTask(connection, task, templateMap, config, stats, isDryRun, updater);
            } catch (error: unknown) {
              const reason = error instanceof Error ? error.message : String(error);
              stats.failed++;
              stats.errors.push({ taskId: task.Id, reason });
              logger.error({ taskId: task.Id, error: reason }, 'Unexpected error processing task');

              if (!isDryRun) {
                await updater.markFailed(task.Id, reason);
              }
            }
          },
          { concurrency: 5 }
        );
      }
      
      if (stats.tasks === 0) {
        log.info('No pending tasks');
        return stats;
      }
    } else {
      // Non-paged mode: single fetch (original behavior)
      const tasks = await sf.fetchPendingTasks(conn);
      stats.tasks = tasks.length;

      if (tasks.length === 0) {
        log.info('No pending tasks');
        return stats;
      }

      // Step 5: Process each task with limited concurrency
      const connection = conn; // Assert non-null for closure
      await pMap(
        tasks,
        async (task) => {
          try {
            await processTask(connection, task, templateMap, config, stats, isDryRun, updater);
          } catch (error: unknown) {
            // Unexpected error during processing
            const reason = error instanceof Error ? error.message : String(error);
            stats.failed++;
            stats.errors.push({ taskId: task.Id, reason });
            logger.error({ taskId: task.Id, error: reason }, 'Unexpected error processing task');

            if (!isDryRun) {
              await updater.markFailed(task.Id, reason);
            }
          }
        },
        { concurrency: 5 }
      );
    }

    // Step 6: Report final stats
    log.info(stats, 'Processing completed');

    // Update Prometheus metrics
    updateRunStats({
      tasks: stats.tasks,
      sent: stats.sent,
      failed: stats.failed,
    });

    return stats;
  } catch (error: unknown) {
    log.error({ error }, 'Fatal error in runOnce');
    throw error;
  } finally {
    if (conn) {
      await conn.logout();
      log.info('Disconnected from Salesforce');
    }
    
    // Step 7: Write metrics (opt-in)
    stats.durationMs = Date.now() - startTime;
    await writeMetrics(stats, startTime);

    // Stop metrics server if enabled (keep running for scraping)
    // Note: In production, metrics server should stay running
    // Only stop in CLI/one-shot mode
    if (config.METRICS_ENABLED && process.env.METRICS_AUTO_STOP === 'true') {
      try {
        await stopMetricsServer();
        log.info('Metrics server stopped');
      } catch (error) {
        log.warn({ error }, 'Failed to stop metrics server');
      }
    }
  }
}

/**
 * Process a single task through the full pipeline
 */
async function processTask(
  _conn: Connection,
  task: sf.STask,
  templateMap: Map<string, NormalizedMapping>,
  config: ReturnType<typeof getConfig>,
  stats: RunStats,
  isDryRun: boolean,
  updater: SalesforceTaskUpdater
): Promise<void> {
  logger.debug({ taskId: task.Id, subject: task.Subject }, 'Processing task');

  // Step a) Derive task key
  const taskKey = sf.deriveTaskKey(task);

  // Step b) Get template mapping
  const mapping = pickTemplate(taskKey, templateMap);
  if (!mapping) {
    const reason = `Template not found: ${taskKey}`;
    stats.skipped++;
    recordTaskResult('skipped');
    stats.errors.push({ taskId: task.Id, reason });
    logger.warn({ taskId: task.Id, taskKey }, reason);

    if (!isDryRun) {
      await updater.markFailed(task.Id, reason);
    }
    return;
  }

  // Step c) Get context from task
  const ctxBase = sf.getContext(task);

  // Step d) Resolve target (phone + names)
  const target = sf.resolveTarget(task);
  if (!target.phoneE164) {
    // Anti-enumeration: Generic user-facing message (no hints about phone vs other issues)
    const userFacingReason = 'Unable to process task: contact information unavailable.';
    
    // Detailed reason for audit trail (masked, logged but not in stats.errors)
    const auditReason = `Missing/invalid phone (source: ${target.source})`;
    
    stats.skipped++;
    recordTaskResult('skipped');
    stats.errors.push({ taskId: task.Id, reason: userFacingReason });
    
    // Log detailed diagnostic info with masked phone (if any)
    logger.warn({ 
      taskId: task.Id, 
      taskKey, 
      source: target.source,
      issue: 'phone_unavailable'
    }, auditReason);

    if (!isDryRun) {
      // Store audit reason in Salesforce (for admin review)
      await updater.markFailed(task.Id, auditReason);
    }
    return;
  }

  // Step e) Build render context
  const ctx = {
    ...ctxBase,
    first_name: String(ctxBase.first_name ?? target.firstName ?? ''),
    account_name: String(ctxBase.account_name ?? target.accountName ?? ''),
    date_iso: todayIso(),
    date_he: todayHe(),
    link: String(ctxBase.link ?? mapping.link ?? ''),
  };

  // Step f) Render message
  const { text, viaGlassixTemplate } = renderMessage(mapping, ctx, {
    defaultLang: config.DEFAULT_LANG,
  });

  // Step g) Send message
  if (isDryRun) {
    // DRY_RUN: just log intent
    logger.info(
      {
        taskId: task.Id,
        taskKey,
        to: mask(target.phoneE164),
        templated: !!viaGlassixTemplate,
        previewLen: text.length,
      },
      'DRY_RUN send'
    );
    stats.previewed++;
    return;
  }

  try {
    const sendResult = await sendWhatsApp({
      toE164: target.phoneE164,
      text,
      idemKey: task.Id,
      templateId: viaGlassixTemplate,
      variables: ctx, // harmless; Glassix ignores extras if not templated
    });

    // Step h) Success path
    stats.sent++;
    recordTaskResult('sent');
    logger.info(
      {
        taskId: task.Id,
        to: mask(target.phoneE164),
        providerId: sendResult.providerId,
      },
      'Message sent'
    );

    await updater.markCompleted(task.Id, { phoneE164: target.phoneE164, sendResult });
  } catch (error: unknown) {
    // Step i) Failure path
    const errorReason = error instanceof Error ? error.message : String(error);
    stats.failed++;
    recordTaskResult('failed');
    stats.errors.push({ taskId: task.Id, reason: errorReason });
    logger.error(
      { taskId: task.Id, to: mask(target.phoneE164), error: errorReason },
      'Send failed'
    );

    await updater.markFailed(task.Id, errorReason);
  }
}

/**
 * Graceful shutdown handler
 * Sets flag and schedules timeout, allowing in-flight work to complete
 */
let isShuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, 'Graceful shutdown initiated - waiting for in-flight operations');

  // Schedule forced exit after timeout
  const forceExitTimer = setTimeout(() => {
    logger.warn('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 10000); // 10 second timeout

  // Wait a moment for in-flight operations to complete
  await new Promise((resolve) => setTimeout(resolve, 1000));

  clearTimeout(forceExitTimer);
  logger.info('Graceful shutdown completed');
  process.exit(0);
}

/**
 * Setup process-level error handlers
 */
function setupErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ error, stack: error.stack }, 'Uncaught exception');
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    logger.fatal(
      {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      },
      'Unhandled promise rejection'
    );
    process.exit(1);
  });

  // Handle graceful shutdown signals
  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT');
  });
}

// CLI entry point: run once and exit
// Use pathToFileURL for correct cross-platform comparison
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Setup error handlers first
  setupErrorHandlers();

  runOnce()
    .then((stats) => {
      process.exit(stats.failed > 0 ? 1 : 0);
    })
    .catch((error: unknown) => {
      logger.fatal({ error }, 'Fatal error in runOnce');
      process.exit(1);
    });
}
