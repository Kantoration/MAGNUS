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
 * Extract placeholder names from template text
 */
export function extractPlaceholders(text: string): string[] {
  const pattern = /\{\{?(\w+)\}?\}/g;
  const matches: string[] = [];
  let match;

  while ((match = pattern.exec(text)) !== null) {
    matches.push(match[1]);
  }

  return [...new Set(matches)];
}

/**
 * Validate template placeholders against whitelist
 * Returns array of unknown placeholders (empty if all valid)
 */
export function validateTemplatePlaceholders(text: string): string[] {
  const placeholders = extractPlaceholders(text);
  const unknown: string[] = [];

  for (const placeholder of placeholders) {
    if (!PLACEHOLDER_WHITELIST.has(placeholder)) {
      unknown.push(placeholder);
    }
  }

  return unknown;
}

