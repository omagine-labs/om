/**
 * Weekly Dashboard Integration Tests
 *
 * Integration tests for the complete dashboard data flow:
 * - Server action data fetching
 * - Component rendering
 * - Analytics tracking
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { WeeklyDashboard } from '@/components/dashboard/WeeklyDashboard';
import { getDashboardData, getMeetingCount } from '@/app/actions/dashboard';
import { trackEvent } from '@/lib/analytics';
import type { DashboardData } from '@/types/dashboard';

// Mock dependencies
jest.mock('@/app/actions/dashboard');
jest.mock('@/lib/analytics');
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  })),
}));
jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      }),
    },
    rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn().mockResolvedValue({
            data: { app_version: null },
            error: null,
          }),
        })),
      })),
      update: jest.fn(() => ({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      })),
    })),
  })),
}));

const mockGetDashboardData = getDashboardData as jest.MockedFunction<
  typeof getDashboardData
>;
const mockGetMeetingCount = getMeetingCount as jest.MockedFunction<
  typeof getMeetingCount
>;
const mockTrackEvent = trackEvent as jest.MockedFunction<typeof trackEvent>;

describe('WeeklyDashboard Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch and display complete dashboard data', async () => {
    const mockData: DashboardData = {
      weekMetrics: {
        weekStart: '2024-11-04',
        weekEnd: '2024-11-10',
        meetingsCount: 3,
        avgTalkTimePercentage: 45.5,
        avgWordsPerMinute: 150.2,
        avgWordsPerSegment: 12.5,
        avgInterruptionRate: 8.3,
        avgTimesInterruptedPerMeeting: 2.5,
        avgTimesInterruptingPerMeeting: 1.8,
        totalFillerWords: 0,
        avgFillerWordsPerMinute: 2.5,
        fillerWordsBreakdown: {},
        avgTurnTakingBalance: null,
        medianTurnTakingBalance: null,
        avgClarityScore: null,
        avgConfidenceScore: null,
        avgAttunementScore: null,
      },
      baseline: {
        baselineTalkTimePercentage: 50.0,
        baselineWordsPerMinute: 140.0,
        baselineWordsPerSegment: 12.0,
        baselineInterruptionRate: 10.0,
        baselineTimesInterruptedPerMeeting: 3.0,
        baselineTimesInterruptingPerMeeting: 2.2,
        baselineFillerWordsPerMinute: 3.0,
        baselineTurnTakingBalance: null,
        meetingsIncluded: 12,
        baselineType: 'current',
        baselineClarityScore: null,
        baselineConfidenceScore: null,
        baselineAttunementScore: null,
      },
      comparisons: {
        talkTime: {
          currentValue: 45.5,
          baselineValue: 50.0,
          percentageChange: -9.0,
          direction: 'down',
          status: 'good',
        },
        wordsPerMinute: {
          currentValue: 150.2,
          baselineValue: 140.0,
          percentageChange: 7.3,
          direction: 'up',
          status: 'good',
        },
        wordsPerSegment: {
          currentValue: 12.5,
          baselineValue: 12.0,
          percentageChange: 4.2,
          direction: 'up',
          status: 'good',
        },
        interruptionRate: {
          currentValue: 8.3,
          baselineValue: 10.0,
          percentageChange: -17.0,
          direction: 'down',
          status: 'good',
        },
        timesInterrupted: {
          currentValue: 2.5,
          baselineValue: 3.0,
          percentageChange: -16.7,
          direction: 'down',
          status: 'good',
        },
        timesInterrupting: {
          currentValue: 1.8,
          baselineValue: 2.2,
          percentageChange: -18.2,
          direction: 'down',
          status: 'good',
        },
        fillerWordsPerMinute: {
          currentValue: 2.5,
          baselineValue: 3.0,
          percentageChange: -16.7,
          direction: 'down',
          status: 'good',
        },
        clarity: null,
        confidence: null,
        attunement: null,
      },
      unassignedMeetingsCount: 0,
    };

    mockGetDashboardData.mockResolvedValue(mockData);
    mockGetMeetingCount.mockResolvedValue(12);

    render(<WeeklyDashboard />);

    // Wait for data to load (skeleton may or may not appear due to 400ms delay)
    await waitFor(() => {
      expect(screen.getByText('Weekly Performance')).toBeInTheDocument();
    });

    // Verify header displays correctly
    expect(screen.getByText(/Week of Nov 4 - 10/)).toBeInTheDocument();
    expect(screen.getByText(/3 Meetings/)).toBeInTheDocument();

    // Verify category card headers and subheaders are displayed
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('What you said')).toBeInTheDocument();
    expect(screen.getByText('Poise')).toBeInTheDocument();
    expect(screen.getByText('How you said it')).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();
    expect(screen.getByText('How you collaborate')).toBeInTheDocument();

    // Verify metric labels are displayed
    expect(screen.getByText('Pace')).toBeInTheDocument();
    expect(screen.getByText('Verbosity')).toBeInTheDocument();
    expect(screen.getByText('Interruptions Received')).toBeInTheDocument();
    expect(screen.getByText('Interruptions Made')).toBeInTheDocument();

    // Note: Not verifying exact metric values as they appear with units attached or formatted differently

    // Verify baseline info
    expect(
      screen.getByText(/Baseline calculated from 12 meetings/)
    ).toBeInTheDocument();
    expect(screen.getByText(/rolling 12-week average/)).toBeInTheDocument();
  });

  it('should track analytics event when dashboard loads', async () => {
    const mockData: DashboardData = {
      weekMetrics: {
        weekStart: '2024-11-04',
        weekEnd: '2024-11-10',
        meetingsCount: 3,
        avgTalkTimePercentage: 45.5,
        avgWordsPerMinute: 150.2,
        avgWordsPerSegment: 12.5,
        avgInterruptionRate: 8.3,
        avgTimesInterruptedPerMeeting: 2.5,
        avgTimesInterruptingPerMeeting: 1.8,
        totalFillerWords: 0,
        avgFillerWordsPerMinute: 2.5,
        fillerWordsBreakdown: {},
        avgTurnTakingBalance: null,
        medianTurnTakingBalance: null,
        avgClarityScore: null,
        avgConfidenceScore: null,
        avgAttunementScore: null,
      },
      baseline: {
        baselineTalkTimePercentage: 50.0,
        baselineWordsPerMinute: 140.0,
        baselineWordsPerSegment: 12.0,
        baselineInterruptionRate: 10.0,
        baselineTimesInterruptedPerMeeting: 3.0,
        baselineTimesInterruptingPerMeeting: 2.2,
        baselineFillerWordsPerMinute: 3.0,
        baselineTurnTakingBalance: null,
        meetingsIncluded: 12,
        baselineType: 'current',
        baselineClarityScore: null,
        baselineConfidenceScore: null,
        baselineAttunementScore: null,
      },
      comparisons: {
        talkTime: {
          currentValue: 45.5,
          baselineValue: 50.0,
          percentageChange: -9.0,
          direction: 'down',
          status: 'good',
        },
        wordsPerMinute: {
          currentValue: 150.2,
          baselineValue: 140.0,
          percentageChange: 7.3,
          direction: 'up',
          status: 'good',
        },
        wordsPerSegment: {
          currentValue: 12.5,
          baselineValue: 12.0,
          percentageChange: 4.2,
          direction: 'up',
          status: 'good',
        },
        interruptionRate: {
          currentValue: 8.3,
          baselineValue: 10.0,
          percentageChange: -17.0,
          direction: 'down',
          status: 'good',
        },
        timesInterrupted: {
          currentValue: 2.5,
          baselineValue: 3.0,
          percentageChange: -16.7,
          direction: 'down',
          status: 'good',
        },
        timesInterrupting: {
          currentValue: 1.8,
          baselineValue: 2.2,
          percentageChange: -18.2,
          direction: 'down',
          status: 'good',
        },
        fillerWordsPerMinute: {
          currentValue: 2.5,
          baselineValue: 3.0,
          percentageChange: -16.7,
          direction: 'down',
          status: 'good',
        },
        clarity: null,
        confidence: null,
        attunement: null,
      },
      unassignedMeetingsCount: 0,
    };

    mockGetDashboardData.mockResolvedValue(mockData);
    mockGetMeetingCount.mockResolvedValue(12);

    render(<WeeklyDashboard />);

    await waitFor(() => {
      expect(mockTrackEvent).toHaveBeenCalledWith(
        'weekly_roundup_viewed',
        expect.objectContaining({
          meeting_count: 3,
        })
      );
    });
  });

  it('should display empty state for user without any meetings', async () => {
    const mockData: DashboardData = {
      weekMetrics: null,
      baseline: null,
      comparisons: null,
      unassignedMeetingsCount: 0,
    };

    mockGetDashboardData.mockResolvedValue(mockData);
    mockGetMeetingCount.mockResolvedValue(0);

    render(<WeeklyDashboard />);

    await waitFor(() => {
      expect(screen.getByTestId('empty-dashboard')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Your insights dashboard awaits/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Start recording to see your weekly insights/)
    ).toBeInTheDocument();
  });

  it('should display dashboard for user with meetings but no baseline yet', async () => {
    const mockData: DashboardData = {
      weekMetrics: {
        weekStart: '2024-11-04',
        weekEnd: '2024-11-10',
        meetingsCount: 3,
        avgTalkTimePercentage: 45.5,
        avgWordsPerMinute: 150.2,
        avgWordsPerSegment: 12.5,
        avgInterruptionRate: 8.3,
        avgTimesInterruptedPerMeeting: 2.5,
        avgTimesInterruptingPerMeeting: 1.8,
        totalFillerWords: 15,
        avgFillerWordsPerMinute: 2.5,
        fillerWordsBreakdown: { um: 5, uh: 5, like: 5 },
        avgTurnTakingBalance: null,
        medianTurnTakingBalance: null,
        avgClarityScore: null,
        avgConfidenceScore: null,
        avgAttunementScore: null,
      },
      baseline: null,
      comparisons: null,
      unassignedMeetingsCount: 0,
    };

    mockGetDashboardData.mockResolvedValue(mockData);
    mockGetMeetingCount.mockResolvedValue(3);

    render(<WeeklyDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Weekly Performance')).toBeInTheDocument();
    });

    // Should show metrics without baseline comparisons
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Poise')).toBeInTheDocument();
    expect(screen.getByText('Connection')).toBeInTheDocument();

    // Should NOT show "No baseline yet" text (we removed that UI element)
    expect(screen.queryByText('No baseline yet')).not.toBeInTheDocument();
  });

  it('should display no meetings message when week has no data', async () => {
    const mockData: DashboardData = {
      weekMetrics: null,
      baseline: {
        baselineTalkTimePercentage: 50.0,
        baselineWordsPerMinute: 140.0,
        baselineWordsPerSegment: 12.0,
        baselineInterruptionRate: 10.0,
        baselineTimesInterruptedPerMeeting: 3.0,
        baselineTimesInterruptingPerMeeting: 2.2,
        baselineFillerWordsPerMinute: 3.0,
        baselineTurnTakingBalance: null,
        meetingsIncluded: 12,
        baselineType: 'current',
        baselineClarityScore: null,
        baselineConfidenceScore: null,
        baselineAttunementScore: null,
      },
      comparisons: null,
      unassignedMeetingsCount: 0,
    };

    mockGetDashboardData.mockResolvedValue(mockData);
    mockGetMeetingCount.mockResolvedValue(12);

    render(<WeeklyDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/No meetings this week yet/)).toBeInTheDocument();
    });
  });

  it('should display error state on fetch failure', async () => {
    mockGetDashboardData.mockRejectedValue(
      new Error('Failed to fetch dashboard')
    );
    mockGetMeetingCount.mockResolvedValue(0);

    render(<WeeklyDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Unable to load dashboard/)).toBeInTheDocument();
    });

    expect(screen.getByText('Failed to fetch dashboard')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Try again/i })
    ).toBeInTheDocument();
  });

  it('should show initial baseline type correctly', async () => {
    const mockData: DashboardData = {
      weekMetrics: {
        weekStart: '2024-11-04',
        weekEnd: '2024-11-10',
        meetingsCount: 2,
        avgTalkTimePercentage: 45.5,
        avgWordsPerMinute: 150.2,
        avgWordsPerSegment: 12.5,
        avgInterruptionRate: 8.3,
        avgTimesInterruptedPerMeeting: 2.5,
        avgTimesInterruptingPerMeeting: 1.8,
        totalFillerWords: 0,
        avgFillerWordsPerMinute: 2.5,
        fillerWordsBreakdown: {},
        avgTurnTakingBalance: null,
        medianTurnTakingBalance: null,
        avgClarityScore: null,
        avgConfidenceScore: null,
        avgAttunementScore: null,
      },
      baseline: {
        baselineTalkTimePercentage: 50.0,
        baselineWordsPerMinute: 140.0,
        baselineWordsPerSegment: 12.0,
        baselineInterruptionRate: 10.0,
        baselineTimesInterruptedPerMeeting: 3.0,
        baselineTimesInterruptingPerMeeting: 2.2,
        baselineFillerWordsPerMinute: 3.0,
        meetingsIncluded: 5,
        baselineType: 'initial',
        baselineClarityScore: null,
        baselineConfidenceScore: null,
        baselineAttunementScore: null,
      },
      comparisons: {
        talkTime: {
          currentValue: 45.5,
          baselineValue: 50.0,
          percentageChange: -9.0,
          direction: 'down',
          status: 'good',
        },
        wordsPerMinute: {
          currentValue: 150.2,
          baselineValue: 140.0,
          percentageChange: 7.3,
          direction: 'up',
          status: 'good',
        },
        wordsPerSegment: {
          currentValue: 12.5,
          baselineValue: 12.0,
          percentageChange: 4.2,
          direction: 'up',
          status: 'good',
        },
        interruptionRate: {
          currentValue: 8.3,
          baselineValue: 10.0,
          percentageChange: -17.0,
          direction: 'down',
          status: 'good',
        },
        timesInterrupted: {
          currentValue: 2.5,
          baselineValue: 3.0,
          percentageChange: -16.7,
          direction: 'down',
          status: 'good',
        },
        timesInterrupting: {
          currentValue: 1.8,
          baselineValue: 2.2,
          percentageChange: -18.2,
          direction: 'down',
          status: 'good',
        },
        fillerWordsPerMinute: {
          currentValue: 2.5,
          baselineValue: 3.0,
          percentageChange: -16.7,
          direction: 'down',
          status: 'good',
        },
        clarity: null,
        confidence: null,
        attunement: null,
      },
      unassignedMeetingsCount: 0,
    };

    mockGetDashboardData.mockResolvedValue(mockData);
    mockGetMeetingCount.mockResolvedValue(5);

    render(<WeeklyDashboard />);

    await waitFor(() => {
      expect(
        screen.getByText(/Baseline calculated from 5 meetings/)
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/initial baseline/)).toBeInTheDocument();
  });
});
