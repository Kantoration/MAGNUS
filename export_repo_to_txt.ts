#!/usr/bin/env node
/**
 * Export project source code to a single text file for external code review
 * Usage: tsx export_repo_to_txt.ts [--src-only] [--with-tests]
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const OUTPUT_FILE = 'project_export.txt';
const REPO_ROOT = __dirname;

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.venv',
  '.cache',
  'coverage',
  '.next',
  '.nuxt',
  'build',
  'out',
  'tmp',
  'temp',
]);

// File extensions to include
const INCLUDE_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.config.js',
  '.config.ts',
]);

// Special files to include
const INCLUDE_FILES = new Set([
  '.env.example',
  'tsconfig.json',
  'package.json',
  'package-lock.json',
  'vitest.config.ts',
  'vitest.config.js',
  '.eslintrc',
  '.prettierrc',
  '.gitignore',
]);

// Parse CLI arguments
const args = process.argv.slice(2);
const srcOnly = args.includes('--src-only');
const withTests = args.includes('--with-tests');

// Determine which folders to export
let TARGET_FOLDERS: string[] = [];
if (srcOnly) {
  TARGET_FOLDERS = ['src'];
} else if (withTests) {
  TARGET_FOLDERS = ['src', 'test'];
} else {
  // Default: both src and test
  TARGET_FOLDERS = ['src', 'test'];
}

interface FileInfo {
  relativePath: string;
  absolutePath: string;
}

/**
 * Check if a file should be included based on extension or name
 */
function shouldIncludeFile(fileName: string): boolean {
  // Check special files
  if (INCLUDE_FILES.has(fileName)) {
    return true;
  }

  // Check extensions
  const ext = path.extname(fileName);
  if (INCLUDE_EXTENSIONS.has(ext)) {
    return true;
  }

  // Check if it's a config file
  if (fileName.endsWith('.config.js') || fileName.endsWith('.config.ts')) {
    return true;
  }

  return false;
}

/**
 * Check if a directory should be skipped
 */
function shouldSkipDir(dirName: string): boolean {
  return SKIP_DIRS.has(dirName) || dirName.startsWith('.');
}

/**
 * Recursively walk directory and collect files
 */
async function walkDirectory(
  dirPath: string,
  baseDir: string,
  files: FileInfo[]
): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (shouldSkipDir(entry.name)) {
          continue;
        }
        // Recursively walk subdirectories
        await walkDirectory(fullPath, baseDir, files);
      } else if (entry.isFile()) {
        // Include file if it matches criteria
        if (shouldIncludeFile(entry.name)) {
          const relativePath = path.relative(baseDir, fullPath);
          files.push({
            relativePath: relativePath.replace(/\\/g, '/'),
            absolutePath: fullPath,
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error walking directory ${dirPath}:`, error);
  }
}

/**
 * Collect all files to export
 */
async function collectFiles(): Promise<FileInfo[]> {
  const files: FileInfo[] = [];

  // Add root-level config files
  const rootFiles = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vitest.config.ts',
    '.env.example',
    'README.md',
  ];

  for (const fileName of rootFiles) {
    const filePath = path.join(REPO_ROOT, fileName);
    try {
      await fs.access(filePath);
      files.push({
        relativePath: fileName,
        absolutePath: filePath,
      });
    } catch {
      // File doesn't exist, skip
    }
  }

  // Walk target folders
  for (const folder of TARGET_FOLDERS) {
    const folderPath = path.join(REPO_ROOT, folder);
    try {
      await fs.access(folderPath);
      await walkDirectory(folderPath, REPO_ROOT, files);
    } catch (error) {
      console.warn(`Skipping folder ${folder}: not found or not accessible`);
    }
  }

  // Sort files by path for consistent output
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return files;
}

/**
 * Export a single file to the output
 */
async function exportFile(
  file: FileInfo,
  outputStream: fs.FileHandle
): Promise<number> {
  try {
    const content = await fs.readFile(file.absolutePath, 'utf-8');
    const lines = content.split('\n').length;

    // Write file header
    const header = `\n===== FILE: ${file.relativePath} =====\n`;
    await outputStream.write(header, 'utf-8');

    // Write file content
    await outputStream.write(content, 'utf-8');

    // Add blank line separator
    await outputStream.write('\n\n', 'utf-8');

    console.log(`✓ ${file.relativePath} (${lines} lines)`);

    return lines;
  } catch (error) {
    console.error(`✗ Failed to export ${file.relativePath}:`, error);
    return 0;
  }
}

/**
 * Main export function
 */
async function exportRepo(): Promise<void> {
  console.log('🚀 Starting project export...\n');

  if (srcOnly) {
    console.log('📁 Mode: --src-only (exporting src/ folder only)');
  } else if (withTests) {
    console.log('📁 Mode: --with-tests (exporting src/ and test/ folders)');
  } else {
    console.log('📁 Mode: default (exporting src/ and test/ folders)');
  }

  console.log('📁 Target folders:', TARGET_FOLDERS.join(', '));
  console.log('');

  // Collect files
  console.log('📋 Collecting files...');
  const files = await collectFiles();
  console.log(`Found ${files.length} files to export\n`);

  if (files.length === 0) {
    console.warn('⚠️  No files found to export!');
    return;
  }

  // Create/truncate output file
  const outputPath = path.join(REPO_ROOT, OUTPUT_FILE);
  const outputStream = await fs.open(outputPath, 'w');

  try {
    // Write header
    const timestamp = new Date().toISOString();
    const header = `Project Source Code Export
Generated: ${timestamp}
Folders: ${TARGET_FOLDERS.join(', ')}
Total files: ${files.length}

`;
    await outputStream.write(header, 'utf-8');

    // Export each file
    let totalLines = 0;
    for (const file of files) {
      const lines = await exportFile(file, outputStream);
      totalLines += lines;
    }

    // Write footer
    const footer = `\n===== END OF EXPORT =====\n`;
    await outputStream.write(footer, 'utf-8');

    console.log('');
    console.log('✅ Export complete!');
    console.log(`   Files: ${files.length}`);
    console.log(`   Lines: ${totalLines.toLocaleString()}`);
    console.log(`   Output: ${OUTPUT_FILE}`);
  } finally {
    await outputStream.close();
  }
}

// Run export
exportRepo().catch((error) => {
  console.error('❌ Export failed:', error);
  process.exit(1);
});




