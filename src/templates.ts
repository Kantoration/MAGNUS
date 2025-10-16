/**
 * Excel template loader and message renderer with Hebrew column support
 * Includes worker-based loading for large files to prevent event-loop blocking
 */
import XLSX from 'xlsx';
import { promises as fs } from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { getConfig } from './config.js';
import { getLogger } from './logger.js';
import { todayIso, todayHe } from './utils/date.js';
import { sanitizeTemplateText, validatePlaceholders, sanitizeLink } from './templates.sanitize.js';
import type { Logger } from 'pino';
import type { RawMappingRow, NormalizedMapping, RenderContext } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Threshold for offloading to worker thread (1MB)
 */
const LARGE_FILE_THRESHOLD = 1_000_000;

/**
 * Default timeout for XLSX parsing (30 seconds)
 */
const PARSE_TIMEOUT_MS = 30_000;

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

let logger: Logger | undefined;

function log(level: 'debug' | 'info' | 'warn' | 'error', obj: object, msg: string): void {
  if (!logger) {
    logger = getLogger();
  }
  logger[level](obj, msg);
}

/**
 * TemplateManager singleton for concurrency-safe caching
 */
class TemplateManager {
  private static instance: TemplateManager | null = null;
  private cache: Map<string, NormalizedMapping> | null = null;
  private cachedMtime: number | null = null;
  private loading: Promise<Map<string, NormalizedMapping>> | null = null;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): TemplateManager {
    if (!TemplateManager.instance) {
      TemplateManager.instance = new TemplateManager();
    }
    return TemplateManager.instance;
  }

  /**
   * Load templates from file (with caching and concurrency safety)
   */
  async load(filePath?: string): Promise<Map<string, NormalizedMapping>> {
    const config = getConfig();
    const actualPath = filePath ?? config.XSLX_MAPPING_PATH;

    // Check if file exists and get stats
    let stats;
    try {
      stats = await fs.stat(actualPath);
    } catch {
      log('error', { filePath: actualPath }, 'Template mapping file not found');
      throw new Error(`Template mapping file not found: ${actualPath}`);
    }

    const currentMtime = stats.mtimeMs;

    // Return cached version if file hasn't changed and not using custom path
    if (!filePath && this.cache && this.cachedMtime === currentMtime) {
      log('debug', {}, 'Using cached template map (file unchanged)');
      return this.cache;
    }

    // If already loading, wait for that to complete (concurrency safety)
    if (this.loading) {
      log('debug', {}, 'Template load already in progress, waiting...');
      return this.loading;
    }

    // Start loading
    this.loading = this.loadFromFile(actualPath, stats, currentMtime, !filePath);

    try {
      const result = await this.loading;
      return result;
    } finally {
      this.loading = null;
    }
  }

  /**
   * Get cached templates (throws if not loaded)
   */
  get(): Map<string, NormalizedMapping> {
    if (!this.cache) {
      throw new Error('Templates not loaded. Call load() first.');
    }
    return this.cache;
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.cache = null;
    this.cachedMtime = null;
  }

  /**
   * Internal: Load from file with worker offloading for large files
   */
  private async loadFromFile(
    filePath: string,
    stats: Awaited<ReturnType<typeof fs.stat>>,
    mtime: number,
    shouldCache: boolean
  ): Promise<Map<string, NormalizedMapping>> {
    const config = getConfig();
    const absolutePath = path.resolve(filePath);
    const fileSize = stats.size;

    log('info', { absolutePath, mtime, fileSize }, 'Loading template mappings');

    try {
      let data: unknown[];
      let sheetName: string | undefined;

      // For large files, offload to worker thread
      if (fileSize > LARGE_FILE_THRESHOLD) {
        log('info', { fileSize, threshold: LARGE_FILE_THRESHOLD }, 'Using worker thread for large file');
        const result = await this.parseWithWorker(filePath, config.XSLX_SHEET);
        data = result.data;
        sheetName = result.sheetName;
      } else {
        // Small files: parse inline
        const result = await this.parseInline(filePath, config.XSLX_SHEET);
        data = result.data;
        sheetName = result.sheetName;
      }

      log('debug', { rowCount: data.length, sheet: sheetName }, 'Parsed Excel data');

      // Validate and build template map
      const templateMap = this.buildTemplateMap(data as RawMappingRow[]);

      // Update cache if not using custom path
      if (shouldCache) {
        this.cache = templateMap;
        this.cachedMtime = mtime;
      }

      log('info', { count: templateMap.size }, 'Template mappings loaded successfully');

      return templateMap;
    } catch (error: unknown) {
      log('error', { filePath, error }, 'Failed to load template mappings');
      throw error;
    }
  }

  /**
   * Parse XLSX using worker thread with timeout
   */
  private async parseWithWorker(
    filePath: string,
    sheetSelector?: string
  ): Promise<{ data: unknown[]; sheetName: string }> {
    return new Promise((resolve, reject) => {
      const workerPath = path.join(__dirname, 'workers', 'xlsx_loader.js');
      
      const worker = new Worker(workerPath, {
        workerData: { filePath, sheetSelector },
      });

      let timeoutId: NodeJS.Timeout | null = null;
      let completed = false;

      // Set timeout
      timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          worker.terminate();
          reject(new Error(`Template load timeout (exceeded ${PARSE_TIMEOUT_MS}ms)`));
        }
      }, PARSE_TIMEOUT_MS);

      worker.on('message', (result: { success: boolean; data?: unknown[]; sheetName?: string; error?: string }) => {
        if (completed) return;
        completed = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        worker.terminate();

        if (result.success && result.data && result.sheetName) {
          resolve({ data: result.data, sheetName: result.sheetName });
        } else {
          reject(new Error(result.error || 'Worker parsing failed'));
        }
      });

      worker.on('error', (error) => {
        if (completed) return;
        completed = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        worker.terminate();
        reject(error);
      });

      worker.on('exit', (code) => {
        if (completed) return;
        completed = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }

  /**
   * Parse XLSX inline (for small files)
   */
  private async parseInline(
    filePath: string,
    sheetSelector?: string
  ): Promise<{ data: unknown[]; sheetName: string }> {
    const fileBuffer = await fs.readFile(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    let targetSheet: XLSX.WorkSheet | undefined;
    let targetSheetName: string | undefined;

    if (sheetSelector) {
      const sheetIndex = parseInt(sheetSelector, 10);
      
      if (!isNaN(sheetIndex)) {
        targetSheetName = workbook.SheetNames[sheetIndex];
        if (targetSheetName) {
          targetSheet = workbook.Sheets[targetSheetName];
          log('debug', { sheetIndex, sheetName: targetSheetName }, 'Using sheet by index');
        }
      } else {
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
      targetSheetName = workbook.SheetNames[0];
      targetSheet = workbook.Sheets[targetSheetName];
      log('debug', { sheetName: targetSheetName }, 'Using first sheet (default)');
    }

    if (!targetSheet) {
      throw new Error('Excel file has no sheets');
    }

    const data = XLSX.utils.sheet_to_json(targetSheet, {
      defval: '',
    });

    return { data, sheetName: targetSheetName };
  }

  /**
   * Build template map from parsed data
   */
  private buildTemplateMap(data: RawMappingRow[]): Map<string, NormalizedMapping> {
    // Validate headers
    validateHeaders(data);

    const templateMap = new Map<string, NormalizedMapping>();

    for (const row of data) {
      const normalizedRow = normalizeRowKeys(row as unknown as Record<string, unknown>) as RawMappingRow;
      
      const name = normalizedRow[HEADERS.NAME];
      const bodyHe = normalizedRow[HEADERS.BODY_HE];
      const link = normalizedRow[HEADERS.LINK];
      const glassixName = normalizedRow[HEADERS.GLASSIX_NAME];

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

    return templateMap;
  }
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
 * Uses TemplateManager singleton for caching and worker offloading
 * @param customPath Optional custom file path (for testing)
 */
export async function loadTemplateMap(
  customPath?: string
): Promise<Map<string, NormalizedMapping>> {
  const manager = TemplateManager.getInstance();
  return manager.load(customPath);
}

/**
 * Extract unique placeholders from text
 * 
 * Matches both {{var}} and {var} syntax and returns unique variable names.
 * This is a security-critical function: validation cannot be bypassed because
 * the regex is strict and deduplication ensures placeholders are checked exactly once.
 * 
 * Fast-path guardrails:
 * - Only \w (word characters: letters, digits, underscore) are allowed in variable names
 * - All other characters (including injection attempts) are ignored
 * - Results are deduplicated to prevent validation bypass via duplicate placeholders
 * 
 * @param text - Template text containing placeholders
 * @returns Array of unique placeholder names (without braces)
 * 
 * @example
 * extractPlaceholders('Hello {{name}}!')
 * // => ['name']
 * 
 * @example
 * extractPlaceholders('Hi {first_name}, visit {link}')
 * // => ['first_name', 'link']
 * 
 * @example
 * // Duplicates are deduplicated
 * extractPlaceholders('{{name}} and {{name}} again')
 * // => ['name']
 * 
 * @example
 * // Mixed brace styles
 * extractPlaceholders('{{date}} and {date_iso}')
 * // => ['date', 'date_iso']
 */
export function extractPlaceholders(text: string): string[] {
  // Match {{var}} or {var}; captures var name in group 1
  const pattern = /\{\{?(\w+)\}?\}/g;
  const found: string[] = [];
  
  // Use for-loop with exec() to handle all matches (regex.exec() maintains state)
  for (let m; (m = pattern.exec(text)) !== null; ) {
    found.push(m[1]);
  }
  
  // Deduplicate: ensures each placeholder is validated exactly once,
  // preventing bypass via duplicates
  return Array.from(new Set(found));
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

  // Sanitize template text (remove control characters, enforce length limits)
  let text = sanitizeTemplateText(mapping.messageBody);

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

  // Validate all placeholders against whitelist (prevents template injection)
  validatePlaceholders(fullContext);

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
    // Sanitize link before appending (validates HTTP/HTTPS only)
    const sanitizedLink = sanitizeLink(linkToUse);
    text += `\n${sanitizedLink}`;
  }

  // Return result
  // NOTE: If glassixTemplateId is manually configured in Excel, it takes precedence
  // Otherwise, template-matcher.ts will auto-match at runtime
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
  const manager = TemplateManager.getInstance();
  manager.clearCache();
  log('debug', {}, 'Template cache cleared');
}
