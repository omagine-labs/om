/**
 * Unit tests for formatting utility functions
 */

import { formatTime, formatDuration } from '@/lib/formatters';

describe('formatters', () => {
  describe('formatTime', () => {
    it('formats seconds less than 60 correctly', () => {
      expect(formatTime(0)).toBe('0:00');
      expect(formatTime(5)).toBe('0:05');
      expect(formatTime(30)).toBe('0:30');
      expect(formatTime(59)).toBe('0:59');
    });

    it('formats minutes and seconds correctly', () => {
      expect(formatTime(60)).toBe('1:00');
      expect(formatTime(90)).toBe('1:30');
      expect(formatTime(125)).toBe('2:05');
      expect(formatTime(599)).toBe('9:59');
    });

    it('formats hours correctly', () => {
      expect(formatTime(3600)).toBe('60:00');
      expect(formatTime(3661)).toBe('61:01');
      expect(formatTime(7200)).toBe('120:00');
    });

    it('handles decimal seconds', () => {
      expect(formatTime(90.5)).toBe('1:30');
      expect(formatTime(90.9)).toBe('1:30');
    });

    it('pads single-digit seconds with zero', () => {
      expect(formatTime(61)).toBe('1:01');
      expect(formatTime(305)).toBe('5:05');
    });
  });

  describe('formatDuration', () => {
    it('formats durations less than 60s as seconds only', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(5)).toBe('5s');
      expect(formatDuration(30)).toBe('30s');
      expect(formatDuration(59)).toBe('59s');
    });

    it('formats durations of 60s or more as minutes and seconds', () => {
      expect(formatDuration(60)).toBe('1m 0s');
      expect(formatDuration(90)).toBe('1m 30s');
      expect(formatDuration(125)).toBe('2m 5s');
      expect(formatDuration(599)).toBe('9m 59s');
    });

    it('handles hours correctly', () => {
      expect(formatDuration(3600)).toBe('60m 0s');
      expect(formatDuration(3661)).toBe('61m 1s');
      expect(formatDuration(7200)).toBe('120m 0s');
    });

    it('rounds decimal values correctly', () => {
      expect(formatDuration(5.4)).toBe('5s');
      expect(formatDuration(5.6)).toBe('6s');
      expect(formatDuration(90.4)).toBe('1m 30s');
      expect(formatDuration(90.6)).toBe('1m 31s');
    });

    it('handles zero correctly', () => {
      expect(formatDuration(0)).toBe('0s');
    });
  });
});
