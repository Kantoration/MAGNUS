/**
 * Glassix End-to-End Tests
 * 
 * Tests the complete flow:
 * - Template fetching from Glassix
 * - Template matching with sample messages
 * - Template message sending (if TEST_E164 provided)
 * 
 * Skips entire suite if GLASSIX_BASE_URL is missing
 * Usage: GLASSIX_BASE_URL=... TEST_E164=+9725XXXXXXX npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getApprovedTemplates, sendWhatsApp } from '../src/glassix.js';
import { findBestTemplateMatch, rankTemplates } from '../src/template-matcher.js';
import { getConfig } from '../src/config.js';
import { mask } from '../src/phone.js';

const logger = console; // Use console for test logs

// Test configuration
const TEST_E164 = process.env.TEST_E164;
const GLASSIX_BASE_URL = process.env.GLASSIX_BASE_URL;
const SKIP_E2E = !GLASSIX_BASE_URL;

describe('Glassix E2E Tests', () => {
  beforeAll(async () => {
    if (SKIP_E2E) {
      logger.log('⚠️  Skipping E2E tests: GLASSIX_BASE_URL not set');
      return;
    }
    
    logger.log('🧪 Starting Glassix E2E tests');
    logger.log(`📞 Test number: ${TEST_E164 ? mask(TEST_E164) : 'Not provided'}`);
  });

  afterAll(async () => {
    if (!SKIP_E2E) {
      logger.log('✅ Glassix E2E tests completed');
    }
  });

  describe('Template Fetching', () => {
    it('should fetch approved templates from Glassix', async () => {
      if (SKIP_E2E) {
        expect(true).toBe(true); // Skip test
        return;
      }

      // Set generous timeout for network operations
      const templates = await getApprovedTemplates();
      
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      
      // Verify template structure
      const firstTemplate = templates[0];
      expect(firstTemplate).toHaveProperty('id');
      expect(firstTemplate).toHaveProperty('name');
      expect(firstTemplate).toHaveProperty('content');
      expect(firstTemplate).toHaveProperty('language');
      expect(firstTemplate).toHaveProperty('status');
      expect(firstTemplate.status).toBe('APPROVED');
      
      logger.log(`✅ Fetched ${templates.length} approved templates`);
    }, 30000);
  });

  describe('Template Matching', () => {
    it('should match Hebrew NEW_PHONE content to a template', async () => {
      if (SKIP_E2E) {
        expect(true).toBe(true); // Skip test
        return;
      }

      // Sample Hebrew message that should match a device-ready template
      const sampleMessage = 'שלום דניאל! המכשיר S24 מוכן לאיסוף. תאריך: 14/10/2025';
      const taskKey = 'NEW_PHONE_READY';
      
      const match = await findBestTemplateMatch(sampleMessage, taskKey);
      
      expect(match).not.toBeNull();
      expect(match!.score).toBeGreaterThanOrEqual(0.6);
      expect(match!.confidence).toMatch(/^(HIGH|MEDIUM|LOW)$/);
      expect(match!.template.status).toBe('APPROVED');
      
      logger.log(`✅ Matched template: ${match!.template.name} (${match!.confidence}, score: ${match!.score.toFixed(2)})`);
      logger.log(`📝 Reason: ${match!.reason}`);
    }, 30000);

    it('should rank templates by similarity for debugging', async () => {
      if (SKIP_E2E) {
        expect(true).toBe(true); // Skip test
        return;
      }

      const sampleMessage = 'שלום יוסי! יש לך חוב של 150 שקל לתשלום';
      const taskKey = 'PAYMENT_REMINDER';
      
      const ranked = await rankTemplates(sampleMessage, taskKey);
      
      expect(Array.isArray(ranked)).toBe(true);
      expect(ranked.length).toBeGreaterThan(0);
      
      // Verify ranking is sorted by score (descending)
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i-1].score).toBeGreaterThanOrEqual(ranked[i].score);
      }
      
      logger.log(`✅ Ranked ${ranked.length} templates by similarity`);
      logger.log(`🏆 Top match: ${ranked[0].template.name} (score: ${ranked[0].score.toFixed(2)})`);
    }, 30000);
  });

  describe('Template Message Sending', () => {
    it('should send template message to test number', async () => {
      if (SKIP_E2E || !TEST_E164) {
        logger.log('⚠️  Skipping send test: TEST_E164 not provided');
        expect(true).toBe(true); // Skip test
        return;
      }

      // Get templates first
      const templates = await getApprovedTemplates();
      expect(templates.length).toBeGreaterThan(0);
      
      // Use first available template
      const template = templates[0];
      const config = getConfig();
      const language = template.language || config.DEFAULT_LANG || 'he';
      
      // Minimal test variables
      const testVariables = {
        first_name: 'Test User',
        device_model: 'Test Device',
        date: new Date().toLocaleDateString('he-IL'),
      };
      
      logger.log(`📤 Sending template "${template.name}" to ${mask(TEST_E164)}`);
      
      const sendResult = await sendWhatsApp({
        toE164: TEST_E164,
        idemKey: `e2e-test-${Date.now()}`,
        templateId: template.name,
        variables: testVariables,
        language,
        customerName: 'E2E Test User',
        subject: `E2E Test: ${template.name}`,
      });
      
      expect(sendResult).toHaveProperty('providerId');
      expect(sendResult.providerId).toBeTruthy();
      
      logger.log(`✅ Message sent successfully`);
      logger.log(`📱 Message ID: ${sendResult.providerId}`);
      if (sendResult.conversationUrl) {
        logger.log(`🔗 Conversation: ${sendResult.conversationUrl}`);
      }
    }, 30000);
  });

  describe('Error Handling', () => {
    it('should handle invalid template gracefully', async () => {
      if (SKIP_E2E) {
        expect(true).toBe(true); // Skip test
        return;
      }

      // Test with a message that should not match any template well
      const invalidMessage = 'xyz abc def ghi jkl mno pqr stu vwx yz';
      const taskKey = 'INVALID_TASK';
      
      const match = await findBestTemplateMatch(invalidMessage, taskKey);
      
      // Should return null for very poor matches
      expect(match).toBeNull();
      
      logger.log('✅ Correctly handled invalid template match');
    }, 30000);
  });
});
