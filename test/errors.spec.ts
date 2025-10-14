/**
 * Tests for typed error classes and error handler
 */
import { describe, it, expect } from 'vitest';
import {
  AutoMessagerError,
  ConfigError,
  NetworkError,
  UpstreamError,
  ValidationError,
  SanitizationError,
  PhoneError,
  TemplateError,
} from '../src/errors.js';
import { printHuman, getRecommendedAction, mapAxiosToUpstream } from '../src/error-handler.js';

describe('Typed Errors', () => {
  describe('Error Classes', () => {
    it('should create ConfigError with hint', () => {
      const error = new ConfigError('Missing field');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.message).toBe('Missing field');
      expect(error.hint).toBe('Run: automessager init');
    });

    it('should create UpstreamError with provider info', () => {
      const error = new UpstreamError('API failed', 'glassix', 401, false);
      expect(error.code).toBe('UPSTREAM_ERROR');
      expect(error.provider).toBe('glassix');
      expect(error.status).toBe(401);
      expect(error.retryable).toBe(false);
      expect(error.hint).toContain('Glassix');
    });

    it('should create ValidationError with details', () => {
      const error = new ValidationError('Invalid data', ['Field1 missing', 'Field2 invalid']);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.details).toHaveLength(2);
    });

    it('should create TemplateError with template key', () => {
      const error = new TemplateError('Template not found', 'NEW_PHONE');
      expect(error.code).toBe('TEMPLATE_ERROR');
      expect(error.templateKey).toBe('NEW_PHONE');
    });

    it('should create PhoneError with phone hint', () => {
      const error = new PhoneError('Invalid format', '+9725******67');
      expect(error.code).toBe('PHONE_ERROR');
      expect(error.phoneHint).toBe('+9725******67');
    });
  });

  describe('printHuman', () => {
    it('should format AutoMessagerError with hint', () => {
      const error = new ConfigError('Missing API key');
      const human = printHuman(error);
      
      expect(human).toContain('[CONFIG_ERROR]');
      expect(human).toContain('Missing API key');
      expect(human).toContain('Hint:');
    });

    it('should format UpstreamError with humanized message', () => {
      const error = new UpstreamError('Auth failed', 'salesforce', 401, false);
      const human = printHuman(error);
      
      expect(human).toContain('[UPSTREAM_ERROR]');
      expect(human).toContain('Salesforce');
    });

    it('should format ValidationError with details', () => {
      const error = new ValidationError('Bad data', ['Error 1', 'Error 2', 'Error 3', 'Error 4']);
      const human = printHuman(error);
      
      expect(human).toContain('[VALIDATION_ERROR]');
      expect(human).toContain('Details:');
      // Should show first 3 details only
      expect(human).toContain('Error 1');
      expect(human).toContain('Error 2');
      expect(human).toContain('Error 3');
    });

    it('should format generic Error', () => {
      const error = new Error('Something went wrong');
      const human = printHuman(error);
      
      expect(human).toContain('Error:');
      expect(human).toContain('Something went wrong');
    });

    it('should truncate to 300 chars max', () => {
      const longMessage = 'x'.repeat(500);
      const error = new Error(longMessage);
      const human = printHuman(error);
      
      expect(human.length).toBeLessThanOrEqual(300);
    });
  });

  describe('getRecommendedAction', () => {
    it('should recommend actions for ConfigError', () => {
      const error = new ConfigError('Missing field');
      const actions = getRecommendedAction(error);
      
      expect(actions).toContain('Run: automessager init');
      expect(actions.length).toBeGreaterThan(0);
    });

    it('should recommend actions for UpstreamError (Salesforce)', () => {
      const error = new UpstreamError('SF failed', 'salesforce', 401);
      const actions = getRecommendedAction(error);
      
      expect(actions).toContain('Run: automessager verify');
      expect(actions.some((a) => a.includes('Salesforce'))).toBe(true);
    });

    it('should recommend actions for UpstreamError (Glassix)', () => {
      const error = new UpstreamError('GX failed', 'glassix', 403);
      const actions = getRecommendedAction(error);
      
      expect(actions).toContain('Run: automessager doctor');
      expect(actions.some((a) => a.includes('Glassix'))).toBe(true);
    });

    it('should recommend actions for TemplateError', () => {
      const error = new TemplateError('Not found', 'UNKNOWN');
      const actions = getRecommendedAction(error);
      
      expect(actions).toContain('Run: automessager verify:mapping');
    });

    it('should recommend actions for PhoneError', () => {
      const error = new PhoneError('Invalid format');
      const actions = getRecommendedAction(error);
      
      expect(actions.some((a) => a.includes('phone number'))).toBe(true);
    });
  });

  describe('mapAxiosToUpstream', () => {
    it('should map axios error to UpstreamError', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          data: { message: 'Rate limit exceeded' },
        },
      };

      const result = mapAxiosToUpstream(axiosError, 'glassix');
      
      expect(result).toBeInstanceOf(UpstreamError);
      expect(result.provider).toBe('glassix');
      expect(result.status).toBe(429);
      expect(result.retryable).toBe(true); // 429 is retryable
    });

    it('should mark non-retryable statuses', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 400,
          statusText: 'Bad Request',
          data: 'Invalid',
        },
      };

      const result = mapAxiosToUpstream(axiosError, 'salesforce');
      
      expect(result.retryable).toBe(false); // 400 not retryable
      expect(result.provider).toBe('salesforce');
    });
  });
});

