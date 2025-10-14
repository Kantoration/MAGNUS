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

    it('should redact authorization headers', () => {
      const mockError = {
        isAxiosError: true,
        response: {
          status: 401,
          statusText: 'Unauthorized',
          data: 'authorization: "Bearer secret123"',
        },
      } as AxiosError;

      const originalIsAxiosError = axios.isAxiosError;
      axios.isAxiosError = (payload: any): payload is AxiosError => payload?.isAxiosError === true;

      const result = buildSafeAxiosError(mockError);
      
      expect(result).not.toContain('secret123');
      expect(result).toContain('[REDACTED]');

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

    it('should add jitter between 0-100ms', () => {
      const baseMs = 300;
      const results: number[] = [];
      
      // Generate 10 backoff values
      for (let i = 0; i < 10; i++) {
        results.push(calculateBackoff(1, baseMs));
      }
      
      // All should be in range [300, 400)
      results.forEach((result) => {
        expect(result).toBeGreaterThanOrEqual(300);
        expect(result).toBeLessThan(400);
      });
      
      // Should have variance (not all the same)
      const unique = new Set(results);
      expect(unique.size).toBeGreaterThan(1);
    });
  });
});

