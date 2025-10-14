/**
 * Comprehensive verification tool for AutoMessager
 * Tests configuration, connectivity, and core functionality
 */
import type { Connection } from 'jsforce';
import { getConfig } from '../config.js';
import { validateMapping } from './mapping.js';
import { login } from '../sf.js';
import { normalizeE164 } from '../phone.js';

export interface VerifyResult {
  success: boolean;
  checks: VerifyCheck[];
}

export interface VerifyCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: Record<string, any>;
}

/**
 * Test Excel mapping file using strict validator
 */
async function verifyExcel(): Promise<VerifyCheck> {
  try {
    const config = getConfig();
    
    const result = await validateMapping({
      path: config.XSLX_MAPPING_PATH,
      sheet: config.XSLX_SHEET,
    });

    if (!result.ok) {
      return {
        name: 'Excel Mapping',
        status: 'fail',
        message: `Validation failed (${result.errors.length} errors)`,
        details: {
          path: result.path,
          errors: result.errors.slice(0, 3),
        },
      };
    }

    if (result.warnings.length > 0) {
      return {
        name: 'Excel Mapping',
        status: 'warn',
        message: `${result.count} templates loaded (${result.warnings.length} warnings)`,
        details: {
          path: result.path,
          count: result.count,
          samples: result.sampleKeys.slice(0, 3),
          warnings: result.warnings.slice(0, 2),
        },
      };
    }

    return {
      name: 'Excel Mapping',
      status: 'pass',
      message: `${result.count} templates loaded`,
      details: {
        path: result.path,
        count: result.count,
        samples: result.sampleKeys.slice(0, 3),
      },
    };
  } catch (error) {
    return {
      name: 'Excel Mapping',
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test Salesforce connectivity
 */
async function verifySalesforce(): Promise<VerifyCheck> {
  let conn: Connection | null = null;

  try {
    // Login
    conn = await login();

    // Query a minimal SOQL to verify API access
    const result = await conn.query('SELECT Id FROM Task LIMIT 1');

    // Get org and user info
    const identity = await conn.identity();
    const orgId = identity.organization_id;
    const userId = identity.user_id;

    return {
      name: 'Salesforce Login',
      status: 'pass',
      message: 'Connected successfully',
      details: {
        orgId: orgId?.substring(0, 8) + '...',
        userId: userId?.substring(0, 8) + '...',
        queryResult: `${result.totalSize} records accessible`,
      },
    };
  } catch (error) {
    return {
      name: 'Salesforce Login',
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
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
 * Test Glassix authentication
 */
async function verifyGlassix(): Promise<VerifyCheck> {
  try {
    const config = getConfig();
    const { USE_ACCESS_TOKEN_FLOW } = await import('../config.js');

    if (USE_ACCESS_TOKEN_FLOW) {
      // Test access token flow
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
            timeout: config.GLASSIX_TIMEOUT_MS,
          }
        );

        const { accessToken, expiresIn } = response.data;

        if (!accessToken || typeof accessToken !== 'string') {
          return {
            name: 'Glassix Auth',
            status: 'fail',
            message: 'Invalid access token response',
          };
        }

        return {
          name: 'Glassix Auth',
          status: 'pass',
          message: 'Access token obtained',
          details: {
            mode: 'access_token_flow',
            expiresIn: expiresIn || 'unknown',
            tokenLength: accessToken.length,
          },
        };
      } catch (error: any) {
        return {
          name: 'Glassix Auth',
          status: 'fail',
          message: `Access token exchange failed: ${
            error.response?.data?.message ||
            error.message ||
            'Unknown error'
          }`,
          details: {
            mode: 'access_token_flow',
            status: error.response?.status,
          },
        };
      }
    } else {
      // Legacy mode - just check if API key is present
      if (!config.GLASSIX_API_KEY) {
        return {
          name: 'Glassix Auth',
          status: 'fail',
          message: 'GLASSIX_API_KEY is not set',
        };
      }

      return {
        name: 'Glassix Auth',
        status: 'warn',
        message: 'Legacy mode (direct bearer token)',
        details: {
          mode: 'legacy',
          warning: 'Consider migrating to access token flow for better security',
        },
      };
    }
  } catch (error) {
    return {
      name: 'Glassix Auth',
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Test phone normalization
 */
async function verifyPhone(): Promise<VerifyCheck> {
  try {
    const samplePhones = [
      { input: '050-1234567', expected: '+9725' },
      { input: '0501234567', expected: '+9725' },
      { input: '+972501234567', expected: '+9725' },
    ];

    const results: Array<{ input: string; output: string | null; ok: boolean }> = [];

    for (const { input, expected } of samplePhones) {
      const normalized = normalizeE164(input);
      const ok = normalized?.startsWith(expected) ?? false;
      results.push({ input, output: normalized, ok });
    }

    const allOk = results.every((r) => r.ok);

    if (!allOk) {
      return {
        name: 'Phone Normalization',
        status: 'fail',
        message: 'Phone normalization failed',
        details: { results },
      };
    }

    return {
      name: 'Phone Normalization',
      status: 'pass',
      message: 'Phone normalization working',
      details: {
        sample: results[0].output,
      },
    };
  } catch (error) {
    return {
      name: 'Phone Normalization',
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run all verification checks
 */
export async function runVerify(opts?: { json?: boolean }): Promise<VerifyResult> {
  if (!opts?.json) {
    console.log('\n🔍 AutoMessager Verification\n');
    console.log('Running checks...\n');
  }

  const checks: VerifyCheck[] = [];

  // Run checks in parallel where possible
  const [excelCheck, sfCheck, glassixCheck, phoneCheck] = await Promise.all([
    verifyExcel(),
    verifySalesforce(),
    verifyGlassix(),
    verifyPhone(),
  ]);

  checks.push(excelCheck, sfCheck, glassixCheck, phoneCheck);

  const success = checks.every((c) => c.status === 'pass' || c.status === 'warn');

  const result: VerifyResult = {
    success,
    checks,
  };

  // JSON output mode
  if (opts?.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  // Human-readable output
  // Print results table
  console.log('┌─────────────────────────┬────────┬─────────────────────────────────────┐');
  console.log('│ Check                   │ Status │ Message                             │');
  console.log('├─────────────────────────┼────────┼─────────────────────────────────────┤');

  for (const check of checks) {
    const statusIcon =
      check.status === 'pass' ? '✔' : check.status === 'fail' ? '✖' : '⚠';
    const statusColor =
      check.status === 'pass' ? '\x1b[32m' : check.status === 'fail' ? '\x1b[31m' : '\x1b[33m';
    const reset = '\x1b[0m';

    const name = check.name.padEnd(23);
    const status = `${statusColor}${statusIcon}${reset}`.padEnd(6);
    const message = check.message.substring(0, 35).padEnd(35);

    console.log(`│ ${name} │ ${status} │ ${message} │`);
  }

  console.log('└─────────────────────────┴────────┴─────────────────────────────────────┘\n');

  // Print details for failed/warn checks
  const problemChecks = checks.filter((c) => c.status !== 'pass');
  if (problemChecks.length > 0) {
    console.log('Details:\n');
    for (const check of problemChecks) {
      console.log(`${check.name}:`);
      console.log(`  Status: ${check.status.toUpperCase()}`);
      console.log(`  Message: ${check.message}`);
      if (check.details) {
        console.log(`  Details: ${JSON.stringify(check.details, null, 2)}`);
      }
      console.log('');
    }
  }

  // Print details for successful checks
  const successChecks = checks.filter((c) => c.status === 'pass' && c.details);
  if (successChecks.length > 0) {
    console.log('Success Details:\n');
    for (const check of successChecks) {
      console.log(`${check.name}:`);
      if (check.details) {
        for (const [key, value] of Object.entries(check.details)) {
          console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
        }
      }
      console.log('');
    }
  }

  if (success) {
    console.log('✅ All checks passed!\n');
    console.log('Next steps:');
    console.log('  - Run dry-run: automessager dry-run');
    console.log('  - Run live: automessager run\n');
  } else {
    console.log('❌ Some checks failed. Please fix the issues above before running AutoMessager.\n');
  }

  return result;
}

