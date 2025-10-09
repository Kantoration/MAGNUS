/**
 * Unit tests for phone number normalization
 */
import { describe, it, expect } from 'vitest';
import { PhoneNormalizer, mask, logPhone } from '../src/phone.js';
import type { Logger } from 'pino';

// Mock logger that doesn't require config
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

describe('PhoneNormalizer', () => {
  const normalizer = new PhoneNormalizer('IL', mockLogger);

  describe('normalize', () => {
    it('should normalize Israeli mobile number with leading 0', () => {
      const result = normalizer.normalize('050-1234567');
      expect(result).toBe('+972501234567');
    });

    it('should normalize Israeli mobile number without country code', () => {
      const result = normalizer.normalize('0521234567');
      expect(result).toBe('+972521234567');
    });

    it('should normalize Israeli number with +972 prefix', () => {
      const result = normalizer.normalize('+972501234567');
      expect(result).toBe('+972501234567');
    });

    it('should normalize Israeli number with 972 prefix (no plus)', () => {
      const result = normalizer.normalize('972501234567');
      expect(result).toBe('+972501234567');
    });

    it('should handle numbers with spaces and parentheses', () => {
      const result = normalizer.normalize('(050) 123-4567');
      expect(result).toBe('+972501234567');
    });

    it('should return null for invalid number', () => {
      const result = normalizer.normalize('123');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = normalizer.normalize('');
      expect(result).toBeNull();
    });

    it('should return null for null input', () => {
      const result = normalizer.normalize(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined input', () => {
      const result = normalizer.normalize(undefined);
      expect(result).toBeNull();
    });
  });

  describe('extractPhoneFromContact', () => {
    it('should prioritize MobilePhone', () => {
      const contact = {
        Phone: '+972501111111',
        MobilePhone: '+972502222222',
        HomePhone: '+972503333333',
      };
      const result = normalizer.extractPhoneFromContact(contact);
      expect(result).toBe('+972502222222');
    });

    it('should fallback to Phone if MobilePhone is missing', () => {
      const contact = {
        Phone: '+972501111111',
        HomePhone: '+972503333333',
      };
      const result = normalizer.extractPhoneFromContact(contact);
      expect(result).toBe('+972501111111');
    });

    it('should return null if all phone fields are empty', () => {
      const contact = {};
      const result = normalizer.extractPhoneFromContact(contact);
      expect(result).toBeNull();
    });

    it('should skip invalid numbers and try next field', () => {
      const contact = {
        MobilePhone: 'invalid',
        Phone: '0501234567',
      };
      const result = normalizer.extractPhoneFromContact(contact);
      expect(result).toBe('+972501234567');
    });
  });

  describe('mask', () => {
    it('should mask Israeli mobile number', () => {
      expect(mask('+972521234567')).toBe('+9725******67');
    });

    it('should mask long phone number', () => {
      // +12125551234 has 12 chars, first 5 + last 2 = 7, so 5 stars in middle
      expect(mask('+12125551234')).toBe('+1212*****34');
    });

    it('should not mask short numbers', () => {
      expect(mask('+97252')).toBe('+97252');
    });
  });

  describe('logPhone', () => {
    it('should always return masked phone for valid E.164', () => {
      expect(logPhone('+972521234567')).toBe('+9725******67');
    });

    it('should return "none" for null', () => {
      expect(logPhone(null)).toBe('none');
    });

    it('should return "none" for undefined', () => {
      expect(logPhone(undefined)).toBe('none');
    });

    it('should never expose raw phone numbers', () => {
      const rawPhone = '+972521234567';
      const logged = logPhone(rawPhone);
      
      // Verify it's masked
      expect(logged).not.toBe(rawPhone);
      expect(logged).toBe('+9725******67');
      
      // Verify middle digits are hidden
      expect(logged).not.toContain('12345');
    });
  });
});
