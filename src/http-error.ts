/**
 * Centralized HTTP error handling utilities
 * Provides safe, sanitized error messages with secret redaction
 */
import type { AxiosError } from 'axios';
import axios from 'axios';

const MAX_ERROR_LENGTH = 500;

/**
 * Build safe error message from Axios error
 * - Truncates to MAX_ERROR_LENGTH chars
 * - Redacts authorization headers and bearer tokens
 * - Extracts status, statusText, and message
 */
export function buildSafeAxiosError(err: unknown): string {
  if (!axios.isAxiosError(err)) {
    const msg = err instanceof Error ? err.message : String(err);
    return msg.length > MAX_ERROR_LENGTH ? msg.slice(0, MAX_ERROR_LENGTH) + '… (truncated)' : msg;
  }

  const axiosErr = err as AxiosError;
  const status = axiosErr.response?.status;
  const statusText = axiosErr.response?.statusText ?? '';
  
  // Extract message from response data
  let msg = '';
  if (axiosErr.response?.data) {
    try {
      const data = axiosErr.response.data;
      
      if (typeof data === 'string') {
        msg = data;
      } else if (typeof data === 'object' && data !== null) {
        // Try to extract message field
        const dataObj = data as Record<string, unknown>;
        if (typeof dataObj.message === 'string') {
          msg = dataObj.message;
        } else if (typeof dataObj.error === 'string') {
          msg = dataObj.error;
        } else {
          msg = JSON.stringify(data);
        }
      }
    } catch {
      msg = String(axiosErr.response.data);
    }
  } else if (axiosErr.message) {
    msg = axiosErr.message;
  }

  // Compose status + message
  let composed = `${status ?? 'ERR'} ${statusText} ${msg}`.trim();

  // Redact authorization headers (case-insensitive, multiple patterns)
  composed = composed
    .replace(/authorization"?\s*:\s*"[^"]+"/gi, 'authorization:"[REDACTED]"')
    .replace(/authorization"?\s*:\s*'[^']+'/gi, "authorization:'[REDACTED]'")
    .replace(/Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/gi, 'Authorization: Bearer [REDACTED]');

  // Redact bearer tokens (multiple patterns)
  composed = composed
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/"token"\s*:\s*"[^"]+"/gi, '"token":"[REDACTED]"')
    .replace(/"accessToken"\s*:\s*"[^"]+"/gi, '"accessToken":"[REDACTED]"')
    .replace(/"access_token"\s*:\s*"[^"]+"/gi, '"access_token":"[REDACTED]"')
    .replace(/access_token"\s*:\s*"[^"]+"/gi, 'access_token":"[REDACTED]"'); // Without leading quote
  
  // Redact API keys and secrets (paranoid mode - multiple formats)
  composed = composed
    // JSON format with quotes: "apiKey": "value"
    .replace(/"(?:api_?key|api_?secret|apiKey|apiSecret)"\s*:\s*"[^"]+"/gi, '"[CREDENTIAL]":"[REDACTED]"')
    // Without quotes around key: apiKey: "value"
    .replace(/(?:api_?key|api_?secret|apiKey|apiSecret)\s*:\s*"[^"]+"/gi, '[CREDENTIAL]:"[REDACTED]"')
    // Object format: apiKey="value"
    .replace(/(?:api_?key|api_?secret|apiKey|apiSecret)\s*=\s*"[^"]+"/gi, '[CREDENTIAL]="[REDACTED]"')
    // Query string: api_key=value
    .replace(/(?:api_?key|api_?secret|apiKey|apiSecret)=[\w.-]+/gi, '[CREDENTIAL]=[REDACTED]')
    // Uppercase variations: API_KEY="value"
    .replace(/(?:API_?KEY|API_?SECRET)\s*=\s*"[^"]+"/gi, '[CREDENTIAL]="[REDACTED]"');

  // Truncate if too long
  if (composed.length > MAX_ERROR_LENGTH) {
    return composed.slice(0, MAX_ERROR_LENGTH) + '… (truncated)';
  }

  return composed;
}

/**
 * Check if HTTP status code is retryable
 * Retryable: 429 (Too Many Requests), 502-504 (Server Errors)
 * Non-retryable: 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), etc.
 */
export function isRetryableStatus(status?: number): boolean {
  if (!status) {
    return false;
  }
  
  // Retry on rate limit and server errors
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Calculate exponential backoff with jitter
 * Uses configurable base delay and adds random jitter (0-100ms)
 */
export function calculateBackoff(attempt: number, baseMs: number): number {
  const exponential = baseMs * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 100);
  return exponential + jitter;
}

