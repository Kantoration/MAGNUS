/**
 * Environment configuration with Zod validation
 */
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const configSchema = z.object({
  // Salesforce
  SF_LOGIN_URL: z.string().url(),
  SF_USERNAME: z.string().email(),
  SF_PASSWORD: z.string().min(1),
  SF_TOKEN: z.string().min(1),

  // Glassix
  GLASSIX_BASE_URL: z.string().url(),
  GLASSIX_API_KEY: z.string().min(1),
  GLASSIX_API_MODE: z.enum(['messages', 'protocols']).default('messages'),
  RETRY_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
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
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Configuration validation failed:');
    console.error(result.error.format());
    throw new Error('Invalid environment configuration');
  }

  cachedConfig = result.data;
  return cachedConfig;
}

/**
 * Clear config cache (for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
