/**
 * Glassix API client with dual-mode support, retries, and idempotency
 * Supports both 'messages' mode and 'protocols' mode for WhatsApp sends
 */
import axios, { AxiosInstance, AxiosError } from 'axios';
import Bottleneck from 'bottleneck';
import { getConfig } from './config.js';
import { getLogger } from './logger.js';
import { mask } from './phone.js';
import { GlassixSendResponseSchema, safeParse } from './schemas.js';

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

/**
 * Send result from Glassix API
 */
export type SendResult = {
  conversationUrl?: string;
  providerId?: string;
};

// Axios client instance
let axiosClient: AxiosInstance | null = null;

// Rate limiter (minTime 250ms = max 4 requests/second)
const limiter = new Bottleneck({
  maxConcurrent: 3,
  minTime: 250,
});

/**
 * Initialize axios client with config
 */
function getAxiosClient(): AxiosInstance {
  if (axiosClient) {
    return axiosClient;
  }

  const config = getConfig();

  axiosClient = axios.create({
    baseURL: config.GLASSIX_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return axiosClient;
}

/**
 * Sleep utility for retry backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncate string to max length
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) {
    return str;
  }
  return str.substring(0, maxLen) + '... (truncated)';
}

/**
 * Check if error is retryable (429, 502, 503, 504)
 */
function isRetryableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }
  const status = error.response?.status;
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Build request body based on API mode
 */
function buildRequestBody(
  mode: 'messages' | 'protocols',
  params: SendParams
): { endpoint: string; body: Record<string, unknown> } {
  if (mode === 'messages') {
    if (params.templateId) {
      // Template mode
      return {
        endpoint: '/api/messages/template',
        body: {
          channel: 'whatsapp',
          to: params.toE164,
          templateId: params.templateId,
          variables: params.variables ?? {},
        },
      };
    } else {
      // Free text mode
      return {
        endpoint: '/api/messages',
        body: {
          channel: 'whatsapp',
          to: params.toE164,
          type: 'text',
          text: params.text,
        },
      };
    }
  } else {
    // protocols mode
    return {
      endpoint: '/v1/protocols/send',
      body: {
        protocol: 'whatsapp',
        to: params.toE164,
        content: {
          type: 'text',
          text: params.text,
        },
        ...(params.templateId ? { templateId: params.templateId } : {}),
        ...(params.variables ? { variables: params.variables } : {}),
      },
    };
  }
}

/**
 * Parse response to extract conversation URL and provider ID
 */
function parseResponse(data: unknown): SendResult {
  if (!data || typeof data !== 'object') {
    return { conversationUrl: undefined, providerId: undefined };
  }

  const obj = data as Record<string, unknown>;
  
  const conversationUrl = 
    (typeof obj.conversationUrl === 'string' ? obj.conversationUrl : undefined) ||
    (obj.conversation && typeof obj.conversation === 'object' && 
      'url' in obj.conversation && typeof (obj.conversation as Record<string, unknown>).url === 'string' 
        ? (obj.conversation as Record<string, unknown>).url as string 
        : undefined);

  const providerId =
    (typeof obj.id === 'string' ? obj.id : undefined) ||
    (typeof obj.messageId === 'string' ? obj.messageId : undefined) ||
    (obj.conversation && typeof obj.conversation === 'object' && 
      'id' in obj.conversation && typeof (obj.conversation as Record<string, unknown>).id === 'string'
        ? (obj.conversation as Record<string, unknown>).id as string
        : undefined);

  return { conversationUrl, providerId };
}

/**
 * Build safe error message (no secrets, truncated)
 */
function buildErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : String(error);
  }

  const status = error.response?.status || 'unknown';
  const statusText = error.response?.statusText || 'unknown';

  let detail = '';
  if (error.response?.data) {
    try {
      const dataStr =
        typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data);
      detail = truncate(dataStr, 500);
    } catch {
      detail = String(error.response.data);
    }
  } else {
    detail = error.message || 'Unknown error';
  }

  return `${status} ${statusText} :: ${detail}`;
}

/**
 * Send WhatsApp message with retry logic
 */
async function sendWithRetry(
  client: AxiosInstance,
  endpoint: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  params: SendParams
): Promise<SendResult> {
  const config = getConfig();
  const maxAttempts = config.RETRY_ATTEMPTS;
  const baseDelayMs = config.RETRY_BASE_MS;

  let lastError: AxiosError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.post(endpoint, body, { headers });

      // Validate response with Zod schema
      const validatedData = safeParse(
        GlassixSendResponseSchema,
        response.data,
        'Glassix response'
      );

      if (!validatedData) {
        logger.warn(
          { to: mask(params.toE164) },
          'Glassix response validation failed, using fallback parsing'
        );
      }

      const result: unknown = validatedData || response.data;
      const providerId = validatedData?.id || (result && typeof result === 'object' && 'id' in result ? String((result as Record<string, unknown>).id) : undefined);

      logger.debug(
        {
          to: mask(params.toE164),
          template: !!params.templateId,
          attempt,
          providerId,
        },
        'Glassix send succeeded'
      );

      return parseResponse(result);
    } catch (error: unknown) {
      if (axios.isAxiosError(error)) {
        lastError = error;

        const status = error.response?.status;
        const isRetryable = isRetryableError(error);

        logger.warn(
          {
            to: mask(params.toE164),
            status,
            code: error.code,
            attempt,
            retryable: isRetryable,
          },
          'Glassix send failed'
        );

        // Retry on retryable errors if we have attempts left
        if (isRetryable && attempt < maxAttempts) {
          // Exponential backoff with jitter
          const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
          const jitter = Math.floor(Math.random() * 100);
          const delay = exponentialDelay + jitter;
          
          logger.debug({ attempt, delay, base: baseDelayMs }, 'Retrying after backoff');
          await sleep(delay);
          continue;
        }

        // No more retries or non-retryable error
        throw new Error(buildErrorMessage(error));
      }

      // Non-Axios error
      logger.error(
        { to: mask(params.toE164), error: String(error) },
        'Unexpected error sending WhatsApp message'
      );
      throw new Error(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Should never reach here, but for type safety
  throw new Error(lastError ? buildErrorMessage(lastError) : 'Send failed after retries');
}

/**
 * Send WhatsApp message via Glassix API
 * Supports both free-text and template modes
 * Includes retries, idempotency, and DRY_RUN support
 */
export async function sendWhatsApp(params: SendParams): Promise<SendResult> {
  // Validate E.164 format (must start with +972)
  if (!params.toE164.startsWith('+972')) {
    throw new Error(
      `Invalid phone number format: ${mask(params.toE164)}. Must start with +972`
    );
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
    return { conversationUrl: undefined, providerId: 'dry-run' };
  }

  const config = getConfig();
  const client = getAxiosClient();

  // Build request based on API mode
  const { endpoint, body } = buildRequestBody(config.GLASSIX_API_MODE, params);

  // Build headers (Authorization header will be redacted by logger)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.GLASSIX_API_KEY}`,
    'Idempotency-Key': params.idemKey,
  };

  logger.debug(
    {
      to: mask(params.toE164),
      endpoint,
      mode: config.GLASSIX_API_MODE,
      template: !!params.templateId,
      idemKey: params.idemKey,
    },
    'Sending WhatsApp message'
  );

  // Use rate limiter to schedule the send with retry
  return limiter.schedule(() =>
    sendWithRetry(client, endpoint, body, headers, params)
  );
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
