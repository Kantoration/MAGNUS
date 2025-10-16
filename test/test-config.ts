/**
 * Test Configuration for AutoMessager
 * 
 * Centralized configuration for all test suites including:
 * - Test data fixtures
 * - Mock configurations
 * - Test environment setup
 * - Acceptance criteria thresholds
 */

export interface TestConfig {
  // Test data
  canonicalTasks: Array<{
    id: string;
    name: string;
    subject: string;
    variables: Record<string, string | number>;
    expectedParamCount: number;
    expectedTemplateId: string;
  }>;
  
  // Mock configurations
  mockGlassixTemplates: Array<{
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
  }>;
  
  // Test environment
  environment: {
    logLevel: string;
    dryRun: boolean;
    mockApis: boolean;
    testTimeout: number;
  };
  
  // Acceptance criteria thresholds
  acceptanceCriteria: {
    parameterMismatchThreshold: number; // Should be 0
    duplicatePreventionThreshold: number; // Should be > 99.9%
    auditTaskCreationThreshold: number; // Should be >= 99.5%
    latencyP50Threshold: number; // Should be < 10s
    latencyP95Threshold: number; // Should be < 45s
    errorTaxonomyCoverage: number; // Should be 100%
    policyViolationThreshold: number; // Should be 0
  };
  
  // Dashboard metrics
  dashboardMetrics: {
    taskSuccessRateThreshold: number; // Warning below 95%
    errorRateThreshold: number; // Warning above 5%
    retryRateThreshold: number; // Warning above 15%
    latencyThreshold: number; // Warning above 30s
  };
  
  // Production hardening
  productionHardening: {
    optInField: string;
    supportedLocales: string[];
    defaultLocale: string;
    logRetentionDays: {
      pii: number;
      audit: number;
      debug: number;
      error: number;
    };
    canaryRolloutPercentage: number;
    autoPromoteThreshold: number;
  };
}

export const TEST_CONFIG: TestConfig = {
  canonicalTasks: [
    {
      id: 'TASK_001',
      name: 'NEW_PHONE_READY',
      subject: 'New Phone Ready',
      variables: {
        first_name: 'יוסי',
        account_name: 'חברה בע"מ',
        device_model: 'iPhone 15',
        imei: '123456789012345',
        date_he: '09/10/2024',
        date_iso: '2024-10-09',
        link: 'https://example.com/phone'
      },
      expectedParamCount: 5,
      expectedTemplateId: 'NEW_PHONE_READY_TEMPLATE'
    },
    {
      id: 'TASK_002',
      name: 'PAYMENT_REMINDER',
      subject: 'Payment Reminder',
      variables: {
        first_name: 'שרה',
        account_name: 'חברה טכנולוגיות',
        amount: '₪1,500',
        due_date: '15/10/2024',
        date_he: '09/10/2024',
        date_iso: '2024-10-09',
        link: 'https://example.com/payment'
      },
      expectedParamCount: 4,
      expectedTemplateId: 'PAYMENT_REMINDER_TEMPLATE'
    },
    {
      id: 'TASK_003',
      name: 'APPOINTMENT_CONFIRMATION',
      subject: 'Appointment Confirmation',
      variables: {
        first_name: 'דוד',
        account_name: 'מרכז שירות',
        appointment_date: '12/10/2024',
        appointment_time: '14:30',
        date_he: '09/10/2024',
        date_iso: '2024-10-09',
        link: 'https://example.com/appointment'
      },
      expectedParamCount: 4,
      expectedTemplateId: 'APPOINTMENT_CONFIRMATION_TEMPLATE'
    },
    {
      id: 'TASK_004',
      name: 'WELCOME_MESSAGE',
      subject: 'Welcome Message',
      variables: {
        first_name: 'מיכל',
        account_name: 'חברה חדשה',
        date_he: '09/10/2024',
        date_iso: '2024-10-09',
        link: 'https://example.com/welcome'
      },
      expectedParamCount: 2,
      expectedTemplateId: 'WELCOME_MESSAGE_TEMPLATE'
    },
    {
      id: 'TASK_005',
      name: 'TRAINING_LINK',
      subject: 'Training Link',
      variables: {
        first_name: 'אבי',
        account_name: 'חברה שירותים',
        training_type: 'הדרכה טכנית',
        training_url: 'https://training.example.com/tech',
        date_he: '09/10/2024',
        date_iso: '2024-10-09',
        link: 'https://example.com/training'
      },
      expectedParamCount: 3,
      expectedTemplateId: 'TRAINING_LINK_TEMPLATE'
    },
    {
      id: 'TASK_006',
      name: 'RETURN_INSTRUCTIONS',
      subject: 'Return Instructions',
      variables: {
        first_name: 'רחל',
        account_name: 'חברה לוגיסטית',
        return_reason: 'החזרת מכשיר',
        return_address: 'רחוב התעשייה 15, תל אביב',
        date_he: '09/10/2024',
        date_iso: '2024-10-09',
        link: 'https://example.com/return'
      },
      expectedParamCount: 4,
      expectedTemplateId: 'RETURN_INSTRUCTIONS_TEMPLATE'
    },
    {
      id: 'TASK_007',
      name: 'SATELLITE_CONNECTION_FINISH',
      subject: 'Satellite Connection Finish',
      variables: {
        first_name: 'אלון',
        account_name: 'חברה ביטוח',
        satellite_type: 'חיבור לוויין',
        connection_date: '01/11/2024',
        date_he: '09/10/2024',
        date_iso: '2024-10-09',
        link: 'https://example.com/satellite'
      },
      expectedParamCount: 4,
      expectedTemplateId: 'SATELLITE_CONNECTION_FINISH_TEMPLATE'
    },
    {
      id: 'TASK_008',
      name: 'MAINTENANCE_REMINDER',
      subject: 'Maintenance Reminder',
      variables: {
        first_name: 'נועה',
        account_name: 'חברה מנויים',
        maintenance_type: 'תחזוקה תקופתית',
        maintenance_date: '31/12/2024',
        date_he: '09/10/2024',
        date_iso: '2024-10-09',
        link: 'https://example.com/maintenance'
      },
      expectedParamCount: 4,
      expectedTemplateId: 'MAINTENANCE_REMINDER_TEMPLATE'
    },
    {
      id: 'TASK_009',
      name: 'SERVICE_FOLLOWUP',
      subject: 'Service Follow-up',
      variables: {
        first_name: 'גיל',
        account_name: 'חברה מחקר',
        service_type: 'מעקב שירות',
        followup_date: '15/10/2024',
        date_he: '09/10/2024',
        date_iso: '2024-10-09',
        link: 'https://example.com/followup'
      },
      expectedParamCount: 4,
      expectedTemplateId: 'SERVICE_FOLLOWUP_TEMPLATE'
    }
  ],
  
  mockGlassixTemplates: [
    {
      id: 'template_001',
      name: 'NEW_PHONE_READY_TEMPLATE',
      content: 'שלום {{first_name}}, הטלפון החדש שלך {{device_model}} מוכן לאסיפה. IMEI: {{imei}}. חשבון: {{account_name}}. תאריך: {{date_he}}.',
      language: 'he',
      status: 'APPROVED',
      category: 'business',
      components: [
        { type: 'header', text: 'Header text' },
        { type: 'body', parameters: ['first_name', 'device_model', 'imei', 'account_name', 'date_he'] },
        { type: 'footer', text: 'Footer text' }
      ]
    },
    {
      id: 'template_002',
      name: 'PAYMENT_REMINDER_TEMPLATE',
      content: 'שלום {{first_name}}, תזכורת לתשלום בסך {{amount}} עבור {{account_name}}. תאריך יעד: {{due_date}}. תאריך: {{date_he}}.',
      language: 'he',
      status: 'APPROVED',
      category: 'business'
    },
    {
      id: 'template_003',
      name: 'APPOINTMENT_CONFIRMATION_TEMPLATE',
      content: 'שלום {{first_name}}, אישור פגישה ב-{{appointment_date}} בשעה {{appointment_time}} עבור {{account_name}}. תאריך: {{date_he}}.',
      language: 'he',
      status: 'APPROVED',
      category: 'business'
    },
    {
      id: 'template_004',
      name: 'WELCOME_MESSAGE_TEMPLATE',
      content: 'שלום {{first_name}}, ברוכים הבאים ל-{{account_name}}! תאריך: {{date_he}}.',
      language: 'he',
      status: 'APPROVED',
      category: 'business'
    },
    {
      id: 'template_005',
      name: 'TRAINING_LINK_TEMPLATE',
      content: 'שלום {{first_name}}, קישור להדרכה {{training_type}} עבור {{account_name}}. תאריך: {{date_he}}.',
      language: 'he',
      status: 'APPROVED',
      category: 'business'
    },
    {
      id: 'template_006',
      name: 'RETURN_INSTRUCTIONS_TEMPLATE',
      content: 'שלום {{first_name}}, הוראות החזרה עבור {{return_reason}} של {{account_name}}. כתובת: {{return_address}}. תאריך: {{date_he}}.',
      language: 'he',
      status: 'APPROVED',
      category: 'business'
    },
    {
      id: 'template_007',
      name: 'SATELLITE_CONNECTION_FINISH_TEMPLATE',
      content: 'שלום {{first_name}}, {{satellite_type}} הושלם עבור {{account_name}} בתאריך {{connection_date}}. תאריך: {{date_he}}.',
      language: 'he',
      status: 'APPROVED',
      category: 'business'
    },
    {
      id: 'template_008',
      name: 'MAINTENANCE_REMINDER_TEMPLATE',
      content: 'שלום {{first_name}}, תזכורת ל{{maintenance_type}} עבור {{account_name}}. תאריך: {{maintenance_date}}. תאריך: {{date_he}}.',
      language: 'he',
      status: 'APPROVED',
      category: 'business'
    },
    {
      id: 'template_009',
      name: 'SERVICE_FOLLOWUP_TEMPLATE',
      content: 'שלום {{first_name}}, מעקב שירות עבור {{service_type}} של {{account_name}}. תאריך מעקב: {{followup_date}}. תאריך: {{date_he}}.',
      language: 'he',
      status: 'APPROVED',
      category: 'business'
    }
  ],
  
  environment: {
    logLevel: 'error',
    dryRun: true,
    mockApis: true,
    testTimeout: 30000
  },
  
  acceptanceCriteria: {
    parameterMismatchThreshold: 0,
    duplicatePreventionThreshold: 99.9,
    auditTaskCreationThreshold: 99.5,
    latencyP50Threshold: 10000, // 10 seconds
    latencyP95Threshold: 45000, // 45 seconds
    errorTaxonomyCoverage: 100,
    policyViolationThreshold: 0
  },
  
  dashboardMetrics: {
    taskSuccessRateThreshold: 95.0,
    errorRateThreshold: 5.0,
    retryRateThreshold: 15.0,
    latencyThreshold: 30000 // 30 seconds
  },
  
  productionHardening: {
    optInField: 'WhatsApp_Opt_In__c',
    supportedLocales: ['he', 'en'],
    defaultLocale: 'he',
    logRetentionDays: {
      pii: 30,
      audit: 90,
      debug: 7,
      error: 365
    },
    canaryRolloutPercentage: 10,
    autoPromoteThreshold: 2.0
  },
  
  // Template catalog versioning
  templateCatalogVersion: '1.0.0',
  templateCatalogLastUpdated: '2024-10-09T10:00:00Z'
};

/**
 * Helper function to create mock Salesforce task
 */
export function createMockTask(taskData: typeof TEST_CONFIG.canonicalTasks[0], phone: string = '+972521234567') {
  return {
    Id: taskData.id,
    Subject: taskData.subject,
    Status: 'Not Started',
    Task_Type_Key__c: taskData.name,
    Context_JSON__c: JSON.stringify(taskData.variables),
    Phone__c: phone,
    Who: {
      attributes: { type: 'Contact' },
      FirstName: taskData.variables.first_name,
      MobilePhone: phone,
      Account: { Name: taskData.variables.account_name }
    },
    What: null
  };
}

/**
 * Helper function to create mock template mapping
 */
export function createMockTemplate(taskData: typeof TEST_CONFIG.canonicalTasks[0]) {
  const glassixTemplate = TEST_CONFIG.mockGlassixTemplates.find(
    t => t.name === taskData.expectedTemplateId
  );
  
  return {
    taskKey: taskData.name,
    messageBody: glassixTemplate?.content || 'Default message',
    glassixTemplateId: glassixTemplate?.name
  };
}

/**
 * Helper function to validate acceptance criteria
 */
export function validateAcceptanceCriteria(metrics: {
  parameterMismatches: number;
  duplicatePreventionRate: number;
  auditTaskCreationRate: number;
  latencyP50: number;
  latencyP95: number;
  errorTaxonomyCoverage: number;
  policyViolations: number;
}): { passed: boolean; failures: string[] } {
  const failures: string[] = [];
  
  if (metrics.parameterMismatches > TEST_CONFIG.acceptanceCriteria.parameterMismatchThreshold) {
    failures.push(`Parameter mismatches: ${metrics.parameterMismatches} (threshold: ${TEST_CONFIG.acceptanceCriteria.parameterMismatchThreshold})`);
  }
  
  if (metrics.duplicatePreventionRate < TEST_CONFIG.acceptanceCriteria.duplicatePreventionThreshold) {
    failures.push(`Duplicate prevention rate: ${metrics.duplicatePreventionRate}% (threshold: ${TEST_CONFIG.acceptanceCriteria.duplicatePreventionThreshold}%)`);
  }
  
  if (metrics.auditTaskCreationRate < TEST_CONFIG.acceptanceCriteria.auditTaskCreationThreshold) {
    failures.push(`Audit task creation rate: ${metrics.auditTaskCreationRate}% (threshold: ${TEST_CONFIG.acceptanceCriteria.auditTaskCreationThreshold}%)`);
  }
  
  if (metrics.latencyP50 >= TEST_CONFIG.acceptanceCriteria.latencyP50Threshold) {
    failures.push(`P50 latency: ${metrics.latencyP50}ms (threshold: <${TEST_CONFIG.acceptanceCriteria.latencyP50Threshold}ms)`);
  }
  
  if (metrics.latencyP95 >= TEST_CONFIG.acceptanceCriteria.latencyP95Threshold) {
    failures.push(`P95 latency: ${metrics.latencyP95}ms (threshold: <${TEST_CONFIG.acceptanceCriteria.latencyP95Threshold}ms)`);
  }
  
  if (metrics.errorTaxonomyCoverage < TEST_CONFIG.acceptanceCriteria.errorTaxonomyCoverage) {
    failures.push(`Error taxonomy coverage: ${metrics.errorTaxonomyCoverage}% (threshold: ${TEST_CONFIG.acceptanceCriteria.errorTaxonomyCoverage}%)`);
  }
  
  if (metrics.policyViolations > TEST_CONFIG.acceptanceCriteria.policyViolationThreshold) {
    failures.push(`Policy violations: ${metrics.policyViolations} (threshold: ${TEST_CONFIG.acceptanceCriteria.policyViolationThreshold})`);
  }
  
  return {
    passed: failures.length === 0,
    failures
  };
}
