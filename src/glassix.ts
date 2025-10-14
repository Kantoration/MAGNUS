/**
 * Glassix API client with access-token caching, dual-mode support, and hardened security
 * Supports both 'messages' mode and 'protocols' mode for WhatsApp sends
 */
import axios, { AxiosError } from 'axios';
import Bottleneck from 'bottleneck';
import { getConfig, USE_ACCESS_TOKEN_FLOW } from './config.js';
import { getLogger } from './logger.js';
import { mask, isAllowedE164 } from './phone.js';
import { buildSafeAxiosError, isRetryableStatus, calculateBackoff } from './http-error.js';
import { glassixSendLatency, trackRateLimit, recordSendResult } from './metrics.js';
import {
  parseAccessTokenResponse,
  parseSendResponse,
  type SendResult,
} from './types/glassix.js';

const logger = getLogger();

/**
 * Send parameters for WhatsApp message
 */
export type SendParams = {
  toE164: string; // E.164 phone number (e.g., +972521234567)
  text: string; // Message text
  idemKey: string; // Idempotency key (typically Task.Id)
  templateId?: string; // If provided, uses template mode
  variables?: Record<string, string | number | boolean | null>; // Template variables
};

// Re-export SendResult type for backward compatibility
export type { SendResult };

/**
 * Access token cache (module-level)
 */
let cached: { token: string; expMs: number } | null = null;

/**
 * Rate limiter (minTime 250ms = max 4 requests/second)
 * With debug logging for operational visibility
 */
const limiter = new Bottleneck({ minTime: 250 });

// Debug logging for rate limiter queue
limiter.on('queued', () => {
  logger.debug({ queueSize: limiter.counts().QUEUED }, 'RateLimit queued');
});

limiter.on('done', () => {
  logger.debug({ queueSize: limiter.counts().QUEUED }, 'RateLimit processed');
});

// Note: Error handling utilities moved to http-error.ts for reusability

/**
 * Get access token (cached, with proactive refresh)
 * Only called when USE_ACCESS_TOKEN_FLOW === true
 * Exported for testing and CLI diagnostic tools
 */
export async function getAccessToken(): Promise<string> {
  const config = getConfig();
  const now = Date.now();

  // Return cached token if valid (refresh 5 min early)
  if (cached && now < cached.expMs - 300_000) {
    return cached.token;
  }

  // Exchange API key + secret for access token
  const baseUrl = config.GLASSIX_BASE_URL.replace(/\/+$/, '');
  
  try {
    const response = await axios.post(
      `${baseUrl}/access-token`,
      {
        apiKey: config.GLASSIX_API_KEY,
        secret: config.GLASSIX_API_SECRET,
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: config.GLASSIX_TIMEOUT_MS,
      }
    );

    // Parse and validate response
    const tokenData = parseAccessTokenResponse(response.data);
    
    // If expiresIn missing, assume 3h (10800s)
    const ttlSeconds = tokenData.expiresIn ?? 10800;
    
    // Refresh 60s early
    const expMs = now + (ttlSeconds - 60) * 1000;
    
    cached = { token: tokenData.accessToken, expMs };
    
    logger.debug(
      { ttlSeconds, expiresAt: new Date(expMs).toISOString() },
      'Access token obtained'
    );
    
    return tokenData.accessToken;
  } catch (error) {
    const safeMsg = buildSafeAxiosError(error);
    
    // Additional scrubbing for access token endpoint to prevent secret leakage
    // This catches cases where buildSafeAxiosError might miss secrets in response bodies
    const scrubbedMsg = safeMsg
      .replace(/"apiKey"\s*:\s*"[^"]+"/g, '"apiKey":"[REDACTED]"')
      .replace(/"secret"\s*:\s*"[^"]+"/g, '"secret":"[REDACTED]"')
      .replace(/(?:apiKey|secret)"\s*:\s*"[^"]+"/g, 'apiKey":"[REDACTED]"');
    
    logger.error({ error: scrubbedMsg }, 'Failed to get access token');
    throw new Error(`Access token exchange failed: ${scrubbedMsg}`);
  }
}

/**
 * Get bearer token for Authorization header
 * - If USE_ACCESS_TOKEN_FLOW: fetches/caches access token
 * - Else: returns legacy GLASSIX_API_KEY
 */
function getBearer(): string {
  const config = getConfig();
  return config.GLASSIX_API_KEY!;
}

/**
 * Build Authorization header
 */
async function authHeader(): Promise<{ Authorization: string }> {
  if (USE_ACCESS_TOKEN_FLOW) {
    const token = await getAccessToken();
    return { Authorization: `Bearer ${token}` };
  } else {
    return { Authorization: `Bearer ${getBearer()}` };
  }
}

/**
 * Send WhatsApp message (single attempt, no retry)
 */
async function sendOnce(params: SendParams): Promise<SendResult> {
  const config = getConfig();
  const base = config.GLASSIX_BASE_URL.replace(/\/+$/, '');
  const mode = config.GLASSIX_API_MODE;

  // Build URL and body based on API mode
  let url: string;
  let body: Record<string, unknown>;

  if (mode === 'messages') {
    if (params.templateId) {
      // Template mode
      url = `${base}/api/messages/template`;
      body = {
        channel: 'whatsapp',
        to: params.toE164,
        templateId: params.templateId,
        variables: params.variables ?? {},
      };
    } else {
      // Free text mode
      url = `${base}/api/messages`;
      body = {
        channel: 'whatsapp',
        to: params.toE164,
        type: 'text',
        text: params.text,
      };
    }
  } else {
    // protocols mode
    url = `${base}/v1/protocols/send`;
    body = {
      protocol: 'whatsapp',
      to: params.toE164,
      content: {
        type: 'text',
        text: params.text,
      },
      ...(params.templateId ? { templateId: params.templateId } : {}),
      ...(params.variables ? { variables: params.variables } : {}),
    };
  }

  // Build headers (auth + idempotency)
  const auth = await authHeader();
  const headers = {
    ...auth,
    'Content-Type': 'application/json',
    'Idempotency-Key': params.idemKey,
  };

  // Track latency with histogram
  const endTimer = glassixSendLatency.startTimer();

  try {
    // Make request
    const response = await axios.post(url, body, {
      headers,
      timeout: config.GLASSIX_TIMEOUT_MS,
    });

    // Track latency
    endTimer();

    // Track rate limit headers if present
    if (response.headers) {
      trackRateLimit(response.headers);
    }

    // Parse and validate response
    return parseSendResponse(response.data);
  } catch (error) {
    // Track latency even on error
    endTimer();
    throw error;
  }
}

/**
 * Send WhatsApp message via Glassix API
 * - Validates phone number (centralized country logic)
 * - Supports DRY_RUN mode
 * - Retries on transient errors (429, 502, 503, 504)
 * - Rate-limited via Bottleneck
 */
export async function sendWhatsApp(params: SendParams): Promise<SendResult> {
  // Validate phone number using centralized country logic
  if (!isAllowedE164(params.toE164)) {
    throw new Error(`Invalid phone number format: ${mask(params.toE164)}. Only Israeli (+972) numbers are supported.`);
  }

  // DRY_RUN mode
  if (process.env.DRY_RUN === '1') {
    logger.info(
      {
        to: mask(params.toE164),
        template: !!params.templateId,
        len: params.text?.length ?? 0,
      },
      'DRY_RUN glassix.send'
    );
    return { providerId: 'dry-run' };
  }

  const config = getConfig();
  const attempts = config.RETRY_ATTEMPTS;
  const base = config.RETRY_BASE_MS;

  // Retry wrapper
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await limiter.schedule(() => sendOnce(params));
      
      // Record successful send
      recordSendResult('ok');
      
      return result;
    } catch (e) {
      const status = (e as AxiosError)?.response?.status;
      const msg = buildSafeAxiosError(e);

      logger.warn(
        { to: mask(params.toE164), attempt, status },
        'glassix.send failed'
      );

      // Throw immediately if non-retryable or last attempt
      if (attempt >= attempts || !isRetryableStatus(status)) {
        // Record final failure
        recordSendResult('fail');
        throw new Error(msg);
      }

      // Record retry attempt
      recordSendResult('retry');

      // Exponential backoff with jitter (configurable)
      const backoff = calculateBackoff(attempt, base);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  // Should never reach here
  recordSendResult('fail');
  throw new Error('Send failed after retries');
}

/**
 * Legacy class wrapper for backward compatibility
 * @deprecated Use sendWhatsApp() function directly
 */
export class GlassixClient {
  async sendWhatsAppMessage(
    phoneNumber: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const result = await sendWhatsApp({
        toE164: phoneNumber,
        text: message,
        idemKey: (metadata?.taskId as string) || `legacy-${Date.now()}`,
        templateId: metadata?.glassixTemplateId as string | undefined,
      });

      return {
        success: true,
        messageId: result.providerId,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async sendBatch(
    messages: Array<{
      phoneNumber: string;
      message: string;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<Array<{ success: boolean; messageId?: string; error?: string }>> {
    const promises = messages.map((msg) =>
      this.sendWhatsAppMessage(msg.phoneNumber, msg.message, msg.metadata)
    );
    return Promise.all(promises);
  }
}
