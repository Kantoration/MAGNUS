/**
 * Pino logger instance (singleton) with PII redaction
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
    // Redact sensitive fields
    redact: {
      paths: [
        'GLASSIX_API_KEY',
        'SF_PASSWORD',
        'SF_TOKEN',
        'headers.authorization',
        'headers.Authorization',
        'config.GLASSIX_API_KEY',
        'config.SF_PASSWORD',
        'config.SF_TOKEN',
        'password',
        'token',
        'apiKey',
        'api_key',
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
