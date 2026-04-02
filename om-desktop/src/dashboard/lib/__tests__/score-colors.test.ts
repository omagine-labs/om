import { describe, it, expect } from 'vitest';
import { getScoreColors } from '../score-colors';

describe('getScoreColors', () => {
  describe('Red scheme (scores 1-3)', () => {
    it('should return red scheme for score of 1', () => {
      const colors = getScoreColors(1);
      expect(colors.bgColor).toBe('bg-[#feece7]');
      expect(colors.fillColor).toBe('bg-rose-400/50');
      expect(colors.hoverFillColor).toBe('group-hover:bg-rose-400/70');
    });

    it('should return red scheme for score of 2', () => {
      const colors = getScoreColors(2);
      expect(colors.bgColor).toBe('bg-[#feece7]');
    });

    it('should return red scheme for score of 3 (boundary)', () => {
      const colors = getScoreColors(3);
      expect(colors.bgColor).toBe('bg-[#feece7]');
      expect(colors.fillColor).toBe('bg-rose-400/50');
    });
  });

  describe('Yellow scheme (scores 4-6)', () => {
    it('should return yellow scheme for score of 4 (boundary)', () => {
      const colors = getScoreColors(4);
      expect(colors.bgColor).toBe('bg-yellow-400/15');
      expect(colors.fillColor).toBe('bg-yellow-300/60');
      expect(colors.hoverFillColor).toBe('group-hover:bg-yellow-300/80');
    });

    it('should return yellow scheme for score of 5', () => {
      const colors = getScoreColors(5);
      expect(colors.bgColor).toBe('bg-yellow-400/15');
    });

    it('should return yellow scheme for score of 6 (boundary)', () => {
      const colors = getScoreColors(6);
      expect(colors.bgColor).toBe('bg-yellow-400/15');
      expect(colors.fillColor).toBe('bg-yellow-300/60');
    });
  });

  describe('Green scheme (scores 7-10)', () => {
    it('should return green scheme for score of 7 (boundary)', () => {
      const colors = getScoreColors(7);
      expect(colors.bgColor).toBe('bg-lime-300/20');
      expect(colors.fillColor).toBe('bg-lime-400/55');
      expect(colors.hoverFillColor).toBe('group-hover:bg-lime-400/70');
    });

    it('should return green scheme for score of 8', () => {
      const colors = getScoreColors(8);
      expect(colors.bgColor).toBe('bg-lime-300/20');
    });

    it('should return green scheme for score of 9', () => {
      const colors = getScoreColors(9);
      expect(colors.bgColor).toBe('bg-lime-300/20');
    });

    it('should return green scheme for score of 10', () => {
      const colors = getScoreColors(10);
      expect(colors.bgColor).toBe('bg-lime-300/20');
      expect(colors.fillColor).toBe('bg-lime-400/55');
    });
  });

  describe('Edge cases', () => {
    it('should return red scheme for score of 0', () => {
      const colors = getScoreColors(0);
      expect(colors.bgColor).toBe('bg-[#feece7]');
    });

    it('should return green scheme for decimal score above 6', () => {
      const colors = getScoreColors(6.5);
      expect(colors.bgColor).toBe('bg-lime-300/20');
    });

    it('should return yellow scheme for decimal score of 3.5', () => {
      const colors = getScoreColors(3.5);
      expect(colors.bgColor).toBe('bg-yellow-400/15');
    });
  });
});
