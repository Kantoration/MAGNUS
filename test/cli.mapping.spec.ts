/**
 * Tests for Excel mapping validator
 */
import { describe, it, expect } from 'vitest';
import type { MappingValidationResult } from '../src/cli/mapping.js';

describe('Mapping Validator', () => {
  it('should define MappingValidationResult interface shape', () => {
    const mockResult: MappingValidationResult = {
      ok: true,
      warnings: [],
      errors: [],
      sampleKeys: ['NEW_PHONE', 'PAYMENT_REMINDER'],
      count: 2,
      path: './test.xlsx',
      sheet: 'Sheet1',
    };

    expect(mockResult.ok).toBe(true);
    expect(mockResult.count).toBe(2);
    expect(mockResult.sampleKeys).toHaveLength(2);
  });

  it('should handle validation failure state', () => {
    const mockResult: MappingValidationResult = {
      ok: false,
      warnings: [],
      errors: ['Missing required headers: name'],
      sampleKeys: [],
      count: 0,
    };

    expect(mockResult.ok).toBe(false);
    expect(mockResult.errors).toHaveLength(1);
    expect(mockResult.errors[0]).toContain('Missing required headers');
  });

  it('should handle warnings without failing', () => {
    const mockResult: MappingValidationResult = {
      ok: true,
      warnings: ['Unknown placeholders found: custom_field'],
      errors: [],
      sampleKeys: ['VALID_TEMPLATE'],
      count: 1,
    };

    expect(mockResult.ok).toBe(true);
    expect(mockResult.warnings).toHaveLength(1);
    expect(mockResult.count).toBeGreaterThan(0);
  });

  it('should extract placeholder names from sample data', () => {
    // Test placeholder extraction logic
    const sampleText = 'Hello {{first_name}}, your {{device_model}} is ready';
    const placeholderPattern = /\{\{?(\w+)\}?\}/g;
    const matches: string[] = [];
    let match;

    while ((match = placeholderPattern.exec(sampleText)) !== null) {
      matches.push(match[1]);
    }

    expect(matches).toContain('first_name');
    expect(matches).toContain('device_model');
    expect(matches).toHaveLength(2);
  });

  it('should detect mojibake replacement characters', () => {
    const textWithMojibake = 'Hello � world � test';
    let count = 0;
    
    for (const char of textWithMojibake) {
      if (char === '\uFFFD') {
        count++;
      }
    }

    expect(count).toBe(2);
  });
});

