/**
 * Unit tests for TranscriptView component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TranscriptView } from '@/components/analysis/TranscriptView';

describe('TranscriptView', () => {
  const mockGetDisplayName = jest.fn((speaker: string) => {
    if (speaker === 'SPEAKER_00') return 'You';
    if (speaker === 'SPEAKER_01') return 'John Doe';
    return speaker;
  });

  const mockIsAssignedToMe = jest.fn((speaker: string) => {
    return speaker === 'SPEAKER_00';
  });

  const mockFullTranscript = {
    segments: [
      {
        start: 0,
        end: 5.2,
        text: 'Hello, how are you today?',
        speaker: 'SPEAKER_00',
      },
      {
        start: 5.5,
        end: 10.8,
        text: 'I am doing great, thanks for asking!',
        speaker: 'SPEAKER_01',
      },
    ],
  };

  const mockSegments = [
    {
      id: 'segment-1',
      segmentNumber: 1,
      startTime: '2024-01-01T10:00:00Z',
      endTime: '2024-01-01T10:05:00Z',
      durationSeconds: 300,
      transcript: {
        segments: [
          {
            start: 0,
            end: 5.2,
            text: 'Hello from segment 1',
            speaker: 'SPEAKER_00',
          },
        ],
      },
      processingStatus: 'completed' as const,
    },
    {
      id: 'segment-2',
      segmentNumber: 2,
      startTime: '2024-01-01T10:10:00Z',
      endTime: '2024-01-01T10:15:00Z',
      durationSeconds: 300,
      transcript: {
        segments: [
          {
            start: 0,
            end: 4.5,
            text: 'Hello from segment 2',
            speaker: 'SPEAKER_01',
          },
        ],
      },
      processingStatus: 'completed' as const,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Single Recording Mode', () => {
    it('renders full transcript for single recording', () => {
      render(
        <TranscriptView
          hasSegments={false}
          fullTranscript={mockFullTranscript}
          isAssignedToMe={mockIsAssignedToMe}
          getDisplayName={mockGetDisplayName}
        />
      );

      expect(screen.getByText('Full Transcript')).toBeInTheDocument();
      expect(screen.getByText('Hello, how are you today?')).toBeInTheDocument();
      expect(
        screen.getByText('I am doing great, thanks for asking!')
      ).toBeInTheDocument();
    });

    it('displays speaker names correctly', () => {
      render(
        <TranscriptView
          hasSegments={false}
          fullTranscript={mockFullTranscript}
          isAssignedToMe={mockIsAssignedToMe}
          getDisplayName={mockGetDisplayName}
        />
      );

      // "You" appears twice (name + badge), use getAllByText
      expect(screen.getAllByText('You').length).toBeGreaterThan(0);
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    it('highlights current user segments', () => {
      const { container } = render(
        <TranscriptView
          hasSegments={false}
          fullTranscript={mockFullTranscript}
          isAssignedToMe={mockIsAssignedToMe}
          getDisplayName={mockGetDisplayName}
        />
      );

      const userSegments = container.querySelectorAll('.border-green-500');
      expect(userSegments.length).toBeGreaterThan(0);
    });

    it('displays timestamps correctly', () => {
      render(
        <TranscriptView
          hasSegments={false}
          fullTranscript={mockFullTranscript}
          isAssignedToMe={mockIsAssignedToMe}
          getDisplayName={mockGetDisplayName}
        />
      );

      expect(screen.getAllByText(/0:00/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/0:05/).length).toBeGreaterThan(0);
    });
  });
});
