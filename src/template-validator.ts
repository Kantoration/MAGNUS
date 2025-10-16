/**
 * Template Validation for Glassix Integration
 * 
 * Validates parameter count and order against chosen template before calling Glassix
 * Fails fast with clear error messages for debugging
 */

import { getLogger } from './logger.js';
import { GlassixTemplate } from './glassix.js';

const logger = getLogger();

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  parameterCount: number;
  expectedCount: number;
}

/**
 * Validate template parameters against Glassix template structure
 */
export function validateTemplateParameters(
  template: GlassixTemplate,
  variables: Record<string, any>
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Extract parameters from template content
  const templateParams = extractTemplateParameters(template.content);
  const variableKeys = Object.keys(variables).filter(k => variables[k] != null);
  
  logger.debug(
    { 
      templateName: template.name,
      templateParams,
      variableKeys,
      templateContent: template.content.substring(0, 100)
    },
    'Validating template parameters'
  );

  // Check parameter count
  const expectedCount = templateParams.length;
  const actualCount = variableKeys.length;
  
  if (actualCount < expectedCount) {
    errors.push(`Missing ${expectedCount - actualCount} required parameters`);
  } else if (actualCount > expectedCount) {
    warnings.push(`Extra ${actualCount - expectedCount} parameters provided (will be ignored)`);
  }

  // Check for missing required parameters
  const missingParams = templateParams.filter(param => !variableKeys.includes(param));
  if (missingParams.length > 0) {
    errors.push(`Missing parameters: ${missingParams.join(', ')}`);
  }

  // Check for unused parameters (warnings only)
  const unusedParams = variableKeys.filter(key => !templateParams.includes(key));
  if (unusedParams.length > 0) {
    warnings.push(`Unused parameters: ${unusedParams.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parameterCount: actualCount,
    expectedCount,
  };
}

/**
 * Extract parameter names from template content
 * Supports both {{param}} and {param} syntax
 */
function extractTemplateParameters(content: string): string[] {
  const patterns = [
    /\{\{([^}]+)\}\}/g,  // {{param}}
    /\{([^}]+)\}/g       // {param}
  ];
  
  const params = new Set<string>();
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      params.add(match[1].trim());
    }
  }
  
  return Array.from(params);
}

/**
 * Generate deterministic external ID for idempotency
 * Format: TaskId#TemplateName#VariableHash
 */
export function generateDeterministicId(
  taskId: string,
  templateName: string,
  variables: Record<string, any>
): string {
  // Create a stable hash of variables for idempotency
  const variableHash = createVariableHash(variables);
  return `${taskId}#${templateName}#${variableHash}`;
}

/**
 * Create a stable hash of variables for idempotency checking
 */
function createVariableHash(variables: Record<string, any>): string {
  // Sort keys for deterministic ordering
  const sortedKeys = Object.keys(variables).sort();
  
  // Create hash string
  const hashString = sortedKeys
    .map(key => `${key}=${String(variables[key] || '')}`)
    .join('|');
  
  // Simple hash function (for idempotency, not security)
  let hash = 0;
  for (let i = 0; i < hashString.length; i++) {
    const char = hashString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash).toString(36);
}

/**
 * Check if template validation should be enforced
 * Some templates might be flexible, others strict
 */
export function shouldEnforceStrictValidation(template: GlassixTemplate): boolean {
  // Strict validation for known daily tasks
  const strictTemplates = [
    'NEW_PHONE_READY',
    'PAYMENT_REMINDER',
    'APPOINTMENT_CONFIRMATION',
    'WELCOME_MESSAGE'
  ];
  
  return strictTemplates.includes(template.name);
}
