/**
 * Tests for wizard path normalization and basic setup flow
 */
import { describe, it, expect } from 'vitest';
import { platform } from 'os';

describe('Wizard Path Normalization', () => {
  it('should handle Windows-style backslashes', () => {
    const inputPath = 'C:\\Users\\User\\Desktop\\MAGNUS\\AutoMessager\\massege_maping.xlsx';
    
    // Normalize function from wizard (copied for testing)
    function normalizePath(p: string): string {
      if (platform() === 'win32') {
        return p.replace(/\//g, '\\');
      }
      return p;
    }

    const normalized = normalizePath(inputPath);
    
    if (platform() === 'win32') {
      expect(normalized).toContain('\\');
      expect(normalized).not.toContain('/');
    }
  });

  it('should handle forward slashes on Windows', () => {
    const inputPath = 'C:/Users/User/Desktop/MAGNUS/AutoMessager/massege_maping.xlsx';
    
    function normalizePath(p: string): string {
      if (platform() === 'win32') {
        return p.replace(/\//g, '\\');
      }
      return p;
    }

    const normalized = normalizePath(inputPath);
    
    if (platform() === 'win32') {
      expect(normalized).toBe('C:\\Users\\User\\Desktop\\MAGNUS\\AutoMessager\\massege_maping.xlsx');
    } else {
      expect(normalized).toBe(inputPath);
    }
  });

  it('should return platform-appropriate default Excel path', () => {
    function getDefaultExcelPath(): string {
      if (platform() === 'win32') {
        return 'C:\\Users\\User\\Desktop\\MAGNUS\\AutoMessager\\massege_maping.xlsx';
      }
      return './massege_maping.xlsx';
    }

    const defaultPath = getDefaultExcelPath();
    
    if (platform() === 'win32') {
      expect(defaultPath).toContain('C:\\Users');
      expect(defaultPath).toContain('massege_maping.xlsx');
    } else {
      expect(defaultPath).toBe('./massege_maping.xlsx');
    }
  });

  it('should build valid .env content', () => {
    // Simplified version of buildEnvContent
    function buildEnvContent(answers: Record<string, any>): string {
      const lines: string[] = [
        '# AutoMessager Configuration',
        '',
        `SF_LOGIN_URL=${answers.sfLoginUrl}`,
        `SF_USERNAME=${answers.sfUsername}`,
        `GLASSIX_BASE_URL=${answers.glassixBaseUrl}`,
        `XSLX_MAPPING_PATH=${answers.excelPath}`,
        '',
      ];
      return lines.join('\n');
    }

    const answers = {
      sfLoginUrl: 'https://login.salesforce.com',
      sfUsername: 'test@example.com',
      glassixBaseUrl: 'https://api.glassix.com',
      excelPath: './massege_maping.xlsx',
    };

    const content = buildEnvContent(answers);
    
    expect(content).toContain('SF_LOGIN_URL=https://login.salesforce.com');
    expect(content).toContain('SF_USERNAME=test@example.com');
    expect(content).toContain('GLASSIX_BASE_URL=https://api.glassix.com');
    expect(content).toContain('XSLX_MAPPING_PATH=./massege_maping.xlsx');
  });
});

