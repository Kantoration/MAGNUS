/**
 * Hardened unit tests for phone number normalization with strict IL heuristics
 */
import { describe, it, expect } from 'vitest';
import { PhoneNormalizer, normalizeE164, isLikelyILMobile, mask } from '../src/phone.js';
import type { Logger } from 'pino';

// Mock logger
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as Logger;

describe('Hardened Phone Normalization', () => {
  describe('normalizeE164', () => {
    it('should normalize valid Israeli mobile with leading +', () => {
      const result = normalizeE164('+972521234567');
      expect(result).toBe('+972521234567');
    });

    it('should normalize Israeli mobile without + (972 prefix)', () => {
      const result = normalizeE164('972521234567');
      expect(result).toBe('+972521234567');
    });

    it('should normalize Israeli mobile with leading 0', () => {
      const result = normalizeE164('052-123-4567');
      expect(result).toBe('+972521234567');
    });

    it('should normalize Israeli mobile without separators', () => {
      const result = normalizeE164('0521234567');
      expect(result).toBe('+972521234567');
    });

    it('should handle different Israeli mobile prefixes', () => {
      expect(normalizeE164('0501234567')).toBe('+972501234567'); // 050
      expect(normalizeE164('0521234567')).toBe('+972521234567'); // 052
      expect(normalizeE164('0531234567')).toBe('+972531234567'); // 053
      expect(normalizeE164('0541234567')).toBe('+972541234567'); // 054
      expect(normalizeE164('0551234567')).toBe('+972551234567'); // 055
      expect(normalizeE164('0581234567')).toBe('+972581234567'); // 058
    });

    it('should return null for invalid short number', () => {
      const result = normalizeE164('12345');
      expect(result).toBeNull();
    });

    it('should return null for Israeli landline by default', () => {
      // 03 is Tel Aviv landline prefix
      const result = normalizeE164('039123456');
      expect(result).toBeNull();
    });

    it('should accept Israeli landline when permitLandlines=true', () => {
      const result = normalizeE164('039123456', 'IL', true);
      expect(result).toBe('+97239123456');
    });

    it('should return null for empty string', () => {
      expect(normalizeE164('')).toBeNull();
    });

    it('should handle spaces and parentheses', () => {
      const result = normalizeE164('(052) 123-4567');
      expect(result).toBe('+972521234567');
    });

    it('should reject non-mobile Israeli numbers', () => {
      // 02 is Jerusalem landline
      expect(normalizeE164('0262345678')).toBeNull();
      // 04 is Haifa landline
      expect(normalizeE164('0462345678')).toBeNull();
      // 08 is Beersheba landline
      expect(normalizeE164('0862345678')).toBeNull();
    });
  });

  describe('PhoneNormalizer with permitLandlines', () => {
    it('should reject landlines by default', () => {
      const normalizer = new PhoneNormalizer('IL', mockLogger, false);
      const result = normalizer.normalize('039123456');
      expect(result).toBeNull();
    });

    it('should accept landlines when permitted', () => {
      const normalizer = new PhoneNormalizer('IL', mockLogger, true);
      const result = normalizer.normalize('039123456');
      expect(result).toBe('+97239123456');
    });
  });

  describe('isLikelyILMobile', () => {
    it('should return true for valid Israeli mobile numbers', () => {
      expect(isLikelyILMobile('+972501234567')).toBe(true); // 050
      expect(isLikelyILMobile('+972521234567')).toBe(true); // 052
      expect(isLikelyILMobile('+972531234567')).toBe(true); // 053
      expect(isLikelyILMobile('+972541234567')).toBe(true); // 054
      expect(isLikelyILMobile('+972551234567')).toBe(true); // 055
      expect(isLikelyILMobile('+972581234567')).toBe(true); // 058
    });

    it('should return false for Israeli landlines', () => {
      expect(isLikelyILMobile('+97239123456')).toBe(false); // Tel Aviv
      expect(isLikelyILMobile('+97229123456')).toBe(false); // Jerusalem
      expect(isLikelyILMobile('+97249123456')).toBe(false); // Haifa
    });

    it('should return false for non-Israeli numbers', () => {
      expect(isLikelyILMobile('+14155551234')).toBe(false); // US
      expect(isLikelyILMobile('+447700900123')).toBe(false); // UK
    });

    it('should return false for invalid formats', () => {
      expect(isLikelyILMobile('0521234567')).toBe(false); // Missing +972
      expect(isLikelyILMobile('+9725212345')).toBe(false); // Too short
      expect(isLikelyILMobile('+97252123456789')).toBe(false); // Too long
    });
  });

  describe('mask', () => {
    it('should mask Israeli mobile number correctly', () => {
      const result = mask('+972521234567');
      expect(result).toBe('+9725******67');
    });

    it('should keep first 4 and last 2 visible', () => {
      const result = mask('+972501234567');
      expect(result).toBe('+9725******67');
    });

    it('should handle different length numbers', () => {
      expect(mask('+14155551234')).toBe('+1415*****34');
      expect(mask('+447700900123')).toBe('+4477******23');
    });

    it('should not mask numbers too short', () => {
      expect(mask('+9725')).toBe('+9725');
      expect(mask('123')).toBe('123');
    });

    it('should mask exactly the middle characters', () => {
      const input = '+972521234567';
      const result = mask(input);

      // Verify length is preserved
      expect(result.length).toBe(input.length);

      // Verify first 5
      expect(result.substring(0, 5)).toBe('+9725');

      // Verify last 2
      expect(result.substring(result.length - 2)).toBe('67');

      // Verify middle is all asterisks
      const middle = result.substring(5, result.length - 2);
      expect(middle).toMatch(/^\*+$/);
      expect(middle.length).toBe(6);
    });
  });

  describe('Edge cases', () => {
    it('should handle null and undefined', () => {
      expect(normalizeE164('')).toBeNull();
    });

    it('should reject invalid Israeli mobile prefixes', () => {
      // 056, 057, 059 are not valid Israeli mobile prefixes
      expect(normalizeE164('0561234567')).toBeNull();
      expect(normalizeE164('0571234567')).toBeNull();
      expect(normalizeE164('0591234567')).toBeNull();
    });

    it('should handle international format correctly', () => {
      const result = normalizeE164('+972-52-123-4567');
      expect(result).toBe('+972521234567');
    });

    it('should strip all non-digit characters except leading +', () => {
      const result = normalizeE164('+972 (52) 123-4567');
      expect(result).toBe('+972521234567');
    });
  });
});
