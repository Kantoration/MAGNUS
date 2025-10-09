/**
 * Main orchestrator for the automation worker
 * Clean, testable design with proper separation of concerns
 */
import type { Connection } from 'jsforce';
import pMap from 'p-map';
import { getConfig } from './config.js';
import { getLogger } from './logger.js';
import * as sf from './sf.js';
import { sendWhatsApp, type SendResult } from './glassix.js';
import { loadTemplateMap, pickTemplate, renderMessage } from './templates.js';
import { todayIso, todayHe } from './utils/date.js';
import { mask } from './phone.js';
import type { NormalizedMapping } from './types.js';

const logger = getLogger();

/**
 * Processing statistics
 */
export interface RunStats {
  total: number;
  sent: number;
  previewed: number;
  failed: number;
  skipped: number;
  errors: Array<{ taskId: string; reason: string }>;
}

/**
 * Maximum length for Task Description field in Salesforce
 */
const MAX_DESCRIPTION_LENGTH = 32000;

/**
 * Truncate string to max length
 */
function truncate(s: string, maxLen = 1000): string {
  if (s.length <= maxLen) {
    return s;
  }
  return s.substring(0, maxLen);
}

/**
 * Mark task as completed with delivery details
 */
async function completeTask(
  conn: Connection,
  taskId: string,
  phoneE164: string,
  sendResult: SendResult
): Promise<void> {
  const now = new Date().toISOString();
  const maskedPhone = mask(phoneE164);
  const providerId = sendResult.providerId ?? 'n/a';

  // Append audit line to description
  const auditLine = `[${now}] WhatsApp → ${maskedPhone} (provId=${providerId})`;

  const glassixUrl =
    sendResult.conversationUrl ||
    `https://app.glassix.com/conversations/${providerId}`;

  try {
    // Fetch current Description using SOQL query
    const { records } = await conn.query<{ Description?: string }>(
      `SELECT Description FROM Task WHERE Id='${taskId}' LIMIT 1`
    );
    
    const previous = records[0]?.Description ?? '';
    
    // Append audit line with newline separator and truncate to field limit
    const combined = previous + '\n' + auditLine;
    const newDesc = combined.slice(-MAX_DESCRIPTION_LENGTH);

    await conn.sobject('Task').update({
      Id: taskId,
      Status: 'Completed',
      Delivery_Status__c: 'SENT',
      Last_Sent_At__c: now,
      Glassix_Conversation_URL__c: glassixUrl,
      Description: newDesc,
    });

    logger.debug({ taskId, maskedPhone, providerId }, 'Task marked completed');
  } catch (error) {
    // Check for INVALID_FIELD error and provide helpful guidance
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg.includes('INVALID_FIELD') || errorMsg.includes('No such column')) {
      logger.error(
        { taskId, error: errorMsg },
        'Failed to update Task: Custom fields missing in Salesforce. ' +
        'Please create these optional fields: Delivery_Status__c (Text), ' +
        'Last_Sent_At__c (DateTime), Glassix_Conversation_URL__c (URL). ' +
        'See README.md#salesforce-setup for details.'
      );
    } else {
      logger.warn({ taskId, error: errorMsg }, 'Failed to update task to Completed (non-fatal)');
    }
    // Don't throw - message was sent successfully
  }
}

/**
 * Mark task as failed with truncated safe error
 */
async function failTask(
  conn: Connection,
  taskId: string,
  reason: string
): Promise<void> {
  const config = getConfig();
  
  // Clean error: no stack traces, truncate to 1000 chars
  const cleanReason = truncate(reason, 1000);

  try {
    await conn.sobject('Task').update({
      Id: taskId,
      Status: 'Waiting on External',
      Failure_Reason__c: cleanReason,
      // Conditionally preserve Ready_for_Automation__c flag
      ...(config.KEEP_READY_ON_FAIL ? { Ready_for_Automation__c: true } : {}),
    });

    logger.debug({ taskId, reason: cleanReason }, 'Task marked failed');
  } catch (error) {
    // Check for INVALID_FIELD error
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg.includes('INVALID_FIELD') || errorMsg.includes('No such column')) {
      logger.error(
        { taskId, error: errorMsg },
        'Failed to update Task: Custom fields missing in Salesforce. ' +
        'Please create these optional fields: Failure_Reason__c (Text), ' +
        'Ready_for_Automation__c (Checkbox). ' +
        'See README.md#salesforce-setup for details.'
      );
    } else {
      logger.warn({ taskId, error: errorMsg }, 'Failed to update task to Waiting (non-fatal)');
    }
    // Don't throw - continue processing other tasks
  }
}

/**
 * Main orchestration loop - processes all pending tasks once
 */
export async function runOnce(): Promise<RunStats> {
  const config = getConfig();
  const isDryRun = process.env.DRY_RUN === '1';

  // Step 1: Startup
  logger.info(
    {
      mode: config.GLASSIX_API_MODE,
      limit: config.TASKS_QUERY_LIMIT,
      dryRun: isDryRun,
    },
    'AutoMessager starting'
  );

  const stats: RunStats = {
    total: 0,
    sent: 0,
    previewed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  let conn: Connection | null = null;

  try {
    // Step 2: Load template map
    const templateMap = await loadTemplateMap();
    logger.info({ templateCount: templateMap.size }, 'Templates loaded');

    // Step 3: Connect to Salesforce
    conn = await sf.login();

    // Step 4: Fetch tasks (single SOQL - no N+1)
    const tasks = await sf.fetchPendingTasks(conn);
    stats.total = tasks.length;

    if (tasks.length === 0) {
      logger.info('No pending tasks');
      return stats;
    }

    // Step 5: Process each task with limited concurrency
    // Process up to 5 tasks concurrently to balance throughput and resource usage
    const connection = conn; // Assert non-null for closure
    await pMap(
      tasks,
      async (task) => {
        try {
          await processTask(connection, task, templateMap, config, stats, isDryRun);
        } catch (error: unknown) {
          // Unexpected error during processing
          const reason = error instanceof Error ? error.message : String(error);
          stats.failed++;
          stats.errors.push({ taskId: task.Id, reason });
          logger.error({ taskId: task.Id, error: reason }, 'Unexpected error processing task');

          if (!isDryRun) {
            await failTask(connection, task.Id, reason);
          }
        }
      },
      { concurrency: 5 }
    );

    // Step 6: Report final stats
    logger.info(stats, 'Processing completed');

    return stats;
  } catch (error: unknown) {
    logger.error({ error }, 'Fatal error in runOnce');
    throw error;
  } finally {
    if (conn) {
      await conn.logout();
      logger.info('Disconnected from Salesforce');
    }
  }
}

/**
 * Process a single task through the full pipeline
 */
async function processTask(
  conn: Connection,
  task: sf.STask,
  templateMap: Map<string, NormalizedMapping>,
  config: ReturnType<typeof getConfig>,
  stats: RunStats,
  isDryRun: boolean
): Promise<void> {
  logger.debug({ taskId: task.Id, subject: task.Subject }, 'Processing task');

  // Step a) Derive task key
  const taskKey = sf.deriveTaskKey(task);

  // Step b) Get template mapping
  const mapping = pickTemplate(taskKey, templateMap);
  if (!mapping) {
    const reason = `Template not found: ${taskKey}`;
    stats.skipped++;
    stats.errors.push({ taskId: task.Id, reason });
    logger.warn({ taskId: task.Id, taskKey }, reason);

    if (!isDryRun) {
      await failTask(conn, task.Id, reason);
    }
    return;
  }

  // Step c) Get context from task
  const ctxBase = sf.getContext(task);

  // Step d) Resolve target (phone + names)
  const target = sf.resolveTarget(task);
  if (!target.phoneE164) {
    const reason = `Missing/invalid phone (source: ${target.source})`;
    stats.skipped++;
    stats.errors.push({ taskId: task.Id, reason });
    logger.warn({ taskId: task.Id, taskKey, source: target.source }, reason);

    if (!isDryRun) {
      await failTask(conn, task.Id, reason);
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
    logger.info(
      {
        taskId: task.Id,
        to: mask(target.phoneE164),
        providerId: sendResult.providerId,
      },
      'Message sent'
    );

    await completeTask(conn, task.Id, target.phoneE164, sendResult);
  } catch (error: unknown) {
    // Step i) Failure path
    const errorReason = error instanceof Error ? error.message : String(error);
    stats.failed++;
    stats.errors.push({ taskId: task.Id, reason: errorReason });
    logger.error(
      { taskId: task.Id, to: mask(target.phoneE164), error: errorReason },
      'Send failed'
    );

    await failTask(conn, task.Id, errorReason);
  }
}

/**
 * Graceful shutdown handler
 */
let isShuttingDown = false;
function gracefulShutdown(signal: string): void {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, 'Graceful shutdown initiated');

  // Give in-flight operations time to complete
  setTimeout(() => {
    logger.warn('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 10000); // 10 second timeout

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
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
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
