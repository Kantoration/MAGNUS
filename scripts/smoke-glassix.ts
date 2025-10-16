#!/usr/bin/env ts-node

/**
 * Glassix Smoke Test
 * 
 * One-off manual test to verify:
 * - Glassix authentication works
 * - Approved templates can be fetched
 * - Template WhatsApp message can be sent to test number
 * 
 * Usage: TEST_E164=+9725XXXXXXX npm run smoke:glassix
 */

import { getLogger } from '../src/logger.js';
import { getApprovedTemplates, sendWhatsApp } from '../src/glassix.js';
import { getConfig } from '../src/config.js';
import { mask } from '../src/phone.js';

const logger = getLogger();

interface SmokeTestResult {
  success: boolean;
  messageId?: string;
  conversationUrl?: string;
  templateUsed?: string;
  error?: string;
}

async function runSmokeTest(): Promise<SmokeTestResult> {
  const testNumber = process.env.TEST_E164;
  
  if (!testNumber) {
    throw new Error('TEST_E164 environment variable is required (e.g., TEST_E164=+972501234567)');
  }

  logger.info({ testNumber: mask(testNumber) }, 'Starting Glassix smoke test');

  try {
    // Step 1: Fetch approved templates
    logger.info('Fetching approved templates from Glassix...');
    const templates = await getApprovedTemplates();
    
    if (templates.length === 0) {
      throw new Error('No approved templates found in Glassix');
    }

    logger.info({ count: templates.length }, 'Retrieved approved templates');

    // Step 2: Select a template (prefer known ones, fallback to first)
    const knownTemplates = ['NEW_PHONE_READY', 'WELCOME_MESSAGE', 'PAYMENT_REMINDER'];
    let selectedTemplate = templates.find(t => knownTemplates.includes(t.name));
    
    if (!selectedTemplate) {
      selectedTemplate = templates[0];
      logger.info({ templateName: selectedTemplate.name }, 'Using first available template');
    } else {
      logger.info({ templateName: selectedTemplate.name }, 'Using known template');
    }

    // Step 3: Prepare realistic test variables
    const config = getConfig();
    const language = selectedTemplate.language || config.DEFAULT_LANG || 'he';
    
    const testVariables = {
      first_name: 'Test User',
      device_model: 'Test Device',
      date: new Date().toLocaleDateString('he-IL'),
      link: 'https://magnus.com/test',
      amount: '100',
      time: new Date().toLocaleTimeString('he-IL'),
      location: 'Test Location'
    };

    logger.info(
      { 
        templateName: selectedTemplate.name,
        language,
        variables: Object.keys(testVariables)
      }, 
      'Sending template message'
    );

    // Step 4: Send template message
    const sendResult = await sendWhatsApp({
      toE164: testNumber,
      idemKey: `smoke-test-${Date.now()}`,
      templateId: selectedTemplate.name,
      variables: testVariables,
      language,
      customerName: 'Test User',
      subject: `Smoke Test: ${selectedTemplate.name}`,
    });

    logger.info(
      {
        messageId: sendResult.providerId,
        conversationUrl: sendResult.conversationUrl,
        templateName: selectedTemplate.name
      },
      'Template message sent successfully'
    );

    return {
      success: true,
      messageId: sendResult.providerId,
      conversationUrl: sendResult.conversationUrl,
      templateUsed: selectedTemplate.name,
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg }, 'Smoke test failed');
    
    return {
      success: false,
      error: errorMsg,
    };
  }
}

async function main(): Promise<void> {
  try {
    const result = await runSmokeTest();
    
    if (result.success) {
      console.log('\n✅ Smoke test done. Check WhatsApp & Glassix link above.');
      console.log(`📱 Message ID: ${result.messageId}`);
      console.log(`🔗 Conversation: ${result.conversationUrl}`);
      console.log(`📝 Template: ${result.templateUsed}`);
    } else {
      console.log('\n❌ Smoke test failed');
      console.log(`Error: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
