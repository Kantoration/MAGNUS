/**
 * Deep diagnostic tool for AutoMessager
 * Combines environment, Excel, Salesforce, and Glassix checks
 */
import type { Connection } from 'jsforce';
import { getConfig, USE_ACCESS_TOKEN_FLOW } from '../config.js';
import { validateMapping } from './mapping.js';
import { login } from '../sf.js';
import { normalizeE164 } from '../phone.js';
import { platform } from 'os';

export interface DiagnosticCheck {
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
  details?: Record<string, unknown>;
  actions?: string[];
}

export interface DiagnosticResult {
  overall: 'PASS' | 'WARN' | 'FAIL';
  checks: DiagnosticCheck[];
  metadata: {
    platform: string;
    nodeVersion: string;
    appVersion: string;
    timestamp: string;
  };
}

/**
 * Check environment configuration
 */
async function checkEnvironment(): Promise<DiagnosticCheck> {
  try {
    const config = getConfig();
    
    // Check for required fields without exposing values
    const requiredKeys = [
      'SF_LOGIN_URL',
      'SF_USERNAME',
      'SF_PASSWORD',
      'SF_TOKEN',
      'GLASSIX_BASE_URL',
      'GLASSIX_API_KEY',
    ];

    const missing: string[] = [];
    for (const key of requiredKeys) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      return {
        name: 'Environment Config',
        status: 'FAIL',
        message: `Missing required variables: ${missing.join(', ')}`,
        actions: ['Run: automessager init'],
      };
    }

    const details: Record<string, unknown> = {
      logLevel: config.LOG_LEVEL,
      tasksLimit: config.TASKS_QUERY_LIMIT,
      authMode: USE_ACCESS_TOKEN_FLOW ? 'modern' : 'legacy',
    };

    return {
      name: 'Environment Config',
      status: 'PASS',
      message: 'All required variables present',
      details,
    };
  } catch (error) {
    return {
      name: 'Environment Config',
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
      actions: ['Check .env file syntax', 'Run: automessager init'],
    };
  }
}

/**
 * Check Excel mapping
 */
async function checkMapping(): Promise<DiagnosticCheck> {
  try {
    const result = await validateMapping({
      path: getConfig().XSLX_MAPPING_PATH,
      sheet: getConfig().XSLX_SHEET,
    });

    if (!result.ok) {
      return {
        name: 'Excel Mapping',
        status: 'FAIL',
        message: `Validation failed (${result.errors.length} errors)`,
        details: {
          errors: result.errors,
          path: result.path,
        },
        actions: [
          'Run: automessager verify:mapping',
          'Check Excel file exists at configured path',
          'Verify required headers are present',
        ],
      };
    }

    if (result.warnings.length > 0) {
      return {
        name: 'Excel Mapping',
        status: 'WARN',
        message: `${result.count} templates loaded (${result.warnings.length} warnings)`,
        details: {
          count: result.count,
          warnings: result.warnings.slice(0, 3),
          sampleKeys: result.sampleKeys.slice(0, 5),
        },
        actions: ['Review warnings with: automessager verify:mapping'],
      };
    }

    return {
      name: 'Excel Mapping',
      status: 'PASS',
      message: `${result.count} templates loaded`,
      details: {
        count: result.count,
        sampleKeys: result.sampleKeys.slice(0, 5),
      },
    };
  } catch (error) {
    return {
      name: 'Excel Mapping',
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
      actions: [
        'Verify Excel file path in .env',
        'Ensure file is not open in Excel',
        'Run: automessager verify:mapping',
      ],
    };
  }
}

/**
 * Check Salesforce connectivity and fields
 */
async function checkSalesforce(): Promise<DiagnosticCheck> {
  let conn: Connection | null = null;

  try {
    // Login
    conn = await login();

    // Test query
    const result = await conn.query('SELECT Id, Status FROM Task ORDER BY CreatedDate DESC LIMIT 1');

    // Describe Task to check optional fields
    const describe = await conn.sobject('Task').describe();
    const fieldMap = new Map(describe.fields.map((f) => [f.name, f]));

    const optionalFields = [
      'Delivery_Status__c',
      'Last_Sent_At__c',
      'Glassix_Conversation_URL__c',
      'Failure_Reason__c',
      'Audit_Trail__c',
      'Ready_for_Automation__c',
    ];

    const presentFields: string[] = [];
    const missingFields: string[] = [];

    for (const field of optionalFields) {
      if (fieldMap.has(field)) {
        presentFields.push(field);
      } else {
        missingFields.push(field);
      }
    }

    // Get org info
    const identity = await conn.identity();

    const details: Record<string, unknown> = {
      orgId: identity.organization_id?.substring(0, 8) + '...',
      userId: identity.user_id?.substring(0, 8) + '...',
      taskCount: result.totalSize,
      optionalFieldsPresent: presentFields.length,
      optionalFieldsMissing: missingFields.length,
    };

    if (missingFields.length > 0) {
      return {
        name: 'Salesforce Connectivity',
        status: 'WARN',
        message: 'Connected, but some optional fields are missing',
        details: {
          ...details,
          missingFields,
        },
        actions: [
          'Optional: Create missing custom fields in Salesforce for enhanced functionality',
          `Missing: ${missingFields.join(', ')}`,
        ],
      };
    }

    return {
      name: 'Salesforce Connectivity',
      status: 'PASS',
      message: 'Connected successfully, all optional fields present',
      details,
    };
  } catch (error) {
    return {
      name: 'Salesforce Connectivity',
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
      actions: [
        'Verify SF_USERNAME, SF_PASSWORD, SF_TOKEN in .env',
        'Check SF_LOGIN_URL (production vs sandbox)',
        'Ensure Salesforce account has API access',
      ],
    };
  } finally {
    if (conn) {
      try {
        await conn.logout();
      } catch {
        // Ignore logout errors
      }
    }
  }
}

/**
 * Check Glassix authentication
 */
async function checkGlassix(): Promise<DiagnosticCheck> {
  try {
    const config = getConfig();

    if (USE_ACCESS_TOKEN_FLOW) {
      // Test access token exchange
      const { default: axios } = await import('axios');
      const baseUrl = config.GLASSIX_BASE_URL.replace(/\/+$/, '');

      try {
        const response = await axios.post(
          `${baseUrl}/access-token`,
          {
            apiKey: config.GLASSIX_API_KEY,
            secret: config.GLASSIX_API_SECRET,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000,
          }
        );

        const { accessToken, expiresIn } = response.data;

        if (!accessToken || typeof accessToken !== 'string') {
          return {
            name: 'Glassix Authentication',
            status: 'FAIL',
            message: 'Invalid access token response',
            actions: [
              'Verify GLASSIX_API_KEY and GLASSIX_API_SECRET',
              'Check Glassix dashboard for valid credentials',
            ],
          };
        }

        const ttlMinutes = typeof expiresIn === 'number' ? Math.floor(expiresIn / 60) : 180;

        return {
          name: 'Glassix Authentication',
          status: 'PASS',
          message: 'Access token obtained (modern mode)',
          details: {
            mode: 'access_token_flow',
            ttlMinutes,
            tokenLength: accessToken.length,
          },
        };
      } catch (error: any) {
        return {
          name: 'Glassix Authentication',
          status: 'FAIL',
          message: `Access token exchange failed: ${error.response?.data?.message || error.message}`,
          actions: [
            'Verify GLASSIX_API_KEY and GLASSIX_API_SECRET in .env',
            'Check GLASSIX_BASE_URL is correct',
            'Ensure API credentials are active in Glassix dashboard',
          ],
        };
      }
    } else {
      // Legacy mode
      if (!config.GLASSIX_API_KEY) {
        return {
          name: 'Glassix Authentication',
          status: 'FAIL',
          message: 'GLASSIX_API_KEY not set',
          actions: ['Add GLASSIX_API_KEY to .env', 'Run: automessager init'],
        };
      }

      return {
        name: 'Glassix Authentication',
        status: 'WARN',
        message: 'Using legacy mode (direct bearer token)',
        details: {
          mode: 'legacy',
        },
        actions: [
          'Consider migrating to modern mode for better security',
          'Add GLASSIX_API_SECRET to .env to enable access token flow',
        ],
      };
    }
  } catch (error) {
    return {
      name: 'Glassix Authentication',
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
      actions: ['Check .env configuration', 'Run: automessager init'],
    };
  }
}

/**
 * Check phone normalization
 */
async function checkPhone(): Promise<DiagnosticCheck> {
  try {
    const testPhones = [
      { input: '050-1234567', expected: '+9725' },
      { input: '0501234567', expected: '+9725' },
      { input: '+972501234567', expected: '+9725' },
    ];

    const results: Array<{ input: string; output: string | null; ok: boolean }> = [];

    for (const { input, expected } of testPhones) {
      const normalized = normalizeE164(input);
      const ok = normalized?.startsWith(expected) ?? false;
      results.push({ input, output: normalized, ok });
    }

    const allOk = results.every((r) => r.ok);

    if (!allOk) {
      return {
        name: 'Phone Normalization',
        status: 'FAIL',
        message: 'Phone normalization failed',
        details: { results },
        actions: ['Check libphonenumber-js configuration', 'Report issue to support'],
      };
    }

    return {
      name: 'Phone Normalization',
      status: 'PASS',
      message: 'Phone normalization working correctly',
      details: {
        sample: results[0].output,
      },
    };
  } catch (error) {
    return {
      name: 'Phone Normalization',
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
      actions: ['Report issue to support'],
    };
  }
}

/**
 * Run all diagnostic checks
 */
export async function runDiagnostics(): Promise<DiagnosticResult> {
  console.log('\n🔬 AutoMessager Deep Diagnostics\n');
  console.log('Running comprehensive system checks...\n');

  const checks: DiagnosticCheck[] = [];

  // Run checks in sequence (some depend on config being valid)
  const envCheck = await checkEnvironment();
  checks.push(envCheck);

  // Only proceed with other checks if env is valid
  if (envCheck.status !== 'FAIL') {
    const [mappingCheck, sfCheck, glassixCheck, phoneCheck] = await Promise.all([
      checkMapping(),
      checkSalesforce(),
      checkGlassix(),
      checkPhone(),
    ]);

    checks.push(mappingCheck, sfCheck, glassixCheck, phoneCheck);
  }

  // Determine overall status
  const hasFail = checks.some((c) => c.status === 'FAIL');
  const hasWarn = checks.some((c) => c.status === 'WARN');
  const overall = hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'PASS';

  // Get package version
  let appVersion = '1.0.0';
  try {
    const { promises: fs } = await import('fs');
    const pkgPath = './package.json';
    const pkgContent = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    appVersion = pkg.version || '1.0.0';
  } catch {
    // Ignore
  }

  const result: DiagnosticResult = {
    overall,
    checks,
    metadata: {
      platform: `${platform()} (${process.arch})`,
      nodeVersion: process.version,
      appVersion,
      timestamp: new Date().toISOString(),
    },
  };

  return result;
}

/**
 * Print diagnostic result to console
 */
export function printDiagnosticResult(result: DiagnosticResult): void {
  // Print table
  console.log('┌─────────────────────────────┬────────┬──────────────────────────────────────┐');
  console.log('│ Check                       │ Status │ Message                              │');
  console.log('├─────────────────────────────┼────────┼──────────────────────────────────────┤');

  for (const check of result.checks) {
    const statusIcon =
      check.status === 'PASS' ? '✔' : check.status === 'FAIL' ? '✖' : '⚠';
    const statusColor =
      check.status === 'PASS' ? '\x1b[32m' : check.status === 'FAIL' ? '\x1b[31m' : '\x1b[33m';
    const reset = '\x1b[0m';

    const name = check.name.padEnd(27);
    const status = `${statusColor}${statusIcon}${reset}`.padEnd(6);
    const message = check.message.substring(0, 36).padEnd(36);

    console.log(`│ ${name} │ ${status} │ ${message} │`);
  }

  console.log('└─────────────────────────────┴────────┴──────────────────────────────────────┘\n');

  // Print details for non-PASS checks
  const problemChecks = result.checks.filter((c) => c.status !== 'PASS');
  if (problemChecks.length > 0) {
    console.log('📋 Details & Actions:\n');
    for (const check of problemChecks) {
      console.log(`${check.name}:`);
      console.log(`  Status: ${check.status}`);
      console.log(`  Message: ${check.message}`);
      
      if (check.details) {
        console.log(`  Details:`);
        for (const [key, value] of Object.entries(check.details)) {
          const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
          console.log(`    ${key}: ${valueStr}`);
        }
      }
      
      if (check.actions && check.actions.length > 0) {
        console.log(`  Actions:`);
        check.actions.forEach((action) => {
          console.log(`    → ${action}`);
        });
      }
      
      console.log('');
    }
  }

  // Print metadata
  console.log('ℹ️  System Information:\n');
  for (const [key, value] of Object.entries(result.metadata)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log('');

  // Print overall status
  if (result.overall === 'PASS') {
    console.log('✅ All diagnostics PASSED\n');
    console.log('System is ready for production use.');
  } else if (result.overall === 'WARN') {
    console.log('⚠️  Diagnostics completed with WARNINGS\n');
    console.log('System is functional but review warnings above.');
  } else {
    console.log('❌ Diagnostics FAILED\n');
    console.log('Fix the issues above before running AutoMessager.');
    console.log('\nRecommended next steps:');
    console.log('  1. Review error details above');
    console.log('  2. Run: automessager init (to reconfigure)');
    console.log('  3. Run: automessager verify:mapping (for Excel issues)');
    console.log('  4. Run: automessager doctor (to re-check)');
  }
  console.log('');
}

/**
 * CLI command entry point
 */
export async function runDoctorCommand(): Promise<number> {
  try {
    const result = await runDiagnostics();
    printDiagnosticResult(result);

    // Exit codes: 0 = PASS, 1 = FAIL, 2 = WARN
    if (result.overall === 'FAIL') {
      return 1;
    }
    if (result.overall === 'WARN') {
      return 2;
    }
    return 0;
  } catch (error) {
    console.error('Fatal error during diagnostics:', error);
    return 1;
  }
}

