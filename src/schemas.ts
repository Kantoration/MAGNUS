/**
 * Zod schemas for external API response validation
 * Provides type-safe parsing of Salesforce and Glassix responses
 */
import { z } from 'zod';

/**
 * Glassix API response schema for message sending
 */
export const GlassixSendResponseSchema = z.object({
  id: z.string().optional(),
  messageId: z.string().optional(),
  conversationUrl: z.string().url().optional(),
  conversation: z
    .object({
      id: z.string().optional(),
      url: z.string().url().optional(),
    })
    .optional(),
  status: z.string().optional(),
  error: z.string().optional(),
});

export type GlassixSendResponse = z.infer<typeof GlassixSendResponseSchema>;

/**
 * Salesforce Task query response schema
 */
export const SalesforceTaskSchema = z.object({
  Id: z.string(),
  Subject: z.string().optional(),
  Status: z.string(),
  ActivityDate: z.string().optional(),
  Description: z.string().optional(),
  Task_Type_Key__c: z.string().optional(),
  Message_Template_Key__c: z.string().optional(),
  Context_JSON__c: z.string().optional(),
  // Note: Who and What are polymorphic and validated separately
  Who: z.unknown().optional(),
  What: z.unknown().optional(),
});

export type SalesforceTask = z.infer<typeof SalesforceTaskSchema>;

/**
 * Salesforce Contact schema (from TYPEOF Who)
 */
export const SalesforceContactSchema = z.object({
  attributes: z.object({
    type: z.literal('Contact'),
  }),
  FirstName: z.string().optional(),
  LastName: z.string().optional(),
  MobilePhone: z.string().optional(),
  Phone: z.string().optional(),
  Account: z
    .object({
      Name: z.string().optional(),
    })
    .optional(),
});

/**
 * Salesforce Lead schema (from TYPEOF Who)
 */
export const SalesforceLeadSchema = z.object({
  attributes: z.object({
    type: z.literal('Lead'),
  }),
  FirstName: z.string().optional(),
  LastName: z.string().optional(),
  MobilePhone: z.string().optional(),
  Phone: z.string().optional(),
});

/**
 * Salesforce Account schema (from TYPEOF What)
 */
export const SalesforceAccountSchema = z.object({
  attributes: z.object({
    type: z.literal('Account'),
  }),
  Name: z.string().optional(),
  Phone: z.string().optional(),
});

/**
 * Salesforce query response wrapper
 */
export const SalesforceQueryResponseSchema = z.object({
  totalSize: z.number(),
  done: z.boolean(),
  records: z.array(SalesforceTaskSchema),
});

export type SalesforceQueryResponse = z.infer<typeof SalesforceQueryResponseSchema>;

/**
 * Safe parse with logging
 */
export function safeParse<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string
): T | null {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    console.warn(`[Schema Validation] ${context} failed:`, result.error.format());
    return null;
  }
  
  return result.data;
}



