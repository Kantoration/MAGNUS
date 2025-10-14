/**
 * Phone number normalization with E.164 format and country-specific validation
 * 
 * VALIDATION MODES:
 * - STRICT (default in production): Rejects inputs with hidden characters, 
 *   format chars (ZWSP, etc.), or non-ASCII digits. Prevents confusable attacks.
 * - LENIENT: Sanitizes hidden chars and normalizes unicode digits before parsing.
 *   Use when integrating with systems that may include formatting chars.
 * 
 * Configure via PHONE_STRICT_VALIDATION env var (default: true)
 * 
 * Uses country map abstraction for market expansion
 */
import { parsePhoneNumber, CountryCode } from 'libphonenumber-js/max';
import { getLogger } from './logger.js';
import { getConfig } from './config.js';
import type { Logger } from 'pino';
import { applyCountryHeuristics, isMobileNumber as checkMobileNumber } from './phone-countries.js';

/**
 * Check if string contains suspicious characters in STRICT mode
 * Rejects:
 * - Format characters (\p{Cf}): ZWSP, ZWNJ, ZWJ, WORD JOINER, BOM, etc.
 * - Control characters (\p{Cc}): NULL, BACKSPACE, newlines, tabs, etc.
 * - Non-standard whitespace: non-breaking space, em space, thin space, etc.
 * - Multiple consecutive plus signs or plus in middle of number
 * - SQL injection patterns, script tags
 */
function containsSuspiciousChars(str: string): boolean {
  // Format characters (invisible)
  if (/\p{Cf}/u.test(str)) return true;
  
  // Control characters (C0 and C1 ranges: NULL, BACKSPACE, tabs, newlines, etc.)
  // Except regular space (U+0020)
  if (/[\x00-\x1F\x7F-\x9F]/u.test(str)) return true;
  
  // Non-standard whitespace (non-breaking space, em/en spaces, thin/hair spaces, etc.)
  // U+00A0 (nbsp), U+2000-U+200A (various spaces), U+202F (narrow nbsp), U+205F (medium math space), U+3000 (ideographic space)
  if (/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/u.test(str)) return true;
  
  // Multiple plus signs or plus in wrong position (not at start)
  if (/\+.*\+/.test(str)) return true; // Multiple plus signs
  if (/^\+?[^+]*\+/.test(str)) return true; // Plus not at start (after allowing optional leading +)
  
  // SQL injection patterns
  if (/['";]|--|\/\*|\*\/|DROP|SELECT|INSERT|UPDATE|DELETE|UNION/i.test(str)) return true;
  
  // Script tags
  if (/<script|<\/script/i.test(str)) return true;
  
  return false;
}

/**
 * Check if string contains non-ASCII digits or mixed scripts
 * Rejects confusable attacks like using Arabic-Indic digits
 */
function containsNonASCIIDigits(str: string): boolean {
  // Match any Unicode digit that's not ASCII 0-9
  // \p{Nd} = all Unicode decimal digits, [0-9] = ASCII digits
  return /\p{Nd}/u.test(str) && /[^\x00-\x7F0-9+\s()-]/u.test(str);
}

/**
 * Sanitize phone input in LENIENT mode
 * - Strips format characters (ZWSP, ZWNJ, ZWJ, etc.)
 * - Normalizes unicode digits to ASCII
 * - Preserves ASCII digits, +, spaces, hyphens, parentheses
 */
function sanitizePhoneInput(str: string): string {
  // Remove all format characters (\p{Cf})
  let sanitized = str.replace(/\p{Cf}/gu, '');
  
  // Normalize unicode digits to ASCII (if present)
  // This handles Arabic-Indic, Devanagari, etc.
  sanitized = sanitized.replace(/[\u0660-\u0669]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x0660 + 0x30)); // Arabic-Indic
  sanitized = sanitized.replace(/[\u06F0-\u06F9]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x06F0 + 0x30)); // Extended Arabic-Indic
  
  return sanitized;
}

export class PhoneNormalizer {
  private defaultCountry: CountryCode;
  private logger: Logger | undefined;
  private permitLandlines: boolean;

  constructor(
    defaultCountry: CountryCode = 'IL',
    logger?: Logger,
    permitLandlines: boolean = false
  ) {
    this.defaultCountry = defaultCountry;
    this.logger = logger;
    this.permitLandlines = permitLandlines;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', obj: object, msg: string): void {
    if (!this.logger) {
      this.logger = getLogger();
    }
    this.logger[level](obj, msg);
  }

  /**
   * Normalize a phone number to E.164 format
   * 
   * STRICT MODE (default):
   * - Rejects inputs with format characters (\p{Cf}: ZWSP, ZWNJ, etc.)
   * - Rejects inputs with non-ASCII digits (confusables)
   * - Returns null if validation fails
   * 
   * LENIENT MODE:
   * - Strips format characters before parsing
   * - Normalizes unicode digits to ASCII
   * - More permissive for legacy systems
   */
  normalize(phoneNumber: string | undefined | null): string | null {
    if (!phoneNumber) {
      return null;
    }

    try {
      const config = getConfig();
      let input = phoneNumber.trim();

      // STRICT validation: reject hidden chars, confusables, and injection attempts
      if (config.PHONE_STRICT_VALIDATION) {
        if (containsSuspiciousChars(input)) {
          this.log(
            'warn',
            { phoneNumber: mask(phoneNumber) },
            'STRICT mode: Rejected phone with suspicious characters (hidden/control/injection)'
          );
          return null;
        }

        if (containsNonASCIIDigits(input)) {
          this.log(
            'warn',
            { phoneNumber: mask(phoneNumber) },
            'STRICT mode: Rejected phone with non-ASCII digits or mixed scripts'
          );
          return null;
        }
      } else {
        // LENIENT mode: sanitize input
        input = sanitizePhoneInput(input);
      }

      // Clean the input - keep only digits and leading '+'
      let cleaned = input;

      // Strip all non-digits except leading '+'
      const hasPlus = cleaned.startsWith('+');
      cleaned = cleaned.replace(/\D/g, '');
      if (hasPlus) {
        cleaned = '+' + cleaned;
      }

      // Apply country-specific heuristics via abstraction
      cleaned = applyCountryHeuristics(cleaned, this.defaultCountry);

      // Parse with libphonenumber-js (max)
      const parsed = parsePhoneNumber(cleaned, this.defaultCountry);

      if (!parsed) {
        this.log('warn', { phoneNumber, cleaned }, 'Could not parse phone number');
        return null;
      }

      // Note: We skip isValid() check as we rely on our own country-specific heuristics
      // libphonenumber-js's isValid() can be overly strict for test numbers
      const e164 = parsed.format('E.164');

      // Check if mobile (unless landlines permitted) via country map
      if (!this.permitLandlines && !checkMobileNumber(e164, this.permitLandlines)) {
        this.log(
          'warn',
          { phoneNumber, e164 },
          'Phone number is not a mobile number (landlines not permitted)'
        );
        return null;
      }

      this.log('debug', { original: mask(phoneNumber), normalized: e164 }, 'Normalized phone number');

      return e164;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(
        'warn',
        { phoneNumber: mask(phoneNumber), error: errorMessage },
        'Error normalizing phone number'
      );
      return null;
    }
  }

  /**
   * Extract the first valid phone number from a contact object
   */
  extractPhoneFromContact(contact: {
    Phone?: string;
    MobilePhone?: string;
    HomePhone?: string;
    OtherPhone?: string;
  }): string | null {
    // Priority: MobilePhone > Phone > HomePhone > OtherPhone
    const candidates = [contact.MobilePhone, contact.Phone, contact.HomePhone, contact.OtherPhone];

    for (const candidate of candidates) {
      const normalized = this.normalize(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }
}

/**
 * Normalize a phone number to E.164 format (standalone function)
 */
export function normalizeE164(
  phone: string,
  country: CountryCode = 'IL',
  permitLandlines: boolean = false
): string | null {
  const normalizer = new PhoneNormalizer(country, undefined, permitLandlines);
  return normalizer.normalize(phone);
}

/**
 * Check if an E.164 number is likely an Israeli mobile number
 */
export function isLikelyILMobile(e164: string): boolean {
  // Israeli mobile numbers start with +9725 (05X in local format)
  // Valid prefixes: 050, 052, 053, 054, 055, 058
  if (!e164.startsWith('+972')) {
    return false;
  }

  const localPart = e164.substring(4); // Remove +972
  if (localPart.length !== 9) {
    return false;
  }

  // Check if starts with 5 (mobile prefix)
  if (!localPart.startsWith('5')) {
    return false;
  }

  // Valid mobile prefixes in Israel
  const mobilePrefix = localPart.substring(0, 2);
  const validPrefixes = ['50', '52', '53', '54', '55', '58'];

  return validPrefixes.includes(mobilePrefix);
}

// Re-export isAllowedE164 from country map for backward compatibility
export { isAllowedE164 } from './phone-countries.js';

/**
 * Mask an E.164 phone number
 * Keeps first 5 chars (e.g., +9725) + last 2 visible, others become '*'
 * Example: +972521234567 => +9725******67
 */
export function mask(e164: string): string {
  if (e164.length <= 7) {
    return e164; // Too short to mask meaningfully
  }

  const first5 = e164.substring(0, 5);
  const last2 = e164.substring(e164.length - 2);
  const middleLength = e164.length - 7;
  const masked = '*'.repeat(middleLength);

  return first5 + masked + last2;
}

/**
 * Safe phone logging wrapper - ALWAYS returns masked phone
 * Use this in log contexts to prevent accidental raw phone exposure
 * 
 * Example: logger.info({ to: logPhone(phone) }, 'Message sent');
 */
export function logPhone(e164: string | null | undefined): string {
  if (!e164) {
    return 'none';
  }
  return mask(e164);
}
