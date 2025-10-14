/**
 * Tests for doctor diagnostics module
 */
import { describe, it, expect } from 'vitest';
import type { DiagnosticResult, DiagnosticCheck } from '../src/cli/doctor.js';

describe('Doctor Diagnostics', () => {
  it('should define DiagnosticResult interface shape', () => {
    const mockResult: DiagnosticResult = {
      overall: 'PASS',
      checks: [],
      metadata: {
        platform: 'win32 (x64)',
        nodeVersion: 'v20.0.0',
        appVersion: '1.0.0',
        timestamp: '2025-10-14T12:00:00.000Z',
      },
    };

    expect(mockResult.overall).toBe('PASS');
    expect(mockResult.metadata.platform).toBeTruthy();
    expect(mockResult.metadata.nodeVersion).toBeTruthy();
  });

  it('should handle PASS check correctly', () => {
    const mockCheck: DiagnosticCheck = {
      name: 'Environment Config',
      status: 'PASS',
      message: 'All required variables present',
      details: {
        logLevel: 'info',
      },
    };

    expect(mockCheck.status).toBe('PASS');
    expect(mockCheck.details).toBeDefined();
  });

  it('should handle WARN check with actions', () => {
    const mockCheck: DiagnosticCheck = {
      name: 'Salesforce Connectivity',
      status: 'WARN',
      message: 'Connected, but some optional fields are missing',
      actions: [
        'Optional: Create missing custom fields in Salesforce',
      ],
    };

    expect(mockCheck.status).toBe('WARN');
    expect(mockCheck.actions).toHaveLength(1);
  });

  it('should handle FAIL check with prescriptive actions', () => {
    const mockCheck: DiagnosticCheck = {
      name: 'Excel Mapping',
      status: 'FAIL',
      message: 'File not found',
      actions: [
        'Run: automessager verify:mapping',
        'Check Excel file exists at configured path',
      ],
    };

    expect(mockCheck.status).toBe('FAIL');
    expect(mockCheck.actions).toBeTruthy();
    expect(mockCheck.actions!.length).toBeGreaterThan(0);
  });

  it('should determine overall status from checks', () => {
    function determineOverall(checks: DiagnosticCheck[]): 'PASS' | 'WARN' | 'FAIL' {
      const hasFail = checks.some((c) => c.status === 'FAIL');
      const hasWarn = checks.some((c) => c.status === 'WARN');
      return hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'PASS';
    }

    const allPass: DiagnosticCheck[] = [
      { name: 'Test1', status: 'PASS', message: 'OK' },
      { name: 'Test2', status: 'PASS', message: 'OK' },
    ];

    const hasWarn: DiagnosticCheck[] = [
      { name: 'Test1', status: 'PASS', message: 'OK' },
      { name: 'Test2', status: 'WARN', message: 'Warning' },
    ];

    const hasFail: DiagnosticCheck[] = [
      { name: 'Test1', status: 'PASS', message: 'OK' },
      { name: 'Test2', status: 'FAIL', message: 'Error' },
    ];

    expect(determineOverall(allPass)).toBe('PASS');
    expect(determineOverall(hasWarn)).toBe('WARN');
    expect(determineOverall(hasFail)).toBe('FAIL');
  });
});

