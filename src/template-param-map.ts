/**
 * Per-template variable ordering for bullet-proof WhatsApp parameters
 * Maps template names to ordered placeholder keys to ensure exact parameter positioning
 */

export const TEMPLATE_PARAM_ORDER: Record<string, string[]> = {
  // Daily messaging tasks (from daily-tasks.ts)
  'NEW_PHONE_READY': ['first_name', 'device_model', 'date', 'link'],
  'PAYMENT_REMINDER': ['first_name', 'amount', 'link', 'date'],
  'TRAINING_LINK': ['first_name', 'link', 'device_model'],
  'APPOINTMENT_CONFIRMATION': ['first_name', 'date', 'time', 'location'],
  'WELCOME_MESSAGE': ['first_name', 'account_name'],
  'RETURN_INSTRUCTIONS': ['first_name', 'location', 'date'],
  'SATELLITE_CONNECTION_FINISH': ['first_name', 'device_model', 'link'],
  'MAINTENANCE_REMINDER': ['first_name', 'device_model', 'date'],
  'SERVICE_FOLLOWUP': ['first_name', 'date', 'link'],
  
  // Add more as needed - these ensure deterministic parameter ordering
  // for templates where exact position matters
};

/**
 * Get ordered parameter keys for a template
 * Falls back to heuristic ordering if template not found in map
 */
export function getTemplateParamOrder(templateName: string, availableVars: string[]): string[] {
  const predefined = TEMPLATE_PARAM_ORDER[templateName];
  
  if (predefined) {
    // Filter to only include keys that are actually available
    return predefined.filter(key => availableVars.includes(key));
  }
  
  // Fallback to heuristic ordering
  const preferred = ['first_name', 'device_model', 'date', 'link', 'amount', 'time', 'location'];
  return [
    ...preferred.filter(k => availableVars.includes(k)),
    ...availableVars.filter(k => !preferred.includes(k)).sort(),
  ];
}
