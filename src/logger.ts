/**
 * Pino logger instance (singleton) with comprehensive PII/secret redaction
 * and request correlation support
 */
import pino from 'pino';
import { getConfig } from './config.js';

let loggerInstance: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (loggerInstance) {
    return loggerInstance;
  }

  const config = getConfig();

  loggerInstance = pino({
    level: config.LOG_LEVEL,
    // Redact sensitive fields comprehensively
    redact: {
      paths: [
        // Glassix secrets
        'GLASSIX_API_KEY',
        'GLASSIX_API_SECRET',
        'config.GLASSIX_API_KEY',
        'config.GLASSIX_API_SECRET',
        // Salesforce secrets
        'SF_PASSWORD',
        'SF_TOKEN',
        'config.SF_PASSWORD',
        'config.SF_TOKEN',
        // HTTP headers (case variations)
        'headers.authorization',
        'headers.Authorization',
        'headers["authorization"]',
        'headers["Authorization"]',
        'req.headers.authorization',
        'req.headers.Authorization',
        'response.headers.authorization',
        'response.headers.Authorization',
        // Generic sensitive fields
        'password',
        'token',
        'apiKey',
        'api_key',
        'secret',
        'bearer',
        // Error objects that might leak auth
        'error.config.headers.authorization',
        'error.config.headers.Authorization',
        'err.config.headers.authorization',
        'err.config.headers.Authorization',
      ],
      censor: '[REDACTED]',
    },
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  });

  return loggerInstance;
}

/**
 * Create a child logger with request correlation ID
 * @param rid Request/correlation ID for tracking
 * @returns Child logger with rid attached to all log entries
 * 
 * @example
 * const log = withRid('req-123');
 * log.info({ userId: 'abc' }, 'Processing user request');
 */
export function withRid(rid: string): pino.Logger {
  const logger = getLogger();
  return logger.child({ rid });
}

/**
 * Default logger instance (singleton)
 */
export const logger = getLogger();
