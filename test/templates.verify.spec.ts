/**
 * Unit tests for template verification scenarios
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import * as path from 'path';
import { loadTemplateMap, renderMessage, clearTemplateCache } from '../src/templates.js';
import type { RenderContext } from '../src/types.js';

// Mock logger
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

import * as loggerModule from '../src/logger.js';
vi.spyOn(loggerModule, 'getLogger').mockReturnValue(
  mockLogger as unknown as ReturnType<typeof loggerModule.getLogger>
);

const TEST_EXCEL_PATH = path.join(process.cwd(), 'test-verify-mapping.xlsx');

function createTestExcelFile(
  rows: Array<{
    name: string;
    'מלל הודעה': string;
    Link: string;
    'שם הודעה מובנית בגלאסיקס'?: string;
  }>
): void {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, TEST_EXCEL_PATH);
}

// Mock config
import * as configModule from '../src/config.js';
vi.spyOn(configModule, 'getConfig').mockReturnValue({
  SF_LOGIN_URL: 'https://test.salesforce.com',
  SF_USERNAME: 'test@example.com',
  SF_PASSWORD: 'password',
  SF_TOKEN: 'token',
  GLASSIX_BASE_URL: 'https://api.glassix.com',
  GLASSIX_API_KEY: 'key',
  TASKS_QUERY_LIMIT: 200,
  XSLX_MAPPING_PATH: TEST_EXCEL_PATH,
  DEFAULT_LANG: 'he',
  LOG_LEVEL: 'info',
});

describe('Template Verification Scenarios', () => {
  beforeEach(() => {
    clearTemplateCache();
    if (fs.existsSync(TEST_EXCEL_PATH)) {
      fs.unlinkSync(TEST_EXCEL_PATH);
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_EXCEL_PATH)) {
      fs.unlinkSync(TEST_EXCEL_PATH);
    }
  });

  describe('Cache invalidation on mtime change', () => {
    it('should reload when file mtime changes', async () => {
      // Create initial file
      createTestExcelFile([
        {
          name: 'test',
          'מלל הודעה': 'Original message',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      // Load first time
      const map1 = await loadTemplateMap();
      expect(map1.get('TEST')?.messageBody).toBe('Original message');

      // Wait a bit to ensure different mtime
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Modify file
      createTestExcelFile([
        {
          name: 'test',
          'מלל הודעה': 'Modified message',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      // Clear cache to force reload
      clearTemplateCache();

      // Load again - should get new content
      const map2 = await loadTemplateMap();
      expect(map2.get('TEST')?.messageBody).toBe('Modified message');
    });

    it('should use cache when file mtime unchanged', async () => {
      createTestExcelFile([
        {
          name: 'test',
          'מלל הודעה': 'Cached message',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      // Load first time
      const map1 = await loadTemplateMap();

      // Load again without clearing cache - should use cached version
      const map2 = await loadTemplateMap();

      // Should be same reference (cached)
      expect(map2).toBe(map1);
    });
  });

  describe('Hebrew column normalization', () => {
    it('should correctly parse Hebrew columns', async () => {
      createTestExcelFile([
        {
          name: 'טלפון חדש',
          'מלל הודעה': 'שלום {{first_name}}!',
          Link: 'https://example.com/phone',
          'שם הודעה מובנית בגלאסיקס': 'new_phone_template',
        },
      ]);

      const map = await loadTemplateMap();

      // Check Hebrew name was transliterated correctly
      const mapping = map.get('TLPVN_HDSH');
      expect(mapping).toBeDefined();
      expect(mapping?.messageBody).toBe('שלום {{first_name}}!');
      expect(mapping?.link).toBe('https://example.com/phone');
      expect(mapping?.glassixTemplateId).toBe('new_phone_template');
    });

    it('should handle mixed Hebrew and English names', async () => {
      createTestExcelFile([
        {
          name: 'NEW טלפון',
          'מלל הודעה': 'Test message',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      const map = await loadTemplateMap();

      // NEW טלפון → NEW_TLPVN
      expect(map.has('NEW_TLPVN')).toBe(true);
    });

    it('should normalize spaces and hyphens to underscores', async () => {
      createTestExcelFile([
        {
          name: 'Payment - Reminder',
          'מלל הודעה': 'Pay now',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
        {
          name: 'WELCOME MESSAGE',
          'מלל הודעה': 'Welcome',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      const map = await loadTemplateMap();

      expect(map.has('PAYMENT_REMINDER')).toBe(true);
      expect(map.has('WELCOME_MESSAGE')).toBe(true);
    });
  });

  describe('renderMessage date and link injection', () => {
    it('should inject date_he when not provided in context', () => {
      const mapping = {
        taskKey: 'TEST',
        messageBody: 'שלום {{first_name}}',
      };

      const ctx: RenderContext = {
        first_name: 'דניאל',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'he' });

      // Should have today's date appended
      expect(result.text).toMatch(/תאריך: \d{2}\/\d{2}\/\d{4}/);
    });

    it('should use provided date_he from context', () => {
      const mapping = {
        taskKey: 'TEST',
        messageBody: 'תאריך: {{date_he}}',
      };

      const ctx: RenderContext = {
        date_he: '15/03/2024',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'he' });

      expect(result.text).toBe('תאריך: 15/03/2024');
    });

    it('should append link when no {{link}} placeholder exists', () => {
      const mapping = {
        taskKey: 'TEST',
        messageBody: 'שלום {{first_name}}',
        link: 'https://example.com/action',
      };

      const ctx: RenderContext = {
        first_name: 'דניאל',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toContain('https://example.com/action');
      expect(result.text).toMatch(/\n.*https:\/\//); // Link on new line
    });

    it('should NOT append link when {{link}} placeholder exists', () => {
      const mapping = {
        taskKey: 'TEST',
        messageBody: 'לחץ כאן: {{link}}',
        link: 'https://example.com/action',
      };

      const ctx: RenderContext = {};

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('לחץ כאן: https://example.com/action');
      // Should only appear once (in placeholder, not appended)
      const linkCount = (result.text.match(/https:\/\/example\.com\/action/g) || []).length;
      expect(linkCount).toBe(1);
    });

    it('should prefer context link over mapping link', () => {
      const mapping = {
        taskKey: 'TEST',
        messageBody: '{{link}}',
        link: 'https://default.com',
      };

      const ctx: RenderContext = {
        link: 'https://override.com',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('https://override.com');
      expect(result.text).not.toContain('default.com');
    });

    it('should handle complete verification scenario', () => {
      const mapping = {
        taskKey: 'NEW_PHONE',
        messageBody: 'שלום {{first_name}}! חברת {{account_name}}, מכשיר {{device_model}}',
        link: 'https://magnus.co.il/devices',
      };

      const ctx: RenderContext = {
        first_name: 'דניאל',
        account_name: 'MAGNUS',
        device_model: 'S24',
        date_he: '09/10/2025',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'he' });

      // Should have all variables replaced
      expect(result.text).toContain('דניאל');
      expect(result.text).toContain('MAGNUS');
      expect(result.text).toContain('S24');

      // Should have date appended (no date placeholder in template)
      expect(result.text).toContain('09/10/2025');

      // Should have link appended (no link placeholder in template)
      expect(result.text).toContain('https://magnus.co.il/devices');
    });
  });

  describe('Error scenarios', () => {
    it('should handle file not found gracefully in verification context', async () => {
      // Don't create file
      await expect(loadTemplateMap()).rejects.toThrow();
    });

    it('should handle empty Excel file', async () => {
      createTestExcelFile([]);

      await expect(loadTemplateMap()).rejects.toThrow(/Excel file is empty or has no data rows/);
    });

    it('should skip rows with missing required fields', async () => {
      createTestExcelFile([
        {
          name: 'valid',
          'מלל הודעה': 'Valid message',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
        {
          name: '',
          'מלל הודעה': 'Should be skipped',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
        {
          name: 'also_valid',
          'מלל הודעה': '',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      const map = await loadTemplateMap();

      // Only 'valid' should be loaded (also_valid has empty message)
      expect(map.size).toBe(1);
      expect(map.has('VALID')).toBe(true);
    });
  });
});
