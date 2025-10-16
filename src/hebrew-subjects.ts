/**
 * Hebrew Subject Policy for Glassix Conversations
 * 
 * Implements the manual workflow requirement for natural Hebrew subjects
 * that match what human reps would type in Glassix UI
 */

export interface HebrewSubjectConfig {
  taskKey: string;
  hebrewDisplayName: string;
  subjectTemplate: string;
}

/**
 * Hebrew display names and subject templates for each task type
 * These match what human reps would naturally type in Glassix
 */
export const HEBREW_SUBJECT_CONFIGS: HebrewSubjectConfig[] = [
  {
    taskKey: 'NEW_PHONE_READY',
    hebrewDisplayName: 'המכשיר מוכן לאיסוף',
    subjectTemplate: 'המכשיר מוכן לאיסוף · {account}',
  },
  {
    taskKey: 'PAYMENT_REMINDER',
    hebrewDisplayName: 'תזכורת תשלום',
    subjectTemplate: 'תזכורת תשלום · {account}',
  },
  {
    taskKey: 'TRAINING_LINK',
    hebrewDisplayName: 'קישור הדרכה',
    subjectTemplate: 'קישור הדרכה · {account}',
  },
  {
    taskKey: 'APPOINTMENT_CONFIRMATION',
    hebrewDisplayName: 'אישור תור',
    subjectTemplate: 'אישור תור · {account} · {date}',
  },
  {
    taskKey: 'WELCOME_MESSAGE',
    hebrewDisplayName: 'הודעת ברכה',
    subjectTemplate: 'הודעת ברכה · {account}',
  },
  {
    taskKey: 'RETURN_INSTRUCTIONS',
    hebrewDisplayName: 'הוראות החזרה',
    subjectTemplate: 'הוראות החזרה · {account}',
  },
  {
    taskKey: 'SATELLITE_CONNECTION_FINISH',
    hebrewDisplayName: 'חיבור לווין הושלם',
    subjectTemplate: 'חיבור לווין הושלם · {account}',
  },
  {
    taskKey: 'MAINTENANCE_REMINDER',
    hebrewDisplayName: 'תזכורת תחזוקה',
    subjectTemplate: 'תזכורת תחזוקה · {account}',
  },
  {
    taskKey: 'SERVICE_FOLLOWUP',
    hebrewDisplayName: 'מעקב שירות',
    subjectTemplate: 'מעקב שירות · {account}',
  },
];

/**
 * Generate Hebrew subject for Glassix conversation
 * Matches the natural language a human rep would use
 */
export function generateHebrewSubject(
  taskKey: string,
  context: {
    accountName?: string;
    date?: string;
    firstName?: string;
  }
): string {
  const config = HEBREW_SUBJECT_CONFIGS.find(c => 
    c.taskKey.toLowerCase() === taskKey.toLowerCase()
  );

  if (!config) {
    // Fallback for unknown task types
    return `AutoMessager: ${taskKey}`;
  }

  let subject = config.subjectTemplate;

  // Replace placeholders with actual values
  subject = subject.replace('{account}', context.accountName || 'לקוח');
  subject = subject.replace('{date}', context.date || new Date().toLocaleDateString('he-IL'));

  return subject;
}

/**
 * Generate customer name for Glassix conversation
 * Follows the manual workflow format: "FirstName LastName"
 */
export function generateCustomerName(
  firstName?: string,
  lastName?: string,
  accountName?: string
): string {
  // Try to build full name from firstName + lastName
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }
  
  // Fallback to firstName only
  if (firstName) {
    return firstName;
  }
  
  // Fallback to account name
  if (accountName) {
    return accountName;
  }
  
  // Final fallback
  return 'לקוח';
}

/**
 * Get Hebrew display name for a task key
 */
export function getHebrewDisplayName(taskKey: string): string {
  const config = HEBREW_SUBJECT_CONFIGS.find(c => 
    c.taskKey.toLowerCase() === taskKey.toLowerCase()
  );
  
  return config?.hebrewDisplayName || taskKey;
}
