/**
 * Centralized error handler with human-readable messages
 * Maps technical errors to user-friendly, actionable messages
 */
import axios from 'axios';
import { buildSafeAxiosError, isRetryableStatus } from './http-error.js';
import {
  AutoMessagerError,
  ConfigError,
  UpstreamError,
  ValidationError,
  SanitizationError,
  TemplateError,
  PhoneError,
} from './errors.js';

/**
 * Map Axios error to UpstreamError
 */
export function mapAxiosToUpstream(
  e: unknown,
  provider: 'salesforce' | 'glassix'
): UpstreamError {
  const msg = buildSafeAxiosError(e);
  const status = axios.isAxiosError(e) ? e.response?.status : undefined;
  const retryable = isRetryableStatus(status);

  return new UpstreamError(msg, provider, status, retryable);
}

/**
 * Map common Salesforce errors to plain language
 */
function humanizeSalesforceError(status?: number, message?: string): string {
  if (!message) {
    return 'Salesforce API error';
  }

  // Common patterns
  if (message.includes('INVALID_FIELD')) {
    return 'Salesforce field error: Custom field may not exist in your org';
  }
  if (message.includes('UNABLE_TO_LOCK_ROW')) {
    return 'Salesforce record locked: Record is being edited by another process';
  }
  if (message.includes('INVALID_SESSION_ID')) {
    return 'Salesforce session expired: Re-authentication required';
  }
  if (message.includes('REQUIRED_FIELD_MISSING')) {
    return 'Salesforce validation: Required field is missing';
  }
  if (status === 401) {
    return 'Salesforce authentication failed: Check credentials';
  }
  if (status === 403) {
    return 'Salesforce permission denied: User lacks required permissions';
  }

  return message.substring(0, 200);
}

/**
 * Map common Glassix errors to plain language
 */
function humanizeGlassixError(status?: number, message?: string): string {
  if (status === 401) {
    return 'Glassix authentication failed: Check API key/secret';
  }
  if (status === 403) {
    return 'Glassix permission denied: API key lacks required permissions';
  }
  if (status === 429) {
    return 'Glassix rate limit exceeded: Too many requests, will retry';
  }
  if (status === 400) {
    return 'Glassix bad request: Invalid message format or phone number';
  }
  if (status && status >= 500) {
    return 'Glassix server error: Service temporarily unavailable';
  }

  return message?.substring(0, 200) || 'Glassix API error';
}

/**
 * Print human-readable error message (max 300 chars)
 * Converts technical errors to user-friendly messages with hints
 */
export function printHuman(e: unknown): string {
  // Handle AutoMessager typed errors
  if (e instanceof AutoMessagerError) {
    let msg = `[${e.code}] ${e.message}`;
    
    if (e.hint) {
      msg += `\nHint: ${e.hint}`;
    }

    // Add specific details
    if (e instanceof UpstreamError && e.provider) {
      const humanized =
        e.provider === 'salesforce'
          ? humanizeSalesforceError(e.status, e.message)
          : humanizeGlassixError(e.status, e.message);
      msg = `[${e.code}] ${humanized}\nHint: ${e.hint}`;
    }

    if (e instanceof ValidationError && e.details && e.details.length > 0) {
      msg += `\nDetails: ${e.details.slice(0, 3).join(', ')}`;
    }

    if (e instanceof TemplateError && e.templateKey) {
      msg += `\nTemplate: ${e.templateKey}`;
    }

    if (e instanceof PhoneError && e.phoneHint) {
      msg += `\nPhone: ${e.phoneHint}`;
    }

    return msg.substring(0, 300);
  }

  // Handle Axios errors
  if (axios.isAxiosError(e)) {
    const safeMsg = buildSafeAxiosError(e);
    return `Network Error: ${safeMsg}`.substring(0, 300);
  }

  // Generic error
  const msg = e instanceof Error ? e.message : String(e);
  return `Error: ${msg}`.substring(0, 300);
}

/**
 * Get recommended action for error
 */
export function getRecommendedAction(e: unknown): string[] {
  if (e instanceof ConfigError) {
    return ['Run: automessager init', 'Check .env file syntax'];
  }

  if (e instanceof UpstreamError) {
    if (e.provider === 'salesforce') {
      return [
        'Run: automessager verify',
        'Check Salesforce credentials',
        'Verify API access enabled',
      ];
    }
    if (e.provider === 'glassix') {
      return [
        'Run: automessager doctor',
        'Check Glassix API key and secret',
        'Verify access token flow enabled',
      ];
    }
  }

  if (e instanceof TemplateError) {
    return ['Run: automessager verify:mapping', 'Check Excel file and headers'];
  }

  if (e instanceof PhoneError) {
    return [
      'Verify phone number format (+972XXXXXXXXX)',
      'Check TASK_CUSTOM_PHONE_FIELD configuration',
      'Ensure Contact/Lead records have phone numbers',
    ];
  }

  if (e instanceof ValidationError) {
    return ['Review input data', 'Check for invalid characters or formats'];
  }

  if (e instanceof SanitizationError) {
    return ['Review template content', 'Remove unsafe characters or long text'];
  }

  return ['Run: automessager doctor', 'Check logs for details'];
}

