/**
 * Glassix API type definitions and Zod schemas
 * Provides runtime validation at API boundaries
 */
import { z } from 'zod';

/**
 * Access Token Response Schema
 * Returned from POST /access-token
 */
export const AccessTokenResponseSchema = z.object({
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive().optional(),
});

export type AccessTokenResponse = z.infer<typeof AccessTokenResponseSchema>;

/**
 * Send Response Schema
 * Returned from POST /api/messages or /v1/protocols/send
 * 
 * STRICT VALIDATION:
 * - conversationUrl MUST be valid URL if present (rejects invalid URLs)
 * - providerId MUST be non-empty string if present
 * - Supports multiple response formats for API flexibility
 */
export const SendResponseSchema = z.object({
  // Provider ID (various field names) - must be non-empty if present
  id: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  providerId: z.string().min(1).optional(),
  sid: z.string().min(1).optional(),
  
  // Conversation URL (various field names) - must be valid URL if present
  conversationUrl: z.string().url().optional(),
  conversation_link: z.string().url().optional(),
  conversation: z.object({
    id: z.string().min(1).optional(),
    url: z.string().url().optional(),
  }).optional(),
  
  // Status and error info
  status: z.string().optional(),
  error: z.string().optional(),
}).passthrough(); // Allow additional fields for forward compatibility

export type SendResponse = z.infer<typeof SendResponseSchema>;

/**
 * Normalized Send Result
 * Internal representation after parsing API response
 */
export interface SendResult {
  providerId?: string;
  conversationUrl?: string;
}

/**
 * Parse access token response with validation
 * @throws {GlassixValidationError} if response doesn't match schema
 */
export function parseAccessTokenResponse(data: unknown): AccessTokenResponse {
  const result = AccessTokenResponseSchema.safeParse(data);
  
  if (!result.success) {
    throw new GlassixValidationError(
      'Invalid access token response',
      result.error.errors
    );
  }
  
  return result.data;
}

/**
 * Parse send response with validation
 * Extracts normalized SendResult from various response formats
 * @throws {GlassixValidationError} if response doesn't match schema
 */
export function parseSendResponse(data: unknown): SendResult {
  const result = SendResponseSchema.safeParse(data);
  
  if (!result.success) {
    throw new GlassixValidationError(
      'Invalid send response',
      result.error.errors
    );
  }
  
  const parsed = result.data;
  
  // Extract providerId from multiple possible fields
  const providerId =
    parsed.providerId ||
    parsed.id ||
    parsed.messageId ||
    parsed.conversation?.id ||
    parsed.sid ||
    undefined;
  
  // Extract conversationUrl from multiple possible fields
  const conversationUrl =
    parsed.conversationUrl ||
    parsed.conversation?.url ||
    parsed.conversation_link ||
    undefined;
  
  return {
    providerId,
    conversationUrl,
  };
}

/**
 * Custom error for Glassix API validation failures
 */
export class GlassixValidationError extends Error {
  constructor(
    message: string,
    public readonly zodErrors: z.ZodIssue[]
  ) {
    super(message);
    this.name = 'GlassixValidationError';
    Error.captureStackTrace(this, GlassixValidationError);
  }
  
  /**
   * Get human-readable error details
   */
  getDetails(): string {
    return this.zodErrors
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join('; ');
  }
}

