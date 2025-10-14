/**
 * Template sanitization and validation
 * Prevents template injection, validates placeholders, and sanitizes content
 */
import { ValidationError, SanitizationError } from './errors.js';

/**
 * Maximum template length (2000 chars)
 */
const MAX_TEMPLATE_LENGTH = 2000;

/**
 * Maximum link length (1024 chars)
 */
const MAX_LINK_LENGTH = 1024;

/**
 * Whitelisted placeholders that can be used in templates
 * Prevents template injection attacks
 * 
 * HOW TO EXTEND SAFELY:
 * 1. Add new placeholder name to this Set
 * 2. Update renderMessage() in templates.ts to provide the value in fullContext
 * 3. Add validation tests in test/templates.placeholders.spec.ts
 * 4. Document the new placeholder in README.md
 * 
 * NEVER remove placeholders without checking all templates in production.
 */
export const PLACEHOLDER_WHITELIST = new Set([
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
 * Sanitize template text
 * - Removes control characters
 * - Enforces length limits
 * - Preserves Hebrew and other valid Unicode
 */
export function sanitizeTemplateText(text: string): string {
  if (!text) {
    return text;
  }

  if (text.length > MAX_TEMPLATE_LENGTH) {
    throw new SanitizationError(
      `Template too long (${text.length} chars, max ${MAX_TEMPLATE_LENGTH})`
    );
  }

  // Remove control characters (0x00-0x1F, 0x7F) but preserve newlines/tabs
  const sanitized = text.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, ' ');

  return sanitized;
}

/**
 * Validate placeholder variables against whitelist
 * Throws ValidationError if unknown placeholders found
 */
export function validatePlaceholders(vars: Record<string, unknown>): void {
  const unknownPlaceholders: string[] = [];

  for (const key of Object.keys(vars)) {
    if (!PLACEHOLDER_WHITELIST.has(key)) {
      unknownPlaceholders.push(key);
    }
  }

  if (unknownPlaceholders.length > 0) {
    throw new ValidationError(
      `Unknown placeholders: ${unknownPlaceholders.join(', ')}`,
      [
        `Supported: ${Array.from(PLACEHOLDER_WHITELIST).join(', ')}`,
        `Found: ${unknownPlaceholders.join(', ')}`,
      ]
    );
  }
}

/**
 * Sanitize and validate link URL
 * - Must be HTTP/HTTPS
 * - Length limit enforced
 * - No JavaScript or data URLs
 */
export function sanitizeLink(url: string | undefined | null): string | undefined {
  if (!url) {
    return undefined;
  }

  const trimmed = url.trim();

  if (trimmed.length > MAX_LINK_LENGTH) {
    throw new ValidationError(
      `Link too long (${trimmed.length} chars, max ${MAX_LINK_LENGTH})`
    );
  }

  try {
    const parsed = new URL(trimmed);

    // Only allow HTTP/HTTPS protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ValidationError(
        `Invalid link protocol: ${parsed.protocol}. Only HTTP/HTTPS allowed.`
      );
    }

    return trimmed;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Invalid link format: ${trimmed.substring(0, 100)}`);
  }
}

/**
 * Extract unique placeholders from template text
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
 * Validate template placeholders against whitelist
 * 
 * Uses extractPlaceholders() to get unique placeholders, then checks each
 * against PLACEHOLDER_WHITELIST. This ensures validation cannot be bypassed:
 * - extractPlaceholders() deduplicates, so each variable is checked exactly once
 * - The regex in extractPlaceholders() only matches valid placeholder syntax
 * - Any variable not in the whitelist is rejected
 * 
 * @param text - Template text to validate
 * @returns Array of unknown placeholders (empty if all valid)
 * 
 * @example
 * validateTemplatePlaceholders('Hello {{first_name}}!')
 * // => [] (valid)
 * 
 * @example
 * validateTemplatePlaceholders('Hello {{evil_injection}}!')
 * // => ['evil_injection'] (invalid)
 */
export function validateTemplatePlaceholders(text: string): string[] {
  // Extract unique placeholders using the fixed extractor
  const placeholders = extractPlaceholders(text);
  const unknown: string[] = [];

  // Check each placeholder against whitelist
  for (const placeholder of placeholders) {
    if (!PLACEHOLDER_WHITELIST.has(placeholder)) {
      unknown.push(placeholder);
    }
  }

  return unknown;
}

