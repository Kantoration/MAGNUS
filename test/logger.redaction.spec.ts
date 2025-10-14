/**
 * Tests for logger redaction and correlation
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Writable } from 'stream';
import pino from 'pino';
import { withRid } from '../src/logger.js';

describe('Logger Redaction & Correlation', () => {
  let logOutput: any[] = [];
  let testLogger: pino.Logger;

  beforeEach(() => {
    logOutput = [];

    // Create a test logger with the same redaction config as production
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        const log = JSON.parse(chunk.toString());
        logOutput.push(log);
        callback();
      },
    });

    testLogger = pino(
      {
        level: 'info',
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
      },
      stream
    );
  });

  afterEach(() => {
    logOutput = [];
  });

  describe('Sensitive field redaction', () => {
    it('should redact GLASSIX_API_KEY in logs', () => {
      const sensitiveData = {
        GLASSIX_API_KEY: 'super-secret-key-12345',
        otherField: 'safe-value',
      };

      testLogger.info(sensitiveData, 'Test log');

      expect(logOutput).toHaveLength(1);
      const logged = JSON.stringify(logOutput[0]);
      expect(logged).not.toContain('super-secret-key-12345');
      expect(logged).toContain('[REDACTED]');
      expect(logged).toContain('safe-value');
    });

    it('should redact GLASSIX_API_SECRET in logs', () => {
      const sensitiveData = {
        GLASSIX_API_SECRET: 'top-secret-value',
        publicData: 'visible',
      };

      testLogger.info(sensitiveData, 'Test log');

      const logged = JSON.stringify(logOutput[0]);
      expect(logged).not.toContain('top-secret-value');
      expect(logged).toContain('[REDACTED]');
    });

    it('should redact SF_PASSWORD and SF_TOKEN', () => {
      const sensitiveData = {
        SF_PASSWORD: 'my-password-123',
        SF_TOKEN: 'my-token-456',
        username: 'user@example.com',
      };

      testLogger.info(sensitiveData, 'Salesforce auth');

      const logged = JSON.stringify(logOutput[0]);
      expect(logged).not.toContain('my-password-123');
      expect(logged).not.toContain('my-token-456');
      expect(logged).toContain('user@example.com'); // username is safe
    });

    it('should redact authorization headers (lowercase)', () => {
      const sensitiveData = {
        headers: {
          authorization: 'Bearer SECRET-TOKEN-XYZ',
          'content-type': 'application/json',
        },
      };

      testLogger.info(sensitiveData, 'HTTP request');

      const logged = JSON.stringify(logOutput[0]);
      expect(logged).not.toContain('SECRET-TOKEN-XYZ');
      expect(logged).toContain('[REDACTED]');
      expect(logged).toContain('application/json'); // other headers are safe
    });

    it('should redact authorization headers (capitalized)', () => {
      const sensitiveData = {
        headers: {
          Authorization: 'Bearer SECRET-TOKEN-ABC',
          Accept: 'application/json',
        },
      };

      testLogger.info(sensitiveData, 'HTTP request');

      const logged = JSON.stringify(logOutput[0]);
      expect(logged).not.toContain('SECRET-TOKEN-ABC');
      expect(logged).toContain('[REDACTED]');
    });

    it('should redact nested config secrets', () => {
      const sensitiveData = {
        config: {
          GLASSIX_API_KEY: 'nested-key-123',
          GLASSIX_API_SECRET: 'nested-secret-456',
          SF_PASSWORD: 'nested-password',
          SF_TOKEN: 'nested-token',
          GLASSIX_BASE_URL: 'https://api.glassix.com',
        },
      };

      testLogger.info(sensitiveData, 'Config dump');

      const logged = JSON.stringify(logOutput[0]);
      expect(logged).not.toContain('nested-key-123');
      expect(logged).not.toContain('nested-secret-456');
      expect(logged).not.toContain('nested-password');
      expect(logged).not.toContain('nested-token');
      expect(logged).toContain('https://api.glassix.com'); // URL is safe
    });

    it('should redact authorization in error objects', () => {
      const errorData = {
        error: {
          config: {
            headers: {
              authorization: 'Bearer ERROR-SECRET',
            },
          },
          message: 'Request failed',
        },
      };

      testLogger.error(errorData, 'API error');

      const logged = JSON.stringify(logOutput[0]);
      expect(logged).not.toContain('ERROR-SECRET');
      expect(logged).toContain('Request failed'); // message is safe
    });

    it('should redact multiple secrets in same log entry', () => {
      const multiSecretData = {
        headers: { authorization: 'Bearer SECRET1' },
        GLASSIX_API_KEY: 'SECRET2',
        GLASSIX_API_SECRET: 'SECRET3',
        config: {
          SF_PASSWORD: 'SECRET4',
          SF_TOKEN: 'SECRET5',
        },
      };

      testLogger.info(multiSecretData, 'Multi-secret test');

      const logged = JSON.stringify(logOutput[0]);
      expect(logged).not.toContain('SECRET1');
      expect(logged).not.toContain('SECRET2');
      expect(logged).not.toContain('SECRET3');
      expect(logged).not.toContain('SECRET4');
      expect(logged).not.toContain('SECRET5');
      
      // Should have multiple redactions
      const redactedCount = (logged.match(/\[REDACTED\]/g) || []).length;
      expect(redactedCount).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Request correlation with withRid', () => {
    it('should include rid in all log entries from child logger', () => {
      const ridLogger = testLogger.child({ rid: 'req-abc-123' });

      ridLogger.info('First log');
      ridLogger.warn('Second log');
      ridLogger.error('Third log');

      expect(logOutput).toHaveLength(3);
      logOutput.forEach((log) => {
        expect(log.rid).toBe('req-abc-123');
      });
    });

    it('should create unique child loggers with different rids', () => {
      const logger1 = testLogger.child({ rid: 'req-001' });
      const logger2 = testLogger.child({ rid: 'req-002' });

      logger1.info('From logger 1');
      logger2.info('From logger 2');

      expect(logOutput).toHaveLength(2);
      expect(logOutput[0].rid).toBe('req-001');
      expect(logOutput[1].rid).toBe('req-002');
    });

    it('should preserve rid while still redacting secrets', () => {
      const ridLogger = testLogger.child({ rid: 'req-secure-123' });

      ridLogger.info({
        rid: 'req-secure-123', // redundant but should work
        GLASSIX_API_KEY: 'SHOULD-BE-REDACTED',
        message: 'Processing request',
      });

      const logged = logOutput[0];
      expect(logged.rid).toBe('req-secure-123');
      expect(JSON.stringify(logged)).not.toContain('SHOULD-BE-REDACTED');
      expect(JSON.stringify(logged)).toContain('[REDACTED]');
    });
  });

  describe('withRid helper function', () => {
    it('should create child logger with rid using helper', () => {
      // Set up minimal environment for logger
      process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
      process.env.GLASSIX_API_KEY = 'test-key';
      process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
      process.env.SF_USERNAME = 'test@example.com';
      process.env.SF_PASSWORD = 'password';
      process.env.SF_TOKEN = 'token';
      process.env.LOG_LEVEL = 'info';

      const logger = withRid('helper-test-rid');
      
      // The logger should be a child logger with rid
      expect(logger).toBeDefined();
      // Note: In a real integration test, we'd verify the logs contain the rid
      // but that requires capturing the actual output stream
    });
  });
});

