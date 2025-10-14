/**
 * Phone Number Edge Case Tests
 * Covers unicode digits, zero-width spaces, hyphenated numbers, and country mismatches
 */

import { describe, it, expect } from 'vitest';
import { normalizeE164, logPhone } from '../src/phone.js';

describe('Phone Number Unicode Edge Cases', () => {
  describe('Unicode Digits (Non-ASCII)', () => {
    it('should reject Arabic-Indic digits (U+0660-U+0669)', () => {
      // ٠١٢٣٤٥٦٧٨٩ (Arabic-Indic digits 0-9)
      const arabicNumber = '+٩٧٢٥٠١٢٣٤٥٦٧';
      const result = normalizeE164(arabicNumber);
      
      expect(result).toBeNull();
    });

    it('should reject Eastern Arabic-Indic digits (U+06F0-U+06F9)', () => {
      // ۰۱۲۳۴۵۶۷۸۹ (Extended Arabic-Indic digits)
      const persianNumber = '+۹۷۲۵۰۱۲۳۴۵۶۷';
      const result = normalizeE164(persianNumber);
      
      expect(result).toBeNull();
    });

    it('should reject Devanagari digits (U+0966-U+096F)', () => {
      // ०१२३४५६७८९ (Devanagari numerals)
      const devanagariNumber = '+९७२५०१२३४५६७';
      const result = normalizeE164(devanagariNumber);
      
      expect(result).toBeNull();
    });

    it('should reject fullwidth digits (U+FF10-U+FF19)', () => {
      // ０１２３４５６７８９ (Fullwidth digits used in East Asian text)
      const fullwidthNumber = '+９７２５０１２３４５６７';
      const result = normalizeE164(fullwidthNumber);
      
      expect(result).toBeNull();
    });

    it('should only accept ASCII digits 0-9', () => {
      const validNumber = '+972501234567';
      const result = normalizeE164(validNumber);
      
      expect(result).toBe('+972501234567');
    });
  });

  describe('Zero-Width and Invisible Characters', () => {
    // Note: Current implementation strips these characters (secure behavior)
    // If they resolve to valid number after stripping, that's acceptable
    
    it('should handle phone with zero-width space (U+200B) by stripping it', () => {
      const number = '+972\u200B501234567'; // Zero-width space after country code
      const result = normalizeE164(number);
      
      // Secure: strips invisible char, validates the result
      expect(result).toBe('+972501234567');
    });

    it('should handle phone with zero-width non-joiner (U+200C) by stripping it', () => {
      const number = '+9725\u200C01234567';
      const result = normalizeE164(number);
      
      expect(result).toBe('+972501234567');
    });

    it('should handle phone with zero-width joiner (U+200D) by stripping it', () => {
      const number = '+972501\u200D234567';
      const result = normalizeE164(number);
      
      expect(result).toBe('+972501234567');
    });

    it('should handle phone with soft hyphen (U+00AD) by stripping it', () => {
      const number = '+972\u00AD501234567';
      const result = normalizeE164(number);
      
      expect(result).toBe('+972501234567');
    });

    it('should handle phone with byte order mark (U+FEFF) by stripping it', () => {
      const number = '\uFEFF+972501234567';
      const result = normalizeE164(number);
      
      expect(result).toBe('+972501234567');
    });
  });

  describe('Hyphenated and Formatted Numbers', () => {
    it('should handle Israeli number with hyphens', () => {
      const number = '+972-50-123-4567';
      const result = normalizeE164(number);
      
      // May strip hyphens and validate, or reject
      // Current implementation strips non-digits, so should work
      expect(result).toBe('+972501234567');
    });

    it('should handle Israeli number with spaces', () => {
      const number = '+972 50 123 4567';
      const result = normalizeE164(number);
      
      expect(result).toBe('+972501234567');
    });

    it('should handle Israeli number with parentheses', () => {
      const number = '+972 (50) 123-4567';
      const result = normalizeE164(number);
      
      expect(result).toBe('+972501234567');
    });

    it('should handle Israeli number with dots', () => {
      const number = '+972.50.123.4567';
      const result = normalizeE164(number);
      
      expect(result).toBe('+972501234567');
    });
  });

  describe('Wrong Country Code vs Number Format', () => {
    it('should reject US number (+1)', () => {
      const usNumber = '+12125551234';
      const result = normalizeE164(usNumber);
      
      expect(result).toBeNull();
    });

    it('should reject UK number (+44)', () => {
      const ukNumber = '+442071234567';
      const result = normalizeE164(ukNumber);
      
      expect(result).toBeNull();
    });

    it('should reject German number (+49)', () => {
      const deNumber = '+4930123456';
      const result = normalizeE164(deNumber);
      
      expect(result).toBeNull();
    });

    it('should reject French number (+33)', () => {
      const frNumber = '+33123456789';
      const result = normalizeE164(frNumber);
      
      expect(result).toBeNull();
    });

    it('should reject Palestinian number (+970)', () => {
      const psNumber = '+970501234567';
      const result = normalizeE164(psNumber);
      
      expect(result).toBeNull();
    });

    it('should reject Egyptian number (+20)', () => {
      const egNumber = '+20101234567';
      const result = normalizeE164(egNumber);
      
      expect(result).toBeNull();
    });

    it('should accept only Israeli numbers (+972)', () => {
      const ilNumber = '+972501234567';
      const result = normalizeE164(ilNumber);
      
      expect(result).toBe('+972501234567');
    });
  });

  describe('Malformed Israeli Numbers', () => {
    it('should reject too short Israeli number', () => {
      const shortNumber = '+97250123';
      const result = normalizeE164(shortNumber);
      
      expect(result).toBeNull();
    });

    it('should reject too long Israeli number', () => {
      const longNumber = '+97250123456789';
      const result = normalizeE164(longNumber);
      
      expect(result).toBeNull();
    });

    it('should reject Israeli number without leading zero in mobile', () => {
      // Israeli mobile numbers should start with 5 (050, 052, 053, 054, 055, 058)
      const invalid = '+97260123456'; // Starts with 60 (landline)
      const result = normalizeE164(invalid);
      
      // Depending on validation, might accept landlines or reject non-mobile
      // Our implementation focuses on mobile validation
      expect(result).toBeNull();
    });
  });

  describe('Edge Case Inputs', () => {
    it('should reject empty string', () => {
      const result = normalizeE164('');
      
      expect(result).toBeNull();
    });

    it('should reject null input', () => {
      const result = normalizeE164(null as any);
      
      expect(result).toBeNull();
    });

    it('should reject undefined input', () => {
      const result = normalizeE164(undefined as any);
      
      expect(result).toBeNull();
    });

    it('should handle number without plus sign by adding it', () => {
      const number = '972501234567';
      const result = normalizeE164(number);
      
      // Normalizer may add + if missing
      expect(result).toBe('+972501234567');
    });

    it('should handle number with multiple plus signs by stripping extras', () => {
      const number = '++972501234567';
      const result = normalizeE164(number);
      
      // Strips extra + signs
      expect(result).toBe('+972501234567');
    });

    it('should reject number with letters', () => {
      const number = '+972ABC123DEF';
      const result = normalizeE164(number);
      
      expect(result).toBeNull();
    });

    it('should handle number with emoji by stripping it', () => {
      const number = '+972📱501234567';
      const result = normalizeE164(number);
      
      // Emoji gets stripped, leaving valid number
      expect(result).toBe('+972501234567');
    });
  });

  describe('logPhone Wrapper', () => {
    it('should mask valid Israeli number', () => {
      const phone = '+972501234567';
      const result = logPhone(phone);
      
      expect(result).toContain('***');
      expect(result).not.toBe(phone);
      expect(result.length).toBeGreaterThan(3);
    });

    it('should handle null input safely', () => {
      const result = logPhone(null);
      
      expect(result).toBe('none'); // Current implementation returns 'none'
    });

    it('should handle undefined input safely', () => {
      const result = logPhone(undefined);
      
      expect(result).toBe('none'); // Current implementation returns 'none'
    });

    it('should not mask very short partial numbers', () => {
      const phone = '+97250';
      const result = logPhone(phone);
      
      // Short numbers (<8 chars) may not be masked
      expect(result).toBe(phone);
    });

    it('should never expose full phone number', () => {
      const phone = '+972501234567';
      const result = logPhone(phone);
      
      // Verify masking happened
      expect(result).not.toContain('01234567');
      expect(result).toMatch(/\*\*\*/);
    });
  });

  describe('Confusable Characters', () => {
    it('should handle Cyrillic characters by stripping them', () => {
      // Cyrillic А (U+0410) looks like Latin A but gets stripped
      const number = '+972А501234567'; // Contains Cyrillic A
      const result = normalizeE164(number);
      
      // Strips Cyrillic char, leaving valid number
      expect(result).toBe('+972501234567');
    });

    it('should reject Greek characters', () => {
      // Greek Ο (omicron, U+039F) looks like Latin O/zero
      const number = '+972501Ο34567';
      const result = normalizeE164(number);
      
      expect(result).toBeNull();
    });

    it('should reject superscript digits', () => {
      // Superscript digits: ⁰¹²³⁴⁵⁶⁷⁸⁹
      const number = '+⁹⁷²⁵⁰¹²³⁴⁵⁶⁷';
      const result = normalizeE164(number);
      
      expect(result).toBeNull();
    });

    it('should reject subscript digits', () => {
      // Subscript digits: ₀₁₂₃₄₅₆₇₈₉
      const number = '+₉₇₂₅₀₁₂₃₄₅₆₇';
      const result = normalizeE164(number);
      
      expect(result).toBeNull();
    });
  });
});

