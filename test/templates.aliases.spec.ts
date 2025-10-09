/**
 * Tests for template header aliasing and sheet selection
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { loadTemplateMap, clearTemplateCache } from '../src/templates.js';
import { clearConfigCache } from '../src/config.js';

describe('Template Header Aliasing', () => {
  let testFilePath: string;

  beforeEach(() => {
    clearTemplateCache();
    testFilePath = path.join(
      process.cwd(),
      `test-aliases-${Date.now()}.xlsx`
    );
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch {
      // File might not exist
    }
  });

  it('should accept "Name" as alias for "name" header', async () => {
    const data = [
      {
        Name: 'Test Task', // Capital N - should be normalized
        'מלל הודעה': 'Test message',
        Link: 'https://example.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, testFilePath);

    const templateMap = await loadTemplateMap(testFilePath);

    expect(templateMap.size).toBe(1);
    const template = templateMap.get('TEST_TASK');
    expect(template).toBeDefined();
    expect(template?.messageBody).toBe('Test message');
  });

  it('should accept "NAME" (all caps) as alias for "name" header', async () => {
    const data = [
      {
        NAME: 'Another Task',
        'מלל הודעה': 'Another message',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, testFilePath);

    const templateMap = await loadTemplateMap(testFilePath);

    expect(templateMap.size).toBe(1);
    const template = templateMap.get('ANOTHER_TASK');
    expect(template).toBeDefined();
  });

  it('should accept "link" (lowercase) as alias for "Link" header', async () => {
    const data = [
      {
        name: 'Link Test',
        'מלל הודעה': 'Link test message',
        link: 'https://test.com', // lowercase link
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, testFilePath);

    const templateMap = await loadTemplateMap(testFilePath);

    const template = templateMap.get('LINK_TEST');
    expect(template?.link).toBe('https://test.com');
  });

  it('should accept "URL" as alias for "Link" header', async () => {
    const data = [
      {
        name: 'URL Test',
        'מלל הודעה': 'URL test message',
        URL: 'https://url-test.com',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, testFilePath);

    const templateMap = await loadTemplateMap(testFilePath);

    const template = templateMap.get('URL_TEST');
    expect(template?.link).toBe('https://url-test.com');
  });

  it('should accept "Message Text" as alias for Hebrew message body', async () => {
    const data = [
      {
        name: 'English Headers',
        'Message Text': 'Test with English header',
        Link: '',
        'Glassix Template': 'template_id',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, testFilePath);

    const templateMap = await loadTemplateMap(testFilePath);

    const template = templateMap.get('ENGLISH_HEADERS');
    expect(template?.messageBody).toBe('Test with English header');
    expect(template?.glassixTemplateId).toBe('template_id');
  });

  it('should handle mixed alias headers with consistent columns', async () => {
    // Note: XLSX merges duplicate column names, so we need consistent headers across rows
    const data = [
      {
        Name: 'Task 1',
        'Message Text': 'Message 1',
        URL: 'https://one.com',
        'glassix_template': 'tmpl1',
      },
      {
        Name: 'Task 2', // Same column name as row 1
        'Message Text': 'Message 2',
        URL: 'https://two.com',
        'glassix_template': 'tmpl2',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, testFilePath);

    const templateMap = await loadTemplateMap(testFilePath);

    expect(templateMap.size).toBe(2);
    
    const task1 = templateMap.get('TASK_1');
    expect(task1?.messageBody).toBe('Message 1');
    expect(task1?.link).toBe('https://one.com');
    expect(task1?.glassixTemplateId).toBe('tmpl1');

    const task2 = templateMap.get('TASK_2');
    expect(task2?.messageBody).toBe('Message 2');
    expect(task2?.link).toBe('https://two.com');
    expect(task2?.glassixTemplateId).toBe('tmpl2');
  });
});

describe('Sheet Selection', () => {
  let testFilePath: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    clearTemplateCache();
    clearConfigCache(); // Clear config cache to pick up env changes
    testFilePath = path.join(
      process.cwd(),
      `test-sheets-${Date.now()}.xlsx`
    );
    originalEnv = process.env.XSLX_SHEET;
  });

  afterEach(async () => {
    if (originalEnv !== undefined) {
      process.env.XSLX_SHEET = originalEnv;
    } else {
      delete process.env.XSLX_SHEET;
    }
    
    clearConfigCache(); // Clear again after restoring env
    
    try {
      await fs.unlink(testFilePath);
    } catch {
      // File might not exist
    }
  });

  it('should use first sheet by default when XSLX_SHEET not set', async () => {
    delete process.env.XSLX_SHEET;
    
    const wb = XLSX.utils.book_new();
    
    // Sheet 1 (first)
    const data1 = [
      {
        name: 'First Sheet Task',
        'מלל הודעה': 'From first sheet',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    const ws1 = XLSX.utils.json_to_sheet(data1);
    XLSX.utils.book_append_sheet(wb, ws1, 'FirstSheet');
    
    // Sheet 2
    const data2 = [
      {
        name: 'Second Sheet Task',
        'מלל הודעה': 'From second sheet',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    const ws2 = XLSX.utils.json_to_sheet(data2);
    XLSX.utils.book_append_sheet(wb, ws2, 'SecondSheet');
    
    XLSX.writeFile(wb, testFilePath);

    const templateMap = await loadTemplateMap(testFilePath);

    expect(templateMap.size).toBe(1);
    const template = templateMap.get('FIRST_SHEET_TASK');
    expect(template).toBeDefined();
    expect(template?.messageBody).toBe('From first sheet');
  });

  it('should select sheet by name when XSLX_SHEET is set', async () => {
    process.env.XSLX_SHEET = 'SecondSheet';
    
    const wb = XLSX.utils.book_new();
    
    // Sheet 1
    const data1 = [
      {
        name: 'First Sheet Task',
        'מלל הודעה': 'From first sheet',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    const ws1 = XLSX.utils.json_to_sheet(data1);
    XLSX.utils.book_append_sheet(wb, ws1, 'FirstSheet');
    
    // Sheet 2 (target)
    const data2 = [
      {
        name: 'Second Sheet Task',
        'מלל הודעה': 'From second sheet',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    const ws2 = XLSX.utils.json_to_sheet(data2);
    XLSX.utils.book_append_sheet(wb, ws2, 'SecondSheet');
    
    XLSX.writeFile(wb, testFilePath);

    // Clear cache to force reload with new env
    clearTemplateCache();
    const templateMap = await loadTemplateMap(testFilePath);

    expect(templateMap.size).toBe(1);
    const template = templateMap.get('SECOND_SHEET_TASK');
    expect(template).toBeDefined();
    expect(template?.messageBody).toBe('From second sheet');
  });

  it('should select sheet by index (0-based) when XSLX_SHEET is numeric', async () => {
    process.env.XSLX_SHEET = '1'; // Second sheet (0-indexed)
    
    const wb = XLSX.utils.book_new();
    
    // Sheet at index 0
    const data1 = [
      {
        name: 'Index 0 Task',
        'מלל הודעה': 'From index 0',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    const ws1 = XLSX.utils.json_to_sheet(data1);
    XLSX.utils.book_append_sheet(wb, ws1, 'Sheet0');
    
    // Sheet at index 1 (target)
    const data2 = [
      {
        name: 'Index 1 Task',
        'מלל הודעה': 'From index 1',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    const ws2 = XLSX.utils.json_to_sheet(data2);
    XLSX.utils.book_append_sheet(wb, ws2, 'Sheet1');
    
    XLSX.writeFile(wb, testFilePath);

    clearTemplateCache();
    const templateMap = await loadTemplateMap(testFilePath);

    expect(templateMap.size).toBe(1);
    const template = templateMap.get('INDEX_1_TASK');
    expect(template).toBeDefined();
    expect(template?.messageBody).toBe('From index 1');
  });

  it('should throw error when specified sheet does not exist', async () => {
    process.env.XSLX_SHEET = 'NonExistentSheet';
    
    const wb = XLSX.utils.book_new();
    const data = [
      {
        name: 'Task',
        'מלל הודעה': 'Message',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'ActualSheet');
    
    XLSX.writeFile(wb, testFilePath);

    clearTemplateCache();
    
    await expect(loadTemplateMap(testFilePath)).rejects.toThrow(
      /Sheet "NonExistentSheet" not found/
    );
  });

  it('should throw error when numeric index is out of range', async () => {
    process.env.XSLX_SHEET = '5'; // Only 1 sheet exists
    
    const wb = XLSX.utils.book_new();
    const data = [
      {
        name: 'Task',
        'מלל הודעה': 'Message',
        Link: '',
        'שם הודעה מובנית בגלאסיקס': '',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'OnlySheet');
    
    XLSX.writeFile(wb, testFilePath);

    clearTemplateCache();
    
    await expect(loadTemplateMap(testFilePath)).rejects.toThrow(
      /Sheet "5" not found/
    );
  });
});

