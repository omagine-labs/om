/**
 * Tests for AgenticScoreCard Component
 */

import { render, screen } from '@testing-library/react';
import { AgenticScoreCard } from '@/components/analysis/AgenticScoreCard';

describe('AgenticScoreCard', () => {
  it('renders dimension name and score', () => {
    render(
      <AgenticScoreCard
        dimension="Clarity"
        score={8}
        explanation="Clear and well-structured communication."
      />
    );

    expect(screen.getByText('Clarity')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('renders explanation text', () => {
    render(
      <AgenticScoreCard
        dimension="Confidence"
        score={7}
        explanation="Shows confidence in communication with assertive statements."
      />
    );

    expect(
      screen.getByText(
        'Shows confidence in communication with assertive statements.'
      )
    ).toBeInTheDocument();
  });

  it('applies correct color for high scores (8-10)', () => {
    const { container } = render(
      <AgenticScoreCard
        dimension="Collaboration"
        score={9}
        explanation="Excellent collaboration skills."
      />
    );

    const scoreElement = container.querySelector(
      '.text-green-700.bg-green-100.border-green-200'
    );
    expect(scoreElement).toBeInTheDocument();
    expect(scoreElement).toHaveTextContent('9');
  });

  it('applies correct color for medium scores (6-7)', () => {
    const { container } = render(
      <AgenticScoreCard
        dimension="Attunement"
        score={6}
        explanation="Good attunement to others."
      />
    );

    const scoreElement = container.querySelector(
      '.text-blue-700.bg-blue-100.border-blue-200'
    );
    expect(scoreElement).toBeInTheDocument();
  });

  it('applies correct color for low scores (4-5)', () => {
    const { container } = render(
      <AgenticScoreCard
        dimension="Clarity"
        score={5}
        explanation="Some clarity issues present."
      />
    );

    const scoreElement = container.querySelector(
      '.text-yellow-700.bg-yellow-100.border-yellow-200'
    );
    expect(scoreElement).toBeInTheDocument();
  });

  it('applies correct color for very low scores (1-3)', () => {
    const { container } = render(
      <AgenticScoreCard
        dimension="Confidence"
        score={3}
        explanation="Low confidence in communication."
      />
    );

    const scoreElement = container.querySelector(
      '.text-red-700.bg-red-100.border-red-200'
    );
    expect(scoreElement).toBeInTheDocument();
  });

  it('renders with optional icon', () => {
    const icon = (
      <svg data-testid="test-icon">
        <path />
      </svg>
    );

    render(
      <AgenticScoreCard
        dimension="Clarity"
        score={8}
        explanation="Clear communication."
        icon={icon}
      />
    );

    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('renders without icon when not provided', () => {
    const { container } = render(
      <AgenticScoreCard
        dimension="Clarity"
        score={8}
        explanation="Clear communication."
      />
    );

    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});
