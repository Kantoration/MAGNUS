/**
 * Support bundle generator
 * Creates a ZIP file with redacted diagnostic information
 */
import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { runDiagnostics } from './doctor.js';
import { runMappingValidationFromEnv } from './mapping.js';
import { getRedactedEnvSnapshot } from '../config.js';

/**
 * Create redacted environment snapshot using centralized config function
 */
async function createEnvSnapshot(): Promise<string> {
  const lines: string[] = [
    '# Redacted Environment Snapshot',
    `# Generated: ${new Date().toISOString()}`,
    '# All secrets masked for privacy',
    '',
  ];

  const snapshot = getRedactedEnvSnapshot();

  for (const [key, value] of Object.entries(snapshot)) {
    lines.push(`${key}=${value}`);
  }

  return lines.join('\n');
}

/**
 * Get recent log content
 */
async function getRecentLogs(logPath: string, maxBytes = 2 * 1024 * 1024): Promise<string> {
  try {
    const stats = await fs.stat(logPath);
    
    if (stats.size <= maxBytes) {
      return await fs.readFile(logPath, 'utf-8');
    }

    // Read last maxBytes
    const buffer = Buffer.alloc(maxBytes);
    const fd = await fs.open(logPath, 'r');
    
    try {
      await fd.read(buffer, 0, maxBytes, stats.size - maxBytes);
      return buffer.toString('utf-8');
    } finally {
      await fd.close();
    }
  } catch (error) {
    return `# Error reading log: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Get template manifest (derived data only, never raw Excel content)
 * Includes headers, template names, and validation status
 * NEVER includes message bodies or customer data
 */
async function getTemplateManifest(): Promise<string> {
  try {
    const result = await runMappingValidationFromEnv();
    const { promises: fs } = await import('fs');
    const XLSX = await import('xlsx');
    
    // Get Excel file stats (not content)
    let fileStats: { size: number; modified: string } | undefined;
    if (result.path) {
      try {
        const stats = await fs.stat(result.path);
        fileStats = {
          size: stats.size,
          modified: stats.mtime.toISOString(),
        };
      } catch {
        // Ignore if file not accessible
      }
    }
    
    // Get sheet names without reading content
    let sheetNames: string[] = [];
    if (result.path) {
      try {
        const buffer = await fs.readFile(result.path);
        const workbook = XLSX.read(buffer, { type: 'buffer', bookSheets: true });
        sheetNames = workbook.SheetNames;
      } catch {
        // Ignore if file not readable
      }
    }
    
    return JSON.stringify(
      {
        ok: result.ok,
        count: result.count,
        path: result.path,
        sheet: result.sheet,
        sampleKeys: result.sampleKeys.slice(0, 10), // Template names only, no message bodies
        warningCount: result.warnings.length,
        errorCount: result.errors.length,
        warnings: result.warnings.slice(0, 5),
        errors: result.errors.slice(0, 5),
        fileStats,
        sheetNames,
        note: 'Manifest includes template names only. Message bodies and customer data are excluded for privacy.',
      },
      null,
      2
    );
  } catch (error) {
    return JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    );
  }
}

/**
 * Get package metadata
 */
async function getPackageMetadata(): Promise<string> {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    
    return JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      null,
      2
    );
  } catch (error) {
    return JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      null,
      2
    );
  }
}

/**
 * Create support bundle ZIP file
 */
export async function createSupportBundle(): Promise<string> {
  console.log('\n📦 Creating support bundle...\n');

  // Create logs directory if it doesn't exist
  const logsDir = path.join(process.cwd(), 'logs');
  try {
    await fs.mkdir(logsDir, { recursive: true });
  } catch {
    // Ignore if exists
  }

  // Generate bundle filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T');
  const dateStr = timestamp[0];
  const timeStr = timestamp[1].substring(0, 5).replace('-', '');
  const bundleFilename = `support-bundle-${dateStr}-${timeStr}.zip`;
  const bundlePath = path.join(logsDir, bundleFilename);

  // Create ZIP
  const zip = new AdmZip();

  // 1. Redacted environment
  console.log('  • Adding redacted environment snapshot...');
  const envSnapshot = await createEnvSnapshot();
  zip.addFile('environment.txt', Buffer.from(envSnapshot, 'utf-8'));

  // 2. Doctor diagnostics
  console.log('  • Running diagnostics...');
  try {
    const doctorResult = await runDiagnostics();
    zip.addFile('diagnostics.json', Buffer.from(JSON.stringify(doctorResult, null, 2), 'utf-8'));
  } catch (error) {
    zip.addFile(
      'diagnostics.error.txt',
      Buffer.from(`Error running diagnostics: ${error instanceof Error ? error.message : String(error)}`, 'utf-8')
    );
  }

  // 3. Recent logs
  console.log('  • Adding recent logs...');
  const mainLogPath = path.join(logsDir, 'automessager.log');
  try {
    const mainLog = await getRecentLogs(mainLogPath);
    zip.addFile('automessager.log', Buffer.from(mainLog, 'utf-8'));
  } catch {
    // Log might not exist yet
  }

  // Today's run log
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const runLogPath = path.join(logsDir, `run-${today}.log`);
  try {
    const runLog = await getRecentLogs(runLogPath);
    zip.addFile(`run-${today}.log`, Buffer.from(runLog, 'utf-8'));
  } catch {
    // Run log might not exist yet
  }

  // 4. Template manifest
  console.log('  • Adding template manifest...');
  const templateManifest = await getTemplateManifest();
  zip.addFile('template-manifest.json', Buffer.from(templateManifest, 'utf-8'));

  // 5. Package metadata
  console.log('  • Adding package metadata...');
  const packageMetadata = await getPackageMetadata();
  zip.addFile('package-metadata.json', Buffer.from(packageMetadata, 'utf-8'));

  // 6. Add README
  const readme = [
    '# AutoMessager Support Bundle',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Bundle: ${bundleFilename}`,
    '',
    '## Contents',
    '',
    '- environment.txt: Redacted environment variables (secrets masked)',
    '- diagnostics.json: Full diagnostic results from doctor command',
    '- automessager.log: Recent main log (last 2MB)',
    '- run-YYYYMMDD.log: Today\'s run log (if available)',
    '- template-manifest.json: Excel mapping summary',
    '- package-metadata.json: Application version and platform info',
    '',
    '## Privacy',
    '',
    'All sensitive information (passwords, tokens, API keys) has been masked.',
    'Phone numbers are not included in logs.',
    '',
    '## Usage',
    '',
    'Attach this ZIP file to your support ticket or send to your system administrator.',
    '',
  ].join('\n');

  zip.addFile('README.txt', Buffer.from(readme, 'utf-8'));

  // Write ZIP file
  console.log('  • Writing bundle...\n');
  zip.writeZip(bundlePath);

  // Get file size
  const stats = await fs.stat(bundlePath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`✅ Support bundle created successfully!\n`);
  console.log(`   Location: ${bundlePath}`);
  console.log(`   Size: ${sizeMB} MB\n`);
  console.log('📧 Next steps:');
  console.log('   1. Attach this file to your support ticket');
  console.log('   2. Or send to your system administrator');
  console.log('   3. Note: Sensitive data has been redacted\n');

  return bundlePath;
}

/**
 * CLI command entry point
 */
export async function runSupportBundleCommand(): Promise<number> {
  try {
    await createSupportBundle();
    return 0;
  } catch (error) {
    console.error('❌ Failed to create support bundle:', error);
    return 1;
  }
}

