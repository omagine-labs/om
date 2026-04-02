/**
 * Unit tests for AnalysisPanel component
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import AnalysisPanel from '@/components/AnalysisPanel';
import { createClient } from '@/lib/supabase';
import { trackEvent } from '@/lib/analytics';

// Mock dependencies
jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/analytics', () => ({
  trackEvent: jest.fn(),
  EngagementEvents: {
    ANALYSIS_VIEWED: 'analysis_viewed',
  },
}));

// Mock child components
jest.mock('@/components/analysis/MeetingHeader', () => ({
  MeetingHeader: ({
    meetingTitle,
    meetingDate,
    activeTab,
    onTabChange,
    onClose,
  }: any) => (
    <div data-testid="meeting-header">
      <span>{meetingTitle || 'Meeting Analysis'}</span>
      {meetingDate && <span>{meetingDate}</span>}
      <button onClick={() => onTabChange('transcript')}>Transcript</button>
      <button onClick={() => onTabChange('speakers')}>Speakers</button>
      <button onClick={onClose}>Close</button>
      <span>Active: {activeTab}</span>
    </div>
  ),
}));

jest.mock('@/components/analysis/TranscriptView', () => ({
  TranscriptView: () => (
    <div data-testid="transcript-view">Transcript Content</div>
  ),
}));

jest.mock('@/components/analysis/SpeakersView', () => ({
  SpeakersView: () => <div data-testid="speakers-view">Speakers Content</div>,
}));

jest.mock('@/hooks/useSpeakerAssignment', () => ({
  useSpeakerAssignment: () => ({
    assignSpeaker: jest.fn(),
    assignCustomName: jest.fn(),
    isAssigning: false,
    error: null,
  }),
}));

jest.mock('@/hooks/useSpeakerIdentityGrouping', () => ({
  useSpeakerIdentityGrouping: () => [],
}));

describe('AnalysisPanel', () => {
  const mockSupabase = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
    storage: {
      from: jest.fn(),
    },
  };

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    jobId: 'job-123',
    filename: 'test-recording.mp4',
    onDelete: jest.fn(),
  };

  // Clean up after each test to prevent state updates after unmount
  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockSpeakerRecords = [
    {
      id: 'rec-1',
      job_id: 'job-123',
      created_by: 'user-123',
      speaker_label: 'SPEAKER_00',
      assigned_user_id: null,
      custom_speaker_name: null,
      summary: 'Test summary',
      transcript_segments: {
        segments: [
          {
            start: 0,
            end: 5,
            text: 'Hello world',
            speaker: 'SPEAKER_00',
          },
        ],
      },
      talk_time_seconds: 120,
      talk_time_percentage: 60,
      word_count: 200,
      words_per_minute: 100,
      segments_count: 1,
      avg_response_latency_seconds: null,
      response_count: null,
      quick_responses_percentage: null,
      times_interrupted: null,
      times_interrupting: null,
      interruption_rate: null,
      communication_tips: [],
      behavioral_insights: null,
      created_at: '2024-01-01T00:00:00Z',
      segment_id: null,
    },
  ];

  // Helper to setup successful data fetch
  const setupSuccessfulDataFetch = () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { full_name: 'Test User' },
                error: null,
              }),
            }),
          }),
        };
      } else if (table === 'processing_jobs') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  meeting_id: null,
                  created_at: '2024-01-15T14:30:00Z',
                },
                error: null,
              }),
            }),
          }),
        };
      } else if (table === 'meeting_analysis') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest
              .fn()
              .mockResolvedValue({ data: mockSpeakerRecords, error: null }),
          }),
        };
      }
      // Default fallback
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      };
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    // Default auth mock
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
    });
  });

  describe('Rendering', () => {
    it('does not render when closed', () => {
      const { container } = render(
        <AnalysisPanel {...defaultProps} isOpen={false} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders backdrop when open', async () => {
      setupSuccessfulDataFetch();
      render(<AnalysisPanel {...defaultProps} />);
      const backdrop = document.querySelector('.bg-black\\/50');
      expect(backdrop).toBeInTheDocument();

      // Wait for loading to complete
      await waitFor(() => {
        expect(
          screen.queryByText('Loading analysis...')
        ).not.toBeInTheDocument();
      });
    });

    it('renders side panel when open', async () => {
      setupSuccessfulDataFetch();
      render(<AnalysisPanel {...defaultProps} />);
      const panel = document.querySelector('.max-w-2xl');
      expect(panel).toBeInTheDocument();

      // Wait for loading to complete
      await waitFor(() => {
        expect(
          screen.queryByText('Loading analysis...')
        ).not.toBeInTheDocument();
      });
    });

    it('renders MeetingHeader with correct props', async () => {
      setupSuccessfulDataFetch();
      render(<AnalysisPanel {...defaultProps} />);
      expect(screen.getByTestId('meeting-header')).toBeInTheDocument();

      // Wait for loading to complete and data to be fetched
      await waitFor(() => {
        expect(
          screen.queryByText('Loading analysis...')
        ).not.toBeInTheDocument();
      });

      // Should show fallback title since no meeting title is available
      expect(screen.getByText('Meeting Analysis')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading state initially', async () => {
      // Make the query hang
      const mockSingle = jest.fn(() => new Promise(() => {}));
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: mockSingle,
          }),
        }),
      });

      render(<AnalysisPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Loading analysis...')).toBeInTheDocument();
      });
    });

    it('hides loading state after data loads', async () => {
      setupSuccessfulDataFetch();
      render(<AnalysisPanel {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.queryByText('Loading analysis...')
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error when no speaker records found', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        const mockSelect = jest.fn();
        const mockEq = jest.fn();
        const mockSingle = jest.fn();

        if (table === 'users') {
          mockSingle.mockResolvedValue({ data: { full_name: 'Test' } });
        } else if (table === 'processing_jobs') {
          mockSingle.mockResolvedValue({ data: { meeting_id: null } });
        } else if (table === 'meeting_analysis') {
          mockEq.mockResolvedValue({ data: [], error: null });
        }

        mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
        mockEq.mockReturnValue({ single: mockSingle });

        return { select: mockSelect };
      });

      render(<AnalysisPanel {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByText(/No speech detected in this recording/)
        ).toBeInTheDocument();
      });
    });

    it('displays error when fetch fails', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        const mockSelect = jest.fn();
        const mockEq = jest.fn();

        if (table === 'meeting_analysis') {
          mockEq.mockResolvedValue({
            data: null,
            error: new Error('Database error'),
          });
        }

        mockSelect.mockReturnValue({ eq: mockEq });

        return { select: mockSelect };
      });

      render(<AnalysisPanel {...defaultProps} />);

      await waitFor(() => {
        expect(
          screen.getByText('Failed to load analysis. Please try again.')
        ).toBeInTheDocument();
      });
    });
  });

  describe('Analytics Tracking', () => {
    it('tracks analysis viewed event when opened', async () => {
      setupSuccessfulDataFetch();
      render(<AnalysisPanel {...defaultProps} />);

      await waitFor(() => {
        expect(trackEvent).toHaveBeenCalledWith('analysis_viewed', {
          meeting_id: 'job-123',
        });
      });

      // Wait for loading to complete
      await waitFor(() => {
        expect(
          screen.queryByText('Loading analysis...')
        ).not.toBeInTheDocument();
      });
    });

    it('does not track when closed', () => {
      render(<AnalysisPanel {...defaultProps} isOpen={false} />);
      expect(trackEvent).not.toHaveBeenCalled();
    });
  });

  describe('Tab Navigation', () => {
    it('defaults to transcript tab', async () => {
      setupSuccessfulDataFetch();
      render(<AnalysisPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('transcript-view')).toBeInTheDocument();
      });
    });

    it('switches to speakers tab when clicked', async () => {
      setupSuccessfulDataFetch();
      render(<AnalysisPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('transcript-view')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Speakers'));

      await waitFor(() => {
        expect(screen.getByTestId('speakers-view')).toBeInTheDocument();
        expect(screen.queryByTestId('transcript-view')).not.toBeInTheDocument();
      });
    });
  });

  describe('Close Functionality', () => {
    it('calls onClose when close button clicked', async () => {
      setupSuccessfulDataFetch();
      render(<AnalysisPanel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('transcript-view')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Close'));

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop clicked', async () => {
      setupSuccessfulDataFetch();
      render(<AnalysisPanel {...defaultProps} />);

      const backdrop = document.querySelector('.bg-black\\/50');
      fireEvent.click(backdrop!);

      expect(defaultProps.onClose).toHaveBeenCalled();

      // Wait for loading to complete
      await waitFor(() => {
        expect(
          screen.queryByText('Loading analysis...')
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('User Context', () => {
    it('fetches and sets current user ID', async () => {
      setupSuccessfulDataFetch();
      render(<AnalysisPanel {...defaultProps} />);

      await waitFor(() => {
        expect(mockSupabase.auth.getUser).toHaveBeenCalled();
      });
    });
  });
});
