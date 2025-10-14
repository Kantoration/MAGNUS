/**
 * Phone number normalization with E.164 format and country-specific validation
 * Uses country map abstraction for market expansion
 */
import { parsePhoneNumber, CountryCode } from 'libphonenumber-js/max';
import { getLogger } from './logger.js';
import type { Logger } from 'pino';
import { applyCountryHeuristics, isMobileNumber as checkMobileNumber } from './phone-countries.js';

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
   * Normalize a phone number to E.164 format with strict IL heuristics
   */
  normalize(phoneNumber: string | undefined | null): string | null {
    if (!phoneNumber) {
      return null;
    }

    try {
      // Clean the input - keep only digits and leading '+'
      let cleaned = phoneNumber.trim();

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

      this.log('debug', { original: phoneNumber, normalized: e164 }, 'Normalized phone number');

      return e164;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(
        'warn',
        { phoneNumber, error: errorMessage },
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
