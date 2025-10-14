/**
 * Environment configuration with Zod validation
 * 
 * FEATURES:
 * - Supports Glassix Access Token flow with backwards compatibility
 * - Loads .env from binary directory or current working directory  
 * - Provides secure defaults (SAFE_MODE_STRICT=true)
 * - Validates all configuration at startup
 * - Redacts secrets in snapshots for support bundles
 * 
 * DEFAULTS (if not specified in .env):
 * - GLASSIX_API_MODE: 'messages'
 * - GLASSIX_TIMEOUT_MS: 15000 (15 seconds)
 * - SAFE_MODE_STRICT: true
 * - ALLOW_LEGACY_BEARER: false
 * - RETRY_ATTEMPTS: 3
 * - RETRY_BASE_MS: 300
 * - TASKS_QUERY_LIMIT: 200
 * - LOG_LEVEL: 'info'
 * - DEFAULT_LANG: 'he'
 * - PHONE_STRICT_VALIDATION: true (reject hidden chars/confusables)
 * - DEFAULT_REGION: 'IL' (Israeli phone numbers)
 * - DRY_RUN: false
 * 
 * See README.md for complete configuration reference.
 */
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

/**
 * Determine .env file path
 * 
 * - For PKG binaries: uses executable directory (e.g., same folder as automessager.exe)
 * - For source mode: uses current working directory
 * 
 * This ensures the binary can run independently without the source repository.
 */
const getBinaryDir = (): string => {
  // For PKG binaries, use executable directory
  // @ts-ignore - pkg adds this property at runtime
  if (process.pkg) {
    return path.dirname(process.execPath);
  }
  // For source mode, use cwd
  return process.cwd();
};

const binaryDir = getBinaryDir();
const envPath = path.join(binaryDir, '.env');

// Load .env from binary directory
dotenv.config({ path: envPath });

const configSchema = z.object({
  // Salesforce
  SF_LOGIN_URL: z.string().url(),
  SF_USERNAME: z.string().email(),
  SF_PASSWORD: z.string().min(1),
  SF_TOKEN: z.string().min(1),

  // Glassix
  GLASSIX_BASE_URL: z.string().url(),
  GLASSIX_API_KEY: z.string().min(1).optional(), // legacy direct-bearer OR new key for token exchange
  GLASSIX_API_SECRET: z.string().min(1).optional(), // new: for /access-token exchange
  GLASSIX_API_MODE: z.enum(['messages', 'protocols']).default('messages'),
  GLASSIX_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  
  // Security
  SAFE_MODE_STRICT: z.coerce.boolean().default(true),
  ALLOW_LEGACY_BEARER: z.coerce.boolean().default(false),

  // Retry configuration
  RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3), // Max 5 to prevent excessive backoff (2^5 * 300ms = ~9.6s)
  RETRY_BASE_MS: z.coerce.number().int().min(100).max(5000).default(300),

  // Application
  TASKS_QUERY_LIMIT: z.coerce.number().int().positive().default(200),
  TASK_CUSTOM_PHONE_FIELD: z.string().min(1).default('Phone__c'),
  XSLX_MAPPING_PATH: z
    .string()
    .min(1)
    .default(path.resolve('massege_maping.xlsx')),
  XSLX_SHEET: z.string().optional(), // Sheet name or index (e.g., "Sheet2" or "1")
  DEFAULT_LANG: z.enum(['he', 'en']).default('he'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  KEEP_READY_ON_FAIL: z.coerce.boolean().default(true),
  PERMIT_LANDLINES: z.coerce.boolean().default(false), // Allow non-mobile numbers
  PAGED: z.coerce.boolean().default(false), // Enable paging mode for large batches

  // Phone Validation
  PHONE_STRICT_VALIDATION: z.coerce.boolean().default(true), // Reject hidden chars/confusables in STRICT mode
  DEFAULT_REGION: z.enum(['IL', 'US']).default('IL'), // Default phone region for normalization

  // Metrics
  METRICS_ENABLED: z.coerce.boolean().default(false), // Enable Prometheus metrics server
  METRICS_PORT: z.coerce.number().int().min(1024).max(65535).default(9090), // Metrics server port
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;
let legacyWarningEmitted = false;

/**
 * Derived flag: use access token flow if API_SECRET is present
 */
export let USE_ACCESS_TOKEN_FLOW = false;

/**
 * Get validated configuration with legacy migration support
 */
/**
 * Get validated configuration
 * 
 * Loads and validates environment variables using Zod schema.
 * Results are cached after first call for performance.
 * 
 * @returns Validated configuration object with all settings
 * @throws ZodError if required variables are missing or invalid
 * 
 * @example
 * ```typescript
 * const config = getConfig();
 * console.log(config.GLASSIX_API_MODE); // 'messages' or 'protocols'
 * console.log(config.RETRY_ATTEMPTS); // 3 (default)
 * ```
 */
export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Legacy migration: map GLASSIXAPIKEY to GLASSIX_API_KEY if present
  const env = { ...process.env };
  
  const hasLegacyKey = env.GLASSIXAPIKEY && !env.GLASSIX_API_KEY && !env.GLASSIX_API_SECRET;
  if (hasLegacyKey) {
    env.GLASSIX_API_KEY = env.GLASSIXAPIKEY;
    
    // Emit warning exactly once
    if (!legacyWarningEmitted) {
      console.warn(
        '[WARN] Using legacy GLASSIXAPIKEY; migrate to GLASSIX_API_KEY/GLASSIX_API_SECRET + access-token flow'
      );
      legacyWarningEmitted = true;
    }
  }

  const result = configSchema.safeParse(env);

  if (!result.success) {
    console.error('Configuration validation failed:');
    console.error(result.error.format());
    throw new Error('Invalid environment configuration');
  }

  cachedConfig = result.data;

  // Validate Glassix auth configuration
  const hasApiKey = !!cachedConfig.GLASSIX_API_KEY;
  const hasApiSecret = !!cachedConfig.GLASSIX_API_SECRET;

  if (!hasApiKey && !hasApiSecret) {
    throw new Error(
      'GLASSIX_API_KEY is required. For access token flow, also provide GLASSIX_API_SECRET.'
    );
  }

  // Access token flow requires BOTH key and secret
  if (hasApiSecret && !hasApiKey) {
    throw new Error(
      'GLASSIX_API_KEY is required when using GLASSIX_API_SECRET for access token flow. ' +
      'Both credentials are needed to exchange for an access token.'
    );
  }

  // Set derived flag (only when BOTH are present)
  USE_ACCESS_TOKEN_FLOW = hasApiKey && hasApiSecret;

  return cachedConfig;
}

/**
 * Clear config cache (for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  legacyWarningEmitted = false;
  USE_ACCESS_TOKEN_FLOW = false;
}

/**
 * Assert secure authentication is configured
 * Throws if SAFE_MODE_STRICT is enabled and legacy mode is used without explicit opt-in
 */
/**
 * Assert secure authentication is configured
 * 
 * In strict mode (SAFE_MODE_STRICT=true, default), enforces modern access token flow
 * unless explicitly allowed to use legacy bearer mode.
 * 
 * Throws descriptive error with three resolution options:
 * 1. Add GLASSIX_API_SECRET (recommended)
 * 2. Set ALLOW_LEGACY_BEARER=true (not recommended)
 * 3. Set SAFE_MODE_STRICT=false (not recommended for production)
 * 
 * @throws Error if secure authentication requirements not met
 * 
 * @example
 * ```typescript
 * // At app startup:
 * assertSecureAuth(); // Throws if not configured securely
 * ```
 */
export function assertSecureAuth(): void {
  const config = getConfig();

  if (config.SAFE_MODE_STRICT && !USE_ACCESS_TOKEN_FLOW && !config.ALLOW_LEGACY_BEARER) {
    throw new Error(
      'Secure authentication required: GLASSIX_API_SECRET is missing.\n\n' +
      'AutoMessager requires modern access token flow in secure mode.\n\n' +
      'Options:\n' +
      '  1. Add GLASSIX_API_SECRET to .env (recommended)\n' +
      '     Run: automessager init\n\n' +
      '  2. Allow legacy bearer mode (not recommended)\n' +
      '     Add to .env: ALLOW_LEGACY_BEARER=true\n\n' +
      '  3. Disable strict mode (not recommended for production)\n' +
      '     Add to .env: SAFE_MODE_STRICT=false'
    );
  }
}

/**
 * Get redacted environment snapshot for diagnostics
 * All secrets are masked, showing only last 4 characters
 */
/**
 * Get redacted environment snapshot for support bundles
 * 
 * Returns all configuration with secrets masked for safe sharing.
 * Secrets show only last 4 characters (e.g., "****ABCD").
 * 
 * Safe to include in support bundles and diagnostic exports.
 * 
 * @returns Record of environment variables with secrets masked
 * 
 * @example
 * ```typescript
 * const snapshot = getRedactedEnvSnapshot();
 * console.log(snapshot.SF_PASSWORD); // "****WXYZ"
 * console.log(snapshot.GLASSIX_API_KEY); // "****1234"
 * console.log(snapshot.LOG_LEVEL); // "info" (not a secret)
 * ```
 */
export function getRedactedEnvSnapshot(): Record<string, string> {
  const config = getConfig();

  const maskSecret = (value?: string): string => {
    if (!value) return '<not-set>';
    if (value.length <= 4) return '****';
    return '****' + value.slice(-4);
  };

  return {
    // Salesforce (username visible, secrets masked)
    SF_LOGIN_URL: config.SF_LOGIN_URL,
    SF_USERNAME: config.SF_USERNAME,
    SF_PASSWORD: maskSecret(config.SF_PASSWORD),
    SF_TOKEN: maskSecret(config.SF_TOKEN),

    // Glassix (URL visible, secrets masked)
    GLASSIX_BASE_URL: config.GLASSIX_BASE_URL,
    GLASSIX_API_KEY: maskSecret(config.GLASSIX_API_KEY),
    GLASSIX_API_SECRET: maskSecret(config.GLASSIX_API_SECRET),
    GLASSIX_API_MODE: config.GLASSIX_API_MODE,
    GLASSIX_TIMEOUT_MS: String(config.GLASSIX_TIMEOUT_MS),

    // Security
    SAFE_MODE_STRICT: String(config.SAFE_MODE_STRICT),
    ALLOW_LEGACY_BEARER: String(config.ALLOW_LEGACY_BEARER),
    USE_ACCESS_TOKEN_FLOW: String(USE_ACCESS_TOKEN_FLOW),

    // Application
    TASKS_QUERY_LIMIT: String(config.TASKS_QUERY_LIMIT),
    TASK_CUSTOM_PHONE_FIELD: config.TASK_CUSTOM_PHONE_FIELD,
    XSLX_MAPPING_PATH: config.XSLX_MAPPING_PATH,
    XSLX_SHEET: config.XSLX_SHEET || '<default>',
    DEFAULT_LANG: config.DEFAULT_LANG,
    LOG_LEVEL: config.LOG_LEVEL,
    KEEP_READY_ON_FAIL: String(config.KEEP_READY_ON_FAIL),
    PERMIT_LANDLINES: String(config.PERMIT_LANDLINES),
    PAGED: String(config.PAGED),

    // Phone Validation
    PHONE_STRICT_VALIDATION: String(config.PHONE_STRICT_VALIDATION),
    DEFAULT_REGION: config.DEFAULT_REGION,

    // Retry
    RETRY_ATTEMPTS: String(config.RETRY_ATTEMPTS),
    RETRY_BASE_MS: String(config.RETRY_BASE_MS),

    // Metrics
    METRICS_ENABLED: String(config.METRICS_ENABLED),
    METRICS_PORT: String(config.METRICS_PORT),
  };
}
