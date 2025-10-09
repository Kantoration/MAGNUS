/**
 * Excel template loader and message renderer with Hebrew column support
 */
import XLSX from 'xlsx';
import { promises as fs } from 'fs';
import path from 'path';
import { getConfig } from './config.js';
import { getLogger } from './logger.js';
import { todayIso, todayHe } from './utils/date.js';
import type { Logger } from 'pino';
import type { RawMappingRow, NormalizedMapping, RenderContext } from './types.js';

/**
 * Excel header constants with exact Hebrew keys
 */
const HEADERS = {
  NAME: 'name',
  BODY_HE: 'מלל הודעה',
  LINK: 'Link',
  GLASSIX_NAME: 'שם הודעה מובנית בגלאסיקס',
} as const;

/**
 * Header aliases - maps canonical header names to acceptable variations
 */
const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'Name', 'NAME', 'Task Name', 'task_name'],
  'מלל הודעה': ['מלל הודעה', 'Message Text', 'message_text', 'text'],
  Link: ['Link', 'link', 'LINK', 'URL', 'url'],
  'שם הודעה מובנית בגלאסיקס': [
    'שם הודעה מובנית בגלאסיקס',
    'Glassix Template',
    'glassix_template',
    'template_name',
  ],
};

/**
 * Normalize header key using aliases
 */
function normalizeHeaderKey(key: string): string {
  const trimmedKey = key.trim();
  
  // Check if key matches any alias
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => alias === trimmedKey)) {
      return canonical;
    }
  }
  
  // Return original key if no alias found
  return trimmedKey;
}

// Cache for template map with mtime tracking
let cachedTemplateMap: Map<string, NormalizedMapping> | null = null;
let cachedMtime: number | null = null;
let logger: Logger | undefined;

function log(level: 'debug' | 'info' | 'warn' | 'error', obj: object, msg: string): void {
  if (!logger) {
    logger = getLogger();
  }
  logger[level](obj, msg);
}

/**
 * Hebrew to Latin transliteration map
 */
const HEBREW_TO_LATIN: Record<string, string> = {
  א: 'A',
  ב: 'B',
  ג: 'G',
  ד: 'D',
  ה: 'H',
  ו: 'V',
  ז: 'Z',
  ח: 'H',
  ט: 'T',
  י: 'Y',
  כ: 'K',
  ך: 'K',
  ל: 'L',
  מ: 'M',
  ם: 'M',
  נ: 'N',
  ן: 'N',
  ס: 'S',
  ע: 'A',
  פ: 'P',
  ף: 'P',
  צ: 'TZ',
  ץ: 'TZ',
  ק: 'K',
  ר: 'R',
  ש: 'SH',
  ת: 'T',
};

/**
 * Normalize task key with Unicode normalization, diacritics removal, and transliteration
 * Rules:
 * - Trim
 * - Normalize Unicode (NFKD), remove diacritics
 * - Transliterate Hebrew and non-ASCII to ASCII best-effort
 * - Uppercase
 * - Replace whitespace and hyphens with underscores
 * - Strip remaining non [A-Z0-9_]
 * - Collapse multiple underscores → single
 * - Fallback: if empty after normalization, return 'UNKNOWN'
 */
export function normalizeTaskKey(input: string): string {
  // Trim
  let normalized = input.trim();

  // Normalize Unicode (NFKD) and remove diacritics
  normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  // Uppercase
  normalized = normalized.toUpperCase();

  // Replace whitespace and hyphens with underscores
  normalized = normalized.replace(/[\s-]+/g, '_');

  // Transliterate and filter characters
  normalized = normalized
    .split('')
    .map((char) => {
      // Transliterate Hebrew
      if (HEBREW_TO_LATIN[char]) {
        return HEBREW_TO_LATIN[char];
      }
      // Keep ASCII alphanumeric and underscore
      if (/[A-Z0-9_]/.test(char)) {
        return char;
      }
      // Drop everything else
      return '';
    })
    .join('');

  // Collapse multiple underscores
  normalized = normalized.replace(/_+/g, '_');

  // Trim leading/trailing underscores
  normalized = normalized.replace(/^_|_$/g, '');

  // Fallback to UNKNOWN if empty
  return normalized || 'UNKNOWN';
}

/**
 * Normalize row keys using header aliases
 */
function normalizeRowKeys(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeHeaderKey(key);
    normalized[normalizedKey] = value;
  }
  
  return normalized;
}

/**
 * Validate that all required headers exist in the Excel sheet (after normalization)
 */
function validateHeaders(data: unknown[]): void {
  if (!data || data.length === 0) {
    throw new Error('Excel file is empty or has no data rows');
  }

  const firstRow = data[0];
  if (!firstRow || typeof firstRow !== 'object') {
    throw new Error('Invalid Excel data format');
  }

  // Normalize the first row keys
  const normalizedRow = normalizeRowKeys(firstRow as Record<string, unknown>);
  
  const requiredHeaders = [HEADERS.NAME, HEADERS.BODY_HE, HEADERS.LINK, HEADERS.GLASSIX_NAME];
  const missingHeaders: string[] = [];

  for (const header of requiredHeaders) {
    if (!(header in normalizedRow)) {
      missingHeaders.push(header);
    }
  }

  if (missingHeaders.length > 0) {
    throw new Error(
      `Missing required Excel headers: ${missingHeaders.join(', ')}. ` +
        `Expected one of the aliases for each header. ` +
        `Available headers: ${Object.keys(normalizedRow).join(', ')}`
    );
  }
}

/**
 * Load and parse the Excel template mapping file
 * @param customPath Optional custom file path (for testing)
 */
export async function loadTemplateMap(
  customPath?: string
): Promise<Map<string, NormalizedMapping>> {
  const config = getConfig();
  const filePath = customPath ?? config.XSLX_MAPPING_PATH;

  // Check if file exists and get stats
  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch {
    log('error', { filePath }, 'Template mapping file not found');
    throw new Error(`Template mapping file not found: ${filePath}`);
  }

  // Check mtime - use cache if file hasn't changed (skip cache if custom path provided)
  const currentMtime = stats.mtimeMs;

  if (!customPath && cachedTemplateMap && cachedMtime === currentMtime) {
    log('debug', {}, 'Using cached template map (file unchanged)');
    return cachedTemplateMap;
  }

  // Log absolute path for clarity
  const absolutePath = path.resolve(filePath);
  log('info', { absolutePath, mtime: currentMtime }, 'Loading template mappings');

  try {
    // Read file as raw buffer to ensure proper encoding
    const fileBuffer = await fs.readFile(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Determine which sheet to use
    let targetSheet: XLSX.WorkSheet | undefined;
    let targetSheetName: string | undefined;
    
    const sheetSelector = config.XSLX_SHEET;
    
    if (sheetSelector) {
      // Try to parse as index first
      const sheetIndex = parseInt(sheetSelector, 10);
      
      if (!isNaN(sheetIndex)) {
        // Use numeric index
        targetSheetName = workbook.SheetNames[sheetIndex];
        if (targetSheetName) {
          targetSheet = workbook.Sheets[targetSheetName];
          log('debug', { sheetIndex, sheetName: targetSheetName }, 'Using sheet by index');
        }
      } else {
        // Use sheet name
        targetSheetName = sheetSelector;
        targetSheet = workbook.Sheets[sheetSelector];
        if (targetSheet) {
          log('debug', { sheetName: sheetSelector }, 'Using sheet by name');
        }
      }
      
      if (!targetSheet) {
        throw new Error(
          `Sheet "${sheetSelector}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`
        );
      }
    } else {
      // Use first sheet by default
      targetSheetName = workbook.SheetNames[0];
      targetSheet = workbook.Sheets[targetSheetName];
      log('debug', { sheetName: targetSheetName }, 'Using first sheet (default)');
    }

    if (!targetSheet) {
      throw new Error('Excel file has no sheets');
    }

    const data = XLSX.utils.sheet_to_json<RawMappingRow>(targetSheet, {
      defval: '',
    });

    log('debug', { rowCount: data.length, sheet: targetSheetName }, 'Parsed Excel data');

    // Validate headers
    validateHeaders(data);

    const templateMap = new Map<string, NormalizedMapping>();

    for (const row of data) {
      // Normalize row keys to handle header aliases
      const normalizedRow = normalizeRowKeys(row as unknown as Record<string, unknown>) as RawMappingRow;
      
      // Access via explicit header constants (after normalization)
      const name = normalizedRow[HEADERS.NAME];
      const bodyHe = normalizedRow[HEADERS.BODY_HE];
      const link = normalizedRow[HEADERS.LINK];
      const glassixName = normalizedRow[HEADERS.GLASSIX_NAME];

      // Skip empty rows (no name or message body)
      if (!name?.trim() || !bodyHe?.trim()) {
        continue;
      }

      const taskKey = normalizeTaskKey(name);
      const messageBody = bodyHe.trim() || undefined;
      const linkValue = link?.trim() || undefined;
      const glassixTemplateId = glassixName?.trim() || undefined;

      const mapping: NormalizedMapping = {
        taskKey,
        messageBody,
        link: linkValue,
        glassixTemplateId,
      };

      templateMap.set(taskKey, mapping);

      log(
        'debug',
        {
          original: name,
          taskKey,
          hasGlassixTemplate: !!glassixTemplateId,
        },
        'Loaded template mapping'
      );
    }

    // Update cache (only if not using custom path)
    if (!customPath) {
      cachedTemplateMap = templateMap;
      cachedMtime = currentMtime;
    }

    log('info', { count: templateMap.size }, 'Template mappings loaded successfully');

    return templateMap;
  } catch (error: unknown) {
    log('error', { filePath, error }, 'Failed to load template mappings');
    throw error;
  }
}

/**
 * Pick a template from the map by task key
 */
export function pickTemplate(
  taskKey: string,
  map: Map<string, NormalizedMapping>
): NormalizedMapping | undefined {
  const normalized = normalizeTaskKey(taskKey);
  return map.get(normalized);
}

/**
 * Render a message from a mapping and context
 */
export function renderMessage(
  mapping: NormalizedMapping,
  ctx: RenderContext,
  opts?: { defaultLang?: 'he' | 'en' }
): { text: string; viaGlassixTemplate?: string } {
  const defaultLang = opts?.defaultLang || 'he';

  if (!mapping.messageBody) {
    log('warn', { mapping }, 'Empty message body in mapping');
    return { text: '' };
  }

  let text = mapping.messageBody;

  // Always inject today's date if not provided
  const dateIso = ctx.date_iso || todayIso();
  const dateHe = ctx.date_he || todayHe();

  // Build complete context with defaults
  const fullContext: Record<string, string> = {
    first_name: ctx.first_name || '',
    account_name: ctx.account_name || '',
    device_model: ctx.device_model || '',
    imei: ctx.imei || '',
    date_iso: dateIso,
    date_he: dateHe,
    date: dateHe, // Alias for date_he (always use Hebrew format by default)
    link: ctx.link || mapping.link || '', // Context link takes precedence
  };

  // Add any additional context keys
  for (const [key, value] of Object.entries(ctx)) {
    if (!(key in fullContext)) {
      fullContext[key] = String(value ?? '');
    }
  }

  // Replace all variables (both {{var}} and {var} syntax)
  for (const [key, value] of Object.entries(fullContext)) {
    const patterns = [new RegExp(`\\{\\{${key}\\}\\}`, 'g'), new RegExp(`\\{${key}\\}`, 'g')];
    for (const pattern of patterns) {
      text = text.replace(pattern, value);
    }
  }

  // Check if date placeholders were present in original template
  const hasDatePlaceholder =
    mapping.messageBody.includes('{{date}}') ||
    mapping.messageBody.includes('{date}') ||
    mapping.messageBody.includes('{{date_he}}') ||
    mapping.messageBody.includes('{date_he}') ||
    mapping.messageBody.includes('{{date_iso}}') ||
    mapping.messageBody.includes('{date_iso}');

  // If no date placeholder and language is Hebrew, append it
  if (!hasDatePlaceholder && defaultLang === 'he') {
    text += ` (תאריך: ${dateHe})`;
  }

  // Check if link placeholder was present in original template
  const hasLinkPlaceholder =
    mapping.messageBody.includes('{{link}}') || mapping.messageBody.includes('{link}');

  // If link exists but no placeholder, append at end
  const linkToUse = ctx.link || mapping.link;
  if (linkToUse && !hasLinkPlaceholder) {
    text += `\n${linkToUse}`;
  }

  // Return result
  if (mapping.glassixTemplateId) {
    return {
      text,
      viaGlassixTemplate: mapping.glassixTemplateId,
    };
  }

  return { text };
}

/**
 * Clear the template cache (useful for testing)
 */
export function clearTemplateCache(): void {
  cachedTemplateMap = null;
  cachedMtime = null;
  log('debug', {}, 'Template cache cleared');
}
