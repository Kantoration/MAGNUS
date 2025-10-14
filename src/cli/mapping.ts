/**
 * Strict Excel mapping validator with detailed diagnostics
 * Used by verify and doctor commands
 */
import { promises as fs } from 'fs';
import XLSX from 'xlsx';
import path from 'path';
import { getConfig } from '../config.js';

export interface MappingValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
  sampleKeys: string[];
  count: number;
  path?: string;
  sheet?: string;
}

/**
 * Known placeholders that can be used in templates
 */
const KNOWN_PLACEHOLDERS = new Set([
  'first_name',
  'account_name',
  'device_model',
  'imei',
  'date_iso',
  'date_he',
  'date',
  'link',
]);

/**
 * Required headers (with aliases)
 * Exported for testing and extension
 */
export const REQUIRED_HEADERS = {
  name: ['name', 'Name', 'NAME', 'Task Name', 'task_name'],
  messageBody: ['מלל הודעה', 'Message Text', 'message_text', 'text'],
  link: ['Link', 'link', 'LINK', 'URL', 'url'],
  glassixTemplate: [
    'שם הודעה מובנית בגלאסיקס',
    'Glassix Template',
    'glassix_template',
    'template_name',
  ],
};

/**
 * Normalize header to canonical name
 */
function normalizeHeader(header: string): string | null {
  const trimmed = header.trim();
  
  for (const [canonical, aliases] of Object.entries(REQUIRED_HEADERS)) {
    if (aliases.includes(trimmed)) {
      return canonical;
    }
  }
  
  return null;
}

/**
 * Extract placeholders from text
 */
function extractPlaceholders(text: string): string[] {
  const pattern = /\{\{?(\w+)\}?\}/g;
  const matches: string[] = [];
  let match;
  
  while ((match = pattern.exec(text)) !== null) {
    matches.push(match[1]);
  }
  
  return [...new Set(matches)];
}

/**
 * Check for mojibake (replacement characters)
 */
function checkMojibake(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char === '\uFFFD') {
      count++;
    }
  }
  return count;
}

/**
 * Validate Excel mapping file
 */
export async function validateMapping(opts: {
  path: string;
  sheet?: string;
}): Promise<MappingValidationResult> {
  const result: MappingValidationResult = {
    ok: true,
    warnings: [],
    errors: [],
    sampleKeys: [],
    count: 0,
    path: opts.path,
    sheet: opts.sheet,
  };

  // 1. Check file exists
  try {
    await fs.access(opts.path);
  } catch {
    result.ok = false;
    result.errors.push(`File not found: ${opts.path}`);
    return result;
  }

  // 2. Read file
  let workbook: XLSX.WorkBook;
  try {
    const buffer = await fs.readFile(opts.path);
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (error) {
    result.ok = false;
    result.errors.push(`Failed to read Excel file: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }

  // 3. Determine sheet
  let targetSheet: XLSX.WorkSheet | undefined;
  let targetSheetName: string | undefined;

  if (opts.sheet) {
    // Try as index first
    const sheetIndex = parseInt(opts.sheet, 10);
    
    if (!isNaN(sheetIndex)) {
      targetSheetName = workbook.SheetNames[sheetIndex];
      if (targetSheetName) {
        targetSheet = workbook.Sheets[targetSheetName];
      }
    } else {
      // Try as name
      targetSheetName = opts.sheet;
      targetSheet = workbook.Sheets[opts.sheet];
    }
    
    if (!targetSheet) {
      result.ok = false;
      result.errors.push(
        `Sheet "${opts.sheet}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`
      );
      return result;
    }
  } else {
    // Use first sheet
    targetSheetName = workbook.SheetNames[0];
    targetSheet = workbook.Sheets[targetSheetName];
  }

  if (!targetSheet) {
    result.ok = false;
    result.errors.push('Excel file has no sheets');
    return result;
  }

  // 4. Parse sheet
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(targetSheet, {
    defval: '',
  });

  if (data.length === 0) {
    result.ok = false;
    result.errors.push('Excel sheet is empty (no data rows)');
    return result;
  }

  // 5. Check headers
  const firstRow = data[0];
  const headers = Object.keys(firstRow);
  const normalizedHeaders = new Map<string, string>();

  for (const header of headers) {
    const canonical = normalizeHeader(header);
    if (canonical) {
      normalizedHeaders.set(canonical, header);
    }
  }

  // Check required headers
  const missingHeaders: string[] = [];
  
  if (!normalizedHeaders.has('name')) {
    missingHeaders.push('name (or Name/NAME/Task Name)');
  }
  
  if (!normalizedHeaders.has('messageBody')) {
    missingHeaders.push('מלל הודעה (or Message Text/message_text)');
  }
  
  if (!normalizedHeaders.has('link')) {
    missingHeaders.push('Link (or link/URL)');
  }

  if (missingHeaders.length > 0) {
    result.ok = false;
    result.errors.push(`Missing required headers: ${missingHeaders.join(', ')}`);
    result.errors.push(`Found headers: ${headers.join(', ')}`);
    return result;
  }

  // Glassix template header is optional
  if (!normalizedHeaders.has('glassixTemplate')) {
    result.warnings.push(
      'Glassix template column (שם הודעה מובנית בגלאסיקס) not found. ' +
      'This is OK if sending free text only.'
    );
  }

  // 6. Validate data rows
  let validRows = 0;
  const nameHeader = normalizedHeaders.get('name')!;
  const messageHeader = normalizedHeaders.get('messageBody')!;
  const allPlaceholders = new Set<string>();
  let totalMojibake = 0;

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const name = String(row[nameHeader] ?? '').trim();
    const message = String(row[messageHeader] ?? '').trim();

    // Skip empty rows
    if (!name && !message) {
      continue;
    }

    // Check for incomplete rows
    if (!name || !message) {
      result.warnings.push(
        `Row ${i + 2}: Missing ${!name ? 'name' : 'message body'}`
      );
      continue;
    }

    validRows++;
    
    if (result.sampleKeys.length < 10) {
      result.sampleKeys.push(name);
    }

    // Extract placeholders from message
    const placeholders = extractPlaceholders(message);
    for (const placeholder of placeholders) {
      allPlaceholders.add(placeholder);
    }

    // Check for mojibake
    const mojibakeCount = checkMojibake(message);
    if (mojibakeCount > 0) {
      totalMojibake += mojibakeCount;
      result.warnings.push(
        `Row ${i + 2} (${name}): Contains ${mojibakeCount} replacement characters (�). ` +
        'This may indicate encoding issues.'
      );
    }
  }

  result.count = validRows;

  if (validRows === 0) {
    result.ok = false;
    result.errors.push('No valid data rows found (all rows are empty or incomplete)');
    return result;
  }

  // 7. Check placeholders
  const unknownPlaceholders: string[] = [];
  for (const placeholder of allPlaceholders) {
    if (!KNOWN_PLACEHOLDERS.has(placeholder)) {
      unknownPlaceholders.push(placeholder);
    }
  }

  if (unknownPlaceholders.length > 0) {
    result.warnings.push(
      `Unknown placeholders found: ${unknownPlaceholders.join(', ')}. ` +
      `Supported: ${Array.from(KNOWN_PLACEHOLDERS).join(', ')}`
    );
  }

  // 8. Summary warnings
  if (totalMojibake > 0) {
    result.warnings.push(
      `Total replacement characters (�) across all messages: ${totalMojibake}. ` +
      'Consider re-saving Excel file with UTF-8 encoding.'
    );
  }

  return result;
}

/**
 * Run mapping validation from environment config
 */
export async function runMappingValidationFromEnv(): Promise<MappingValidationResult> {
  const config = getConfig();
  
  return await validateMapping({
    path: config.XSLX_MAPPING_PATH,
    sheet: config.XSLX_SHEET,
  });
}

/**
 * Print validation result to console
 */
export function printMappingResult(result: MappingValidationResult): void {
  console.log('\n📋 Excel Mapping Validation\n');

  if (result.path) {
    console.log(`File: ${path.resolve(result.path)}`);
  }
  if (result.sheet) {
    console.log(`Sheet: ${result.sheet}`);
  }
  console.log('');

  // Errors
  if (result.errors.length > 0) {
    console.log('❌ Errors:\n');
    result.errors.forEach((err) => {
      console.log(`  • ${err}`);
    });
    console.log('');
  }

  // Warnings
  if (result.warnings.length > 0) {
    console.log('⚠️  Warnings:\n');
    result.warnings.forEach((warn) => {
      console.log(`  • ${warn}`);
    });
    console.log('');
  }

  // Success info
  if (result.ok) {
    console.log(`✅ Valid templates: ${result.count}\n`);
    
    if (result.sampleKeys.length > 0) {
      console.log('Sample template keys:');
      result.sampleKeys.slice(0, 10).forEach((key) => {
        console.log(`  • ${key}`);
      });
      if (result.count > 10) {
        console.log(`  ... and ${result.count - 10} more`);
      }
      console.log('');
    }
  }

  // Final status
  if (result.ok) {
    console.log('✅ Mapping validation PASSED');
    if (result.warnings.length > 0) {
      console.log(`   (with ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''})`);
    }
  } else {
    console.log('❌ Mapping validation FAILED');
  }
  console.log('');
}

/**
 * CLI command entry point
 */
export async function runMappingCommand(): Promise<number> {
  try {
    const result = await runMappingValidationFromEnv();
    printMappingResult(result);
    
    // Exit codes: 0 = pass, 1 = fail, 2 = warnings only
    if (!result.ok) {
      return 1;
    }
    if (result.warnings.length > 0) {
      return 2;
    }
    return 0;
  } catch (error) {
    console.error('Fatal error during mapping validation:', error);
    return 1;
  }
}

