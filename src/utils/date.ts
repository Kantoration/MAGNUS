/**
 * Date formatting utilities with Hebrew and English support
 * All dates use Asia/Jerusalem timezone by default
 */
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import 'dayjs/locale/he.js';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

// Default timezone for all operations
const DEFAULT_TIMEZONE = 'Asia/Jerusalem';

const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export function formatDateHe(date: Date | string): string {
  const d = dayjs(date);
  const dayName = HEBREW_DAYS[d.day()];
  const day = d.date();
  const month = HEBREW_MONTHS[d.month()];
  const year = d.year();

  return `יום ${dayName}, ${day} ב${month} ${year}`;
}

export function formatDateEn(date: Date | string): string {
  return dayjs(date).format('dddd, MMMM D, YYYY');
}

export function formatDateTime(date: Date | string, lang: 'he' | 'en' = 'he'): string {
  const d = dayjs(date);

  if (lang === 'he') {
    return `${formatDateHe(date)} ${d.format('HH:mm')}`;
  }

  return `${formatDateEn(date)} ${d.format('h:mm A')}`;
}

export function formatShortDate(date: Date | string, lang: 'he' | 'en' = 'he'): string {
  const d = dayjs(date);

  if (lang === 'he') {
    return d.format('DD/MM/YYYY');
  }

  return d.format('MM/DD/YYYY');
}

export function isToday(date: Date | string): boolean {
  return dayjs(date).isSame(dayjs(), 'day');
}

export function parseDate(dateStr: string, format?: string): Date {
  if (format) {
    return dayjs(dateStr, format).toDate();
  }
  return dayjs(dateStr).toDate();
}

/**
 * Get current dayjs instance pinned to Asia/Jerusalem timezone
 */
export function nowTz(tz: string = DEFAULT_TIMEZONE): dayjs.Dayjs {
  return dayjs().tz(tz);
}

/**
 * Get today's date in ISO format (YYYY-MM-DD) in Asia/Jerusalem timezone
 */
export function todayIso(tz: string = DEFAULT_TIMEZONE): string {
  return nowTz(tz).format('YYYY-MM-DD');
}

/**
 * Get today's date in Hebrew format (DD/MM/YYYY) in Asia/Jerusalem timezone
 */
export function todayHe(tz: string = DEFAULT_TIMEZONE): string {
  return nowTz(tz).format('DD/MM/YYYY');
}
