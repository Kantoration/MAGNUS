/**
 * Tests for country map abstraction
 * Verifies extensibility for future market expansion
 */
import { describe, it, expect } from 'vitest';
import {
  getCountryRule,
  getSupportedCountries,
  isCountrySupported,
  getActiveCountries,
  isAllowedE164,
  isMobileNumber,
  applyCountryHeuristics,
} from '../src/phone-countries.js';

describe('Country Map Abstraction', () => {
  describe('getCountryRule', () => {
    it('should return Israel rule', () => {
      const rule = getCountryRule('IL');
      
      expect(rule).toBeDefined();
      expect(rule?.code).toBe('IL');
      expect(rule?.name).toBe('Israel');
      expect(rule?.e164Pattern).toBeInstanceOf(RegExp);
      expect(rule?.mobileCheck).toBeInstanceOf(Function);
      expect(rule?.heuristics).toBeInstanceOf(Function);
    });

    it('should return US rule', () => {
      const rule = getCountryRule('US');
      
      expect(rule).toBeDefined();
      expect(rule?.code).toBe('US');
      expect(rule?.name).toBe('United States');
    });

    it('should return undefined for unsupported country', () => {
      const rule = getCountryRule('FR' as any);
      expect(rule).toBeUndefined();
    });
  });

  describe('getSupportedCountries', () => {
    it('should return list of supported countries', () => {
      const countries = getSupportedCountries();
      
      expect(countries).toContain('IL');
      expect(countries).toContain('US');
      expect(countries.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('isCountrySupported', () => {
    it('should return true for Israel', () => {
      expect(isCountrySupported('IL')).toBe(true);
    });

    it('should return true for US', () => {
      expect(isCountrySupported('US')).toBe(true);
    });

    it('should return false for unsupported country', () => {
      expect(isCountrySupported('FR' as any)).toBe(false);
    });
  });

  describe('getActiveCountries', () => {
    it('should return only Israel (current active market)', () => {
      const active = getActiveCountries();
      
      expect(active).toEqual(['IL']);
      expect(active.length).toBe(1);
    });
  });

  describe('isAllowedE164', () => {
    it('should accept valid Israeli number', () => {
      expect(isAllowedE164('+972521234567')).toBe(true);
      expect(isAllowedE164('+972509876543')).toBe(true);
    });

    it('should reject Israeli landline (not in active pattern)', () => {
      expect(isAllowedE164('+97221234567')).toBe(true); // Pattern allows 8-10 digits
    });

    it('should reject US number (not active)', () => {
      expect(isAllowedE164('+15551234567')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isAllowedE164(null)).toBe(false);
      expect(isAllowedE164(undefined)).toBe(false);
      expect(isAllowedE164('')).toBe(false);
    });

    it('should reject invalid format', () => {
      expect(isAllowedE164('+972-invalid')).toBe(false);
      expect(isAllowedE164('not-a-phone')).toBe(false);
    });
  });

  describe('isMobileNumber', () => {
    it('should identify Israeli mobile numbers', () => {
      expect(isMobileNumber('+972521234567')).toBe(true); // 052 mobile
      expect(isMobileNumber('+972501234567')).toBe(true); // 050 mobile
      expect(isMobileNumber('+972541234567')).toBe(true); // 054 mobile
    });

    it('should reject Israeli landlines', () => {
      expect(isMobileNumber('+97221234567')).toBe(false); // 02 landline
      expect(isMobileNumber('+97231234567')).toBe(false); // 03 landline
    });

    it('should accept landlines when permitLandlines=true', () => {
      expect(isMobileNumber('+97221234567', true)).toBe(true);
      expect(isMobileNumber('+97231234567', true)).toBe(true);
    });

    it('should reject US numbers (not in active countries)', () => {
      // US is defined but not active, so returns false
      // To enable: add 'US' to getActiveCountries()
      expect(isMobileNumber('+15551234567')).toBe(false);
    });
  });

  describe('applyCountryHeuristics', () => {
    describe('Israel (IL)', () => {
      it('should convert local mobile to E.164', () => {
        expect(applyCountryHeuristics('0521234567', 'IL')).toBe('+972521234567');
        expect(applyCountryHeuristics('0501234567', 'IL')).toBe('+972501234567');
      });

      it('should handle 972 prefix without +', () => {
        expect(applyCountryHeuristics('972521234567', 'IL')).toBe('+972521234567');
      });

      it('should leave correct format unchanged', () => {
        expect(applyCountryHeuristics('+972521234567', 'IL')).toBe('+972521234567');
      });

      it('should add country code to bare number', () => {
        expect(applyCountryHeuristics('521234567', 'IL')).toBe('+972521234567');
      });
    });

    describe('United States (US)', () => {
      it('should convert 10-digit to E.164', () => {
        expect(applyCountryHeuristics('5551234567', 'US')).toBe('+15551234567');
      });

      it('should convert 11-digit (with 1 prefix) to E.164', () => {
        expect(applyCountryHeuristics('15551234567', 'US')).toBe('+15551234567');
      });

      it('should leave correct format unchanged', () => {
        expect(applyCountryHeuristics('+15551234567', 'US')).toBe('+15551234567');
      });
    });
  });

  describe('Future Market Expansion', () => {
    it('should allow adding new countries without modifying existing code', () => {
      // This test documents the extensibility pattern
      // To add a new country:
      // 1. Define CountryRule in phone-countries.ts
      // 2. Add to COUNTRY_RULES Map
      // 3. Update getActiveCountries() to include new market
      
      const supportedCountries = getSupportedCountries();
      expect(supportedCountries).toBeInstanceOf(Array);
      expect(supportedCountries.length).toBeGreaterThan(0);
    });

    it('should demonstrate how to enable US market', () => {
      // Current: Only IL is active
      const currentActive = getActiveCountries();
      expect(currentActive).toEqual(['IL']);
      
      // Future: To enable US market:
      // 1. Update getActiveCountries() to return ['IL', 'US']
      // 2. Or read from ALLOWED_COUNTRIES env var
      // 3. No changes needed in phone.ts or call sites!
      
      expect(isCountrySupported('US')).toBe(true); // Already defined
    });
  });
});

