#!/usr/bin/env tsx
/**
 * Release Check - Validates readiness for v1.0.0 release
 * Ensures all binaries, docs, and tests pass before tagging
 */

import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  optional?: boolean;
}

const results: CheckResult[] = [];

/**
 * Print colored output
 */
function printResult(result: CheckResult): void {
  const icon = result.passed ? '✅' : result.optional ? '⚠️ ' : '❌';
  const status = result.passed ? 'PASS' : result.optional ? 'WARN' : 'FAIL';
  console.log(`${icon} [${status}] ${result.name}`);
  if (result.message) {
    console.log(`     ${result.message}`);
  }
}

/**
 * Check if file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check binaries exist and are executable
 */
async function checkBinaries(): Promise<void> {
  console.log('\n📦 Checking Binaries...\n');
  
  // Windows binary
  const winBinary = 'build/bin/automessager-win.exe';
  const winExists = await fileExists(winBinary);
  
  if (winExists) {
    const stats = await fs.stat(winBinary);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    results.push({
      name: 'Windows Binary',
      passed: true,
      message: `Found at ${winBinary} (${sizeMB} MB)`
    });
  } else {
    results.push({
      name: 'Windows Binary',
      passed: false,
      message: `Not found: ${winBinary}. Run: npm run package:win`
    });
  }
  
  // macOS binary
  const macBinary = 'build/bin/automessager-mac';
  const macExists = await fileExists(macBinary);
  
  if (macExists) {
    const stats = await fs.stat(macBinary);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    results.push({
      name: 'macOS Binary',
      passed: true,
      message: `Found at ${macBinary} (${sizeMB} MB)`
    });
  } else {
    results.push({
      name: 'macOS Binary',
      passed: false,
      message: `Not found: ${macBinary}. Run: npm run package:mac`
    });
  }
  
  results.forEach(printResult);
}

/**
 * Check required documentation files
 */
async function checkDocumentation(): Promise<void> {
  console.log('\n📚 Checking Documentation...\n');
  
  const requiredDocs = [
    { path: 'README.md', name: 'Main README' },
    { path: 'SETUP.md', name: 'Setup Guide' },
    { path: 'TROUBLESHOOTING.md', name: 'Troubleshooting Guide' },
    { path: 'RELEASE_NOTES_v1.0.0.md', name: 'Release Notes' },
    { path: 'docs/README-QUICKSTART.md', name: 'Quickstart Guide' },
    { path: 'docs/MACOS_SIGNING_NOTES.md', name: 'macOS Signing Guide' },
  ];
  
  for (const doc of requiredDocs) {
    const exists = await fileExists(doc.path);
    results.push({
      name: doc.name,
      passed: exists,
      message: exists ? `✓ ${doc.path}` : `Missing: ${doc.path}`
    });
  }
  
  results.slice(-requiredDocs.length).forEach(printResult);
}

/**
 * Check helper tools
 */
async function checkTools(): Promise<void> {
  console.log('\n🔧 Checking Helper Tools...\n');
  
  const tools = [
    { path: 'tools/verify-mapping.cmd', name: 'Windows Mapping Validator' },
    { path: 'tools/verify-mapping.sh', name: 'Unix Mapping Validator' },
    { path: 'tools/smoke.cmd', name: 'Windows Smoke Test' },
    { path: 'tools/smoke.sh', name: 'Unix Smoke Test' },
    { path: 'scripts/windows/Create-DesktopShortcut.ps1', name: 'Desktop Shortcut Script' },
  ];
  
  for (const tool of tools) {
    const exists = await fileExists(tool.path);
    results.push({
      name: tool.name,
      passed: exists,
      message: exists ? `✓ ${tool.path}` : `Missing: ${tool.path}`
    });
  }
  
  results.slice(-tools.length).forEach(printResult);
}

/**
 * Check sample files
 */
async function checkSamples(): Promise<void> {
  console.log('\n📋 Checking Sample Files...\n');
  
  // .env.example (optional - can be generated)
  const envExample = await fileExists('templates/.env.example');
  results.push({
    name: '.env.example Template',
    passed: envExample,
    message: envExample ? '✓ templates/.env.example' : 'Will be generated during packaging',
    optional: true
  });
  
  // Sample Excel (optional - client provides their own)
  const excelSample = await fileExists('massege_maping.xlsx') || await fileExists('templates/massege_maping.xlsx');
  results.push({
    name: 'Sample Excel File',
    passed: excelSample,
    message: excelSample ? '✓ Found sample Excel' : 'Clients will provide their own',
    optional: true
  });
  
  results.slice(-2).forEach(printResult);
}

/**
 * Run verification on sample mapping (if exists)
 */
async function checkMappingValidation(): Promise<void> {
  console.log('\n🔍 Checking Mapping Validation...\n');
  
  const excelPath = await fileExists('massege_maping.xlsx') 
    ? 'massege_maping.xlsx' 
    : await fileExists('templates/massege_maping.xlsx')
      ? 'templates/massege_maping.xlsx'
      : null;
  
  if (!excelPath) {
    results.push({
      name: 'Mapping Validation',
      passed: true,
      message: 'No sample Excel to validate (optional)',
      optional: true
    });
  } else {
    try {
      const { stdout, stderr } = await execAsync('npm run verify:mapping');
      const passed = !stderr && stdout.includes('verify: OK');
      
      results.push({
        name: 'Mapping Validation',
        passed,
        message: passed ? '✓ Sample Excel validated' : 'Validation failed - check npm run verify:mapping'
      });
    } catch (error) {
      results.push({
        name: 'Mapping Validation',
        passed: false,
        message: 'Validation command failed'
      });
    }
  }
  
  results.slice(-1).forEach(printResult);
}

/**
 * Check TypeScript compilation
 */
async function checkBuild(): Promise<void> {
  console.log('\n🔨 Checking Build...\n');
  
  try {
    await execAsync('npm run build');
    results.push({
      name: 'TypeScript Build',
      passed: true,
      message: '✓ Build successful'
    });
  } catch (error) {
    results.push({
      name: 'TypeScript Build',
      passed: false,
      message: 'Build failed - fix TypeScript errors'
    });
  }
  
  results.slice(-1).forEach(printResult);
}

/**
 * Check tests pass
 */
async function checkTests(): Promise<void> {
  console.log('\n🧪 Checking Tests...\n');
  
  try {
    const { stdout } = await execAsync('npm run test:run');
    const passed = stdout.includes('PASS') || stdout.includes('passed');
    
    results.push({
      name: 'Unit Tests',
      passed,
      message: passed ? '✓ All tests passed' : 'Some tests failed'
    });
  } catch (error) {
    results.push({
      name: 'Unit Tests',
      passed: false,
      message: 'Test suite failed - run npm test for details'
    });
  }
  
  results.slice(-1).forEach(printResult);
}

/**
 * Check package.json version
 */
async function checkVersion(): Promise<void> {
  console.log('\n🏷️  Checking Version...\n');
  
  try {
    const pkgContent = await fs.readFile('package.json', 'utf-8');
    const pkg = JSON.parse(pkgContent);
    const version = pkg.version;
    
    const isCorrect = version === '1.0.0';
    results.push({
      name: 'Package Version',
      passed: isCorrect,
      message: isCorrect ? '✓ Version is 1.0.0' : `Version is ${version}, expected 1.0.0`
    });
  } catch (error) {
    results.push({
      name: 'Package Version',
      passed: false,
      message: 'Could not read package.json'
    });
  }
  
  results.slice(-1).forEach(printResult);
}

/**
 * Check code export exists and is redacted
 */
async function checkCodeExport(): Promise<void> {
  console.log('\n📄 Checking Code Export...\n');
  
  const exportFiles = [
    'docs/project_export.txt',
    'logs/Project Source Code Export.txt'
  ];
  
  let found = false;
  let foundPath = '';
  
  for (const exportPath of exportFiles) {
    if (await fileExists(exportPath)) {
      found = true;
      foundPath = exportPath;
      
      // Check if it's redacted (should not contain actual secrets)
      const content = await fs.readFile(exportPath, 'utf-8');
      const hasSecrets = content.includes('your-password') || content.includes('your-api-key');
      
      results.push({
        name: 'Code Export',
        passed: !hasSecrets,
        message: hasSecrets 
          ? `Found at ${foundPath} but may contain secrets!` 
          : `✓ Found at ${foundPath} (redacted)`,
        optional: true
      });
      break;
    }
  }
  
  if (!found) {
    results.push({
      name: 'Code Export',
      passed: true,
      message: 'Not required for binary release',
      optional: true
    });
  }
  
  results.slice(-1).forEach(printResult);
}

/**
 * Main check function
 */
async function runReleaseChecks(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  AutoMessager v1.0.0 - Release Readiness Check');
  console.log('═══════════════════════════════════════════════════════════');
  
  // Run all checks
  await checkVersion();
  await checkBinaries();
  await checkDocumentation();
  await checkTools();
  await checkSamples();
  await checkBuild();
  await checkTests();
  await checkMappingValidation();
  await checkCodeExport();
  
  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  const totalChecks = results.length;
  const requiredChecks = results.filter(r => !r.optional);
  const optionalChecks = results.filter(r => r.optional);
  
  const requiredPassed = requiredChecks.filter(r => r.passed).length;
  const requiredFailed = requiredChecks.length - requiredPassed;
  
  const optionalPassed = optionalChecks.filter(r => r.passed).length;
  const optionalWarnings = optionalChecks.length - optionalPassed;
  
  console.log(`Total Checks: ${totalChecks}`);
  console.log(`  Required: ${requiredPassed}/${requiredChecks.length} passed`);
  console.log(`  Optional: ${optionalPassed}/${optionalChecks.length} passed`);
  console.log('');
  
  if (requiredFailed > 0) {
    console.log('❌ RELEASE NOT READY');
    console.log('');
    console.log('Failed Checks:');
    requiredChecks.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
    console.log('');
    process.exit(1);
  } else if (optionalWarnings > 0) {
    console.log('⚠️  RELEASE READY WITH WARNINGS');
    console.log('');
    console.log('Warnings:');
    optionalChecks.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
    console.log('');
    console.log('You can proceed with the release, but consider addressing warnings.');
    console.log('');
    process.exit(0);
  } else {
    console.log('✅ RELEASE READY!');
    console.log('');
    console.log('All checks passed. You can now:');
    console.log('  1. Create client kit: npm run release:clientkit');
    console.log('  2. Tag release: git tag -a v1.0.0 -m "Production Release v1.0.0"');
    console.log('  3. Distribute the client kit ZIP');
    console.log('');
    process.exit(0);
  }
}

// Run checks
runReleaseChecks().catch((error) => {
  console.error('');
  console.error('FATAL ERROR:', error);
  process.exit(1);
});

