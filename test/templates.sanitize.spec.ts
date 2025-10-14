/**
 * Tests for template sanitization
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeTemplateText,
  validatePlaceholders,
  sanitizeLink,
  extractPlaceholders,
  validateTemplatePlaceholders,
  PLACEHOLDER_WHITELIST,
} from '../src/templates.sanitize.js';
import { ValidationError, SanitizationError } from '../src/errors.js';

describe('Template Sanitization', () => {
  describe('sanitizeTemplateText', () => {
    it('should allow normal text', () => {
      const text = 'Hello {{first_name}}, your order is ready!';
      const result = sanitizeTemplateText(text);
      expect(result).toBe(text);
    });

    it('should allow Hebrew text', () => {
      const text = 'שלום {{first_name}}, ההזמנה שלך מוכנה!';
      const result = sanitizeTemplateText(text);
      expect(result).toBe(text);
    });

    it('should remove control characters', () => {
      const text = 'Hello\u0001world\u0007test';
      const result = sanitizeTemplateText(text);
      expect(result).not.toContain('\u0001');
      expect(result).not.toContain('\u0007');
      expect(result).toBe('Hello world test');
    });

    it('should throw on too-long templates', () => {
      const longText = 'x'.repeat(2001);
      expect(() => sanitizeTemplateText(longText)).toThrow(SanitizationError);
      expect(() => sanitizeTemplateText(longText)).toThrow('Template too long');
    });

    it('should preserve newlines and tabs', () => {
      const text = 'Hello\nworld\ttab';
      const result = sanitizeTemplateText(text);
      expect(result).toContain('\n');
      expect(result).toContain('\t');
    });
  });

  describe('validatePlaceholders', () => {
    it('should allow whitelisted placeholders', () => {
      const vars = {
        first_name: 'John',
        account_name: 'ACME Corp',
        date: '2025-10-14',
        link: 'https://example.com',
      };

      expect(() => validatePlaceholders(vars)).not.toThrow();
    });

    it('should throw on unknown placeholders', () => {
      const vars = {
        first_name: 'John',
        unknown_field: 'value',
        malicious_var: 'bad',
      };

      expect(() => validatePlaceholders(vars)).toThrow(ValidationError);
      expect(() => validatePlaceholders(vars)).toThrow('Unknown placeholders');
    });

    it('should include list of supported placeholders in error', () => {
      const vars = { bad_placeholder: 'value' };

      try {
        validatePlaceholders(vars);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).details).toBeDefined();
      }
    });
  });

  describe('sanitizeLink', () => {
    it('should allow valid HTTPS links', () => {
      const url = 'https://example.com/path?query=value';
      const result = sanitizeLink(url);
      expect(result).toBe(url);
    });

    it('should allow valid HTTP links', () => {
      const url = 'http://example.com';
      const result = sanitizeLink(url);
      expect(result).toBe(url);
    });

    it('should return undefined for empty links', () => {
      expect(sanitizeLink(null)).toBeUndefined();
      expect(sanitizeLink(undefined)).toBeUndefined();
      expect(sanitizeLink('')).toBeUndefined();
    });

    it('should throw on javascript: URLs', () => {
      const url = 'javascript:alert(1)';
      expect(() => sanitizeLink(url)).toThrow(ValidationError);
      expect(() => sanitizeLink(url)).toThrow('Invalid link protocol');
    });

    it('should throw on data: URLs', () => {
      const url = 'data:text/html,<script>alert(1)</script>';
      expect(() => sanitizeLink(url)).toThrow(ValidationError);
    });

    it('should throw on too-long URLs', () => {
      const longUrl = 'https://example.com/' + 'x'.repeat(1100);
      expect(() => sanitizeLink(longUrl)).toThrow(ValidationError);
      expect(() => sanitizeLink(longUrl)).toThrow('Link too long');
    });

    it('should throw on invalid URL format', () => {
      const invalid = 'not-a-url';
      expect(() => sanitizeLink(invalid)).toThrow(ValidationError);
      expect(() => sanitizeLink(invalid)).toThrow('Invalid link format');
    });
  });

  describe('extractPlaceholders', () => {
    it('should extract double-brace placeholders', () => {
      const text = 'Hello {{first_name}}, your {{device_model}} is ready';
      const placeholders = extractPlaceholders(text);
      expect(placeholders).toContain('first_name');
      expect(placeholders).toContain('device_model');
      expect(placeholders).toHaveLength(2);
    });

    it('should extract single-brace placeholders', () => {
      const text = 'Hello {first_name}, your {device_model} is ready';
      const placeholders = extractPlaceholders(text);
      expect(placeholders).toContain('first_name');
      expect(placeholders).toContain('device_model');
    });

    it('should deduplicate repeated placeholders', () => {
      const text = '{{first_name}} and {{first_name}} again';
      const placeholders = extractPlaceholders(text);
      expect(placeholders).toEqual(['first_name']);
    });

    it('should return empty array for text without placeholders', () => {
      const text = 'Plain text with no variables';
      const placeholders = extractPlaceholders(text);
      expect(placeholders).toEqual([]);
    });
  });

  describe('validateTemplatePlaceholders', () => {
    it('should return empty array for valid placeholders', () => {
      const text = 'Hello {{first_name}}, date: {{date}}';
      const unknown = validateTemplatePlaceholders(text);
      expect(unknown).toEqual([]);
    });

    it('should return array of unknown placeholders', () => {
      const text = 'Hello {{first_name}}, {{unknown_field}}, {{bad_var}}';
      const unknown = validateTemplatePlaceholders(text);
      expect(unknown).toContain('unknown_field');
      expect(unknown).toContain('bad_var');
      expect(unknown).not.toContain('first_name');
    });
  });

  describe('PLACEHOLDER_WHITELIST', () => {
    it('should include all standard placeholders', () => {
      const expected = [
        'first_name',
        'account_name',
        'device_model',
        'imei',
        'date_iso',
        'date_he',
        'date',
        'link',
      ];

      expected.forEach((placeholder) => {
        expect(PLACEHOLDER_WHITELIST.has(placeholder)).toBe(true);
      });
    });
  });
});

