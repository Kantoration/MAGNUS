/**
 * Header validation tests for Excel template loading
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadTemplateMap, clearTemplateCache } from '../src/templates.js';
import XLSX from 'xlsx';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('Excel Template Header Validation', () => {
  let tempFilePath: string;

  beforeEach(() => {
    // Clear cache before each test
    clearTemplateCache();
    // Create temp file path
    tempFilePath = path.join(os.tmpdir(), `test-template-${Date.now()}.xlsx`);
  });

  afterEach(async () => {
    // Cleanup temp file
    try {
      await fs.unlink(tempFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('should load template with all required headers in Hebrew', async () => {
    // Create workbook with correct headers (UTF-8)
    const ws = XLSX.utils.json_to_sheet([
      {
        name: 'NEW_PHONE',
        'מלל הודעה': 'שלום {{first_name}}, הטלפון החדש שלך מוכן!',
        Link: 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');

    // Write to temp file
    XLSX.writeFile(wb, tempFilePath);

    // Load and verify using custom path
    const templateMap = await loadTemplateMap(tempFilePath);

    expect(templateMap.size).toBe(1);
    expect(templateMap.has('NEW_PHONE')).toBe(true);

    const mapping = templateMap.get('NEW_PHONE');
    expect(mapping).toBeDefined();
    expect(mapping?.messageBody).toBe('שלום {{first_name}}, הטלפון החדש שלך מוכן!');
    expect(mapping?.link).toBe('https://example.com');
  });

  it('should throw error when "name" header is missing', async () => {
    // Create workbook WITHOUT name header
    const ws = XLSX.utils.json_to_sheet([
      {
        task_name: 'NEW_PHONE', // Wrong column name
        'מלל הודעה': 'Test message',
        Link: 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');
    XLSX.writeFile(wb, tempFilePath);

    await expect(loadTemplateMap(tempFilePath)).rejects.toThrow(/Missing required Excel headers.*name/);
  });

  it('should throw error when Hebrew message body header is missing', async () => {
    // Create workbook WITHOUT Hebrew message header
    const ws = XLSX.utils.json_to_sheet([
      {
        name: 'NEW_PHONE',
        message: 'Test message', // Wrong column name (not Hebrew)
        Link: 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');
    XLSX.writeFile(wb, tempFilePath);

    await expect(loadTemplateMap(tempFilePath)).rejects.toThrow(/Missing required Excel headers.*מלל הודעה/);
  });

  it('should throw error when Link header is missing', async () => {
    // Create workbook WITHOUT Link header
    const ws = XLSX.utils.json_to_sheet([
      {
        name: 'NEW_PHONE',
        'מלל הודעה': 'Test message',
        URL: 'https://example.com', // Wrong column name
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');
    XLSX.writeFile(wb, tempFilePath);

    await expect(loadTemplateMap(tempFilePath)).rejects.toThrow(/Missing required Excel headers.*Link/);
  });

  it('should throw error when Glassix template name header is missing', async () => {
    // Create workbook WITHOUT Glassix header
    const ws = XLSX.utils.json_to_sheet([
      {
        name: 'NEW_PHONE',
        'מלל הודעה': 'Test message',
        Link: 'https://example.com',
        glassix: 'template-1', // Wrong column name
      },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');
    XLSX.writeFile(wb, tempFilePath);

    await expect(loadTemplateMap(tempFilePath)).rejects.toThrow(
      /Missing required Excel headers.*שם הודעה מובנית בגלאסיקס/
    );
  });

  it('should throw error when multiple headers are missing', async () => {
    // Create workbook with only one correct header
    const ws = XLSX.utils.json_to_sheet([
      {
        name: 'NEW_PHONE',
        message: 'Test message', // Wrong
        url: 'https://example.com', // Wrong
        template: 'template-1', // Wrong
      },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');
    XLSX.writeFile(wb, tempFilePath);

    await expect(loadTemplateMap(tempFilePath)).rejects.toThrow(/Missing required Excel headers/);
  });

  it('should handle empty Excel file gracefully', async () => {
    // Create empty workbook
    const ws = XLSX.utils.json_to_sheet([]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');
    XLSX.writeFile(wb, tempFilePath);

    await expect(loadTemplateMap(tempFilePath)).rejects.toThrow(
      /Excel file is empty or has no data rows/
    );
  });

  it('should load multiple rows with correct headers', async () => {
    // Create workbook with multiple rows
    const ws = XLSX.utils.json_to_sheet([
      {
        name: 'NEW_PHONE',
        'מלל הודעה': 'הטלפון החדש שלך מוכן',
        Link: 'https://example.com/phone',
        'שם הודעה מובנית בגלאסיקס': '',
      },
      {
        name: 'DEVICE_READY',
        'מלל הודעה': 'המכשיר שלך {{device_model}} מוכן לאיסוף',
        Link: 'https://example.com/device',
        'שם הודעה מובנית בגלאסיקס': 'device-template-1',
      },
      {
        name: 'new-appointment',
        'מלל הודעה': 'תור חדש נקבע ל-{{date_he}}',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');
    XLSX.writeFile(wb, tempFilePath);

    const templateMap = await loadTemplateMap(tempFilePath);

    expect(templateMap.size).toBe(3);
    expect(templateMap.has('NEW_PHONE')).toBe(true);
    expect(templateMap.has('DEVICE_READY')).toBe(true);
    expect(templateMap.has('NEW_APPOINTMENT')).toBe(true); // normalized

    const deviceMapping = templateMap.get('DEVICE_READY');
    expect(deviceMapping?.glassixTemplateId).toBe('device-template-1');
  });

  it('should skip rows with empty name or message body', async () => {
    // Create workbook with some empty rows
    const ws = XLSX.utils.json_to_sheet([
      {
        name: 'VALID_ROW',
        'מלל הודעה': 'תוכן תקין',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
      {
        name: '', // Empty name
        'מלל הודעה': 'תוכן כלשהו',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
      {
        name: 'NO_MESSAGE',
        'מלל הודעה': '', // Empty message
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');
    XLSX.writeFile(wb, tempFilePath);

    const templateMap = await loadTemplateMap(tempFilePath);

    // Only the valid row should be loaded
    expect(templateMap.size).toBe(1);
    expect(templateMap.has('VALID_ROW')).toBe(true);
  });

  it('should properly handle Hebrew text in message body', async () => {
    const hebrewMessage = 'שלום {{first_name}}, המכשיר {{device_model}} שלך מוכן לאיסוף בסניף {{account_name}}. תאריך: {{date_he}}';

    const ws = XLSX.utils.json_to_sheet([
      {
        name: 'HEBREW_TEST',
        'מלל הודעה': hebrewMessage,
        Link: 'https://example.co.il',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Templates');
    XLSX.writeFile(wb, tempFilePath);

    const templateMap = await loadTemplateMap(tempFilePath);

    const mapping = templateMap.get('HEBREW_TEST');
    expect(mapping?.messageBody).toBe(hebrewMessage);
  });
});

