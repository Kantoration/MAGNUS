/**
 * Error Taxonomy System
 * 
 * Normalizes failure reasons for consistent dashboards and monitoring
 * Provides structured error categorization for operations teams
 */

export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  TEMPLATE = 'TEMPLATE', 
  PHONE = 'PHONE',
  AUTHENTICATION = 'AUTHENTICATION',
  NETWORK = 'NETWORK',
  GLASSIX_API = 'GLASSIX_API',
  SALESFORCE_API = 'SALESFORCE_API',
  DEDUPLICATION = 'DEDUPLICATION',
  UNKNOWN = 'UNKNOWN'
}

export enum ErrorSeverity {
  LOW = 'LOW',      // Warnings, non-blocking issues
  MEDIUM = 'MEDIUM', // Issues that prevent processing but are recoverable
  HIGH = 'HIGH',    // Critical issues that require immediate attention
  CRITICAL = 'CRITICAL' // System-breaking issues
}

export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  description: string;
  actionable: boolean;
  retryable: boolean;
  dashboardLabel: string;
}

/**
 * Error taxonomy mapping for consistent categorization
 */
export const ERROR_TAXONOMY: Record<string, ErrorClassification> = {
  // Validation errors
  'TEMPLATE_NOT_FOUND': {
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.MEDIUM,
    code: 'TEMPLATE_NOT_FOUND',
    description: 'Excel template mapping not found for task key',
    actionable: true,
    retryable: false,
    dashboardLabel: 'Template Mapping Missing'
  },
  'TEMPLATE_VALIDATION_FAILED': {
    category: ErrorCategory.TEMPLATE,
    severity: ErrorSeverity.MEDIUM,
    code: 'TEMPLATE_VALIDATION_FAILED',
    description: 'Template parameter validation failed',
    actionable: true,
    retryable: false,
    dashboardLabel: 'Template Parameter Mismatch'
  },
  'NO_TEMPLATE_MATCH': {
    category: ErrorCategory.TEMPLATE,
    severity: ErrorSeverity.HIGH,
    code: 'NO_TEMPLATE_MATCH',
    description: 'No approved Glassix template found for message',
    actionable: true,
    retryable: false,
    dashboardLabel: 'WhatsApp Compliance Issue'
  },
  
  // Phone errors
  'PHONE_UNAVAILABLE': {
    category: ErrorCategory.PHONE,
    severity: ErrorSeverity.HIGH,
    code: 'PHONE_UNAVAILABLE',
    description: 'No valid phone number found for contact',
    actionable: true,
    retryable: false,
    dashboardLabel: 'Missing Phone Numbers'
  },
  'PHONE_INVALID': {
    category: ErrorCategory.PHONE,
    severity: ErrorSeverity.MEDIUM,
    code: 'PHONE_INVALID',
    description: 'Phone number format is invalid',
    actionable: true,
    retryable: false,
    dashboardLabel: 'Invalid Phone Numbers'
  },
  
  // Deduplication errors
  'DAILY_DEDUPLICATION': {
    category: ErrorCategory.DEDUPLICATION,
    severity: ErrorSeverity.LOW,
    code: 'DAILY_DEDUPLICATION',
    description: 'Identical template sent recently to same recipient',
    actionable: false,
    retryable: true,
    dashboardLabel: 'Duplicate Messages Prevented'
  },
  
  // Authentication errors
  'GLASSIX_AUTH_FAILED': {
    category: ErrorCategory.AUTHENTICATION,
    severity: ErrorSeverity.CRITICAL,
    code: 'GLASSIX_AUTH_FAILED',
    description: 'Glassix authentication failed',
    actionable: true,
    retryable: true,
    dashboardLabel: 'Authentication Issues'
  },
  'SF_AUTH_FAILED': {
    category: ErrorCategory.AUTHENTICATION,
    severity: ErrorSeverity.CRITICAL,
    code: 'SF_AUTH_FAILED',
    description: 'Salesforce authentication failed',
    actionable: true,
    retryable: true,
    dashboardLabel: 'Authentication Issues'
  },
  
  // API errors
  'GLASSIX_API_ERROR': {
    category: ErrorCategory.GLASSIX_API,
    severity: ErrorSeverity.HIGH,
    code: 'GLASSIX_API_ERROR',
    description: 'Glassix API error during message send',
    actionable: true,
    retryable: true,
    dashboardLabel: 'Glassix API Issues'
  },
  'SF_API_ERROR': {
    category: ErrorCategory.SALESFORCE_API,
    severity: ErrorSeverity.HIGH,
    code: 'SF_API_ERROR',
    description: 'Salesforce API error during task update',
    actionable: true,
    retryable: true,
    dashboardLabel: 'Salesforce API Issues'
  },
  
  // Network errors
  'NETWORK_TIMEOUT': {
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    code: 'NETWORK_TIMEOUT',
    description: 'Network timeout during API call',
    actionable: false,
    retryable: true,
    dashboardLabel: 'Network Issues'
  },
  'RATE_LIMITED': {
    category: ErrorCategory.NETWORK,
    severity: ErrorSeverity.MEDIUM,
    code: 'RATE_LIMITED',
    description: 'API rate limit exceeded',
    actionable: false,
    retryable: true,
    dashboardLabel: 'Rate Limiting'
  }
};

/**
 * Classify an error reason string into structured taxonomy
 */
export function classifyError(reason: string): ErrorClassification {
  // Try to match exact error codes first
  for (const [code, classification] of Object.entries(ERROR_TAXONOMY)) {
    if (reason.includes(code)) {
      return classification;
    }
  }
  
  // Pattern matching for common error types
  if (reason.includes('phone') || reason.includes('Phone')) {
    return ERROR_TAXONOMY.PHONE_UNAVAILABLE;
  }
  
  if (reason.includes('template') || reason.includes('Template')) {
    return ERROR_TAXONOMY.TEMPLATE_NOT_FOUND;
  }
  
  if (reason.includes('auth') || reason.includes('Auth')) {
    return ERROR_TAXONOMY.GLASSIX_AUTH_FAILED;
  }
  
  if (reason.includes('timeout') || reason.includes('Timeout')) {
    return ERROR_TAXONOMY.NETWORK_TIMEOUT;
  }
  
  if (reason.includes('rate limit') || reason.includes('Rate limit')) {
    return ERROR_TAXONOMY.RATE_LIMITED;
  }
  
  // Default to unknown
  return {
    category: ErrorCategory.UNKNOWN,
    severity: ErrorSeverity.MEDIUM,
    code: 'UNKNOWN_ERROR',
    description: reason,
    actionable: false,
    retryable: false,
    dashboardLabel: 'Unknown Errors'
  };
}

/**
 * Generate dashboard-friendly error summary
 */
export function generateErrorSummary(errors: Array<{ taskId: string; reason: string }>): {
  total: number;
  byCategory: Record<ErrorCategory, number>;
  bySeverity: Record<ErrorSeverity, number>;
  actionable: number;
  retryable: number;
} {
  const summary = {
    total: errors.length,
    byCategory: {} as Record<ErrorCategory, number>,
    bySeverity: {} as Record<ErrorSeverity, number>,
    actionable: 0,
    retryable: 0
  };
  
  // Initialize counters
  Object.values(ErrorCategory).forEach(cat => summary.byCategory[cat] = 0);
  Object.values(ErrorSeverity).forEach(sev => summary.bySeverity[sev] = 0);
  
  // Classify each error
  errors.forEach(({ reason }) => {
    const classification = classifyError(reason);
    
    summary.byCategory[classification.category]++;
    summary.bySeverity[classification.severity]++;
    
    if (classification.actionable) summary.actionable++;
    if (classification.retryable) summary.retryable++;
  });
  
  return summary;
}
