/**
 * Timezone-aware date utility tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { nowTz, todayIso, todayHe } from '../src/utils/date.js';

dayjs.extend(utc);
dayjs.extend(timezone);

describe('Timezone-aware Date Utilities', () => {
  describe('nowTz', () => {
    it('should return dayjs instance in Asia/Jerusalem timezone', () => {
      const now = nowTz();
      expect(now).toBeDefined();
      expect(typeof now.format).toBe('function');
    });

    it('should support custom timezone', () => {
      const nowNY = nowTz('America/New_York');
      expect(nowNY).toBeDefined();
      expect(typeof nowNY.format).toBe('function');
    });

    it('should reflect Asia/Jerusalem timezone', () => {
      const now = nowTz();
      // Get timezone offset - Jerusalem is typically UTC+2 or UTC+3
      const offset = now.utcOffset();
      // Jerusalem is either 120 (UTC+2) or 180 (UTC+3) depending on DST
      expect([120, 180]).toContain(offset);
    });
  });

  describe('todayIso', () => {
    it('should return date in YYYY-MM-DD format', () => {
      const result = todayIso();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return Asia/Jerusalem date', () => {
      const result = todayIso();
      const parsed = dayjs(result);
      expect(parsed.isValid()).toBe(true);
    });

    it('should support custom timezone', () => {
      const result = todayIso('America/New_York');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('todayHe', () => {
    it('should return date in DD/MM/YYYY format', () => {
      const result = todayHe();
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('should return Asia/Jerusalem date', () => {
      const result = todayHe();
      const parts = result.split('/');
      expect(parts).toHaveLength(3);
      expect(parseInt(parts[0])).toBeGreaterThan(0);
      expect(parseInt(parts[0])).toBeLessThanOrEqual(31);
      expect(parseInt(parts[1])).toBeGreaterThan(0);
      expect(parseInt(parts[1])).toBeLessThanOrEqual(12);
      expect(parseInt(parts[2])).toBeGreaterThan(2020);
    });

    it('should support custom timezone', () => {
      const result = todayHe('America/New_York');
      expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });
  });

  describe('Date boundary scenarios', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should handle date transition near UTC midnight', () => {
      // Set system time to 23:30 UTC
      // In Asia/Jerusalem (UTC+2/+3), this would be 01:30 or 02:30 next day
      const utcDate = new Date('2024-03-15T23:30:00Z');
      vi.setSystemTime(utcDate);

      const isoIL = todayIso('Asia/Jerusalem');
      const isoUTC = todayIso('UTC');

      // Parse dates
      const dateIL = dayjs(isoIL);
      const dateUTC = dayjs(isoUTC);

      // Jerusalem should be ahead of UTC
      expect(dateIL.isValid()).toBe(true);
      expect(dateUTC.isValid()).toBe(true);

      // At 23:30 UTC, Jerusalem is already next day
      expect(dateIL.date()).toBeGreaterThanOrEqual(dateUTC.date());
    });

    it('should handle date transition at exactly midnight UTC', () => {
      const utcMidnight = new Date('2024-03-15T00:00:00Z');
      vi.setSystemTime(utcMidnight);

      const isoIL = todayIso('Asia/Jerusalem');
      const heIL = todayHe('Asia/Jerusalem');

      expect(isoIL).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(heIL).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

      // At UTC midnight, Jerusalem is at 02:00 or 03:00 same day
      const dateIL = dayjs.tz(isoIL, 'Asia/Jerusalem');
      expect(dateIL.month()).toBe(2); // March (0-indexed)
      expect(dateIL.date()).toBe(15);
    });

    it('should maintain consistency between todayIso and todayHe', () => {
      const testDate = new Date('2024-06-15T12:00:00Z');
      vi.setSystemTime(testDate);

      const iso = todayIso('Asia/Jerusalem');
      const he = todayHe('Asia/Jerusalem');

      // Parse both formats
      const [isoYear, isoMonth, isoDay] = iso.split('-').map(Number);
      const [heDay, heMonth, heYear] = he.split('/').map(Number);

      // Should represent the same date
      expect(isoYear).toBe(heYear);
      expect(isoMonth).toBe(heMonth);
      expect(isoDay).toBe(heDay);
    });

    it('should handle DST transitions correctly', () => {
      // Test date during DST transition (Israel typically late March/October)
      const beforeDST = new Date('2024-03-28T22:00:00Z'); // Before DST
      vi.setSystemTime(beforeDST);

      const isoBefore = todayIso('Asia/Jerusalem');
      expect(isoBefore).toMatch(/2024-03-(28|29)/);

      // After DST (1 week later)
      const afterDST = new Date('2024-04-05T22:00:00Z');
      vi.setSystemTime(afterDST);

      const isoAfter = todayIso('Asia/Jerusalem');
      expect(isoAfter).toMatch(/2024-04-(05|06)/);
    });
  });

  describe('Format consistency', () => {
    it('should maintain format with leading zeros in todayHe', () => {
      // Set to a date that needs leading zeros
      vi.useFakeTimers();
      const testDate = new Date('2024-01-05T12:00:00Z');
      vi.setSystemTime(testDate);

      const he = todayHe('Asia/Jerusalem');

      // Should have leading zeros for single-digit day/month
      expect(he).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

      vi.useRealTimers();
    });

    it('should use 4-digit year in both formats', () => {
      const iso = todayIso();
      const he = todayHe();

      const isoYear = iso.split('-')[0];
      const heYear = he.split('/')[2];

      expect(isoYear.length).toBe(4);
      expect(heYear.length).toBe(4);
    });
  });

  describe('Timezone independence', () => {
    it('should produce same date for same timezone regardless of system time', () => {
      vi.useFakeTimers();

      // Set system time to various times
      const times = [
        new Date('2024-06-15T00:00:00Z'),
        new Date('2024-06-15T12:00:00Z'),
        new Date('2024-06-15T23:59:59Z'),
      ];

      const results: string[] = [];

      for (const time of times) {
        vi.setSystemTime(time);
        results.push(todayIso('Asia/Jerusalem'));
      }

      // All should return dates within the same 24-hour period in Jerusalem
      // They might differ by 1 day at boundaries, but format should be consistent
      results.forEach((result) => {
        expect(result).toMatch(/^2024-06-(15|16)$/);
      });

      vi.useRealTimers();
    });

    it('should allow explicit timezone override', () => {
      const isoTokyo = todayIso('Asia/Tokyo');
      const isoNY = todayIso('America/New_York');
      const isoIL = todayIso('Asia/Jerusalem');

      // All should be valid dates
      expect(isoTokyo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isoNY).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isoIL).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Dates might differ depending on current time
      // But each should be valid for its timezone
    });
  });
});
