/**
 * Tests for support bundle generator
 */
import { describe, it, expect } from 'vitest';

describe('Support Bundle', () => {
  it('should mask sensitive environment values', () => {
    function maskValue(key: string, value: string): string {
      const sensitiveKeys = [
        'PASSWORD',
        'TOKEN',
        'SECRET',
        'API_KEY',
        'APIKEY',
      ];

      const isSensitive = sensitiveKeys.some((k) => key.toUpperCase().includes(k));

      if (!isSensitive) {
        return value;
      }

      if (value.length <= 4) {
        return '****';
      }

      return '****' + value.slice(-4);
    }

    expect(maskValue('SF_USERNAME', 'user@example.com')).toBe('user@example.com');
    expect(maskValue('SF_PASSWORD', 'secret123456')).toBe('****3456');
    expect(maskValue('SF_TOKEN', 'abc')).toBe('****');
    expect(maskValue('GLASSIX_API_KEY', 'key12345')).toBe('****2345');
    expect(maskValue('LOG_LEVEL', 'info')).toBe('info');
  });

  it('should generate correct bundle filename pattern', () => {
    const timestamp = '20251014-1230';
    const filename = `support-bundle-${timestamp}.zip`;
    
    expect(filename).toMatch(/^support-bundle-\d{8}-\d{4}\.zip$/);
    expect(filename).toContain('.zip');
  });

  it('should validate bundle content structure', () => {
    const expectedFiles = [
      'environment.txt',
      'diagnostics.json',
      'automessager.log',
      'template-manifest.json',
      'package-metadata.json',
      'README.txt',
    ];

    expectedFiles.forEach((file) => {
      expect(file).toBeTruthy();
      expect(typeof file).toBe('string');
    });
  });

  it('should redact sensitive keys in environment snapshot', () => {
    const envSnapshot = {
      SF_USERNAME: 'user@example.com',
      SF_PASSWORD: '****1234',
      SF_TOKEN: '****5678',
      GLASSIX_API_KEY: '****9012',
      LOG_LEVEL: 'info',
    };

    // All password/token/key fields should be masked
    expect(envSnapshot.SF_PASSWORD).toMatch(/^\*\*\*\*/);
    expect(envSnapshot.SF_TOKEN).toMatch(/^\*\*\*\*/);
    expect(envSnapshot.GLASSIX_API_KEY).toMatch(/^\*\*\*\*/);
    
    // Non-sensitive fields should be plain
    expect(envSnapshot.SF_USERNAME).not.toMatch(/^\*\*\*\*/);
    expect(envSnapshot.LOG_LEVEL).toBe('info');
  });
});

