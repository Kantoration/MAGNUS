/**
 * Unit tests for date utilities
 */
import { describe, it, expect } from 'vitest';
import { formatDateHe, formatDateEn, formatShortDate, isToday } from '../src/utils/date.js';

describe('Date utilities', () => {
  describe('formatShortDate', () => {
    it('should format date in Hebrew format (DD/MM/YYYY)', () => {
      const date = new Date('2024-10-09');
      const result = formatShortDate(date, 'he');
      expect(result).toBe('09/10/2024');
    });

    it('should format date in English format (MM/DD/YYYY)', () => {
      const date = new Date('2024-10-09');
      const result = formatShortDate(date, 'en');
      expect(result).toBe('10/09/2024');
    });
  });

  describe('formatDateHe', () => {
    it('should format date in Hebrew long format', () => {
      const date = new Date('2024-10-09');
      const result = formatDateHe(date);
      expect(result).toContain('אוקטובר');
      expect(result).toContain('2024');
    });
  });

  describe('formatDateEn', () => {
    it('should format date in English long format', () => {
      const date = new Date('2024-10-09');
      const result = formatDateEn(date);
      expect(result).toContain('October');
      expect(result).toContain('2024');
    });
  });

  describe('isToday', () => {
    it('should return true for current date', () => {
      const today = new Date();
      expect(isToday(today)).toBe(true);
    });

    it('should return false for past date', () => {
      const pastDate = new Date('2020-01-01');
      expect(isToday(pastDate)).toBe(false);
    });
  });
});
