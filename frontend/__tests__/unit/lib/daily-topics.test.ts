/**
 * Unit tests for daily-topics utility functions
 */

import {
  formatDateString,
  parseDateString,
  formatDateDisplay,
  isToday,
  isPastDate,
  getTodayDateString,
} from '@/lib/daily-topics';

describe('daily-topics', () => {
  describe('formatDateString', () => {
    it('formats date to YYYY-MM-DD string', () => {
      expect(formatDateString(new Date(2025, 0, 15))).toBe('2025-01-15');
      expect(formatDateString(new Date(2025, 11, 31))).toBe('2025-12-31');
      expect(formatDateString(new Date(2025, 5, 1))).toBe('2025-06-01');
    });

    it('pads single-digit months and days with zeros', () => {
      expect(formatDateString(new Date(2025, 0, 1))).toBe('2025-01-01');
      expect(formatDateString(new Date(2025, 8, 9))).toBe('2025-09-09');
    });
  });

  describe('parseDateString', () => {
    it('parses YYYY-MM-DD string to Date', () => {
      const date = parseDateString('2025-01-15');
      expect(date.getFullYear()).toBe(2025);
      expect(date.getMonth()).toBe(0); // January is 0
      expect(date.getDate()).toBe(15);
    });

    it('handles different dates correctly', () => {
      const dec31 = parseDateString('2025-12-31');
      expect(dec31.getFullYear()).toBe(2025);
      expect(dec31.getMonth()).toBe(11); // December is 11
      expect(dec31.getDate()).toBe(31);
    });

    it('round-trips with formatDateString', () => {
      const original = new Date(2025, 5, 15);
      const formatted = formatDateString(original);
      const parsed = parseDateString(formatted);
      expect(formatDateString(parsed)).toBe(formatted);
    });
  });

  describe('formatDateDisplay', () => {
    it('formats date for human-readable display', () => {
      // Note: This test may vary based on locale
      const display = formatDateDisplay('2025-01-15');
      expect(display).toContain('January');
      expect(display).toContain('15');
    });

    it('includes weekday in output', () => {
      // January 15, 2025 is a Wednesday
      const display = formatDateDisplay('2025-01-15');
      expect(display).toContain('Wednesday');
    });
  });

  describe('isToday', () => {
    it('returns true for today', () => {
      const today = getTodayDateString();
      expect(isToday(today)).toBe(true);
    });

    it('returns false for other dates', () => {
      expect(isToday('2020-01-01')).toBe(false);
      expect(isToday('2030-12-31')).toBe(false);
    });
  });

  describe('isPastDate', () => {
    it('returns true for dates before today', () => {
      expect(isPastDate('2020-01-01')).toBe(true);
      expect(isPastDate('2024-01-01')).toBe(true);
    });

    it('returns false for today', () => {
      const today = getTodayDateString();
      expect(isPastDate(today)).toBe(false);
    });

    it('returns false for future dates', () => {
      expect(isPastDate('2030-12-31')).toBe(false);
      expect(isPastDate('2099-01-01')).toBe(false);
    });
  });

  describe('getTodayDateString', () => {
    it('returns a valid date string format', () => {
      const today = getTodayDateString();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('can be parsed back to a date', () => {
      const today = getTodayDateString();
      const parsed = parseDateString(today);
      expect(parsed).toBeInstanceOf(Date);
      expect(isNaN(parsed.getTime())).toBe(false);
    });
  });
});
