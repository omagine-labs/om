/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { ScoreSquare, getScoreColors } from '@/components/ui/ScoreSquare';

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

describe('ScoreSquare', () => {
  describe('Score Display', () => {
    it('should display the score rounded to integer', () => {
      render(<ScoreSquare score={7.5} />);
      expect(screen.getByText('8')).toBeInTheDocument();
    });

    it('should display scale indicator', () => {
      render(<ScoreSquare score={5} />);
      expect(screen.getByText('/ 10')).toBeInTheDocument();
    });

    it('should handle score of 10', () => {
      render(<ScoreSquare score={10} />);
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    it('should handle score of 0', () => {
      render(<ScoreSquare score={0} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });
  });

  describe('Color Application', () => {
    it('should apply red background for low score', () => {
      const { container } = render(<ScoreSquare score={2} />);
      const scoreSquare = container.firstChild as HTMLElement;
      expect(scoreSquare.className).toContain('bg-[#feece7]');
    });

    it('should apply yellow background for medium score', () => {
      const { container } = render(<ScoreSquare score={5} />);
      const scoreSquare = container.firstChild as HTMLElement;
      expect(scoreSquare.className).toContain('bg-yellow-400/15');
    });

    it('should apply green background for high score', () => {
      const { container } = render(<ScoreSquare score={8} />);
      const scoreSquare = container.firstChild as HTMLElement;
      expect(scoreSquare.className).toContain('bg-lime-300/20');
    });
  });

  describe('Fill Indicator', () => {
    it('should have fill height proportional to score', () => {
      const { container } = render(<ScoreSquare score={5} />);
      const fillDiv = container.querySelector(
        '.absolute.bottom-0'
      ) as HTMLElement;
      expect(fillDiv.style.height).toBe('50%');
    });

    it('should have 100% fill height for score of 10', () => {
      const { container } = render(<ScoreSquare score={10} />);
      const fillDiv = container.querySelector(
        '.absolute.bottom-0'
      ) as HTMLElement;
      expect(fillDiv.style.height).toBe('100%');
    });

    it('should have 0% fill height for score of 0', () => {
      const { container } = render(<ScoreSquare score={0} />);
      const fillDiv = container.querySelector(
        '.absolute.bottom-0'
      ) as HTMLElement;
      expect(fillDiv.style.height).toBe('0%');
    });
  });

  describe('Animation', () => {
    it('should apply animation delay when provided', () => {
      const { container } = render(
        <ScoreSquare score={5} animationDelay={200} />
      );
      const fillDiv = container.querySelector(
        '.absolute.bottom-0'
      ) as HTMLElement;
      expect(fillDiv.style.animationDelay).toBe('200ms');
    });

    it('should default to 0ms animation delay', () => {
      const { container } = render(<ScoreSquare score={5} />);
      const fillDiv = container.querySelector(
        '.absolute.bottom-0'
      ) as HTMLElement;
      expect(fillDiv.style.animationDelay).toBe('0ms');
    });
  });

  describe('Custom maxScore', () => {
    it('should calculate fill based on custom maxScore', () => {
      const { container } = render(<ScoreSquare score={5} maxScore={5} />);
      const fillDiv = container.querySelector(
        '.absolute.bottom-0'
      ) as HTMLElement;
      expect(fillDiv.style.height).toBe('100%');
    });

    it('should display custom maxScore in indicator', () => {
      render(<ScoreSquare score={3} maxScore={5} />);
      expect(screen.getByText('/ 5')).toBeInTheDocument();
    });
  });
});
