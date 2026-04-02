/**
 * Unit tests for SpeakerSelectionCard component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpeakerSelectionCard } from '@/app/analysis/[meetingId]/components/SpeakerSelectionCard';

describe('SpeakerSelectionCard', () => {
  const mockOnSelect = jest.fn();

  const defaultProps = {
    speakerLabel: 'SPEAKER_A',
    displayName: 'Speaker A',
    transcriptSnippets: [
      'This is the first snippet of text',
      'Here is another example of what this speaker said',
      'And a third piece of transcript content',
    ],
    isAssigning: false,
    onSelect: mockOnSelect,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders speaker display name', () => {
      render(<SpeakerSelectionCard {...defaultProps} />);
      expect(screen.getByText('Speaker A')).toBeInTheDocument();
    });

    it('renders all transcript snippets', () => {
      render(<SpeakerSelectionCard {...defaultProps} />);
      expect(
        screen.getByText('This is the first snippet of text')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Here is another example of what this speaker said')
      ).toBeInTheDocument();
      expect(
        screen.getByText('And a third piece of transcript content')
      ).toBeInTheDocument();
    });

    it('renders "This is me" button', () => {
      render(<SpeakerSelectionCard {...defaultProps} />);
      expect(screen.getByText('This is me')).toBeInTheDocument();
    });

    it('renders "Sample Transcript" label', () => {
      render(<SpeakerSelectionCard {...defaultProps} />);
      expect(screen.getByText('Sample Transcript')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onSelect when "This is me" button is clicked', () => {
      render(<SpeakerSelectionCard {...defaultProps} />);
      const button = screen.getByText('This is me');
      fireEvent.click(button);
      expect(mockOnSelect).toHaveBeenCalledTimes(1);
    });

    it('disables button when isAssigning is true', () => {
      render(<SpeakerSelectionCard {...defaultProps} isAssigning={true} />);
      const button = screen.getByText('Assigning...');
      expect(button).toBeDisabled();
    });

    it('shows "Assigning..." text when isAssigning is true', () => {
      render(<SpeakerSelectionCard {...defaultProps} isAssigning={true} />);
      expect(screen.getByText('Assigning...')).toBeInTheDocument();
      expect(screen.queryByText('This is me')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty transcript snippets array', () => {
      render(
        <SpeakerSelectionCard {...defaultProps} transcriptSnippets={[]} />
      );
      expect(screen.getByText('Speaker A')).toBeInTheDocument();
      expect(screen.getByText('This is me')).toBeInTheDocument();
    });

    it('handles single transcript snippet', () => {
      render(
        <SpeakerSelectionCard
          {...defaultProps}
          transcriptSnippets={['Only one snippet']}
        />
      );
      expect(screen.getByText('Only one snippet')).toBeInTheDocument();
      expect(screen.getAllByText(/snippet/i)).toHaveLength(1);
    });

    it('handles long display names without breaking layout', () => {
      render(
        <SpeakerSelectionCard
          {...defaultProps}
          displayName="Speaker With A Very Long Name That Might Break Layout"
        />
      );
      expect(
        screen.getByText(
          'Speaker With A Very Long Name That Might Break Layout'
        )
      ).toBeInTheDocument();
    });
  });
});
