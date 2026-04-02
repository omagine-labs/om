/**
 * @jest-environment jsdom
 *
 * AnalysisPreview Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AnalysisPreview } from '@/app/analysis/[meetingId]/components/AnalysisPreview';
import { createClient } from '@/lib/supabase';
import { GUEST_USER_ID } from '@/lib/constants';

// Mock dependencies
jest.mock('@/lib/supabase');
jest.mock('@/components/analysis/MeetingPillarScoreCard', () => ({
  MeetingPillarScoreCard: ({ pillar }: { pillar: string }) => (
    <div data-testid={`pillar-card-${pillar}`}>{pillar}</div>
  ),
}));
jest.mock('@/components/analysis/MeetingFocusAreas', () => ({
  MeetingFocusAreas: () => <div data-testid="focus-areas">Focus Areas</div>,
}));
jest.mock('@/components/analysis/AnalysisDetails', () => ({
  AnalysisDetails: () => <div data-testid="analysis-details">Details</div>,
}));
jest.mock('@/components/analysis/SpeakerIdentificationOverlay', () => ({
  SpeakerIdentificationOverlay: ({
    onSelectSpeaker,
  }: {
    onSelectSpeaker: (label: string) => void;
  }) => (
    <div data-testid="speaker-overlay">
      <button onClick={() => onSelectSpeaker('SPEAKER_A')}>
        Select Speaker A
      </button>
    </div>
  ),
}));
jest.mock('@/app/analysis/[meetingId]/components/SignupCTA', () => ({
  SignupCTA: ({
    isSticky,
    user,
  }: {
    isSticky: boolean;
    user: { id: string; email?: string } | null;
  }) => (
    <div
      data-testid={isSticky ? 'sticky-cta' : 'card-cta'}
      data-user={user ? 'authenticated' : 'anonymous'}
    >
      CTA
    </div>
  ),
}));

const mockSupabaseClient = {
  from: jest.fn(),
};

const mockMeeting = {
  id: 'meeting-123',
  title: 'Test Meeting',
  start_time: '2025-01-15T10:00:00Z',
  recording_duration_seconds: 3600,
  user_id: 'user-123',
  created_at: '2025-01-15T10:00:00Z',
};

const mockAnalysisRecords = [
  {
    id: 'analysis-1',
    speaker_label: 'SPEAKER_A',
    assigned_user_id: null,
    custom_speaker_name: null,
    talk_time_percentage: 60,
    talk_time_seconds: 2160,
    word_count: 500,
    segments_count: 10,
    clarity_score: 8.5,
    confidence_score: 7.8,
    attunement_score: 9.0,
    clarity_explanation: 'Clear communication',
    confidence_explanation: 'Confident delivery',
    attunement_explanation: 'Good connection',
    communication_tips: ['Tip 1', 'Tip 2'],
    transcript_segments: {
      segments: [
        { start: 0, end: 5, text: 'Hello everyone', speaker: 'SPEAKER_A' },
      ],
    },
    words_per_minute: 150,
    avg_response_latency_seconds: 1.5,
    times_interrupted: 2,
    times_interrupting: 1,
    turn_taking_balance: 5,
    quick_responses_percentage: 75,
    created_at: '2025-01-15T10:00:00Z',
    created_by: 'user-123',
    job_id: 'job-123',
    meeting_id: 'meeting-123',
    updated_at: '2025-01-15T10:00:00Z',
    summary: null,
    behavioral_insights: null,
    filler_words_breakdown: null,
    filler_words_per_minute: null,
    filler_words_total: null,
    interruption_rate: null,
    response_count: null,
    speaker_embeddings: null,
    talk_time_status: null,
    talk_time_vs_expected: null,
    verbosity: null,
    connection_pillar_score: null,
    content_pillar_score: null,
    poise_pillar_score: null,
  },
  {
    id: 'analysis-2',
    speaker_label: 'SPEAKER_B',
    assigned_user_id: null,
    custom_speaker_name: null,
    talk_time_percentage: 40,
    talk_time_seconds: 1440,
    word_count: 300,
    segments_count: 8,
    clarity_score: 7.5,
    confidence_score: 8.2,
    attunement_score: 7.8,
    clarity_explanation: 'Clear',
    confidence_explanation: 'Confident',
    attunement_explanation: 'Connected',
    communication_tips: ['Tip A'],
    transcript_segments: {
      segments: [
        { start: 5, end: 10, text: 'Thank you', speaker: 'SPEAKER_B' },
      ],
    },
    words_per_minute: 140,
    avg_response_latency_seconds: 2.0,
    times_interrupted: 1,
    times_interrupting: 2,
    turn_taking_balance: -5,
    quick_responses_percentage: 60,
    created_at: '2025-01-15T10:00:00Z',
    created_by: 'user-123',
    job_id: 'job-123',
    meeting_id: 'meeting-123',
    updated_at: '2025-01-15T10:00:00Z',
    summary: null,
    behavioral_insights: null,
    filler_words_breakdown: null,
    filler_words_per_minute: null,
    filler_words_total: null,
    interruption_rate: null,
    response_count: null,
    speaker_embeddings: null,
    talk_time_status: null,
    talk_time_vs_expected: null,
    verbosity: null,
    connection_pillar_score: null,
    content_pillar_score: null,
    poise_pillar_score: null,
  },
];

describe('AnalysisPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  });

  describe('Initial Render - No Speaker Selected', () => {
    it('should show speaker identification overlay when no speaker selected', () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: jest
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          transcriptSegments={{}}
          user={null}
        />
      );

      expect(screen.getByTestId('speaker-overlay')).toBeInTheDocument();
    });

    it('should display meeting title and metadata', () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: jest
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          transcriptSegments={{}}
          user={null}
        />
      );

      expect(screen.getByText('Test Meeting')).toBeInTheDocument();
      expect(screen.getByText(/2 speakers/i)).toBeInTheDocument();
    });

    it('should not show sticky CTA when no speaker selected', () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: jest
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          transcriptSegments={{}}
          user={null}
        />
      );

      expect(screen.queryByTestId('sticky-cta')).not.toBeInTheDocument();
    });
  });

  // Note: Speaker Selection tests would require complex multi-step mocking
  // of useEffect queries + update queries + select queries in sequence
  // These are better tested via E2E or integration tests

  describe('Speaker Selected - Full Analysis Display', () => {
    beforeEach(() => {
      // Set localStorage to simulate previous selection
      localStorage.setItem('meeting_meeting-123_speaker', 'SPEAKER_A');
    });

    it('should show pillar score cards when speaker is selected', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { speaker_label: 'SPEAKER_A' },
                error: null,
              }),
            }),
          }),
        }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          transcriptSegments={{}}
          user={null}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('pillar-card-clarity')).toBeInTheDocument();
        expect(
          screen.getByTestId('pillar-card-confidence')
        ).toBeInTheDocument();
        expect(
          screen.getByTestId('pillar-card-attunement')
        ).toBeInTheDocument();
      });
    });

    it('should show focus areas when communication tips exist', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { speaker_label: 'SPEAKER_A' },
                error: null,
              }),
            }),
          }),
        }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          transcriptSegments={{}}
          user={null}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('focus-areas')).toBeInTheDocument();
      });
    });

    it('should show analysis details', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { speaker_label: 'SPEAKER_A' },
                error: null,
              }),
            }),
          }),
        }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          transcriptSegments={{}}
          user={null}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('analysis-details')).toBeInTheDocument();
      });
    });

    it('should show sticky CTA when speaker is selected', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { speaker_label: 'SPEAKER_A' },
                error: null,
              }),
            }),
          }),
        }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          transcriptSegments={{}}
          user={null}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('sticky-cta')).toBeInTheDocument();
      });
    });

    it('should show card CTA at bottom', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { speaker_label: 'SPEAKER_A' },
                error: null,
              }),
            }),
          }),
        }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          transcriptSegments={{}}
          user={null}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('card-cta')).toBeInTheDocument();
      });
    });

    it('should show "Not you?" button when speaker is selected', async () => {
      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: { speaker_label: 'SPEAKER_A' },
                error: null,
              }),
            }),
          }),
        }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          transcriptSegments={{}}
          user={null}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Not you?')).toBeInTheDocument();
      });
    });
  });

  describe('Speaker Unassignment', () => {
    beforeEach(() => {
      localStorage.setItem('meeting_meeting-123_speaker', 'SPEAKER_A');
    });

    it('should clear speaker assignment when "Not you?" is clicked', async () => {
      // Mock fetch for the anonymous-speaker DELETE API
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, records: mockAnalysisRecords }),
      });
      global.fetch = mockFetch;

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          speakerExcerpts={{}}
          transcriptSegments={[]}
          user={null}
          accessToken="test-token"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Not you?')).toBeInTheDocument();
      });

      const notYouButton = screen.getByText('Not you?');
      fireEvent.click(notYouButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/anonymous-speaker'),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });

    it('should clear localStorage when unassigning speaker', async () => {
      // Mock fetch for the anonymous-speaker DELETE API
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, records: mockAnalysisRecords }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          speakerExcerpts={{}}
          transcriptSegments={[]}
          user={null}
          accessToken="test-token"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Not you?')).toBeInTheDocument();
      });

      expect(localStorage.getItem('meeting_meeting-123_speaker')).toBe(
        'SPEAKER_A'
      );

      const notYouButton = screen.getByText('Not you?');
      fireEvent.click(notYouButton);

      await waitFor(() => {
        expect(localStorage.getItem('meeting_meeting-123_speaker')).toBeNull();
      });
    });
  });

  describe('LocalStorage Persistence', () => {
    it('should load speaker selection from localStorage on mount', async () => {
      localStorage.setItem('meeting_meeting-123_speaker', 'SPEAKER_B');

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          speakerExcerpts={{}}
          transcriptSegments={[]}
          user={null}
        />
      );

      await waitFor(() => {
        // Should not show speaker overlay since selection exists in localStorage
        expect(screen.queryByTestId('speaker-overlay')).not.toBeInTheDocument();
      });
    });

    it('should fallback to API check if localStorage is empty', async () => {
      // Mock fetch for the anonymous-speaker GET API
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ speakerLabel: 'SPEAKER_A' }),
      });
      global.fetch = mockFetch;

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          speakerExcerpts={{}}
          transcriptSegments={[]}
          user={null}
          accessToken="test-token"
        />
      );

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(
            '/api/anonymous-speaker?meetingId=meeting-123&token=test-token'
          )
        );
      });
    });
  });

  describe('Authenticated User Flow', () => {
    const mockUser = { id: 'user-123', email: 'user@example.com' };

    it('should not load speaker from localStorage for authenticated users', async () => {
      localStorage.setItem('meeting_meeting-123_speaker', 'SPEAKER_A');

      mockSupabaseClient.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockReturnValue({
                single: jest
                  .fn()
                  .mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          transcriptSegments={{}}
          user={mockUser}
        />
      );

      // Should still show overlay even though localStorage has selection
      expect(screen.getByTestId('speaker-overlay')).toBeInTheDocument();
    });

    it('should call API routes and auto-claim for authenticated users', async () => {
      // Mock window.location.href
      delete (window as any).location;
      (window as any).location = { href: '' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          speakerExcerpts={{}}
          transcriptSegments={[]}
          user={mockUser}
        />
      );

      const selectButton = screen.getByText('Select Speaker A');
      fireEvent.click(selectButton);

      // Should call API route to assign speaker
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/assign-speaker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId: 'meeting-123',
            speakerLabel: 'SPEAKER_A',
          }),
        });
      });

      // Should call claim API route
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/claim-meeting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId: 'meeting-123',
            anonymousEmail: 'test@example.com',
          }),
        });
      });

      // Should redirect to dashboard
      await waitFor(
        () => {
          expect(window.location.href).toBe('/meetings/meeting-123/analysis');
        },
        { timeout: 1000 }
      );
    });

    it('should show loading overlay when authenticated user selects speaker', async () => {
      // Mock window.location to prevent actual navigation
      delete (window as any).location;
      (window as any).location = { href: '' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          speakerExcerpts={{}}
          transcriptSegments={[]}
          user={mockUser}
        />
      );

      const selectButton = screen.getByText('Select Speaker A');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(screen.getByText('Saving Your Meeting...')).toBeInTheDocument();
        expect(
          screen.getByText('Taking you to your dashboard')
        ).toBeInTheDocument();
      });
    });

    it('should prevent body scroll when loading overlay is shown', async () => {
      // Mock window.location to prevent actual navigation
      delete (window as any).location;
      (window as any).location = { href: '' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      render(
        <AnalysisPreview
          meeting={mockMeeting as any}
          analysisRecords={mockAnalysisRecords as any}
          anonymousEmail="test@example.com"
          speakerExcerpts={{}}
          transcriptSegments={[]}
          user={mockUser}
        />
      );

      const selectButton = screen.getByText('Select Speaker A');
      fireEvent.click(selectButton);

      await waitFor(() => {
        expect(document.body.style.overflow).toBe('hidden');
      });
    });
  });

  // Note: Error handling tests would require complex async mock setup
  // The component logs errors but doesn't throw, making it hard to test meaningfully
  // Error handling is better tested via E2E or manual testing
});
