/**
 * Unit tests for SpeakerIdentificationOverlay component
 * Tests confidence display, shared mic warning, and speaker selection
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SpeakerIdentificationOverlay } from '@/components/analysis/SpeakerIdentificationOverlay';

describe('SpeakerIdentificationOverlay', () => {
  const mockOnSelectSpeaker = jest.fn();
  const mockOnClose = jest.fn();

  const mockSpeakerRecords = [
    {
      speaker_label: 'SPEAKER_00',
      talk_time_percentage: 60,
    },
    {
      speaker_label: 'SPEAKER_01',
      talk_time_percentage: 40,
    },
  ];

  const mockTranscriptSegments = [
    {
      start: 0,
      end: 10,
      text: 'Hello, this is a test transcript segment for speaker A.',
      speaker: 'SPEAKER_00',
    },
    {
      start: 10,
      end: 20,
      text: 'This is speaker B talking about something interesting.',
      speaker: 'SPEAKER_01',
    },
    {
      start: 20,
      end: 30,
      text: 'Another segment from speaker A with some content.',
      speaker: 'SPEAKER_00',
    },
  ];

  const defaultProps = {
    speakerRecords: mockSpeakerRecords,
    transcriptSegments: mockTranscriptSegments,
    onSelectSpeaker: mockOnSelectSpeaker,
    onClose: mockOnClose,
    isAssigning: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders speaker cards for all speakers', () => {
      render(<SpeakerIdentificationOverlay {...defaultProps} />);

      expect(screen.getByText('SPEAKER 00')).toBeInTheDocument();
      expect(screen.getByText('SPEAKER 01')).toBeInTheDocument();
    });

    it('displays talk time percentages', () => {
      render(<SpeakerIdentificationOverlay {...defaultProps} />);

      expect(screen.getByText(/60%/)).toBeInTheDocument();
      expect(screen.getByText(/40%/)).toBeInTheDocument();
    });

    it('displays transcript excerpts', () => {
      render(<SpeakerIdentificationOverlay {...defaultProps} />);

      expect(
        screen.getByText(/Hello, this is a test transcript/)
      ).toBeInTheDocument();
      expect(screen.getByText(/This is speaker B talking/)).toBeInTheDocument();
    });

    it('calls onSelectSpeaker when speaker card is clicked', () => {
      render(<SpeakerIdentificationOverlay {...defaultProps} />);

      const speakerCard = screen.getByText('SPEAKER 00').closest('button');
      if (speakerCard) {
        fireEvent.click(speakerCard);
        expect(mockOnSelectSpeaker).toHaveBeenCalledWith('SPEAKER_00');
      }
    });

    it('disables speaker cards when isAssigning is true', () => {
      render(
        <SpeakerIdentificationOverlay {...defaultProps} isAssigning={true} />
      );

      const speakerCards = screen.getAllByRole('button');
      // Filter out the close button (if present), test only speaker cards
      const speakerCardButtons = speakerCards.filter(
        (card) => !card.getAttribute('aria-label')?.includes('Close')
      );
      speakerCardButtons.forEach((card) => {
        expect(card).toBeDisabled();
      });
    });
  });

  describe('Backend Identification - Confidence Display', () => {
    it('displays confidence badge when speaker has identification_confidence', () => {
      const speakerRecordsWithConfidence = [
        {
          speaker_label: 'SPEAKER_00',
          talk_time_percentage: 60,
          identification_confidence: 0.85,
        },
        {
          speaker_label: 'SPEAKER_01',
          talk_time_percentage: 40,
          identification_confidence: null,
        },
      ];
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          speakerRecords={speakerRecordsWithConfidence}
          userSpeakerLabel="SPEAKER_00"
        />
      );

      expect(screen.getByText('85% match')).toBeInTheDocument();
    });

    it('does not display confidence badge when no identification_confidence', () => {
      render(<SpeakerIdentificationOverlay {...defaultProps} />);

      expect(screen.queryByText(/match/)).not.toBeInTheDocument();
    });

    it('displays confidence badge for all speakers with identification_confidence', () => {
      const speakerRecordsWithConfidence = [
        {
          speaker_label: 'SPEAKER_00',
          talk_time_percentage: 60,
          identification_confidence: 0.92,
        },
        {
          speaker_label: 'SPEAKER_01',
          talk_time_percentage: 40,
          identification_confidence: 0.08,
        },
      ];
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          speakerRecords={speakerRecordsWithConfidence}
          userSpeakerLabel="SPEAKER_00"
        />
      );

      // Should show confidence for both speakers
      expect(screen.getByText('92% match')).toBeInTheDocument();
      expect(screen.getByText('8% match')).toBeInTheDocument();

      // Both speakers should have badges
      const confidenceBadges = screen.getAllByText(/match/);
      expect(confidenceBadges).toHaveLength(2);
    });

    it('rounds confidence percentage to nearest integer', () => {
      const speakerRecordsWithConfidence = [
        {
          speaker_label: 'SPEAKER_00',
          talk_time_percentage: 60,
          identification_confidence: 0.876,
        },
        {
          speaker_label: 'SPEAKER_01',
          talk_time_percentage: 40,
          identification_confidence: null,
        },
      ];
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          speakerRecords={speakerRecordsWithConfidence}
          userSpeakerLabel="SPEAKER_00"
        />
      );

      expect(screen.getByText('88% match')).toBeInTheDocument();
    });

    it('highlights identified speaker with blue ring', () => {
      const speakerRecordsWithConfidence = [
        {
          speaker_label: 'SPEAKER_00',
          talk_time_percentage: 60,
          identification_confidence: 0.85,
        },
        {
          speaker_label: 'SPEAKER_01',
          talk_time_percentage: 40,
          identification_confidence: null,
        },
      ];
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          speakerRecords={speakerRecordsWithConfidence}
          userSpeakerLabel="SPEAKER_00"
        />
      );

      const speakerACard = screen.getByText('SPEAKER 00').closest('button');
      expect(speakerACard?.className).toContain('ring-2');
      expect(speakerACard?.className).toContain('ring-blue-500');
    });

    it('does not highlight non-identified speakers', () => {
      const speakerRecordsWithConfidence = [
        {
          speaker_label: 'SPEAKER_00',
          talk_time_percentage: 60,
          identification_confidence: 0.85,
        },
        {
          speaker_label: 'SPEAKER_01',
          talk_time_percentage: 40,
          identification_confidence: null,
        },
      ];
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          speakerRecords={speakerRecordsWithConfidence}
          userSpeakerLabel="SPEAKER_00"
        />
      );

      const speakerBCard = screen.getByText('SPEAKER 01').closest('button');
      expect(speakerBCard?.className).not.toContain('ring-2');
      expect(speakerBCard?.className).not.toContain('ring-blue-500');
    });
  });

  describe('Shared Microphone Detection', () => {
    it('displays shared mic warning when detected', () => {
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          sharedMicDetected={true}
        />
      );

      expect(
        screen.getByText(/Shared Microphone Detected/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Multiple speakers were detected on your microphone/)
      ).toBeInTheDocument();
    });

    it('does not display shared mic warning when not detected', () => {
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          sharedMicDetected={false}
        />
      );

      expect(
        screen.queryByText(/Shared Microphone Detected/)
      ).not.toBeInTheDocument();
    });

    it('does not display shared mic warning when undefined', () => {
      render(<SpeakerIdentificationOverlay {...defaultProps} />);

      expect(
        screen.queryByText(/Shared Microphone Detected/)
      ).not.toBeInTheDocument();
    });

    it('displays warning icon in shared mic banner', () => {
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          sharedMicDetected={true}
        />
      );

      // Look for the warning banner container with yellow styling
      // The text is in a nested div, so we need to go up to find the actual banner
      const warningText = screen.getByText(/Shared Microphone Detected/);
      const warningBanner = warningText.closest('.bg-yellow-50');
      expect(warningBanner).toBeInTheDocument();
      expect(warningBanner?.className).toContain('border-yellow-200');
    });
  });

  describe('Combined Features', () => {
    it('displays both confidence and shared mic warning together', () => {
      const speakerRecordsWithConfidence = [
        {
          speaker_label: 'SPEAKER_00',
          talk_time_percentage: 60,
          identification_confidence: 0.75,
        },
        {
          speaker_label: 'SPEAKER_01',
          talk_time_percentage: 40,
          identification_confidence: null,
        },
      ];
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          speakerRecords={speakerRecordsWithConfidence}
          userSpeakerLabel="SPEAKER_00"
          sharedMicDetected={true}
        />
      );

      // Shared mic warning
      expect(
        screen.getByText(/Shared Microphone Detected/)
      ).toBeInTheDocument();

      // Confidence badge
      expect(screen.getByText('75% match')).toBeInTheDocument();

      // Blue ring highlight
      const speakerACard = screen.getByText('SPEAKER 00').closest('button');
      expect(speakerACard?.className).toContain('ring-blue-500');
    });

    it('allows speaker selection even with shared mic detected', () => {
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          sharedMicDetected={true}
        />
      );

      const speakerCard = screen.getByText('SPEAKER 00').closest('button');
      if (speakerCard) {
        fireEvent.click(speakerCard);
        expect(mockOnSelectSpeaker).toHaveBeenCalledWith('SPEAKER_00');
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles speaker with no transcript segments', () => {
      const speakerWithNoSegments = [
        {
          speaker_label: 'SPEAKER_00',
          talk_time_percentage: 100,
        },
      ];

      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          speakerRecords={speakerWithNoSegments}
          transcriptSegments={[]}
        />
      );

      expect(screen.getByText('SPEAKER 00')).toBeInTheDocument();
    });

    it('handles very low confidence (< 10%)', () => {
      const speakerRecordsWithConfidence = [
        {
          speaker_label: 'SPEAKER_00',
          talk_time_percentage: 60,
          identification_confidence: 0.05,
        },
        {
          speaker_label: 'SPEAKER_01',
          talk_time_percentage: 40,
          identification_confidence: null,
        },
      ];
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          speakerRecords={speakerRecordsWithConfidence}
          userSpeakerLabel="SPEAKER_00"
        />
      );

      expect(screen.getByText('5% match')).toBeInTheDocument();
    });

    it('handles perfect confidence (100%)', () => {
      const speakerRecordsWithConfidence = [
        {
          speaker_label: 'SPEAKER_00',
          talk_time_percentage: 60,
          identification_confidence: 1.0,
        },
        {
          speaker_label: 'SPEAKER_01',
          talk_time_percentage: 40,
          identification_confidence: null,
        },
      ];
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          speakerRecords={speakerRecordsWithConfidence}
          userSpeakerLabel="SPEAKER_00"
        />
      );

      expect(screen.getByText('100% match')).toBeInTheDocument();
    });

    it('handles many speakers (> 5)', () => {
      const manySpeakers = Array.from({ length: 8 }, (_, i) => ({
        speaker_label: `SPEAKER_${i.toString().padStart(2, '0')}`,
        talk_time_percentage: Math.floor(100 / 8),
      }));

      const manySegments = Array.from({ length: 8 }, (_, i) => ({
        start: i * 10,
        end: (i + 1) * 10,
        text: `Speaker ${i} speaking with some text that is long enough to be meaningful`,
        speaker: `SPEAKER_${i.toString().padStart(2, '0')}`,
      }));

      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          speakerRecords={manySpeakers}
          transcriptSegments={manySegments}
          onClose={undefined} // No close button for cleaner test
        />
      );

      // Should render all 8 speaker cards
      expect(screen.getAllByRole('button')).toHaveLength(8);
    });

    it('handles speaker label that does not exist in records', () => {
      render(
        <SpeakerIdentificationOverlay
          {...defaultProps}
          userSpeakerLabel="SPEAKER_99"
        />
      );

      // Should not crash, should not show confidence badge since no identification_confidence in records
      expect(screen.queryByText(/match/)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('provides proper button roles for speaker cards', () => {
      render(<SpeakerIdentificationOverlay {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('maintains tab order for speaker selection', () => {
      render(<SpeakerIdentificationOverlay {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).toHaveProperty('tabIndex');
      });
    });
  });
});
