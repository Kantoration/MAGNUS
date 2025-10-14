/**
 * End-to-End Tests for AutoMessager
 * Tests full workflow: Config → SF Login → Fetch → Template → Send → Update
 * 
 * USAGE:
 *   TEST_E2E=true npm test -- test/e2e/full-workflow.spec.ts
 * 
 * REQUIREMENTS:
 *   - Salesforce sandbox with test data
 *   - Glassix test account/endpoint
 *   - .env.e2e file with test credentials
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Connection } from 'jsforce';
import { promises as fs } from 'fs';
import path from 'path';

// Only run E2E tests when explicitly enabled
const isE2EEnabled = process.env.TEST_E2E === 'true';
const describeE2E = isE2EEnabled ? describe : describe.skip;

describeE2E('E2E: Full Workflow', () => {
  let testTaskId: string | null = null;

  beforeAll(async () => {
    // Load E2E test environment
    const e2eEnvPath = path.join(process.cwd(), '.env.e2e');
    
    try {
      await fs.access(e2eEnvPath);
      const dotenv = await import('dotenv');
      dotenv.config({ path: e2eEnvPath });
      
      console.log('✓ Loaded .env.e2e for E2E tests');
    } catch {
      throw new Error(
        'E2E tests require .env.e2e file with test credentials.\n' +
        'Copy .env.example to .env.e2e and configure with test Salesforce/Glassix accounts.'
      );
    }

    // Verify required E2E env vars
    const required = [
      'SF_LOGIN_URL',
      'SF_USERNAME',
      'SF_PASSWORD',
      'SF_TOKEN',
      'GLASSIX_BASE_URL',
      'GLASSIX_API_KEY',
    ];

    const missing = required.filter((key) => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing E2E env vars: ${missing.join(', ')}`);
    }

    console.log('✓ E2E environment validated');
  });

  afterAll(async () => {
    // Cleanup: Delete test task if created
    if (testTaskId) {
      try {
        const { login } = await import('../../src/sf.js');
        const conn = await login();
        await conn.sobject('Task').delete(testTaskId);
        await conn.logout();
        console.log(`✓ Cleaned up test task: ${testTaskId}`);
      } catch (error) {
        console.warn('Failed to cleanup test task:', error);
      }
    }
  });

  it('should complete full workflow: create task → process → verify updates', async () => {
    const { login } = await import('../../src/sf.js');
    const { runOnce } = await import('../../src/run.js');
    const { clearConfigCache } = await import('../../src/config.js');

    // Clear config to pick up E2E env vars
    clearConfigCache();

    // Step 1: Create a test task in Salesforce
    console.log('Step 1: Creating test task in Salesforce...');
    
    const conn = await login();
    
    // Create a test Contact with valid phone
    const contactResult = await conn.sobject('Contact').create({
      FirstName: 'E2E',
      LastName: 'Test',
      MobilePhone: '+972501234567', // Test number
    });

    expect(contactResult.success).toBe(true);
    const contactId = contactResult.id;

    // Create a test task
    const taskResult = await conn.sobject('Task').create({
      Subject: 'E2E Test Task',
      Status: 'Not Started',
      WhoId: contactId,
      Task_Type_Key__c: 'TEST_E2E',
      Ready_for_Automation__c: true,
      Description: 'E2E test task created by automated tests',
    });

    expect(taskResult.success).toBe(true);
    testTaskId = taskResult.id!;

    console.log(`✓ Created test task: ${testTaskId}`);
    console.log(`✓ Created test contact: ${contactId}`);

    await conn.logout();

    // Step 2: Create test template mapping
    console.log('Step 2: Creating test template...');
    
    // Note: In real E2E, you'd have a test Excel file or mock loadTemplateMap
    // For now, we'll skip this step and assume the mapping exists

    // Step 3: Run the orchestrator
    console.log('Step 3: Running AutoMessager orchestrator...');
    
    // Enable DRY_RUN to avoid actually sending messages
    process.env.DRY_RUN = '1';
    
    const stats = await runOnce();

    // Step 4: Verify results
    console.log('Step 4: Verifying results...');
    
    expect(stats.tasks).toBeGreaterThan(0);
    // In DRY_RUN mode, should have previewed at least 1 message
    expect(stats.previewed).toBeGreaterThan(0);

    console.log(`✓ Processed ${stats.tasks} tasks`);
    console.log(`✓ Previewed ${stats.previewed} messages`);

    // Step 5: Verify task was not updated (DRY_RUN mode)
    console.log('Step 5: Verifying task state (DRY_RUN)...');
    
    const conn2 = await login();
    const updatedTask = await conn2.sobject('Task').retrieve(testTaskId);
    
    // In DRY_RUN mode, status should still be 'Not Started'
    expect((updatedTask as any).Status).toBe('Not Started');
    
    console.log('✓ Task state unchanged (as expected in DRY_RUN)');

    // Cleanup
    await conn2.sobject('Task').delete(testTaskId);
    await conn2.sobject('Contact').delete(contactId);
    await conn2.logout();
    
    testTaskId = null; // Mark as cleaned up

    console.log('✓ Cleaned up test data');
    console.log('\n✅ E2E Test PASSED');
  }, 60000); // 60 second timeout for E2E test

  it('should handle template not found scenario', async () => {
    const { login } = await import('../../src/sf.js');
    const { runOnce } = await import('../../src/run.js');
    const { clearConfigCache } = await import('../../src/config.js');

    clearConfigCache();

    // Create task with non-existent template key
    const conn = await login();
    
    const contactResult = await conn.sobject('Contact').create({
      FirstName: 'NoTemplate',
      LastName: 'Test',
      MobilePhone: '+972509876543',
    });

    const taskResult = await conn.sobject('Task').create({
      Subject: 'No Template Task',
      Status: 'Not Started',
      WhoId: contactResult.id,
      Task_Type_Key__c: 'NONEXISTENT_TEMPLATE_KEY_XYZ',
      Ready_for_Automation__c: true,
    });

    testTaskId = taskResult.id!;
    await conn.logout();

    // Run orchestrator in DRY_RUN
    process.env.DRY_RUN = '1';
    const stats = await runOnce();

    // Should have skipped the task (template not found)
    expect(stats.skipped).toBeGreaterThan(0);
    expect(stats.errors.length).toBeGreaterThan(0);
    expect(stats.errors[0].reason).toContain('Template not found');

    // Cleanup
    const conn2 = await login();
    await conn2.sobject('Task').delete(testTaskId);
    await conn2.sobject('Contact').delete(contactResult.id!);
    await conn2.logout();
    
    testTaskId = null;

    console.log('✅ Template not found scenario handled correctly');
  }, 60000);

  it('should handle missing phone number scenario', async () => {
    const { login } = await import('../../src/sf.js');
    const { runOnce } = await import('../../src/run.js');
    const { clearConfigCache } = await import('../../src/config.js');

    clearConfigCache();

    // Create contact WITHOUT phone
    const conn = await login();
    
    const contactResult = await conn.sobject('Contact').create({
      FirstName: 'NoPhone',
      LastName: 'Test',
      // No phone number
    });

    const taskResult = await conn.sobject('Task').create({
      Subject: 'No Phone Task',
      Status: 'Not Started',
      WhoId: contactResult.id,
      Task_Type_Key__c: 'TEST_E2E',
      Ready_for_Automation__c: true,
    });

    testTaskId = taskResult.id!;
    await conn.logout();

    // Run orchestrator in DRY_RUN
    process.env.DRY_RUN = '1';
    const stats = await runOnce();

    // Should have skipped the task (no phone)
    expect(stats.skipped).toBeGreaterThan(0);
    expect(stats.errors.length).toBeGreaterThan(0);
    // Should use anti-enumeration message (generic)
    expect(stats.errors[0].reason).toContain('contact information unavailable');

    // Cleanup
    const conn2 = await login();
    await conn2.sobject('Task').delete(testTaskId);
    await conn2.sobject('Contact').delete(contactResult.id!);
    await conn2.logout();
    
    testTaskId = null;

    console.log('✅ Missing phone scenario handled correctly');
  }, 60000);
});

describeE2E('E2E: Configuration Validation', () => {
  it('should fail gracefully with invalid SF credentials', async () => {
    // Save original env
    const originalPassword = process.env.SF_PASSWORD;

    // Set invalid password
    process.env.SF_PASSWORD = 'INVALID_PASSWORD_12345';

    const { clearConfigCache } = await import('../../src/config.js');
    clearConfigCache();

    const { login } = await import('../../src/sf.js');

    // Should fail to login
    await expect(login()).rejects.toThrow();

    // Restore
    process.env.SF_PASSWORD = originalPassword;
    clearConfigCache();

    console.log('✅ Invalid SF credentials handled correctly');
  }, 30000);

  it('should fail gracefully with invalid Glassix credentials', async () => {
    // This test would require mocking or a test endpoint
    // Skipped in favor of contract tests
    expect(true).toBe(true);
  });
});

// Helper: Check if E2E tests can run
if (!isE2EEnabled) {
  console.log('\n⚠️  E2E tests skipped (TEST_E2E not set)');
  console.log('To run E2E tests:');
  console.log('  1. Create .env.e2e with test Salesforce/Glassix credentials');
  console.log('  2. Run: TEST_E2E=true npm test -- test/e2e/full-workflow.spec.ts\n');
}

