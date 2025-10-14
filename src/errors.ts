/**
 * Typed error classes for AutoMessager
 * Provides structured, actionable error information
 */

/**
 * Base error class with error codes
 */
export class AutoMessagerError extends Error {
  code: string = 'AUTOMESSAGER_ERROR';
  hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = this.constructor.name;
    this.hint = hint;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Configuration error (invalid .env, missing fields, etc.)
 */
export class ConfigError extends AutoMessagerError {
  code = 'CONFIG_ERROR';

  constructor(message: string, hint?: string) {
    super(message, hint || 'Run: automessager init');
  }
}

/**
 * Network error (timeout, connection refused, etc.)
 */
export class NetworkError extends AutoMessagerError {
  code = 'NETWORK_ERROR';
  status?: number;
  retryable?: boolean;

  constructor(message: string, status?: number, retryable?: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

/**
 * Upstream API error (Salesforce, Glassix)
 */
export class UpstreamError extends AutoMessagerError {
  code = 'UPSTREAM_ERROR';
  provider?: 'salesforce' | 'glassix';
  status?: number;
  retryable?: boolean;

  constructor(
    message: string,
    provider?: 'salesforce' | 'glassix',
    status?: number,
    retryable?: boolean
  ) {
    super(message);
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;

    // Set hint based on provider
    if (provider === 'salesforce') {
      this.hint = 'Check SF credentials. Run: automessager verify';
    } else if (provider === 'glassix') {
      this.hint = 'Check Glassix auth. Run: automessager doctor';
    }
  }
}

/**
 * Validation error (bad data, invalid format, etc.)
 */
export class ValidationError extends AutoMessagerError {
  code = 'VALIDATION_ERROR';
  details?: string[];

  constructor(message: string, details?: string[]) {
    super(message);
    this.details = details;
    this.hint = 'Review data and try again';
  }
}

/**
 * Sanitization error (unsafe content, injection attempt, etc.)
 */
export class SanitizationError extends AutoMessagerError {
  code = 'SANITIZATION_ERROR';

  constructor(message: string) {
    super(message);
    this.hint = 'Content contains unsafe characters or exceeds limits';
  }
}

/**
 * Phone validation error (invalid format, unsupported country, etc.)
 */
export class PhoneError extends AutoMessagerError {
  code = 'PHONE_ERROR';
  phoneHint?: string;

  constructor(message: string, phoneHint?: string) {
    super(message);
    this.phoneHint = phoneHint;
    this.hint = 'Verify phone number format and country code';
  }
}

/**
 * Template error (template not found, rendering failed, etc.)
 */
export class TemplateError extends AutoMessagerError {
  code = 'TEMPLATE_ERROR';
  templateKey?: string;

  constructor(message: string, templateKey?: string) {
    super(message);
    this.templateKey = templateKey;
    this.hint = 'Run: automessager verify:mapping';
  }
}

