/**
 * Tests for AgenticScoresDisplay Component
 */

import { render, screen } from '@testing-library/react';
import { AgenticScoresDisplay } from '@/components/analysis/AgenticScoresDisplay';

describe('AgenticScoresDisplay', () => {
  it('renders all 3 agentic scores when provided', () => {
    render(
      <AgenticScoresDisplay
        clarity={{ score: 8, explanation: 'Clear communication' }}
        confidence={{ score: 7, explanation: 'Confident tone' }}
        attunement={{ score: 8, explanation: 'Good attunement' }}
      />
    );

    expect(screen.getByText('Communication Analysis')).toBeInTheDocument();
    expect(screen.getByText('Clarity')).toBeInTheDocument();
    expect(screen.getByText('Confidence')).toBeInTheDocument();
    expect(screen.getByText('Attunement')).toBeInTheDocument();
  });

  it('renders only provided scores', () => {
    render(
      <AgenticScoresDisplay
        clarity={{ score: 8, explanation: 'Clear communication' }}
        confidence={{ score: 7, explanation: 'Confident tone' }}
      />
    );

    expect(screen.getByText('Clarity')).toBeInTheDocument();
    expect(screen.getByText('Confidence')).toBeInTheDocument();
    expect(screen.queryByText('Collaboration')).not.toBeInTheDocument();
    expect(screen.queryByText('Attunement')).not.toBeInTheDocument();
  });

  it('does not render when no scores are provided', () => {
    const { container } = render(<AgenticScoresDisplay />);

    expect(container.firstChild).toBeNull();
  });

  it('does not render when all scores are null', () => {
    const { container } = render(
      <AgenticScoresDisplay
        clarity={null}
        confidence={null}
        attunement={null}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders with responsive grid layout', () => {
    const { container } = render(
      <AgenticScoresDisplay
        clarity={{ score: 8, explanation: 'Clear' }}
        confidence={{ score: 7, explanation: 'Confident' }}
      />
    );

    const gridContainer = container.querySelector(
      '.grid.grid-cols-1.md\\:grid-cols-2'
    );
    expect(gridContainer).toBeInTheDocument();
  });

  it('passes scores and explanations to AgenticScoreCard components', () => {
    render(
      <AgenticScoresDisplay
        clarity={{ score: 8, explanation: 'Very clear and structured' }}
      />
    );

    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Very clear and structured')).toBeInTheDocument();
  });

  it('renders section header with icon', () => {
    render(
      <AgenticScoresDisplay clarity={{ score: 8, explanation: 'Clear' }} />
    );

    const header = screen.getByText('Communication Analysis');
    expect(header).toBeInTheDocument();

    // Check for icon in header
    const headerWithIcon = header.closest('.flex.items-center');
    expect(headerWithIcon?.querySelector('svg')).toBeInTheDocument();
  });

  it('renders all dimension icons', () => {
    const { container } = render(
      <AgenticScoresDisplay
        clarity={{ score: 8, explanation: 'Clear' }}
        confidence={{ score: 7, explanation: 'Confident' }}
        attunement={{ score: 8, explanation: 'Attuned' }}
      />
    );

    // Should have 4 SVG icons total: 1 header + 3 dimension icons
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(4);
  });
});
