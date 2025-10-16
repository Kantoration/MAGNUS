/**
 * Glassix API client with access-token caching, dual-mode support, and hardened security
 * 
 * AUTHENTICATION:
 * - Preferred: Modern access token flow (USE_ACCESS_TOKEN_FLOW=true)
 *   - Requires GLASSIX_API_KEY + GLASSIX_API_SECRET
 *   - Exchanges credentials for short-lived access token
 *   - Caches token until expiry (minus 60s safety margin)
 *   - More secure than legacy bearer mode
 * 
 * - Fallback: Legacy bearer mode (USE_ACCESS_TOKEN_FLOW=false)
 *   - Uses GLASSIX_API_KEY directly in Authorization header
 *   - Less secure (long-lived credential in every request)
 *   - Only use if access token flow unavailable
 *   - Must explicitly set ALLOW_LEGACY_BEARER=true in strict mode
 * 
 * MODES:
 * - 'messages' mode: Direct message sending (simpler, default)
 * - 'protocols' mode: Protocol-based sending (required for some Glassix setups)
 */
import axios, { AxiosError } from 'axios';
import Bottleneck from 'bottleneck';
import { getConfig, USE_ACCESS_TOKEN_FLOW } from './config.js';
import { getLogger } from './logger.js';
import { mask, isAllowedE164 } from './phone.js';
import { getSupportedCountries } from './phone-countries.js';
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
  text?: string; // Message text (used only if templateId absent)
  idemKey: string; // Idempotency key (typically Task.Id)
  templateId?: string; // If provided, uses template mode
  variables?: Record<string, string | number | boolean | null>; // Template variables
  language?: string; // Optional language override
  customerName?: string; // Customer name for conversation tracking (manual workflow requirement)
  subject?: string; // Conversation subject (נושא) - manual workflow requirement
};

// Re-export SendResult type for backward compatibility
export type { SendResult };

/**
 * Glassix template structure
 */
export interface GlassixTemplate {
  id: string;
  name: string;
  content: string;
  language: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  category?: string;
  components?: Array<{
    type: string;
    text?: string;
    parameters?: string[];
  }>;
}

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
    // If it's already a validation error, re-throw it (don't wrap)
    if (error instanceof Error && error.name === 'GlassixValidationError') {
      logger.error({ error: error.message }, 'Access token validation failed');
      throw error;
    }
    
    // For other errors: use hardened axios error builder
    const safeMsg = buildSafeAxiosError(error);
    
    // Second pass: Paranoid scrubbing for token exchange endpoint
    // Prevent secret leakage in response bodies or error messages
    let scrubbedMsg = safeMsg
      .replace(/"apiKey"\s*:\s*"[^"]+"/g, '"apiKey":"[REDACTED]"')
      .replace(/"secret"\s*:\s*"[^"]+"/g, '"secret":"[REDACTED]"')
      .replace(/"api_key"\s*:\s*"[^"]+"/gi, '"api_key":"[REDACTED]"');
    
    // Third pass: Replace literal credential values (in case they leaked through)
    const config = getConfig();
    if (config.GLASSIX_API_KEY) {
      scrubbedMsg = scrubbedMsg.replace(new RegExp(config.GLASSIX_API_KEY, 'g'), '[REDACTED]');
    }
    if (config.GLASSIX_API_SECRET) {
      scrubbedMsg = scrubbedMsg.replace(new RegExp(config.GLASSIX_API_SECRET, 'g'), '[REDACTED]');
    }
    
    // Log only the fully scrubbed message (never raw error)
    logger.error({ error: scrubbedMsg }, 'Failed to get access token');
    throw new Error(`Access token exchange failed: ${scrubbedMsg}`);
  }
}

/**
 * Get bearer token for Authorization header
 * - If USE_ACCESS_TOKEN_FLOW: fetches/caches access token
 * - Else: returns legacy GLASSIX_API_KEY
 * 
 * SECURITY: Never log the return value of this function!
 */
function getBearer(): string {
  const config = getConfig();
  
  // Return API key for legacy mode (never log this!)
  if (!config.GLASSIX_API_KEY) {
    throw new Error('GLASSIX_API_KEY is required but not configured');
  }
  
  return config.GLASSIX_API_KEY;
}

/**
 * Build Authorization header
 * 
 * SECURITY RATIONALE:
 * - Modern flow (access token): Short-lived tokens, rotated automatically
 *   - Reduces exposure window if token is compromised
 *   - Supports token revocation and auditing
 *   - Industry best practice for API security
 * 
 * - Legacy flow (bearer with API key): Long-lived credential in every request
 *   - Higher risk if intercepted (no expiration)
 *   - No rotation or revocation mechanism
 *   - Only use when access token flow unavailable
 *   - Requires ALLOW_LEGACY_BEARER=true in strict mode
 */
async function authHeader(): Promise<{ Authorization: string }> {
  if (USE_ACCESS_TOKEN_FLOW) {
    // Preferred: Modern access token flow
    const token = await getAccessToken();
    return { Authorization: `Bearer ${token}` };
  } else {
    // Fallback: Legacy bearer mode (requires explicit opt-in in strict mode)
    return { Authorization: `Bearer ${getBearer()}` };
  }
}

/**
 * Convert variables object to WhatsApp component parameters
 * Creates ordered parameters for template body components
 */
async function buildTemplateComponents(vars?: Record<string, any>, templateName?: string) {
  if (!vars) return [];

  // Import template parameter ordering
  const { getTemplateParamOrder } = await import('./template-param-map.js');
  
  // Get ordered keys for this template (or heuristic fallback)
  const availableVars = Object.keys(vars);
  const orderedKeys = templateName 
    ? getTemplateParamOrder(templateName, availableVars)
    : availableVars.sort(); // Fallback to alphabetical

  const parameters = orderedKeys
    .map(k => (vars[k] == null ? '' : String(vars[k])))
    .map(value => ({ type: 'text', text: value }));

  return parameters.length
    ? [{ type: 'body', parameters }]
    : [];
}

/**
 * Send WhatsApp message (single attempt, no retry)
 */
async function sendOnce(params: SendParams): Promise<SendResult> {
  const config = getConfig();
  const base = config.GLASSIX_BASE_URL.replace(/\/+$/, '');
  const mode = config.GLASSIX_API_MODE;

  // Choose language (fallback to config, then 'he')
  const lang = (params.language || config.DEFAULT_LANG || 'he').toLowerCase();

  // Build URL and body based on API mode
  let url: string;
  let body: Record<string, unknown>;

  if (mode === 'messages') {
    // Always use /api/messages/send endpoint
    url = `${base}/api/messages/send`;
    
    // Build payload
    body = {
      to: params.toE164,
      channel: 'whatsapp',
    };

    // Add conversation metadata (manual workflow requirement)
    if (params.customerName) {
      body.customerName = params.customerName;
    }
    if (params.subject) {
      body.subject = params.subject;
    }

    if (params.templateId) {
      // Build WhatsApp template payload
      body.template = {
        name: params.templateId,        // template name
        language: { code: lang },       // WhatsApp expects BCP-47-ish
        components: await buildTemplateComponents(params.variables, params.templateId),
      };
    } else {
      // Free text (only allowed for non-first contacts or ongoing sessions)
      body.text = params.text || '';
    }
  } else {
    // protocols mode - keep existing structure
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
  const headers = {
    ...(await authHeader()),
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

    // Track rate limit headers and warn if approaching limit
    if (response.headers) {
      trackRateLimit(response.headers);
      
      // Check rate limit remaining and warn if low
      const remaining = response.headers['x-ratelimit-remaining'];
      const reset = response.headers['x-ratelimit-reset'];
      
      if (remaining !== undefined) {
        const remainingValue = typeof remaining === 'string' ? parseInt(remaining, 10) : remaining;
        
        if (!isNaN(remainingValue) && remainingValue < 10) {
          logger.warn(
            { remaining: remainingValue, reset },
            'Approaching Glassix rate limit'
          );
        }
      }
    }

    // Parse and validate response
    return parseSendResponse(response.data);
  } catch (error) {
    // Track latency even on error
    endTimer();
    
    // Use hardened error scrubbing to prevent token leakage
    const msg = buildSafeAxiosError(error);
    logger.warn({ to: mask(params.toE164) }, `glassix.send failed: ${msg}`);
    throw new Error(msg);
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
    const supportedCountries = getSupportedCountries().join(', ');
    throw new Error(`Invalid phone number format: ${mask(params.toE164)}. Supported countries: ${supportedCountries}`);
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
      // Always use buildSafeAxiosError to prevent token leakage
      const status = (e as AxiosError)?.response?.status;
      const msg = buildSafeAxiosError(e);

      logger.warn(
        { to: mask(params.toE164), attempt, status },
        `glassix.send failed: ${msg}`
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
 * Retrieve approved WhatsApp templates from Glassix
 * Uses canned replies endpoint (templates are stored as canned replies)
 */
export async function getApprovedTemplates(): Promise<GlassixTemplate[]> {
  const config = getConfig();
  const base = config.GLASSIX_BASE_URL.replace(/\/+$/, '');
  
  const headers = {
    ...(await authHeader()),
    'Content-Type': 'application/json',
  };

  try {
    // Glassix stores WhatsApp templates as "canned replies"
    const response = await axios.get(`${base}/api/canned-replies`, {
      headers,
      timeout: config.GLASSIX_TIMEOUT_MS,
      params: {
        channel: 'whatsapp',
        status: 'APPROVED'
      }
    });

    // Fall back to different response structures
    const raw = response.data?.replies ?? response.data?.items ?? response.data ?? [];
    const templates: GlassixTemplate[] = raw
      .filter((t: any) => (t.status ?? t.state) === 'APPROVED')
      .map((t: any) => ({
        id: t.id || t._id,
        name: t.name || t.title,
        content: t.content || t.text || t.body || '',
        language: (t.language || 'he').toLowerCase().slice(0, 2), // Normalize to two-letter
        status: 'APPROVED',
        category: t.category,
        components: t.components
      }));

    logger.info({ count: templates.length }, 'Retrieved Glassix approved templates');
    return templates;
  } catch (error) {
    const msg = buildSafeAxiosError(error);
    logger.warn({ error: msg }, 'Failed to fetch Glassix templates - will proceed without template matching');
    return []; // Return empty array instead of throwing - allows system to continue
  }
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
