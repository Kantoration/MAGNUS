/**
 * Daily Messaging Tasks Configuration
 * 
 * Implements the "9 distinct daily messaging tasks" concept from the manual workflow.
 * Each task type maps to:
 * 1. A specific Salesforce Task_Type_Key__c value
 * 2. A corresponding Glassix template name
 * 3. Required personalization fields
 */

export interface DailyTaskConfig {
  taskKey: string;
  glassixTemplate: string;
  description: string;
  requiredFields: string[];
  priority: number;
}

/**
 * The 9 distinct daily messaging tasks as defined in the manual workflow
 * These correspond to the task types that workers process manually
 */
export const DAILY_TASK_CONFIGS: DailyTaskConfig[] = [
  {
    taskKey: 'NEW_PHONE_READY',
    glassixTemplate: 'NEW_PHONE_READY',
    description: 'Device ready for pickup notification',
    requiredFields: ['first_name', 'device_model', 'date', 'link'],
    priority: 1,
  },
  {
    taskKey: 'PAYMENT_REMINDER',
    glassixTemplate: 'PAYMENT_REMINDER', 
    description: 'Payment due reminder',
    requiredFields: ['first_name', 'amount', 'date', 'link'],
    priority: 2,
  },
  {
    taskKey: 'TRAINING_LINK',
    glassixTemplate: 'TRAINING_LINK',
    description: 'Training materials delivery',
    requiredFields: ['first_name', 'link', 'device_model'],
    priority: 3,
  },
  {
    taskKey: 'APPOINTMENT_CONFIRMATION',
    glassixTemplate: 'APPOINTMENT_CONFIRMATION',
    description: 'Service appointment confirmation',
    requiredFields: ['first_name', 'date', 'time', 'location'],
    priority: 4,
  },
  {
    taskKey: 'WELCOME_MESSAGE',
    glassixTemplate: 'WELCOME_MESSAGE',
    description: 'New customer welcome',
    requiredFields: ['first_name', 'account_name'],
    priority: 5,
  },
  {
    taskKey: 'RETURN_INSTRUCTIONS',
    glassixTemplate: 'RETURN_INSTRUCTIONS',
    description: 'Device return instructions',
    requiredFields: ['first_name', 'location', 'date'],
    priority: 6,
  },
  {
    taskKey: 'SATELLITE_CONNECTION_FINISH',
    glassixTemplate: 'SATELLITE_CONNECTION_FINISH',
    description: 'Satellite connection completion notification',
    requiredFields: ['first_name', 'device_model', 'link'],
    priority: 7,
  },
  {
    taskKey: 'MAINTENANCE_REMINDER',
    glassixTemplate: 'MAINTENANCE_REMINDER',
    description: 'Device maintenance reminder',
    requiredFields: ['first_name', 'device_model', 'date'],
    priority: 8,
  },
  {
    taskKey: 'SERVICE_FOLLOWUP',
    glassixTemplate: 'SERVICE_FOLLOWUP',
    description: 'Post-service follow-up',
    requiredFields: ['first_name', 'date', 'link'],
    priority: 9,
  },
];

/**
 * Get task configuration by task key
 */
export function getTaskConfig(taskKey: string): DailyTaskConfig | undefined {
  return DAILY_TASK_CONFIGS.find(config => 
    config.taskKey.toLowerCase() === taskKey.toLowerCase()
  );
}

/**
 * Get all task keys for validation
 */
export function getAllTaskKeys(): string[] {
  return DAILY_TASK_CONFIGS.map(config => config.taskKey);
}

/**
 * Validate that a task has all required fields for its type
 */
export function validateTaskFields(
  taskKey: string, 
  availableFields: string[]
): { valid: boolean; missing: string[] } {
  const config = getTaskConfig(taskKey);
  if (!config) {
    return { valid: false, missing: ['unknown_task_type'] };
  }

  const missing = config.requiredFields.filter(
    field => !availableFields.includes(field)
  );

  return { valid: missing.length === 0, missing };
}

/**
 * Get priority-ordered task configs
 */
export function getTaskConfigsByPriority(): DailyTaskConfig[] {
  return [...DAILY_TASK_CONFIGS].sort((a, b) => a.priority - b.priority);
}

/**
 * Check if a task key is a known daily task type
 */
export function isKnownDailyTask(taskKey: string): boolean {
  return getTaskConfig(taskKey) !== undefined;
}
