/**
 * Daily Deduplication System
 * 
 * Prevents sending identical templates to the same recipient within N hours
 * Implements the "daily" spirit of the manual workflow
 */

import { getLogger } from './logger.js';
import { Connection } from 'jsforce';
import { mask } from './phone.js';

const logger = getLogger();

export interface DedupeCheckResult {
  shouldSkip: boolean;
  reason?: string;
  lastSent?: string;
  hoursSinceLastSent?: number;
}

/**
 * Check if we should skip sending due to recent duplicate
 * 
 * @param conn - Salesforce connection
 * @param phoneE164 - Recipient phone number
 * @param templateName - Template being sent
 * @param hoursThreshold - Hours to check back (default: 24)
 */
export async function checkDailyDeduplication(
  conn: Connection,
  phoneE164: string,
  templateName: string,
  hoursThreshold: number = 24
): Promise<DedupeCheckResult> {
  try {
    // Query for recent tasks with same template to same phone
    const cutoffTime = new Date(Date.now() - (hoursThreshold * 60 * 60 * 1000));
    const cutoffIso = cutoffTime.toISOString();
    
    const soql = `
      SELECT Id, Subject, CreatedDate, Description, Delivery_Status__c
      FROM Task
      WHERE Delivery_Status__c = 'SENT'
        AND CreatedDate >= ${cutoffIso}
        AND Description LIKE '%${templateName}%'
        AND Description LIKE '%${mask(phoneE164)}%'
      ORDER BY CreatedDate DESC
      LIMIT 1
    `;

    const result = await conn.query(soql);
    
    if (result.records.length === 0) {
      return { shouldSkip: false };
    }
    
    const lastTask = result.records[0] as any;
    const lastSent = new Date(lastTask.CreatedDate);
    const hoursSinceLastSent = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);
    
    logger.debug(
      {
        phoneMasked: mask(phoneE164),
        templateName,
        lastSent: lastSent.toISOString(),
        hoursSinceLastSent: Math.round(hoursSinceLastSent * 100) / 100,
        hoursThreshold
      },
      'Found recent duplicate message'
    );
    
    return {
      shouldSkip: true,
      reason: `Duplicate template "${templateName}" sent ${Math.round(hoursSinceLastSent)} hours ago`,
      lastSent: lastSent.toISOString(),
      hoursSinceLastSent: Math.round(hoursSinceLastSent * 100) / 100
    };
    
  } catch (error) {
    // Non-fatal: if dedupe check fails, proceed with send
    logger.warn(
      {
        phoneMasked: mask(phoneE164),
        templateName,
        error: error instanceof Error ? error.message : String(error)
      },
      'Daily deduplication check failed - proceeding with send (non-fatal)'
    );
    
    return { shouldSkip: false };
  }
}

/**
 * Check if a task should be skipped due to daily deduplication
 * 
 * @param conn - Salesforce connection
 * @param taskId - Current task ID
 * @param phoneE164 - Recipient phone number
 * @param templateName - Template being sent
 * @param hoursThreshold - Hours to check back (default: 24)
 */
export async function shouldSkipDueToDailyDedupe(
  conn: Connection,
  taskId: string,
  phoneE164: string,
  templateName: string,
  hoursThreshold: number = 24
): Promise<DedupeCheckResult> {
  const result = await checkDailyDeduplication(conn, phoneE164, templateName, hoursThreshold);
  
  if (result.shouldSkip) {
    logger.info(
      {
        taskId,
        phoneMasked: mask(phoneE164),
        templateName,
        reason: result.reason,
        hoursSinceLastSent: result.hoursSinceLastSent
      },
      'Skipping task due to daily deduplication'
    );
  }
  
  return result;
}
