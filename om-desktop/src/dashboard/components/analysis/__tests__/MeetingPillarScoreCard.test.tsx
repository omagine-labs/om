import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MeetingPillarScoreCard } from '../MeetingPillarScoreCard';

describe('MeetingPillarScoreCard', () => {
  describe('Pillar Configurations', () => {
    it('should render clarity pillar with correct title and subtitle', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={7.5}
          explanation="Clear communication"
        />
      );

      expect(screen.getByText('Clarity')).toBeTruthy();
      expect(screen.getByText('How clear your content is')).toBeTruthy();
    });

    it('should render confidence pillar with correct title and subtitle', () => {
      render(
        <MeetingPillarScoreCard
          pillar="confidence"
          score={8.2}
          explanation="Confident delivery"
        />
      );

      expect(screen.getByText('Confidence')).toBeTruthy();
      expect(screen.getByText('How decisive you come across')).toBeTruthy();
    });

    it('should render attunement pillar with correct title and subtitle', () => {
      render(
        <MeetingPillarScoreCard
          pillar="attunement"
          score={6.8}
          explanation="Good connection"
        />
      );

      expect(screen.getByText('Attunement')).toBeTruthy();
      expect(screen.getByText('How you connect with others')).toBeTruthy();
    });
  });

  describe('Score Display', () => {
    it('should round score to nearest integer (single digit)', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={7.5}
          explanation="Test"
        />
      );

      // 7.5 rounds to 8
      expect(screen.getByText('8')).toBeTruthy();
    });

    it('should round down when score is below 0.5', () => {
      render(
        <MeetingPillarScoreCard
          pillar="confidence"
          score={7.4}
          explanation="Test"
        />
      );

      // 7.4 rounds to 7
      expect(screen.getByText('7')).toBeTruthy();
    });

    it('should display scale indicator', () => {
      render(
        <MeetingPillarScoreCard pillar="clarity" score={8} explanation="Test" />
      );

      expect(screen.getByText('/ 10')).toBeTruthy();
    });

    it('should handle score of 10 correctly', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={10}
          explanation="Perfect score"
        />
      );

      expect(screen.getByText('10')).toBeTruthy();
    });

    it('should handle score of 0 correctly', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={0}
          explanation="Low score"
        />
      );

      expect(screen.getByText('0')).toBeTruthy();
    });

    it('should display – when score is null', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={null}
          explanation={null}
        />
      );

      expect(screen.getByText('–')).toBeTruthy();
    });
  });

  describe('Score Quality Badges', () => {
    it('should show Excellent badge for score >= 8', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={8.5}
          explanation="Test"
        />
      );

      expect(screen.getByText('Excellent')).toBeTruthy();
    });

    it('should show Good badge for score >= 6 and < 8', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={7.0}
          explanation="Test"
        />
      );

      expect(screen.getByText('Good')).toBeTruthy();
    });

    it('should show Fair badge for score >= 4 and < 6', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={5.5}
          explanation="Test"
        />
      );

      expect(screen.getByText('Fair')).toBeTruthy();
    });

    it('should show Needs Work badge for score < 4', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={3.2}
          explanation="Test"
        />
      );

      expect(screen.getByText('Needs Work')).toBeTruthy();
    });

    it('should not show badge when score is null', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={null}
          explanation={null}
        />
      );

      expect(screen.queryByText('Excellent')).toBeFalsy();
      expect(screen.queryByText('Good')).toBeFalsy();
      expect(screen.queryByText('Fair')).toBeFalsy();
      expect(screen.queryByText('Needs Work')).toBeFalsy();
    });

    it('should show Excellent for boundary score of 8', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={8.0}
          explanation="Test"
        />
      );

      expect(screen.getByText('Excellent')).toBeTruthy();
    });

    it('should show Good for boundary score of 6', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={6.0}
          explanation="Test"
        />
      );

      expect(screen.getByText('Good')).toBeTruthy();
    });

    it('should show Fair for boundary score of 4', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={4.0}
          explanation="Test"
        />
      );

      expect(screen.getByText('Fair')).toBeTruthy();
    });
  });

  describe('Explanation Display', () => {
    it('should display explanation when provided', () => {
      const explanation =
        'You communicated clearly with well-structured points.';
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={8}
          explanation={explanation}
        />
      );

      expect(screen.getByText(explanation)).toBeTruthy();
    });

    it('should not display explanation when null', () => {
      render(
        <MeetingPillarScoreCard pillar="clarity" score={8} explanation={null} />
      );

      expect(screen.queryByText(/You communicated/)).toBeFalsy();
    });

    it('should show fallback message when score is null', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={null}
          explanation={null}
        />
      );

      expect(
        screen.getByText('Score not available for this meeting.')
      ).toBeTruthy();
    });

    it('should not show fallback message when score is 0', () => {
      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={0}
          explanation="Low score explanation"
        />
      );

      expect(
        screen.queryByText('Score not available for this meeting.')
      ).toBeFalsy();
    });
  });

  describe('Animation', () => {
    it('should apply animation delay based on animationIndex', () => {
      const { container } = render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={8}
          explanation="Test"
          animationIndex={2}
        />
      );

      const card = container.firstChild as HTMLElement;
      expect(card.style.animationDelay).toBe('200ms');
    });

    it('should default to 0ms delay when animationIndex not provided', () => {
      const { container } = render(
        <MeetingPillarScoreCard pillar="clarity" score={8} explanation="Test" />
      );

      const card = container.firstChild as HTMLElement;
      expect(card.style.animationDelay).toBe('0ms');
    });
  });

  describe('Visual Styling', () => {
    it('should have correct animation class', () => {
      const { container } = render(
        <MeetingPillarScoreCard pillar="clarity" score={8} explanation="Test" />
      );

      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('animate-fadeInUp');
    });

    it('should have hover effects', () => {
      const { container } = render(
        <MeetingPillarScoreCard pillar="clarity" score={8} explanation="Test" />
      );

      const card = container.firstChild as HTMLElement;
      expect(card.className).toContain('hover:shadow-2xl');
      expect(card.className).toContain('hover:translate-y-[-2px]');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty explanation string', () => {
      render(
        <MeetingPillarScoreCard pillar="clarity" score={8} explanation="" />
      );

      // Explanation section should not be rendered for empty string
      expect(screen.queryByText(/border-t-2/)).toBeFalsy();
    });

    it('should handle very long explanation text', () => {
      const longExplanation =
        'This is a very long explanation that contains multiple sentences and goes into great detail about the score. '.repeat(
          5
        );

      render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={8}
          explanation={longExplanation}
        />
      );

      // Check for partial text since the full text is very long
      expect(screen.getByText(/This is a very long explanation/)).toBeTruthy();
    });

    it('should handle decimal scores near boundaries', () => {
      // Test score of 7.999 (should be 'Good', not 'Excellent')
      const { rerender } = render(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={7.999}
          explanation="Test"
        />
      );

      expect(screen.getByText('Good')).toBeTruthy();
      expect(screen.getByText('8')).toBeTruthy(); // Rounds to 8

      // Test score of 8.001 (should be 'Excellent')
      rerender(
        <MeetingPillarScoreCard
          pillar="clarity"
          score={8.001}
          explanation="Test"
        />
      );

      expect(screen.getByText('Excellent')).toBeTruthy();
    });
  });
});
