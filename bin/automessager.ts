#!/usr/bin/env node

/**
 * AutoMessager CLI Entry Point
 * Production-friendly command-line interface with setup wizard, verification, diagnostics, and execution
 */
import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Clean up old log files (keep only last 30 days)
 */
async function cleanupOldLogs(logsDir: string, retentionDays: number = 30): Promise<void> {
  try {
    const files = await fs.readdir(logsDir);
    const now = Date.now();
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

    for (const file of files) {
      // Only clean up daily log files (automessager-YYYY-MM-DD.log pattern)
      if (file.match(/^automessager-\d{4}-\d{2}-\d{2}\.log$/)) {
        const filePath = path.join(logsDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          const age = now - stats.mtimeMs;

          if (age > retentionMs) {
            await fs.unlink(filePath);
            console.log(`Cleaned up old log file: ${file}`);
          }
        } catch (error) {
          // Ignore errors on individual files
        }
      }
    }
  } catch (error) {
    // Non-fatal: log cleanup errors but don't throw
    console.warn('Failed to clean up old logs:', error);
  }
}

/**
 * Setup dual logging (console + daily file)
 * Logs rotate daily and old logs are automatically cleaned up (30-day retention)
 */
async function setupLogging() {
  const logsDir = path.join(process.cwd(), 'logs');
  
  // Create logs directory if it doesn't exist
  try {
    await fs.mkdir(logsDir, { recursive: true });
  } catch (error) {
    // Ignore if already exists
  }

  // Daily log file: automessager-YYYY-MM-DD.log
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const logFile = path.join(logsDir, `automessager-${today}.log`);

  // Clean up old logs (async, non-blocking)
  cleanupOldLogs(logsDir, 30).catch(() => {
    // Ignore cleanup errors
  });

  // Create a pino logger with pretty printing for console
  const logger = pino({
    transport: {
      targets: [
        {
          target: 'pino-pretty',
          level: 'info',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
        {
          target: 'pino/file',
          level: 'info',
          options: {
            destination: logFile,
            mkdir: true,
          },
        },
      ],
    },
  });

  return logger;
}

/**
 * Get package version
 */
async function getVersion(): Promise<string> {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/**
 * Run lightweight preflight checks before execution
 */
async function runPreflight(): Promise<boolean> {
  console.log('\n🛡️  Running preflight checks...\n');

  try {
    // Import verify module
    const { runVerify } = await import('../src/cli/verify.js');
    
    // Run verification (will handle output internally)
    const result = await runVerify({ json: false });

    if (!result.success) {
      console.log('❌ Preflight checks failed\n');
      console.log('Please fix the issues above before running.\n');
      console.log('Recommended actions:');
      console.log('  1. Run: automessager doctor (for detailed diagnostics)');
      console.log('  2. Run: automessager verify:mapping (for Excel issues)');
      console.log('  3. Run: automessager init (to reconfigure)\n');
      console.log('To bypass preflight checks (not recommended):');
      console.log('  automessager run --no-guard\n');
      return false;
    }

    console.log('✅ Preflight checks passed\n');
    return true;
  } catch (error) {
    console.error('❌ Preflight failed with error:', error);
    return false;
  }
}

/**
 * Init command - run interactive setup wizard
 */
async function initCommand() {
  try {
    const { runWizard } = await import('../src/cli/wizard.js');
    const result = await runWizard();

    if (result.success) {
      console.log('✅ Setup completed successfully\n');
      process.exit(0);
    } else {
      console.error('❌ Setup failed\n');
      if (result.warnings.length > 0) {
        result.warnings.forEach((w) => console.error(`  ${w}`));
      }
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error during setup:', error);
    process.exit(1);
  }
}

/**
 * Verify command - run comprehensive checks
 */
async function verifyCommand(opts: { json?: boolean }) {
  try {
    const { runVerify } = await import('../src/cli/verify.js');
    const result = await runVerify({ json: opts.json });

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Fatal error during verification:', error);
    process.exit(1);
  }
}

/**
 * Verify:mapping command - strict Excel validation only
 */
async function verifyMappingCommand() {
  try {
    const { runMappingCommand } = await import('../src/cli/mapping.js');
    const exitCode = await runMappingCommand();
    process.exit(exitCode);
  } catch (error) {
    console.error('Fatal error during mapping validation:', error);
    process.exit(1);
  }
}

/**
 * Doctor command - deep diagnostics
 */
async function doctorCommand() {
  try {
    const { runDoctorCommand } = await import('../src/cli/doctor.js');
    const exitCode = await runDoctorCommand();
    process.exit(exitCode);
  } catch (error) {
    console.error('Fatal error during diagnostics:', error);
    process.exit(1);
  }
}

/**
 * Support-bundle command - create redacted support ZIP
 */
async function supportBundleCommand() {
  try {
    const { runSupportBundleCommand } = await import('../src/cli/support.js');
    const exitCode = await runSupportBundleCommand();
    process.exit(exitCode);
  } catch (error) {
    console.error('Fatal error creating support bundle:', error);
    process.exit(1);
  }
}

/**
 * Dry-run command - preview without sending
 */
async function dryRunCommand(opts: { noGuard?: boolean }) {
  const logger = await setupLogging();
  
  try {
    // Run preflight unless --no-guard is set
    if (!opts.noGuard) {
      const preflightOk = await runPreflight();
      if (!preflightOk) {
        process.exit(1);
      }
    } else {
      logger.warn('Preflight checks bypassed with --no-guard');
    }

    logger.info('Starting AutoMessager in DRY_RUN mode');
    
    // Set DRY_RUN environment variable
    process.env.DRY_RUN = '1';
    
    const { runOnce } = await import('../src/run.js');
    const stats = await runOnce();

    logger.info(stats, 'Dry-run completed');
    
    console.log('\n📊 Dry-Run Summary:');
    console.log(`  Total tasks: ${stats.tasks}`);
    console.log(`  Previewed: ${stats.previewed}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Failed: ${stats.failed}\n`);

    if (stats.errors.length > 0) {
      console.log('⚠️  Errors encountered:');
      stats.errors.slice(0, 5).forEach((e) => {
        console.log(`  - Task ${e.taskId}: ${e.reason}`);
      });
      if (stats.errors.length > 5) {
        console.log(`  ... and ${stats.errors.length - 5} more\n`);
      }
      console.log('');
    }

    process.exit(stats.failed > 0 ? 1 : 0);
  } catch (error) {
    logger.error({ error }, 'Fatal error during dry-run');
    console.error('❌ Dry-run failed:', error);
    process.exit(1);
  }
}

/**
 * Run command - execute normally
 */
async function runCommand(opts: { noGuard?: boolean }) {
  const logger = await setupLogging();
  
  try {
    // Assert secure auth before running (can be bypassed with env vars)
    const { assertSecureAuth } = await import('../src/config.js');
    try {
      assertSecureAuth();
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    // Run preflight unless --no-guard is set
    if (!opts.noGuard) {
      const preflightOk = await runPreflight();
      if (!preflightOk) {
        process.exit(1);
      }
    } else {
      logger.warn('Preflight checks bypassed with --no-guard');
    }

    logger.info('Starting AutoMessager');
    
    // Ensure DRY_RUN is not set
    delete process.env.DRY_RUN;
    
    const { runOnce } = await import('../src/run.js');
    const stats = await runOnce();

    logger.info(stats, 'Run completed');
    
    console.log('\n📊 Run Summary:');
    console.log(`  Total tasks: ${stats.tasks}`);
    console.log(`  Sent: ${stats.sent}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Failed: ${stats.failed}\n`);

    if (stats.errors.length > 0) {
      console.log('⚠️  Errors encountered:');
      stats.errors.slice(0, 5).forEach((e) => {
        console.log(`  - Task ${e.taskId}: ${e.reason}`);
      });
      if (stats.errors.length > 5) {
        console.log(`  ... and ${stats.errors.length - 5} more\n`);
      }
      console.log('');
    }

    process.exit(stats.failed > 0 ? 1 : 0);
  } catch (error) {
    logger.error({ error }, 'Fatal error during run');
    console.error('❌ Run failed:', error);
    process.exit(1);
  }
}

/**
 * Version command - display version info
 */
async function versionCommand() {
  const version = await getVersion();
  const nodeVersion = process.version;
  const platform = process.platform;
  const arch = process.arch;
  
  // Build date from compilation or package
  const buildDate = new Date().toISOString().split('T')[0];

  console.log('\n📦 AutoMessager');
  console.log(`Version: ${version}`);
  console.log(`Build Date: ${buildDate}`);
  console.log(`Node: ${nodeVersion}`);
  console.log(`Platform: ${platform} (${arch})\n`);
  
  process.exit(0);
}

/**
 * Main CLI setup
 */
async function main() {
  const version = await getVersion();
  
  const program = new Command();

  program
    .name('automessager')
    .description('AutoMessager - Automated WhatsApp messaging for Salesforce')
    .version(version);

  program
    .command('init')
    .description('Interactive setup wizard to create/update .env configuration')
    .action(initCommand);

  program
    .command('verify')
    .description('Run environment and connectivity checks')
    .option('--json', 'Output results as JSON')
    .action(verifyCommand);

  program
    .command('verify:mapping')
    .description('Strict Excel mapping validation only')
    .action(verifyMappingCommand);

  program
    .command('doctor')
    .description('Deep diagnostics with prescriptive actions')
    .action(doctorCommand);

  program
    .command('support-bundle')
    .description('Create redacted support bundle ZIP')
    .action(supportBundleCommand);

  program
    .command('dry-run')
    .description('Run orchestrator with DRY_RUN=1 (no network sends)')
    .option('--no-guard', 'Skip preflight checks (advanced)')
    .action(dryRunCommand);

  program
    .command('run')
    .description('Run orchestrator normally (live mode)')
    .option('--no-guard', 'Skip preflight checks (advanced)')
    .action(runCommand);

  program
    .command('version')
    .description('Display version and build info')
    .action(versionCommand);

  // Show help if no command provided
  if (process.argv.length <= 2) {
    program.help();
  }

  await program.parseAsync(process.argv);
}

// Entry point
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
