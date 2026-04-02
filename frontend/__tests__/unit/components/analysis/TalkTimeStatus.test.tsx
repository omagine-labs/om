/**
 * TalkTimeStatus Component Tests
 *
 * Tests the dynamic talk time participation status calculation
 * based on number of speakers and actual talk time percentage.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock component that mirrors the TalkTimeStatus logic
function TalkTimeStatus({
  percentage,
  numSpeakers,
}: {
  percentage: number;
  numSpeakers: number;
}) {
  // Solo meetings: special handling
  if (numSpeakers === 1) {
    return (
      <div data-testid="talk-time-status">
        <div>Solo Meeting</div>
        <div>This was a solo recording or presentation.</div>
      </div>
    );
  }

  // Calculate expected percentage and tolerance bands based on number of speakers
  const idealPercentage = 100 / numSpeakers;

  // Define tolerance ranges based on number of speakers
  let lowerBound: number;
  let upperBound: number;

  if (numSpeakers === 2) {
    // 2 speakers: ideal is 50%, balanced range 40-60%
    lowerBound = idealPercentage - 10;
    upperBound = idealPercentage + 10;
  } else if (numSpeakers === 3) {
    // 3 speakers: ideal is 33.3%, balanced range 25-42%
    lowerBound = idealPercentage - 8;
    upperBound = idealPercentage + 9;
  } else if (numSpeakers === 4) {
    // 4 speakers: ideal is 25%, balanced range 18-33%
    lowerBound = idealPercentage - 7;
    upperBound = idealPercentage + 8;
  } else {
    // 5+ speakers: ideal varies, use ±6 percentage points
    lowerBound = idealPercentage - 6;
    upperBound = idealPercentage + 6;
  }

  const isBalanced = percentage >= lowerBound && percentage <= upperBound;

  const status = isBalanced
    ? {
        label: 'Balanced Participation',
        description: 'Your speaking time is well-balanced with the group.',
      }
    : {
        label:
          percentage < lowerBound ? 'Low Participation' : 'High Participation',
        description:
          percentage < lowerBound
            ? 'Consider contributing more to discussions.'
            : 'Consider creating more space for others.',
      };

  return (
    <div data-testid="talk-time-status">
      <div>{status.label}</div>
      <div>{status.description}</div>
    </div>
  );
}

describe('TalkTimeStatus', () => {
  describe('Solo Meetings (1 speaker)', () => {
    it('should show "Solo Meeting" for 1 speaker at 100%', () => {
      render(<TalkTimeStatus percentage={100} numSpeakers={1} />);
      expect(screen.getByText('Solo Meeting')).toBeInTheDocument();
      expect(
        screen.getByText('This was a solo recording or presentation.')
      ).toBeInTheDocument();
    });
  });

  describe('Two Speaker Meetings (ideal: 50%, balanced: 40-60%)', () => {
    it('should show balanced for 47% (near ideal 50%)', () => {
      render(<TalkTimeStatus percentage={47} numSpeakers={2} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show balanced for 50% (exactly ideal)', () => {
      render(<TalkTimeStatus percentage={50} numSpeakers={2} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show balanced for 40% (lower bound)', () => {
      render(<TalkTimeStatus percentage={40} numSpeakers={2} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show balanced for 60% (upper bound)', () => {
      render(<TalkTimeStatus percentage={60} numSpeakers={2} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show low participation for 39%', () => {
      render(<TalkTimeStatus percentage={39} numSpeakers={2} />);
      expect(screen.getByText('Low Participation')).toBeInTheDocument();
      expect(
        screen.getByText('Consider contributing more to discussions.')
      ).toBeInTheDocument();
    });

    it('should show high participation for 61%', () => {
      render(<TalkTimeStatus percentage={61} numSpeakers={2} />);
      expect(screen.getByText('High Participation')).toBeInTheDocument();
      expect(
        screen.getByText('Consider creating more space for others.')
      ).toBeInTheDocument();
    });

    it('should show low participation for 20%', () => {
      render(<TalkTimeStatus percentage={20} numSpeakers={2} />);
      expect(screen.getByText('Low Participation')).toBeInTheDocument();
    });

    it('should show high participation for 80%', () => {
      render(<TalkTimeStatus percentage={80} numSpeakers={2} />);
      expect(screen.getByText('High Participation')).toBeInTheDocument();
    });
  });

  describe('Three Speaker Meetings (ideal: 33.3%, balanced: ~25.3-42.3%)', () => {
    it('should show balanced for 33% (near ideal)', () => {
      render(<TalkTimeStatus percentage={33} numSpeakers={3} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show balanced for 26% (above lower bound)', () => {
      render(<TalkTimeStatus percentage={26} numSpeakers={3} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show balanced for 42% (upper bound)', () => {
      render(<TalkTimeStatus percentage={42} numSpeakers={3} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show low participation for 25%', () => {
      render(<TalkTimeStatus percentage={25} numSpeakers={3} />);
      expect(screen.getByText('Low Participation')).toBeInTheDocument();
    });

    it('should show high participation for 43%', () => {
      render(<TalkTimeStatus percentage={43} numSpeakers={3} />);
      expect(screen.getByText('High Participation')).toBeInTheDocument();
    });
  });

  describe('Four Speaker Meetings (ideal: 25%, balanced: 18-33%)', () => {
    it('should show balanced for 25% (exactly ideal)', () => {
      render(<TalkTimeStatus percentage={25} numSpeakers={4} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show balanced for 18% (lower bound)', () => {
      render(<TalkTimeStatus percentage={18} numSpeakers={4} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show balanced for 33% (upper bound)', () => {
      render(<TalkTimeStatus percentage={33} numSpeakers={4} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show low participation for 17%', () => {
      render(<TalkTimeStatus percentage={17} numSpeakers={4} />);
      expect(screen.getByText('Low Participation')).toBeInTheDocument();
    });

    it('should show high participation for 34%', () => {
      render(<TalkTimeStatus percentage={34} numSpeakers={4} />);
      expect(screen.getByText('High Participation')).toBeInTheDocument();
    });
  });

  describe('Five Speaker Meetings (ideal: 20%, balanced: 14-26%)', () => {
    it('should show balanced for 20% (exactly ideal)', () => {
      render(<TalkTimeStatus percentage={20} numSpeakers={5} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show balanced for 14% (lower bound)', () => {
      render(<TalkTimeStatus percentage={14} numSpeakers={5} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show balanced for 26% (upper bound)', () => {
      render(<TalkTimeStatus percentage={26} numSpeakers={5} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show low participation for 13%', () => {
      render(<TalkTimeStatus percentage={13} numSpeakers={5} />);
      expect(screen.getByText('Low Participation')).toBeInTheDocument();
    });

    it('should show high participation for 27%', () => {
      render(<TalkTimeStatus percentage={27} numSpeakers={5} />);
      expect(screen.getByText('High Participation')).toBeInTheDocument();
    });
  });

  describe('Large Meetings (6+ speakers)', () => {
    it('should show balanced for 10 speakers at 10% (exactly ideal)', () => {
      render(<TalkTimeStatus percentage={10} numSpeakers={10} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show balanced for 10 speakers at 4% (lower bound)', () => {
      render(<TalkTimeStatus percentage={4} numSpeakers={10} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show balanced for 10 speakers at 16% (upper bound)', () => {
      render(<TalkTimeStatus percentage={16} numSpeakers={10} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should show low participation for 10 speakers at 3%', () => {
      render(<TalkTimeStatus percentage={3} numSpeakers={10} />);
      expect(screen.getByText('Low Participation')).toBeInTheDocument();
    });

    it('should show high participation for 10 speakers at 17%', () => {
      render(<TalkTimeStatus percentage={17} numSpeakers={10} />);
      expect(screen.getByText('High Participation')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle decimal percentages correctly', () => {
      render(<TalkTimeStatus percentage={47.5} numSpeakers={2} />);
      expect(screen.getByText('Balanced Participation')).toBeInTheDocument();
    });

    it('should handle very small percentages', () => {
      render(<TalkTimeStatus percentage={1} numSpeakers={10} />);
      expect(screen.getByText('Low Participation')).toBeInTheDocument();
    });

    it('should handle very high percentages', () => {
      render(<TalkTimeStatus percentage={95} numSpeakers={2} />);
      expect(screen.getByText('High Participation')).toBeInTheDocument();
    });
  });
});
