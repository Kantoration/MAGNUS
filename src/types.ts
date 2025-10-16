/**
 * Shared type definitions for the automation worker
 */

export interface SalesforceTask {
  Id: string;
  Subject: string;
  Status: string;
  Priority?: string;
  ActivityDate?: string;
  Description?: string;
  WhoId?: string;
  WhatId?: string;
  TaskType__c?: string;
  Phone?: string;
  [key: string]: unknown;
}

export interface ContactInfo {
  Id: string;
  Name: string;
  Phone?: string;
  MobilePhone?: string;
  HomePhone?: string;
  OtherPhone?: string;
  [key: string]: unknown;
}

export interface MessageTemplate {
  taskType: string;
  templateHe: string;
  templateEn: string;
  variables: string[];
}

export interface MessagePayload {
  to: string;
  message: string;
  taskId: string;
  taskType: string;
}

export interface GlassixResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ProcessingResult {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ taskId: string; reason: string }>;
}

// Template mapping types
export type RawMappingRow = {
  name: string; // task type key
  'מלל הודעה': string; // message body (hebrew label)
  Link: string; // url to include
  'שם הודעה מובנית בגלאסיקס'?: string; // glassix built-in template id (optional)
};

export type NormalizedMapping = {
  taskKey: string; // normalized from name
  messageBody?: string; // from מלל הודעה
  link?: string; // from Link
  glassixTemplateId?: string; // from שם הודעה מובנית בגלאסיקס
  language?: string; // optional language override
};

export type RenderContext = {
  first_name?: string;
  account_name?: string;
  device_model?: string;
  imei?: string;
  date_iso?: string; // YYYY-MM-DD
  date_he?: string; // DD/MM/YYYY
  link?: string;
  [k: string]: unknown;
};
