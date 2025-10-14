/**
 * Comprehensive tests for extractPlaceholders
 * Verifies unique placeholder extraction and proper handling of edge cases
 */

import { describe, it, expect } from 'vitest';
import { extractPlaceholders } from '../src/templates.js';

describe('extractPlaceholders - Comprehensive Tests', () => {
  describe('Basic Extraction', () => {
    it('should extract single placeholder with double braces', () => {
      const text = 'Hello {{first_name}}!';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['first_name']);
      expect(Array.isArray(result)).toBe(true);
      expect(result.every(item => typeof item === 'string')).toBe(true);
    });

    it('should extract single placeholder with single braces', () => {
      const text = 'Hello {first_name}!';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['first_name']);
    });

    it('should extract multiple different placeholders', () => {
      const text = 'Hello {{first_name}}, your order {{order_id}} from {{date}} is ready!';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['first_name', 'order_id', 'date']);
      expect(result.length).toBe(3);
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate repeated placeholders (double braces)', () => {
      const text = 'Hello {{first_name}}, {{first_name}}! Your name is {{first_name}}.';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['first_name']);
      expect(result.length).toBe(1);
    });

    it('should deduplicate repeated placeholders (single braces)', () => {
      const text = 'Hello {name}, {name}! Your name is {name}.';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['name']);
      expect(result.length).toBe(1);
    });

    it('should treat single and double brace placeholders as same', () => {
      const text = 'Hi {{name}} and {name}';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['name']);
      expect(result.length).toBe(1);
    });

    it('should deduplicate across mixed brace styles', () => {
      const text = '{{first_name}} loves {first_name} and {{first_name}}!';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['first_name']);
    });
  });

  describe('Return Value Structure', () => {
    it('should return a plain array, not a Set', () => {
      const text = 'Test {{test}}';
      const result = extractPlaceholders(text);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toBe('test');
      expect(typeof result[0]).toBe('string');
    });

    it('should not wrap Set in array', () => {
      const text = '{{a}} {{b}} {{a}}';
      const result = extractPlaceholders(text);
      
      // Verify it's not [Set {...}]
      expect(result).toEqual(['a', 'b']);
      expect(result).not.toEqual([expect.any(Set)]);
    });
  });

  describe('Complex Placeholders', () => {
    it('should extract placeholders with underscores', () => {
      const text = 'User {{user_id}} has {{device_model}}';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['user_id', 'device_model']);
    });

    it('should extract placeholders with numbers', () => {
      const text = 'Item {{item123}} and {{product456}}';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['item123', 'product456']);
    });

    it('should handle consecutive placeholders', () => {
      const text = '{{first}}{{second}}{{third}}';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['first', 'second', 'third']);
    });
  });

  describe('Edge Cases', () => {
    it('should return empty array for text with no placeholders', () => {
      const text = 'Hello world, this is a test.';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty array for empty string', () => {
      const result = extractPlaceholders('');
      
      expect(result).toEqual([]);
    });

    it('should ignore malformed placeholders (no closing brace)', () => {
      const text = 'Test {{unclosed without closing';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual([]);
    });

    it('should ignore malformed placeholders (just braces)', () => {
      const text = 'Test {{}} and {}';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual([]);
    });

    it('should ignore placeholders with spaces', () => {
      const text = 'Test {{ name }} and { value }';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual([]);
    });

    it('should ignore placeholders with special characters', () => {
      const text = 'Test {{name-with-dash}} and {{name.with.dot}}';
      const result = extractPlaceholders(text);
      
      // Only \w (word characters) are matched
      expect(result).toEqual([]);
    });

    it('should handle multiline text', () => {
      const text = `Line 1: {{first}}
Line 2: {{second}}
Line 3: {{first}}`;
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['first', 'second']);
    });

    it('should handle Hebrew text with placeholders', () => {
      const text = 'שלום {{first_name}}, התאריך הוא {{date}}';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['first_name', 'date']);
    });
  });

  describe('Real-World Examples', () => {
    it('should extract from actual WhatsApp template', () => {
      const text = `שלום {{first_name}}!
חברת MAGNUS מודיעה כי המכשיר {{device_model}} עם IMEI {{imei}} מוכן לאיסוף.
תאריך: {{date}}
קישור: {{link}}`;
      
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['first_name', 'device_model', 'imei', 'date', 'link']);
      expect(result.length).toBe(5);
    });

    it('should handle template with date injection', () => {
      const text = 'Hello {{first_name}}, your order from {{date_iso}} is ready!';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['first_name', 'date_iso']);
    });

    it('should handle template with account name', () => {
      const text = 'Dear {{first_name}} from {{account_name}}';
      const result = extractPlaceholders(text);
      
      expect(result).toEqual(['first_name', 'account_name']);
    });
  });

  describe('Regex Behavior Verification', () => {
    it('should use /\\{\\{?(\\w+)\\}?\\}/g pattern correctly', () => {
      // This test verifies the regex matches both {{var}} and {var}
      const textDouble = '{{test}}';
      const textSingle = '{test}';
      
      const resultDouble = extractPlaceholders(textDouble);
      const resultSingle = extractPlaceholders(textSingle);
      
      expect(resultDouble).toEqual(['test']);
      expect(resultSingle).toEqual(['test']);
    });

    it('should extract capture group correctly (placeholder name only)', () => {
      const text = '{{first_name}}';
      const result = extractPlaceholders(text);
      
      // Should return the placeholder name, not the full match with braces
      expect(result[0]).toBe('first_name');
      expect(result[0]).not.toContain('{');
      expect(result[0]).not.toContain('}');
    });
  });
});

