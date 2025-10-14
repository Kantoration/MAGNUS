/**
 * International Phone Number Support Tests
 * Verifies multi-country validation and configuration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeE164 } from '../src/phone.js';
import { getActiveCountries, getSupportedCountries, isAllowedE164 } from '../src/phone-countries.js';

describe('International Phone Number Support', () => {
  const originalEnv = process.env.ALLOWED_COUNTRIES;

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.ALLOWED_COUNTRIES;
    } else {
      process.env.ALLOWED_COUNTRIES = originalEnv;
    }
  });

  describe('Supported Countries', () => {
    it('should support Israel (IL)', () => {
      const countries = getSupportedCountries();
      expect(countries).toContain('IL');
    });

    it('should support United States (US)', () => {
      const countries = getSupportedCountries();
      expect(countries).toContain('US');
    });

    it('should support United Kingdom (GB)', () => {
      const countries = getSupportedCountries();
      expect(countries).toContain('GB');
    });

    it('should support Germany (DE)', () => {
      const countries = getSupportedCountries();
      expect(countries).toContain('DE');
    });

    it('should support France (FR)', () => {
      const countries = getSupportedCountries();
      expect(countries).toContain('FR');
    });

    it('should have at least 5 countries registered', () => {
      const countries = getSupportedCountries();
      expect(countries.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Default Behavior (All Countries Allowed)', () => {
    beforeEach(() => {
      delete process.env.ALLOWED_COUNTRIES;
    });

    it('should allow Israeli numbers by default', () => {
      const phone = '+972501234567';
      const result = normalizeE164(phone);
      expect(result).toBe('+972501234567');
    });

    it('should allow US numbers by default', () => {
      const phone = '+12125551234';
      const result = normalizeE164(phone);
      expect(result).toBe('+12125551234');
    });

    it('should allow UK numbers by default', () => {
      const phone = '+442071234567';
      const result = normalizeE164(phone);
      expect(result).toBe('+442071234567');
    });

    it('should allow German numbers by default', () => {
      const phone = '+4930123456';
      const result = normalizeE164(phone);
      expect(result).toBe('+4930123456');
    });

    it('should allow French numbers by default', () => {
      const phone = '+33123456789';
      const result = normalizeE164(phone);
      expect(result).toBe('+33123456789');
    });
  });

  describe('Wildcard Configuration (ALLOWED_COUNTRIES=*)', () => {
    beforeEach(() => {
      process.env.ALLOWED_COUNTRIES = '*';
    });

    it('should accept all registered countries', () => {
      const active = getActiveCountries();
      const supported = getSupportedCountries();
      expect(active).toEqual(supported);
    });

    it('should allow Israeli numbers', () => {
      expect(isAllowedE164('+972501234567')).toBe(true);
    });

    it('should allow US numbers', () => {
      expect(isAllowedE164('+12125551234')).toBe(true);
    });

    it('should allow UK numbers', () => {
      expect(isAllowedE164('+442071234567')).toBe(true);
    });
  });

  describe('Israel Only Configuration (ALLOWED_COUNTRIES=IL)', () => {
    beforeEach(() => {
      process.env.ALLOWED_COUNTRIES = 'IL';
    });

    it('should return only IL in active countries', () => {
      const active = getActiveCountries();
      expect(active).toEqual(['IL']);
    });

    it('should accept Israeli numbers', () => {
      expect(isAllowedE164('+972501234567')).toBe(true);
    });

    it('should reject US numbers', () => {
      expect(isAllowedE164('+12125551234')).toBe(false);
    });

    it('should reject UK numbers', () => {
      expect(isAllowedE164('+442071234567')).toBe(false);
    });

    it('should reject German numbers', () => {
      expect(isAllowedE164('+4930123456')).toBe(false);
    });
  });

  describe('Multiple Countries Configuration (ALLOWED_COUNTRIES=IL,US,GB)', () => {
    beforeEach(() => {
      process.env.ALLOWED_COUNTRIES = 'IL,US,GB';
    });

    it('should return only specified countries', () => {
      const active = getActiveCountries();
      expect(active).toEqual(['IL', 'US', 'GB']);
    });

    it('should accept Israeli numbers', () => {
      expect(isAllowedE164('+972501234567')).toBe(true);
    });

    it('should accept US numbers', () => {
      expect(isAllowedE164('+12125551234')).toBe(true);
    });

    it('should accept UK numbers', () => {
      expect(isAllowedE164('+442071234567')).toBe(true);
    });

    it('should reject German numbers (not in list)', () => {
      expect(isAllowedE164('+4930123456')).toBe(false);
    });

    it('should reject French numbers (not in list)', () => {
      expect(isAllowedE164('+33123456789')).toBe(false);
    });
  });

  describe('Case Insensitive Configuration', () => {
    beforeEach(() => {
      process.env.ALLOWED_COUNTRIES = 'il,us'; // Lowercase
    });

    it('should handle lowercase country codes', () => {
      const active = getActiveCountries();
      expect(active).toEqual(['IL', 'US']);
    });

    it('should accept Israeli numbers with lowercase config', () => {
      expect(isAllowedE164('+972501234567')).toBe(true);
    });
  });

  describe('Invalid Configuration Handling', () => {
    beforeEach(() => {
      process.env.ALLOWED_COUNTRIES = 'IL,INVALID,US,FAKE';
    });

    it('should filter out invalid country codes', () => {
      const active = getActiveCountries();
      expect(active).toEqual(['IL', 'US']);
      expect(active).not.toContain('INVALID');
      expect(active).not.toContain('FAKE');
    });
  });

  describe('Empty Configuration Fallback', () => {
    beforeEach(() => {
      process.env.ALLOWED_COUNTRIES = '';
    });

    it('should default to all countries when empty', () => {
      const active = getActiveCountries();
      const supported = getSupportedCountries();
      expect(active).toEqual(supported);
    });
  });

  describe('Whitespace Handling', () => {
    beforeEach(() => {
      process.env.ALLOWED_COUNTRIES = ' IL , US , GB '; // Extra spaces
    });

    it('should trim whitespace from country codes', () => {
      const active = getActiveCountries();
      expect(active).toEqual(['IL', 'US', 'GB']);
    });
  });

  describe('Country-Specific Number Validation', () => {
    beforeEach(() => {
      delete process.env.ALLOWED_COUNTRIES; // All countries
    });

    it('should validate Israeli mobile numbers (050-058)', () => {
      expect(normalizeE164('+972501234567')).toBe('+972501234567'); // 050
      expect(normalizeE164('+972521234567')).toBe('+972521234567'); // 052
      expect(normalizeE164('+972531234567')).toBe('+972531234567'); // 053
      expect(normalizeE164('+972541234567')).toBe('+972541234567'); // 054
      expect(normalizeE164('+972551234567')).toBe('+972551234567'); // 055
      expect(normalizeE164('+972581234567')).toBe('+972581234567'); // 058
    });

    it('should validate US 10-digit numbers', () => {
      expect(normalizeE164('+12125551234')).toBe('+12125551234');
      expect(normalizeE164('+14155551234')).toBe('+14155551234');
    });

    it('should validate UK numbers starting with 44', () => {
      expect(normalizeE164('+442071234567')).toBe('+442071234567');
      expect(normalizeE164('+447912345678')).toBe('+447912345678');
    });

    it('should validate German numbers', () => {
      expect(normalizeE164('+4930123456')).toBe('+4930123456');
      expect(normalizeE164('+491234567890')).toBe('+491234567890');
    });

    it('should validate French numbers', () => {
      expect(normalizeE164('+33123456789')).toBe('+33123456789');
      expect(normalizeE164('+33612345678')).toBe('+33612345678');
    });
  });

  describe('Country-Specific Heuristics', () => {
    beforeEach(() => {
      delete process.env.ALLOWED_COUNTRIES;
    });

    it('should add +1 to US 10-digit numbers', () => {
      const result = normalizeE164('2125551234');
      expect(result).toBe('+12125551234');
    });

    it('should add +44 to UK numbers starting with 0', () => {
      const result = normalizeE164('07912345678');
      expect(result).toBe('+447912345678');
    });

    it('should add +49 to German numbers starting with 0', () => {
      const result = normalizeE164('030123456');
      expect(result).toBe('+4930123456');
    });

    it('should add +33 to French numbers starting with 0', () => {
      const result = normalizeE164('0123456789');
      expect(result).toBe('+33123456789');
    });
  });
});

