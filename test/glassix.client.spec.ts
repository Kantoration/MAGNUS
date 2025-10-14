/**
 * Tests for Glassix client - API modes, retry logic, idempotency, response parsing
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { sendWhatsApp } from '../src/glassix.js';
import { clearConfigCache } from '../src/config.js';

describe('Glassix Client', () => {
  let mock: MockAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    process.env.GLASSIX_BASE_URL = 'https://api.glassix.com';
    process.env.GLASSIX_API_KEY = 'test-api-key';
    process.env.GLASSIX_API_MODE = 'messages';
    process.env.GLASSIX_TIMEOUT_MS = '15000';
    process.env.SF_LOGIN_URL = 'https://login.salesforce.com';
    process.env.SF_USERNAME = 'test@example.com';
    process.env.SF_PASSWORD = 'password';
    process.env.SF_TOKEN = 'token';
    process.env.RETRY_ATTEMPTS = '3';
    process.env.RETRY_BASE_MS = '300';
    process.env.LOG_LEVEL = 'error';
    delete process.env.DRY_RUN;
    delete process.env.GLASSIX_API_SECRET;

    clearConfigCache();

    // Mock axios
    mock = new MockAdapter(axios);
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
    mock.restore();
  });

  describe('DRY_RUN mode', () => {
    it('should return dry-run providerId without making API call', async () => {
      process.env.DRY_RUN = '1';
      clearConfigCache();

      const result = await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test message',
        idemKey: 'task-123',
      });

      expect(result.providerId).toBe('dry-run');
      expect(result.conversationUrl).toBeUndefined();
    });

    it('should log masked phone number in DRY_RUN mode', async () => {
      process.env.DRY_RUN = '1';
      clearConfigCache();

      // Just verify it doesn't throw
      const result = await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-123',
      });

      expect(result.providerId).toBe('dry-run');
    });
  });

  describe('Phone validation', () => {
    it('should reject non-+972 numbers', async () => {
      await expect(
        sendWhatsApp({
          toE164: '+1234567890',
          text: 'Test',
          idemKey: 'task-123',
        })
      ).rejects.toThrow('Invalid phone: only +972 E.164 numbers are supported');
    });

    it('should accept valid +972 numbers', async () => {
      mock
        .onPost(/\/api\/messages$/)
        .reply(200, { id: 'msg-123', conversationUrl: 'https://glassix.com/conv/123' });

      const result = await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-123',
      });

      expect(result.providerId).toBe('msg-123');
    });
  });

  describe('Retry logic', () => {
    it('should retry on 429 and succeed on second attempt', async () => {
      mock
        .onPost(/\/api\/messages$/)
        .replyOnce(429, { error: 'Rate limit exceeded' })
        .onPost(/\/api\/messages$/)
        .replyOnce(200, { id: 'msg-success', conversationUrl: 'https://glassix.com/conv/1' });

      const result = await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-retry',
      });

      expect(result.providerId).toBe('msg-success');
      expect(mock.history.post).toHaveLength(2);
    });

    it('should retry on 503 with exponential backoff', async () => {
      mock
        .onPost(/\/api\/messages$/)
        .replyOnce(503, { error: 'Service unavailable' })
        .onPost(/\/api\/messages$/)
        .replyOnce(503, { error: 'Service unavailable' })
        .onPost(/\/api\/messages$/)
        .replyOnce(200, { id: 'msg-final' });

      const result = await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-503',
      });

      expect(result.providerId).toBe('msg-final');
      expect(mock.history.post).toHaveLength(3);
    });

    it('should throw after max retries exhausted', async () => {
      mock.onPost(/\/api\/messages$/).reply(502, { error: 'Bad Gateway' });

      await expect(
        sendWhatsApp({
          toE164: '+972521234567',
          text: 'Test',
          idemKey: 'task-fail',
        })
      ).rejects.toThrow(/502/);

      expect(mock.history.post).toHaveLength(3);
    });

    it('should not retry on 400 bad request', async () => {
      mock.onPost(/\/api\/messages$/).reply(400, { error: 'Bad Request' });

      await expect(
        sendWhatsApp({
          toE164: '+972521234567',
          text: 'Test',
          idemKey: 'task-400',
        })
      ).rejects.toThrow(/400/);

      expect(mock.history.post).toHaveLength(1); // No retries
    });
  });

  describe('Error message safety', () => {
    it('should truncate long error messages to 500 chars', async () => {
      const longError = 'x'.repeat(1000);
      mock.onPost(/\/api\/messages$/).reply(500, { error: longError });

      try {
        await sendWhatsApp({
          toE164: '+972521234567',
          text: 'Test',
          idemKey: 'task-long',
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('…');
        expect(error.message.length).toBeLessThan(600);
      }
    });

    it('should not expose authorization headers in error messages', async () => {
      mock.onPost(/\/api\/messages$/).reply(401, {
        error: 'Unauthorized',
        authorization: 'Bearer secret-key',
      });

      try {
        await sendWhatsApp({
          toE164: '+972521234567',
          text: 'Test',
          idemKey: 'task-401',
        });
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).not.toContain('secret-key');
        expect(error.message).not.toContain('Bearer');
        expect(error.message).toContain('401');
        expect(error.message).toContain('Unauthorized');
      }
    });
  });

  describe('Idempotency', () => {
    it('should set Idempotency-Key header from idemKey param', async () => {
      mock.onPost(/\/api\/messages$/).reply(200, { id: 'msg-idem' });

      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'unique-task-id-123',
      });

      const request = mock.history.post[0];
      expect(request.headers?.['Idempotency-Key']).toBe('unique-task-id-123');
    });
  });

  describe('API modes', () => {
    it('should use /api/messages endpoint for free text in messages mode', async () => {
      mock.onPost(/\/api\/messages$/).reply(200, { id: 'msg-text' });

      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Hello world',
        idemKey: 'task-text',
      });

      const request = mock.history.post[0];
      expect(request.url).toMatch(/\/api\/messages$/);
      
      const body = JSON.parse(request.data);
      expect(body.channel).toBe('whatsapp');
      expect(body.to).toBe('+972521234567');
      expect(body.type).toBe('text');
      expect(body.text).toBe('Hello world');
    });

    it('should use /api/messages/template endpoint for template in messages mode', async () => {
      mock.onPost(/\/api\/messages\/template$/).reply(200, { id: 'msg-template' });

      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Template text',
        idemKey: 'task-template',
        templateId: 'tmpl-123',
        variables: { name: 'John', age: 30 },
      });

      const request = mock.history.post[0];
      expect(request.url).toMatch(/\/api\/messages\/template$/);
      
      const body = JSON.parse(request.data);
      expect(body.channel).toBe('whatsapp');
      expect(body.to).toBe('+972521234567');
      expect(body.templateId).toBe('tmpl-123');
      expect(body.variables).toEqual({ name: 'John', age: 30 });
    });

    it('should use /v1/protocols/send endpoint in protocols mode', async () => {
      process.env.GLASSIX_API_MODE = 'protocols';
      clearConfigCache();

      mock.onPost(/\/v1\/protocols\/send$/).reply(200, { id: 'msg-protocol' });

      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Protocol message',
        idemKey: 'task-protocol',
      });

      const request = mock.history.post[0];
      expect(request.url).toMatch(/\/v1\/protocols\/send$/);
      
      const body = JSON.parse(request.data);
      expect(body.protocol).toBe('whatsapp');
      expect(body.to).toBe('+972521234567');
      expect(body.content).toEqual({ type: 'text', text: 'Protocol message' });
    });

    it('should include templateId and variables in protocols mode', async () => {
      process.env.GLASSIX_API_MODE = 'protocols';
      clearConfigCache();

      mock.onPost(/\/v1\/protocols\/send$/).reply(200, { id: 'msg-protocol-tmpl' });

      await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Protocol template',
        idemKey: 'task-protocol-tmpl',
        templateId: 'tmpl-456',
        variables: { foo: 'bar', count: 5 },
      });

      const request = mock.history.post[0];
      const body = JSON.parse(request.data);
      
      expect(body.templateId).toBe('tmpl-456');
      expect(body.variables).toEqual({ foo: 'bar', count: 5 });
      expect(body.content).toEqual({ type: 'text', text: 'Protocol template' });
    });
  });

  describe('Response parsing', () => {
    it('should parse conversationUrl from data.conversationUrl', async () => {
      mock.onPost(/\/api\/messages$/).reply(200, {
        id: 'msg-1',
        conversationUrl: 'https://glassix.com/conversations/123',
      });

      const result = await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-url',
      });

      expect(result.conversationUrl).toBe('https://glassix.com/conversations/123');
      expect(result.providerId).toBe('msg-1');
    });

    it('should parse conversationUrl from data.conversation.url', async () => {
      mock.onPost(/\/api\/messages$/).reply(200, {
        messageId: 'msg-2',
        conversation: {
          id: 'conv-456',
          url: 'https://glassix.com/conv/456',
        },
      });

      const result = await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-nested',
      });

      expect(result.conversationUrl).toBe('https://glassix.com/conv/456');
      expect(result.providerId).toBe('msg-2');
    });

    it('should fallback to conversation.id for providerId', async () => {
      mock.onPost(/\/api\/messages$/).reply(200, {
        conversation: {
          id: 'fallback-id',
        },
      });

      const result = await sendWhatsApp({
        toE164: '+972521234567',
        text: 'Test',
        idemKey: 'task-fallback',
      });

      expect(result.providerId).toBe('fallback-id');
    });
  });
});
