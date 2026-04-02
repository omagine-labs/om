/**
 * Unit tests for SpeakersView component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SpeakersView } from '@/components/analysis/SpeakersView';
import { SpeakerIdentityGroup } from '@/hooks/useSpeakerIdentityGrouping';

describe('SpeakersView', () => {
  const mockFormatDuration = jest.fn((seconds: number) => `${seconds}s`);
  const mockIsAssignedToMe = jest.fn(
    (speaker: string) => speaker === 'SPEAKER_00'
  );
  const mockGetDisplayName = jest.fn((speaker: string) => {
    if (speaker === 'SPEAKER_00') return 'You';
    if (speaker === 'SPEAKER_01') return 'John Doe';
    return speaker;
  });
  const mockIsAssigned = jest.fn((speaker: string) =>
    ['SPEAKER_00', 'SPEAKER_01'].includes(speaker)
  );
  const mockSetEditingSpeaker = jest.fn();
  const mockSetCustomName = jest.fn();
  const mockHandleAssignSpeaker = jest.fn();
  const mockHandleAssignCustomName = jest.fn();

  const defaultProps = {
    isAssignedToMe: mockIsAssignedToMe,
    getDisplayName: mockGetDisplayName,
    isAssigned: mockIsAssigned,
    formatDuration: mockFormatDuration,
    editingSpeaker: null,
    isAssigning: false,
    customName: '',
    setEditingSpeaker: mockSetEditingSpeaker,
    setCustomName: mockSetCustomName,
    handleAssignSpeaker: mockHandleAssignSpeaker,
    handleAssignCustomName: mockHandleAssignCustomName,
  };

  const mockSpeakerRecords = [
    {
      id: 'record-1',
      speaker_label: 'SPEAKER_00',
      segment_id: null,
      assigned_user_id: 'user-123',
      custom_speaker_name: null,
      talk_time_seconds: 120,
      talk_time_percentage: 60,
      word_count: 200,
      words_per_minute: 100,
      avg_response_latency_seconds: 0.5,
      quick_responses_percentage: 75,
      times_interrupted: 2,
      times_interrupting: 1,
      interruption_rate: 0.5,
      communication_tips: ['Speak more slowly', 'Let others finish'],
    },
    {
      id: 'record-2',
      speaker_label: 'SPEAKER_01',
      segment_id: null,
      assigned_user_id: null,
      custom_speaker_name: 'John Doe',
      talk_time_seconds: 80,
      talk_time_percentage: 40,
      word_count: 150,
      words_per_minute: 112,
      avg_response_latency_seconds: 1.2,
      quick_responses_percentage: 50,
      times_interrupted: 1,
      times_interrupting: 2,
      interruption_rate: 1.5,
      communication_tips: null,
    },
  ];

  const mockIdentityGroups: SpeakerIdentityGroup[] = [
    {
      identity: 'user-123',
      records: [
        {
          id: 'record-1',
          speaker_label: 'SPEAKER_00',
          segment_id: 'segment-1',
          assigned_user_id: 'user-123',
          custom_speaker_name: null,
          talk_time_seconds: 120,
          talk_time_percentage: 60,
          word_count: 200,
        },
      ],
      isMe: true,
      isAssigned: true,
      displayName: 'You',
      segmentLabel: null,
      metrics: {
        totalTalkTime: 120,
        totalWords: 200,
        avgPercentage: 60,
        words_per_minute: 100,
        avg_response_latency_seconds: 0.5,
        quick_responses_percentage: 75,
        times_interrupted: 2,
        times_interrupting: 1,
        interruption_rate: 0.5,
        communication_tips: ['Speak more slowly', 'Let others finish'],
        clarity_score: null,
        clarity_explanation: null,
        confidence_score: null,
        confidence_explanation: null,
        attunement_score: null,
        attunement_explanation: null,
      },
    },
    {
      identity: 'John Doe',
      records: [
        {
          id: 'record-2',
          speaker_label: 'SPEAKER_01',
          segment_id: null,
          assigned_user_id: null,
          custom_speaker_name: 'John Doe',
          talk_time_seconds: 80,
          talk_time_percentage: 40,
          word_count: 150,
        },
      ],
      isMe: false,
      isAssigned: true,
      displayName: 'John Doe',
      segmentLabel: null,
      metrics: {
        totalTalkTime: 80,
        totalWords: 150,
        avgPercentage: 40,
        words_per_minute: 112,
        avg_response_latency_seconds: 1.2,
        quick_responses_percentage: 50,
        times_interrupted: 1,
        times_interrupting: 2,
        interruption_rate: 1.5,
        communication_tips: null,
        clarity_score: null,
        clarity_explanation: null,
        confidence_score: null,
        confidence_explanation: null,
        attunement_score: null,
        attunement_explanation: null,
      },
    },
  ];

  const mockSegments = [
    {
      id: 'segment-1',
      segmentNumber: 1,
      startTime: '2024-01-01T10:00:00Z',
      endTime: '2024-01-01T10:05:00Z',
      durationSeconds: 300,
    },
    {
      id: 'segment-2',
      segmentNumber: 2,
      startTime: '2024-01-01T10:10:00Z',
      endTime: '2024-01-01T10:15:00Z',
      durationSeconds: 300,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Single Recording Mode', () => {
    it('renders speaker statistics title', () => {
      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={mockSpeakerRecords}
          identityGroups={mockIdentityGroups}
        />
      );

      expect(
        screen.getByText('Speaker Statistics & Metrics')
      ).toBeInTheDocument();
    });

    it('renders speaker cards for each identity group', () => {
      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={mockSpeakerRecords}
          identityGroups={mockIdentityGroups}
        />
      );

      const speakerCards = screen.getAllByTestId('speaker-card');
      expect(speakerCards.length).toBe(mockIdentityGroups.length);
    });

    it('displays detailed metrics for assigned speakers', () => {
      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={mockSpeakerRecords}
          identityGroups={mockIdentityGroups}
        />
      );

      expect(screen.getAllByText('Words per Minute').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Response Time').length).toBeGreaterThan(0);
    });

    it('displays communication tips when available', () => {
      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={mockSpeakerRecords}
          identityGroups={mockIdentityGroups}
        />
      );

      expect(screen.getByText('Communication Tips')).toBeInTheDocument();
      expect(screen.getByText('Speak more slowly')).toBeInTheDocument();
      expect(screen.getByText('Let others finish')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty speaker records', () => {
      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={[]}
          identityGroups={[]}
        />
      );

      expect(
        screen.getByText('Speaker Statistics & Metrics')
      ).toBeInTheDocument();
    });

    it('handles segments with no speakers', () => {
      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={[]}
          identityGroups={[]}
        />
      );

      // Should not crash, segments with no speakers are not rendered
      expect(screen.queryByText('Segment 1')).not.toBeInTheDocument();
    });

    it('handles null communication tips', () => {
      const recordsWithoutTips = [
        {
          ...mockSpeakerRecords[0],
          communication_tips: null,
        },
      ];

      const groupsWithoutTips = [
        {
          ...mockIdentityGroups[0],
          metrics: {
            ...mockIdentityGroups[0].metrics,
            communication_tips: null,
          },
        },
      ];

      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={recordsWithoutTips}
          identityGroups={groupsWithoutTips}
        />
      );

      expect(screen.queryByText('Communication Tips')).not.toBeInTheDocument();
    });

    it('handles empty communication tips array', () => {
      const recordsWithEmptyTips = [
        {
          ...mockSpeakerRecords[0],
          communication_tips: [],
        },
      ];

      const groupsWithEmptyTips = [
        {
          ...mockIdentityGroups[0],
          metrics: {
            ...mockIdentityGroups[0].metrics,
            communication_tips: [],
          },
        },
      ];

      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={recordsWithEmptyTips}
          identityGroups={groupsWithEmptyTips}
        />
      );

      expect(screen.queryByText('Communication Tips')).not.toBeInTheDocument();
    });

    it('handles null metric values gracefully', () => {
      const recordsWithNullMetrics = [
        {
          ...mockSpeakerRecords[0],
          words_per_minute: null,
          avg_response_latency_seconds: null,
          quick_responses_percentage: null,
        },
      ];

      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={recordsWithNullMetrics}
          identityGroups={mockIdentityGroups}
        />
      );

      // Should render without crashing
      expect(
        screen.getByText('Speaker Statistics & Metrics')
      ).toBeInTheDocument();
    });
  });

  describe('Metric Display', () => {
    it('displays all interruption metrics when available', () => {
      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={mockSpeakerRecords}
          identityGroups={mockIdentityGroups}
        />
      );

      expect(screen.getAllByText('Times Interrupted').length).toBeGreaterThan(
        0
      );
      expect(screen.getAllByText('Times Interrupting').length).toBeGreaterThan(
        0
      );
      expect(screen.getAllByText('Interruption Rate').length).toBeGreaterThan(
        0
      );
    });

    it('displays quick responses percentage', () => {
      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={mockSpeakerRecords}
          identityGroups={mockIdentityGroups}
        />
      );

      expect(screen.getAllByText(/Quick Responses/).length).toBeGreaterThan(0);
    });

    it('formats interruption rate correctly', () => {
      render(
        <SpeakersView
          {...defaultProps}
          speakerRecords={mockSpeakerRecords}
          identityGroups={mockIdentityGroups}
        />
      );

      expect(screen.getByText('0.50/min')).toBeInTheDocument();
    });
  });
});
