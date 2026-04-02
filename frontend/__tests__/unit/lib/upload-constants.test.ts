/**
 * Upload Constants Tests
 *
 * Unit tests for upload validation functions including:
 * - Duration calculation from timestamps
 * - Duration validation against minimum requirements
 */

import {
  MIN_RECORDING_DURATION_SECONDS,
  calculateDurationSeconds,
  isDurationValid,
} from '@/lib/upload-constants';

describe('Upload Duration Validation', () => {
  describe('calculateDurationSeconds', () => {
    it('should calculate duration correctly from ISO timestamps', () => {
      const startTime = '2025-11-12T10:00:00Z';
      const endTime = '2025-11-12T10:05:00Z';
      const duration = calculateDurationSeconds(startTime, endTime);
      expect(duration).toBe(300); // 5 minutes = 300 seconds
    });

    it('should handle sub-second precision by flooring', () => {
      const startTime = '2025-11-12T10:00:00.500Z';
      const endTime = '2025-11-12T10:00:01.499Z';
      const duration = calculateDurationSeconds(startTime, endTime);
      expect(duration).toBe(0); // Floors to 0 seconds
    });

    it('should calculate duration for multi-hour recordings', () => {
      const startTime = '2025-11-12T10:00:00Z';
      const endTime = '2025-11-12T12:30:15Z';
      const duration = calculateDurationSeconds(startTime, endTime);
      expect(duration).toBe(9015); // 2h 30m 15s = 9015 seconds
    });

    it('should return 0 for equal timestamps', () => {
      const timestamp = '2025-11-12T10:00:00Z';
      const duration = calculateDurationSeconds(timestamp, timestamp);
      expect(duration).toBe(0);
    });
  });

  describe('isDurationValid', () => {
    it('should reject durations below minimum (60 seconds)', () => {
      expect(isDurationValid(0)).toBe(false);
      expect(isDurationValid(30)).toBe(false);
      expect(isDurationValid(59)).toBe(false);
    });

    it('should accept durations at or above minimum', () => {
      expect(isDurationValid(60)).toBe(true);
      expect(isDurationValid(61)).toBe(true);
      expect(isDurationValid(300)).toBe(true);
      expect(isDurationValid(3600)).toBe(true);
    });

    it('should use constant MIN_RECORDING_DURATION_SECONDS', () => {
      expect(MIN_RECORDING_DURATION_SECONDS).toBe(60);
      expect(isDurationValid(MIN_RECORDING_DURATION_SECONDS)).toBe(true);
      expect(isDurationValid(MIN_RECORDING_DURATION_SECONDS - 1)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative durations (end before start)', () => {
      const startTime = '2025-11-12T10:05:00Z';
      const endTime = '2025-11-12T10:00:00Z';
      const duration = calculateDurationSeconds(startTime, endTime);
      expect(duration).toBeLessThan(0);
      expect(isDurationValid(duration)).toBe(false);
    });

    it('should handle timestamps across day boundaries', () => {
      const startTime = '2025-11-12T23:59:00Z';
      const endTime = '2025-11-13T00:02:00Z';
      const duration = calculateDurationSeconds(startTime, endTime);
      expect(duration).toBe(180); // 3 minutes
    });

    it('should handle timestamps with different time zones', () => {
      const startTime = '2025-11-12T10:00:00-05:00';
      const endTime = '2025-11-12T10:02:00-05:00';
      const duration = calculateDurationSeconds(startTime, endTime);
      expect(duration).toBe(120); // 2 minutes
    });
  });
});
