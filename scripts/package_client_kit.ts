#!/usr/bin/env tsx
/**
 * Package Client Kit - Creates turnkey distribution ZIP
 * Generates AutoMessager-ClientKit-v1.0.0.zip with all client-facing assets
 */

import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

const VERSION = '1.0.0';
const OUTPUT_DIR = 'dist';
const ZIP_NAME = `AutoMessager-ClientKit-v${VERSION}.zip`;
const BUILD_DIR = 'build/bin';

interface FileMapping {
  source: string;
  target: string;
  required?: boolean;
}

/**
 * Files to include in the client kit
 */
const FILE_MAPPINGS: FileMapping[] = [
  // Binaries
  { source: `${BUILD_DIR}/automessager-win.exe`, target: 'win/automessager-win.exe', required: true },
  { source: `${BUILD_DIR}/automessager-mac`, target: 'mac/automessager-mac', required: true },
  
  // Documentation
  { source: 'docs/README-QUICKSTART.md', target: 'docs/README-QUICKSTART.md', required: true },
  { source: 'SETUP.md', target: 'docs/SETUP.md', required: true },
  { source: 'TROUBLESHOOTING.md', target: 'docs/TROUBLESHOOTING.md', required: true },
  { source: 'docs/MACOS_SIGNING_NOTES.md', target: 'docs/MACOS_SIGNING_NOTES.md', required: true },
  { source: 'RELEASE_NOTES_v1.0.0.md', target: 'RELEASE_NOTES_v1.0.0.md', required: true },
  { source: 'LICENSE', target: 'LICENSE', required: false }, // Optional
  
  // Templates
  { source: 'templates/.env.example', target: 'templates/.env.example', required: false },
  { source: 'massege_maping.xlsx', target: 'templates/massege_maping.xlsx', required: false },
  
  // Tools
  { source: 'tools/verify-mapping.cmd', target: 'tools/verify-mapping.cmd', required: true },
  { source: 'tools/verify-mapping.sh', target: 'tools/verify-mapping.sh', required: true },
  { source: 'tools/smoke.cmd', target: 'tools/smoke.cmd', required: true },
  { source: 'tools/smoke.sh', target: 'tools/smoke.sh', required: true },
  
  // Scripts
  { source: 'scripts/windows/Install-Task.ps1', target: 'scripts/windows/Install-Task.ps1', required: true },
  { source: 'scripts/windows/Uninstall-Task.ps1', target: 'scripts/windows/Uninstall-Task.ps1', required: true },
  { source: 'scripts/windows/Start-AutoMessager.ps1', target: 'scripts/windows/Start-AutoMessager.ps1', required: true },
  { source: 'scripts/windows/Create-DesktopShortcut.ps1', target: 'scripts/windows/Create-DesktopShortcut.ps1', required: true },
  { source: 'scripts/macos/start.sh', target: 'scripts/macos/start.sh', required: true },
];

/**
 * Create .env.example if it doesn't exist
 */
async function createEnvExample(): Promise<void> {
  const templatePath = 'templates/.env.example';
  
  try {
    await fs.access(templatePath);
    console.log('✓ .env.example already exists');
  } catch {
    console.log('Creating .env.example...');
    
    const envContent = `# AutoMessager v${VERSION} - Environment Configuration
# Copy this file to .env and fill in your credentials

# ═══════════════════════════════════════════════════════════════
# SALESFORCE CONFIGURATION (Required)
# ═══════════════════════════════════════════════════════════════

SF_LOGIN_URL=https://login.salesforce.com
SF_USERNAME=your-username@example.com
SF_PASSWORD=your-password-here
SF_TOKEN=your-security-token-here

# ═══════════════════════════════════════════════════════════════
# GLASSIX CONFIGURATION (Required)
# ═══════════════════════════════════════════════════════════════

GLASSIX_BASE_URL=https://api.glassix.com
GLASSIX_API_KEY=your-api-key-here
GLASSIX_API_SECRET=your-api-secret-here

# ═══════════════════════════════════════════════════════════════
# EXCEL MAPPING CONFIGURATION (Required)
# ═══════════════════════════════════════════════════════════════

XSLX_MAPPING_PATH=./massege_maping.xlsx

# ═══════════════════════════════════════════════════════════════
# OPTIONAL SETTINGS
# ═══════════════════════════════════════════════════════════════

TASKS_QUERY_LIMIT=200
KEEP_READY_ON_FAIL=true
PERMIT_LANDLINES=false
DEFAULT_LANG=he
LOG_LEVEL=info

# For help, run: automessager init
`;
    
    await fs.mkdir('templates', { recursive: true });
    await fs.writeFile(templatePath, envContent, 'utf-8');
    console.log('✓ Created .env.example');
  }
}

/**
 * Create sample Excel file if it doesn't exist
 */
async function createSampleExcel(): Promise<void> {
  const samplePath = 'templates/massege_maping.xlsx';
  const sourcePath = 'massege_maping.xlsx';
  
  try {
    await fs.access(samplePath);
    console.log('✓ Sample Excel already exists in templates/');
  } catch {
    // Try to copy from root
    try {
      await fs.access(sourcePath);
      await fs.mkdir('templates', { recursive: true });
      await fs.copyFile(sourcePath, samplePath);
      console.log('✓ Copied sample Excel to templates/');
    } catch {
      console.log('⚠ Warning: No sample Excel file found (massege_maping.xlsx)');
      console.log('  Clients will need to provide their own Excel file');
    }
  }
}

/**
 * Check if required files exist
 */
async function validateRequiredFiles(): Promise<string[]> {
  const missing: string[] = [];
  
  for (const mapping of FILE_MAPPINGS) {
    if (mapping.required) {
      try {
        await fs.access(mapping.source);
      } catch {
        missing.push(mapping.source);
      }
    }
  }
  
  return missing;
}

/**
 * Main packaging function
 */
async function packageClientKit(): Promise<void> {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  AutoMessager Client Kit Packager v${VERSION}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  
  // Step 1: Validate binaries exist
  console.log('[1/6] Validating binaries...');
  const missingBinaries: string[] = [];
  
  try {
    await fs.access(`${BUILD_DIR}/automessager-win.exe`);
    console.log('  ✓ Windows binary found');
  } catch {
    missingBinaries.push('automessager-win.exe');
    console.log('  ✗ Windows binary NOT found');
  }
  
  try {
    await fs.access(`${BUILD_DIR}/automessager-mac`);
    console.log('  ✓ macOS binary found');
  } catch {
    missingBinaries.push('automessager-mac');
    console.log('  ✗ macOS binary NOT found');
  }
  
  if (missingBinaries.length > 0) {
    console.log('');
    console.log('ERROR: Missing binaries. Please build them first:');
    if (missingBinaries.includes('automessager-win.exe')) {
      console.log('  npm run package:win');
    }
    if (missingBinaries.includes('automessager-mac')) {
      console.log('  npm run package:mac');
    }
    process.exit(1);
  }
  
  // Step 2: Create templates if missing
  console.log('');
  console.log('[2/6] Preparing templates...');
  await createEnvExample();
  await createSampleExcel();
  
  // Step 3: Validate all required files
  console.log('');
  console.log('[3/6] Validating required files...');
  const missingFiles = await validateRequiredFiles();
  
  if (missingFiles.length > 0) {
    console.log('');
    console.log('ERROR: Missing required files:');
    missingFiles.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }
  console.log('  ✓ All required files present');
  
  // Step 4: Create output directory
  console.log('');
  console.log('[4/6] Creating output directory...');
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  console.log(`  ✓ Output directory: ${OUTPUT_DIR}/`);
  
  // Step 5: Create ZIP archive
  console.log('');
  console.log('[5/6] Building ZIP archive...');
  const zip = new AdmZip();
  let fileCount = 0;
  
  for (const mapping of FILE_MAPPINGS) {
    try {
      await fs.access(mapping.source);
      
      const content = await fs.readFile(mapping.source);
      zip.addFile(mapping.target, content);
      
      console.log(`  + ${mapping.target}`);
      fileCount++;
    } catch (error) {
      if (mapping.required) {
        console.log(`  ✗ Required file missing: ${mapping.source}`);
        process.exit(1);
      } else {
        console.log(`  ⚠ Optional file skipped: ${mapping.source}`);
      }
    }
  }
  
  // Step 6: Write ZIP file
  console.log('');
  console.log('[6/6] Writing ZIP file...');
  const zipPath = path.join(OUTPUT_DIR, ZIP_NAME);
  zip.writeZip(zipPath);
  
  // Get file size
  const stats = await fs.stat(zipPath);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ Client Kit Packaged Successfully!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Output: ${zipPath}`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log(`  Files: ${fileCount}`);
  console.log('');
  console.log('Next Steps:');
  console.log('  1. Test the ZIP on a clean machine');
  console.log('  2. Extract and run smoke tests');
  console.log('  3. Distribute to clients');
  console.log('');
}

// Run packager
packageClientKit().catch((error) => {
  console.error('');
  console.error('FATAL ERROR:', error);
  process.exit(1);
});

