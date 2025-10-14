/**
 * Tests for Excel encoding edge cases
 * Addresses Finding 6.1.1 from Production Readiness Report
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { loadTemplateMap, normalizeTaskKey, clearTemplateCache } from '../src/templates.js';
import { clearConfigCache } from '../src/config.js';

describe('Excel Encoding Edge Cases', () => {
  const testDir = path.join(process.cwd(), 'test', 'fixtures', 'encoding');
  
  beforeEach(async () => {
    // Setup environment
    process.env.SF_LOGIN_URL = 'https://test.salesforce.com';
    process.env.SF_USERNAME = 'test@example.com';
    process.env.SF_PASSWORD = 'password123';
    process.env.SF_TOKEN = 'token123';
    process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
    process.env.GLASSIX_API_KEY = 'test-key';
    process.env.LOG_LEVEL = 'error';
    
    clearConfigCache();
    clearTemplateCache();
    
    // Create test fixtures directory
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    clearTemplateCache();
    clearConfigCache();
    
    // Cleanup test files
    try {
      const files = await fs.readdir(testDir);
      for (const file of files) {
        await fs.unlink(path.join(testDir, file));
      }
      await fs.rmdir(testDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should handle Hebrew content in Excel files', async () => {
    // Create test workbook with Hebrew content
    // Note: XLSX is a binary (ZIP) format, not text - no UTF-8 BOM needed/wanted
    const workbook = XLSX.utils.book_new();
    const data = [
      {
        'name': 'TEST_HEBREW_KEY',
        'מלל הודעה': 'שלום {{first_name}}, זהו מבחן עברי',
        'Link': 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    // Write XLSX file (binary format, not text)
    const filePath = path.join(testDir, 'test_hebrew.xlsx');
    XLSX.writeFile(workbook, filePath, { bookType: 'xlsx' });
    
    // Load templates - should handle Hebrew content correctly
    const templates = await loadTemplateMap(filePath);
    
    expect(templates.size).toBeGreaterThan(0);
    const key = normalizeTaskKey('TEST_HEBREW_KEY');
    expect(templates.get(key)).toBeDefined();
    expect(templates.get(key)?.messageBody).toContain('שלום');
  });

  it('should handle pure Hebrew content without Latin characters', async () => {
    // Create test workbook with only Hebrew text
    const workbook = XLSX.utils.book_new();
    const data = [
      {
        'name': 'בדיקה_חדשה',
        'מלל הודעה': 'שלום לכולם! זהו מבחן בעברית בלבד עם {{first_name}}',
        'Link': 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    const filePath = path.join(testDir, 'test_hebrew_only.xlsx');
    XLSX.writeFile(workbook, filePath, { bookType: 'xlsx' });
    
    // Load templates
    const templates = await loadTemplateMap(filePath);
    
    expect(templates.size).toBeGreaterThan(0);
    
    // Hebrew text should be normalized to Latin transliteration
    const key = normalizeTaskKey('בדיקה חדשה');
    expect(key).toBeTruthy();
    expect(templates.get(key)).toBeDefined();
    expect(templates.get(key)?.messageBody).toContain('שלום לכולם');
  });

  it('should handle Excel files with mixed RTL and LTR content', async () => {
    // Create test workbook with mixed Hebrew and English
    const workbook = XLSX.utils.book_new();
    const data = [
      {
        'name': 'MIXED_CONTENT_KEY',
        'מלל הודעה': 'Hello {{first_name}} - שלום! Your device: {{device_model}}',
        'Link': 'https://example.com/mixed',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    const filePath = path.join(testDir, 'test_mixed.xlsx');
    XLSX.writeFile(workbook, filePath, { bookType: 'xlsx' });
    
    // Load templates
    const templates = await loadTemplateMap(filePath);
    
    expect(templates.size).toBeGreaterThan(0);
    const key = normalizeTaskKey('MIXED_CONTENT_KEY');
    expect(templates.get(key)).toBeDefined();
    
    const messageBody = templates.get(key)?.messageBody || '';
    expect(messageBody).toContain('Hello');
    expect(messageBody).toContain('שלום');
    expect(messageBody).toContain('{{first_name}}');
    expect(messageBody).toContain('{{device_model}}');
  });

  it('should handle Excel files with special Unicode characters', async () => {
    // Create test workbook with various Unicode characters
    const workbook = XLSX.utils.book_new();
    const data = [
      {
        'name': 'UNICODE_TEST',
        'מלל הודעה': 'Test with emoji 🚀 and special chars: é, ñ, ü, 中文',
        'Link': 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    const filePath = path.join(testDir, 'test_unicode.xlsx');
    XLSX.writeFile(workbook, filePath, { bookType: 'xlsx' });
    
    // Load templates
    const templates = await loadTemplateMap(filePath);
    
    expect(templates.size).toBeGreaterThan(0);
    const key = normalizeTaskKey('UNICODE_TEST');
    expect(templates.get(key)).toBeDefined();
    
    const messageBody = templates.get(key)?.messageBody || '';
    // Unicode characters should be preserved in message body
    expect(messageBody).toContain('🚀');
    expect(messageBody.length).toBeGreaterThan(0);
  });

  it('should handle Excel files with different sheet encodings', async () => {
    // Create test workbook with multiple sheets
    const workbook = XLSX.utils.book_new();
    
    // Sheet 1: English
    const dataEN = [
      {
        'name': 'ENGLISH_KEY',
        'מלל הודעה': 'Hello {{first_name}}',
        'Link': 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    const worksheetEN = XLSX.utils.json_to_sheet(dataEN);
    XLSX.utils.book_append_sheet(workbook, worksheetEN, 'English');
    
    // Sheet 2: Hebrew
    const dataHE = [
      {
        'name': 'HEBREW_KEY',
        'מלל הודעה': 'שלום {{first_name}}',
        'Link': 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    const worksheetHE = XLSX.utils.json_to_sheet(dataHE);
    XLSX.utils.book_append_sheet(workbook, worksheetHE, 'Hebrew');
    
    const filePath = path.join(testDir, 'test_multi_sheet.xlsx');
    XLSX.writeFile(workbook, filePath, { bookType: 'xlsx' });
    
    // Load from first sheet (default)
    const templatesDefault = await loadTemplateMap(filePath);
    expect(templatesDefault.size).toBeGreaterThan(0);
    expect(templatesDefault.get('ENGLISH_KEY')).toBeDefined();
    
    // Clear cache and load from specific sheet
    clearTemplateCache();
    process.env.XSLX_SHEET = 'Hebrew';
    clearConfigCache();
    
    const templatesHebrew = await loadTemplateMap(filePath);
    expect(templatesHebrew.size).toBeGreaterThan(0);
    expect(templatesHebrew.get('HEBREW_KEY')).toBeDefined();
  });

  it('should handle Excel files with empty cells and whitespace', async () => {
    // Create test workbook with edge cases
    const workbook = XLSX.utils.book_new();
    const data = [
      {
        'name': '  WHITESPACE_KEY  ',
        'מלל הודעה': '  Trimmed message  ',
        'Link': '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
      {
        'name': '',
        'מלל הודעה': 'Should be skipped',
        'Link': 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
      {
        'name': 'VALID_KEY',
        'מלל הודעה': '',
        'Link': 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    const filePath = path.join(testDir, 'test_whitespace.xlsx');
    XLSX.writeFile(workbook, filePath, { bookType: 'xlsx' });
    
    // Load templates
    const templates = await loadTemplateMap(filePath);
    
    // Should have 1 valid template (WHITESPACE_KEY with trimmed values)
    expect(templates.size).toBe(1);
    
    const key = normalizeTaskKey('WHITESPACE_KEY');
    expect(templates.get(key)).toBeDefined();
    expect(templates.get(key)?.messageBody).toBe('Trimmed message');
    
    // Empty name should be skipped
    expect(templates.has('')).toBe(false);
    
    // Empty message body should be skipped
    expect(templates.has('VALID_KEY')).toBe(false);
  });

  it('should handle very long template content', async () => {
    // Create test workbook with long message
    const longMessage = 'א'.repeat(5000) + ' {{first_name}} ' + 'ב'.repeat(5000);
    
    const workbook = XLSX.utils.book_new();
    const data = [
      {
        'name': 'LONG_MESSAGE_KEY',
        'מלל הודעה': longMessage,
        'Link': 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    const filePath = path.join(testDir, 'test_long.xlsx');
    XLSX.writeFile(workbook, filePath, { bookType: 'xlsx' });
    
    // Load templates - should handle long content
    const templates = await loadTemplateMap(filePath);
    
    expect(templates.size).toBeGreaterThan(0);
    const key = normalizeTaskKey('LONG_MESSAGE_KEY');
    expect(templates.get(key)).toBeDefined();
    expect(templates.get(key)?.messageBody?.length).toBeGreaterThan(1000);
  });
});

