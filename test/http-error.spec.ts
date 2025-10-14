/**
 * Tests for centralized HTTP error handling utilities
 */
import { describe, it, expect } from 'vitest';
import { buildSafeAxiosError, isRetryableStatus, calculateBackoff } from '../src/http-error.js';
import axios, { AxiosError } from 'axios';

describe('HTTP Error Utilities', () => {
  describe('buildSafeAxiosError', () => {
    it('should handle non-Axios errors', () => {
      const error = new Error('Generic error');
      const result = buildSafeAxiosError(error);
      
      expect(result).toBe('Generic error');
    });

    it('should extract status and message from Axios error', () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 400,
          statusText: 'Bad Request',
          data: { message: 'Invalid input' },
        },
        message: 'Request failed',
      } as AxiosError;

      // Mock axios.isAxiosError
      const originalIsAxiosError = axios.isAxiosError;
      axios.isAxiosError = (payload: any): payload is AxiosError => payload?.isAxiosError === true;

      const result = buildSafeAxiosError(mockError);
      
      expect(result).toContain('400');
      expect(result).toContain('Bad Request');
      expect(result).toContain('Invalid input');

      // Restore original
      axios.isAxiosError = originalIsAxiosError;
    });

    it('should redact authorization headers - various formats', () => {
      const testCases = [
        // Case 1: Standard format with double quotes
        { data: 'authorization: "Bearer secret123"', secret: 'secret123' },
        // Case 2: With optional quote in key (JSON-like)
        { data: '"authorization": "abc123xyz"', secret: 'abc123xyz' },
        // Case 3: Single quotes
        { data: "authorization: 'token456'", secret: 'token456' },
        // Case 4: Mixed case (should be case-insensitive)
        { data: 'Authorization: "SECRET789"', secret: 'SECRET789' },
        // Case 5: Authorization header with Bearer prefix
        { data: 'Authorization: Bearer mysecrettoken', secret: 'mysecrettoken' },
        // Case 6: No quotes
        { data: 'authorization:"key123"', secret: 'key123' },
      ];

      const originalIsAxiosError = axios.isAxiosError;
      axios.isAxiosError = (payload: any): payload is AxiosError => payload?.isAxiosError === true;

      testCases.forEach(({ data, secret }, index) => {
        const mockError = {
          isAxiosError: true,
          response: {
            status: 401,
            statusText: 'Unauthorized',
            data,
          },
        } as AxiosError;

        const result = buildSafeAxiosError(mockError);
        
        expect(result, `Test case ${index + 1} should not contain secret`).not.toContain(secret);
        expect(result, `Test case ${index + 1} should contain [REDACTED]`).toContain('[REDACTED]');
      });

      axios.isAxiosError = originalIsAxiosError;
    });

    it('should redact Bearer tokens', () => {
      const errorMsg = 'Request failed with Bearer abc123xyz456';
      const mockError = {
        isAxiosError: true,
        response: {
          status: 403,
          statusText: 'Forbidden',
          data: errorMsg,
        },
      } as AxiosError;

      const originalIsAxiosError = axios.isAxiosError;
      axios.isAxiosError = (payload: any): payload is AxiosError => payload?.isAxiosError === true;

      const result = buildSafeAxiosError(mockError);
      
      expect(result).not.toContain('abc123xyz456');
      expect(result).toContain('Bearer [REDACTED]');

      axios.isAxiosError = originalIsAxiosError;
    });

    it('should redact API keys and secrets - various formats', () => {
      const testCases = [
        // JSON format with quotes
        { data: '{"apiKey": "secret123"}', secret: 'secret123' },
        { data: '{"api_key": "key456"}', secret: 'key456' },
        { data: '{"apiSecret": "mysecret"}', secret: 'mysecret' },
        { data: '{"api_secret": "topsecret"}', secret: 'topsecret' },
        // Without quotes around key
        { data: 'apiKey: "value789"', secret: 'value789' },
        { data: 'api_key: "abc123"', secret: 'abc123' },
        // Case variations
        { data: '{"API_KEY": "CAPSKEY"}', secret: 'CAPSKEY' },
        { data: 'API_SECRET="secret"', secret: 'secret' },
        // Query string format
        { data: 'error?api_key=qwerty123&other=param', secret: 'qwerty123' },
      ];

      const originalIsAxiosError = axios.isAxiosError;
      axios.isAxiosError = (payload: any): payload is AxiosError => payload?.isAxiosError === true;

      testCases.forEach(({ data, secret }, index) => {
        const mockError = {
          isAxiosError: true,
          response: {
            status: 401,
            statusText: 'Unauthorized',
            data,
          },
        } as AxiosError;

        const result = buildSafeAxiosError(mockError);
        
        expect(result, `Test case ${index + 1} should not contain secret: ${secret}`).not.toContain(secret);
        expect(result, `Test case ${index + 1} should contain [REDACTED]`).toContain('[REDACTED]');
      });

      axios.isAxiosError = originalIsAxiosError;
    });

    it('should truncate long error messages', () => {
      const longMessage = 'x'.repeat(600);
      const mockError = {
        isAxiosError: true,
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: longMessage,
        },
      } as AxiosError;

      const originalIsAxiosError = axios.isAxiosError;
      axios.isAxiosError = (payload: any): payload is AxiosError => payload?.isAxiosError === true;

      const result = buildSafeAxiosError(mockError);
      
      expect(result.length).toBeLessThanOrEqual(520); // 500 + '… (truncated)'
      expect(result).toContain('(truncated)');

      axios.isAxiosError = originalIsAxiosError;
    });
  });

  describe('isRetryableStatus', () => {
    it('should return true for retryable status codes', () => {
      expect(isRetryableStatus(429)).toBe(true); // Too Many Requests
      expect(isRetryableStatus(502)).toBe(true); // Bad Gateway
      expect(isRetryableStatus(503)).toBe(true); // Service Unavailable
      expect(isRetryableStatus(504)).toBe(true); // Gateway Timeout
    });

    it('should return false for non-retryable status codes', () => {
      expect(isRetryableStatus(400)).toBe(false); // Bad Request
      expect(isRetryableStatus(401)).toBe(false); // Unauthorized
      expect(isRetryableStatus(403)).toBe(false); // Forbidden
      expect(isRetryableStatus(404)).toBe(false); // Not Found
      expect(isRetryableStatus(500)).toBe(false); // Internal Server Error
    });

    it('should return false for undefined status', () => {
      expect(isRetryableStatus(undefined)).toBe(false);
    });
  });

  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      const baseMs = 300;
      
      // Attempt 1: 300ms + jitter
      const backoff1 = calculateBackoff(1, baseMs);
      expect(backoff1).toBeGreaterThanOrEqual(300);
      expect(backoff1).toBeLessThan(400);
      
      // Attempt 2: 600ms + jitter
      const backoff2 = calculateBackoff(2, baseMs);
      expect(backoff2).toBeGreaterThanOrEqual(600);
      expect(backoff2).toBeLessThan(700);
      
      // Attempt 3: 1200ms + jitter
      const backoff3 = calculateBackoff(3, baseMs);
      expect(backoff3).toBeGreaterThanOrEqual(1200);
      expect(backoff3).toBeLessThan(1300);
    });

    it('should add jitter in range [0, 100] ms', () => {
      const baseMs = 300;
      const results: number[] = [];
      const jitters: number[] = [];
      
      // Generate 20 backoff values to ensure good coverage
      for (let i = 0; i < 20; i++) {
        const result = calculateBackoff(1, baseMs);
        results.push(result);
        
        // Extract jitter: result = base * 2^(attempt-1) + jitter
        // For attempt=1: result = 300 + jitter
        const jitter = result - 300;
        jitters.push(jitter);
      }
      
      // All results should be in range [baseMs, baseMs + 100)
      results.forEach((result, index) => {
        expect(result, `Result ${index + 1} should be >= ${baseMs}`).toBeGreaterThanOrEqual(baseMs);
        expect(result, `Result ${index + 1} should be < ${baseMs + 100}`).toBeLessThan(baseMs + 100);
      });
      
      // All jitters should be in range [0, 100)
      jitters.forEach((jitter, index) => {
        expect(jitter, `Jitter ${index + 1} should be >= 0`).toBeGreaterThanOrEqual(0);
        expect(jitter, `Jitter ${index + 1} should be < 100`).toBeLessThan(100);
      });
      
      // Should have variance (not all the same)
      const unique = new Set(results);
      expect(unique.size, 'Should have multiple unique backoff values').toBeGreaterThan(1);
    });
  });
});

