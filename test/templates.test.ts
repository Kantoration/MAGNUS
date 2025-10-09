/**
 * Unit tests for template rendering and mapping
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import * as path from 'path';
import {
  loadTemplateMap,
  pickTemplate,
  renderMessage,
  clearTemplateCache,
} from '../src/templates.js';
import type { NormalizedMapping, RenderContext } from '../src/types.js';

// Mock logger to avoid config requirement in tests
const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// Mock getLogger
import * as loggerModule from '../src/logger.js';
vi.spyOn(loggerModule, 'getLogger').mockReturnValue(
  mockLogger as unknown as ReturnType<typeof loggerModule.getLogger>
);

// Create a temporary test Excel file
const TEST_EXCEL_PATH = path.join(process.cwd(), 'test-template-mapping.xlsx');

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

describe('Template Mapping System', () => {
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

  describe('loadTemplateMap', () => {
    it('should parse Hebrew column names correctly', async () => {
      createTestExcelFile([
        {
          name: 'reminder',
          'מלל הודעה': 'שלום {{first_name}}',
          Link: 'https://example.com',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      const map = await loadTemplateMap();

      expect(map.size).toBe(1);
      const mapping = map.get('REMINDER');
      expect(mapping).toBeDefined();
      expect(mapping?.messageBody).toBe('שלום {{first_name}}');
      expect(mapping?.link).toBe('https://example.com');
    });

    it('should normalize task keys correctly', async () => {
      createTestExcelFile([
        {
          name: 'Send Reminder',
          'מלל הודעה': 'Test message',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
        {
          name: 'follow-up',
          'מלל הודעה': 'Follow up message',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
        {
          name: 'URGENT TASK',
          'מלל הודעה': 'Urgent',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      const map = await loadTemplateMap();

      expect(map.has('SEND_REMINDER')).toBe(true);
      expect(map.has('FOLLOW_UP')).toBe(true); // Hyphen becomes underscore
      expect(map.has('URGENT_TASK')).toBe(true);
    });

    it('should handle optional Glassix template ID', async () => {
      createTestExcelFile([
        {
          name: 'with_template',
          'מלל הודעה': 'Message',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': 'template_123',
        },
        {
          name: 'without_template',
          'מלל הודעה': 'Message',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      const map = await loadTemplateMap();

      const withTemplate = map.get('WITH_TEMPLATE');
      expect(withTemplate?.glassixTemplateId).toBe('template_123');

      const withoutTemplate = map.get('WITHOUT_TEMPLATE');
      expect(withoutTemplate?.glassixTemplateId).toBeUndefined();
    });

    it('should skip empty rows', async () => {
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

      expect(map.size).toBe(1);
      expect(map.has('VALID')).toBe(true);
    });

    it('should cache based on mtime', async () => {
      createTestExcelFile([
        {
          name: 'test',
          'מלל הודעה': 'Original',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      const map1 = await loadTemplateMap();
      expect(map1.get('TEST')?.messageBody).toBe('Original');

      // Load again without file change - should use cache
      const map2 = await loadTemplateMap();
      expect(map2).toBe(map1); // Same reference

      // Modify file
      await new Promise((resolve) => setTimeout(resolve, 10));
      createTestExcelFile([
        {
          name: 'test',
          'מלל הודעה': 'Modified',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      // Clear cache and reload
      clearTemplateCache();
      const map3 = await loadTemplateMap();
      expect(map3.get('TEST')?.messageBody).toBe('Modified');
    });

    it('should trim whitespace from values', async () => {
      createTestExcelFile([
        {
          name: '  spaced  ',
          'מלל הודעה': '  message with spaces  ',
          Link: '  https://example.com  ',
          'שם הודעה מובנית בגלאסיקס': '  template_id  ',
        },
      ]);

      const map = await loadTemplateMap();
      const mapping = map.get('SPACED');

      expect(mapping?.messageBody).toBe('message with spaces');
      expect(mapping?.link).toBe('https://example.com');
      expect(mapping?.glassixTemplateId).toBe('template_id');
    });
  });

  describe('pickTemplate', () => {
    it('should find template by normalized key', async () => {
      createTestExcelFile([
        {
          name: 'My Task Type',
          'מלל הודעה': 'Test',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      const map = await loadTemplateMap();

      expect(pickTemplate('My Task Type', map)).toBeDefined();
      expect(pickTemplate('my task type', map)).toBeDefined();
      expect(pickTemplate('MY_TASK_TYPE', map)).toBeDefined();
    });

    it('should return undefined for non-existent key', async () => {
      createTestExcelFile([
        {
          name: 'exists',
          'מלל הודעה': 'Test',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      const map = await loadTemplateMap();

      expect(pickTemplate('doesnt_exist', map)).toBeUndefined();
    });
  });

  describe('renderMessage', () => {
    it('should replace all variables', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'שלום {{first_name}}, חשבון: {{account_name}}, מכשיר: {{device_model}}',
      };

      const ctx: RenderContext = {
        first_name: 'יוסי',
        account_name: 'חברה בע"מ',
        device_model: 'iPhone 15',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('שלום יוסי, חשבון: חברה בע"מ, מכשיר: iPhone 15');
      expect(result.viaGlassixTemplate).toBeUndefined();
    });

    it('should handle missing variables gracefully', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'שלום {{first_name}}, IMEI: {{imei}}',
      };

      const ctx: RenderContext = {
        first_name: 'יוסי',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('שלום יוסי, IMEI: ');
    });

    it('should inject link from mapping', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'לחץ כאן: {{link}}',
        link: 'https://example.com/test',
      };

      const ctx: RenderContext = {};

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('לחץ כאן: https://example.com/test');
    });

    it('should prefer context link over mapping link', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: '{{link}}',
        link: 'https://default.com',
      };

      const ctx: RenderContext = {
        link: 'https://override.com',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('https://override.com');
    });

    it('should return Glassix template ID when present', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'Template message with {{first_name}}',
        glassixTemplateId: 'template_xyz',
      };

      const ctx: RenderContext = {
        first_name: 'David',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('Template message with David');
      expect(result.viaGlassixTemplate).toBe('template_xyz');
    });

    it('should inject date when placeholder exists', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'תאריך: {{date_he}}, ISO: {{date_iso}}',
      };

      const ctx: RenderContext = {
        date_he: '09/10/2024',
        date_iso: '2024-10-09',
      };

      const result = renderMessage(mapping, ctx);

      expect(result.text).toBe('תאריך: 09/10/2024, ISO: 2024-10-09');
    });

    it('should append date for Hebrew when no placeholder and date exists', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'שלום {{first_name}}',
      };

      const ctx: RenderContext = {
        first_name: 'יוסי',
        date_he: '09/10/2024',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'he' });

      expect(result.text).toBe('שלום יוסי (תאריך: 09/10/2024)');
    });

    it('should NOT append date for English by default', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'Hello {{first_name}}',
      };

      const ctx: RenderContext = {
        first_name: 'John',
        date_iso: '2024-10-09',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('Hello John');
    });

    it('should NOT append date if placeholder already exists', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'שלום, תאריך: {{date}}',
      };

      const ctx: RenderContext = {
        date_he: '09/10/2024',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'he' });

      expect(result.text).toBe('שלום, תאריך: 09/10/2024');
      expect(result.text).not.toContain('(תאריך:');
    });

    it('should handle both {{var}} and {var} syntax', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'שלום {{first_name}}, חשבון: {account_name}',
      };

      const ctx: RenderContext = {
        first_name: 'יוסי',
        account_name: 'חברה',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('שלום יוסי, חשבון: חברה');
    });

    it('should handle date alias correctly', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'תאריך: {{date}}',
      };

      const ctx: RenderContext = {
        date_he: '09/10/2024',
      };

      const result = renderMessage(mapping, ctx);

      expect(result.text).toBe('תאריך: 09/10/2024');
    });

    it('should handle custom context keys', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'Custom: {{custom_field}}',
      };

      const ctx: RenderContext = {
        custom_field: 'custom value',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('Custom: custom value');
    });

    it('should auto-append link when no placeholder exists', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'שלום {{first_name}}',
        link: 'https://example.com/action',
      };

      const ctx: RenderContext = {
        first_name: 'יוסי',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('שלום יוסי\nhttps://example.com/action');
    });

    it('should NOT auto-append link when placeholder exists', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'שלום {{first_name}}, לחץ כאן: {{link}}',
        link: 'https://example.com/action',
      };

      const ctx: RenderContext = {
        first_name: 'יוסי',
      };

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      expect(result.text).toBe('שלום יוסי, לחץ כאן: https://example.com/action');
      expect(result.text).not.toContain('\nhttps://');
    });

    it('should use today date when not provided in context', () => {
      const mapping: NormalizedMapping = {
        taskKey: 'TEST',
        messageBody: 'תאריך: {{date_he}}',
      };

      const ctx: RenderContext = {};

      const result = renderMessage(mapping, ctx, { defaultLang: 'en' });

      // Should have today's date in DD/MM/YYYY format
      expect(result.text).toMatch(/^תאריך: \d{2}\/\d{2}\/\d{4}$/);
    });
  });

  describe('Hebrew transliteration', () => {
    it('should transliterate Hebrew task names', async () => {
      createTestExcelFile([
        {
          name: 'טלפון חדש',
          'מלל הודעה': 'Test message',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
        {
          name: 'תשלום',
          'מלל הודעה': 'Payment message',
          Link: '',
          'שם הודעה מובנית בגלאסיקס': '',
        },
      ]);

      const map = await loadTemplateMap();

      // טלפון חדש → TLPVN_HDSH (ט=T, ל=L, פ=P, ו=V, ן=N, space=_, ח=H, ד=D, ש=SH)
      expect(map.has('TLPVN_HDSH')).toBe(true);
      // תשלום → TSHLVM (ת=T, ש=SH, ל=L, ו=V, ם=M)
      expect(map.has('TSHLVM')).toBe(true);
    });
  });
});
