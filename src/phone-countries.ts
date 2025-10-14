/**
 * Country-specific phone validation rules
 * Enables market expansion without changing call sites
 */
import type { CountryCode } from 'libphonenumber-js/max';

/**
 * Country validation rule
 */
export interface CountryRule {
  code: CountryCode;
  name: string;
  e164Pattern: RegExp;
  mobileCheck?: (e164: string) => boolean;
  heuristics?: (cleaned: string) => string; // Pre-parsing normalization
}

/**
 * Israel validation rules
 */
const israelRule: CountryRule = {
  code: 'IL',
  name: 'Israel',
  e164Pattern: /^\+972\d{8,10}$/,
  
  mobileCheck: (e164: string): boolean => {
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

    // Valid mobile prefixes
    const mobilePrefix = localPart.substring(0, 2);
    const validPrefixes = ['50', '52', '53', '54', '55', '58'];

    return validPrefixes.includes(mobilePrefix);
  },
  
  heuristics: (cleaned: string): string => {
    // Format: 05X-XXX-XXXX or 05XXXXXXXX (10 digits starting with 0)
    if (cleaned.startsWith('0') && cleaned.length === 10 && cleaned.startsWith('05')) {
      return '+972' + cleaned.substring(1);
    }
    // Format: 9725XXXXXXXX (12 digits starting with 972)
    else if (cleaned.startsWith('972') && cleaned.length === 12) {
      return '+' + cleaned;
    }
    // Format: +9725XXXXXXXX (already correct)
    else if (cleaned.startsWith('+972')) {
      return cleaned;
    }
    // Add country code if missing and not already handled
    else if (!cleaned.startsWith('+') && !cleaned.startsWith('972')) {
      return '+972' + cleaned;
    }
    
    return cleaned;
  },
};

/**
 * United States validation rules (example for future expansion)
 */
const usRule: CountryRule = {
  code: 'US',
  name: 'United States',
  e164Pattern: /^\+1\d{10}$/,
  
  mobileCheck: undefined, // US doesn't distinguish mobile/landline by prefix
  
  heuristics: (cleaned: string): string => {
    // Format: (555) 123-4567 or 5551234567 (10 digits)
    if (!cleaned.startsWith('+') && cleaned.length === 10) {
      return '+1' + cleaned;
    }
    // Format: 15551234567 (11 digits)
    else if (cleaned.startsWith('1') && cleaned.length === 11) {
      return '+' + cleaned;
    }
    // Format: +15551234567 (already correct)
    else if (cleaned.startsWith('+1')) {
      return cleaned;
    }
    
    return cleaned;
  },
};

/**
 * Country rules registry
 */
const COUNTRY_RULES = new Map<CountryCode, CountryRule>([
  ['IL', israelRule],
  ['US', usRule], // Placeholder for future expansion
]);

/**
 * Get country rule by code
 * @param country Country code (e.g., 'IL', 'US')
 * @returns Country rule or undefined if not supported
 */
export function getCountryRule(country: CountryCode): CountryRule | undefined {
  return COUNTRY_RULES.get(country);
}

/**
 * Get list of supported countries
 */
export function getSupportedCountries(): CountryCode[] {
  return Array.from(COUNTRY_RULES.keys());
}

/**
 * Check if a country is supported
 */
export function isCountrySupported(country: CountryCode): boolean {
  return COUNTRY_RULES.has(country);
}

/**
 * Get active countries from configuration
 * Returns array of enabled countries (currently only IL)
 */
export function getActiveCountries(): CountryCode[] {
  // For now, only Israel is active
  // Future: Read from ALLOWED_COUNTRIES env var
  return ['IL'];
}

/**
 * Check if phone number matches any active country pattern
 * @param e164 E.164 formatted phone number
 * @returns true if matches any active country
 */
export function isAllowedE164(e164: string | null | undefined): boolean {
  if (!e164) {
    return false;
  }
  
  const activeCountries = getActiveCountries();
  
  for (const countryCode of activeCountries) {
    const rule = COUNTRY_RULES.get(countryCode);
    if (rule && rule.e164Pattern.test(e164)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if phone number is mobile (if country supports distinction)
 * @param e164 E.164 formatted phone number
 * @param permitLandlines If true, accept landlines
 * @returns true if mobile (or landlines permitted)
 */
export function isMobileNumber(
  e164: string,
  permitLandlines: boolean = false
): boolean {
  if (permitLandlines) {
    return true; // Accept all if landlines permitted
  }
  
  // Check each active country
  const activeCountries = getActiveCountries();
  
  for (const countryCode of activeCountries) {
    const rule = COUNTRY_RULES.get(countryCode);
    
    if (!rule) {
      continue;
    }
    
    // If rule has mobileCheck, use it
    if (rule.mobileCheck) {
      return rule.mobileCheck(e164);
    }
    
    // No mobile check = accept all numbers for this country
    return true;
  }
  
  return false;
}

/**
 * Apply country-specific heuristics to clean phone input
 * @param cleaned Pre-cleaned phone (digits + optional leading +)
 * @param country Country code
 * @returns Phone with country heuristics applied
 */
export function applyCountryHeuristics(cleaned: string, country: CountryCode): string {
  const rule = COUNTRY_RULES.get(country);
  
  if (rule?.heuristics) {
    return rule.heuristics(cleaned);
  }
  
  // No heuristics = return as-is
  return cleaned;
}

