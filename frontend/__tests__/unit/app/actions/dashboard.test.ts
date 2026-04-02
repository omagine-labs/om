/**
 * Dashboard Server Actions Tests
 *
 * Unit tests for getDashboardData, getMeetingCount, and getGlobalUnassignedMeetings
 * server actions. Tests data fetching, calculation logic, and edge cases.
 */

import {
  getDashboardData,
  getMeetingCount,
  getGlobalUnassignedMeetings,
} from '@/app/actions/dashboard';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase-server';

// Mock Supabase client
jest.mock('@/lib/supabase-server');

// Mock Next.js unstable_cache - it just passes through the function in tests
jest.mock('next/cache', () => ({
  unstable_cache: (fn: any) => fn,
}));

const mockSupabase = {
  auth: {
    getUser: jest.fn(),
  },
  from: jest.fn(),
};

const mockServiceRoleSupabase = {
  from: jest.fn(),
};

describe('getDashboardData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createServerSupabaseClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  it('should return dashboard data with baseline', async () => {
    // Mock authenticated user
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    // Mock weekly rollup data
    const mockWeeklyRollup = {
      week_start_date: '2024-11-04',
      week_end_date: '2024-11-10',
      meetings_count: 3,
      avg_talk_time_percentage: 45.5,
      avg_words_per_minute: 150.2,
      avg_words_per_segment: 12.5,
      avg_interruption_rate: 8.3,
      avg_filler_words_per_minute: 2.5,
    };

    // Mock baseline data
    const mockBaseline = {
      baseline_talk_time_percentage: 50.0,
      baseline_words_per_minute: 140.0,
      baseline_words_per_segment: 12.0,
      baseline_interruption_rate: 10.0,
      baseline_filler_words_per_minute: 3.0,
      meetings_included: 12,
      baseline_type: 'current' as const,
    };

    // Mock Supabase query chain
    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    };

    mockSupabase.from.mockReturnValue(mockQuery);

    // First call: weekly rollup, Second call: current baseline
    // Note: getUnassignedMeetingsCount also queries but returns empty by default
    mockQuery.maybeSingle
      .mockResolvedValueOnce({
        data: mockWeeklyRollup,
        error: null,
      })
      .mockResolvedValueOnce({
        data: mockBaseline,
        error: null,
      });

    // Mock the query for getUnassignedMeetingsCount (ends with .or())
    mockQuery.or.mockResolvedValue({ data: [], error: null });

    const result = await getDashboardData();

    expect(result.weekMetrics).toEqual({
      weekStart: '2024-11-04',
      weekEnd: '2024-11-10',
      meetingsCount: 3,
      avgTalkTimePercentage: 45.5,
      avgWordsPerMinute: 150.2,
      avgWordsPerSegment: 12.5,
      avgInterruptionRate: 8.3,
      avgTimesInterruptedPerMeeting: 0,
      avgTimesInterruptingPerMeeting: 0,
      totalFillerWords: 0,
      avgFillerWordsPerMinute: 2.5,
      fillerWordsBreakdown: {},
      avgTurnTakingBalance: null,
      medianTurnTakingBalance: null,
      avgClarityScore: null,
      avgConfidenceScore: null,
      avgAttunementScore: null,
      weeklyContentPillarScore: null,
      weeklyPoisePillarScore: null,
      weeklyConnectionPillarScore: null,
    });
    expect(result.baseline).toEqual({
      baselineTalkTimePercentage: 50.0,
      baselineWordsPerMinute: 140.0,
      baselineWordsPerSegment: 12.0,
      baselineInterruptionRate: 10.0,
      baselineTimesInterruptedPerMeeting: 0,
      baselineTimesInterruptingPerMeeting: 0,
      baselineFillerWordsPerMinute: 3.0,
      baselineTurnTakingBalance: null,
      meetingsIncluded: 12,
      baselineType: 'current',
      baselineClarityScore: null,
      baselineConfidenceScore: null,
      baselineAttunementScore: null,
      avgBaselineContentPillarScore: null,
      avgBaselinePoisePillarScore: null,
      avgBaselineConnectionPillarScore: null,
    });
    expect(result.comparisons).toBeDefined();
    expect(result.comparisons?.talkTime.percentageChange).toBeCloseTo(-9.0, 1);
    expect(result.comparisons?.wordsPerMinute.percentageChange).toBeCloseTo(
      7.3,
      1
    );
  });

  it('should return empty state for user without baseline', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    };

    mockSupabase.from.mockReturnValue(mockQuery);

    // Weekly rollup exists
    mockQuery.maybeSingle
      .mockResolvedValueOnce({
        data: {
          week_start_date: '2024-11-04',
          week_end_date: '2024-11-10',
          meetings_count: 2,
          avg_talk_time_percentage: 45.0,
          avg_words_per_minute: 150.0,
          avg_words_per_segment: 12.0,
          avg_interruption_rate: 8.0,
        },
        error: null,
      })
      // No current baseline
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      // No initial baseline
      .mockResolvedValueOnce({
        data: null,
        error: null,
      });

    // Mock for getUnassignedMeetingsCount (ends with .or())
    mockQuery.or.mockResolvedValue({ data: [], error: null });

    const result = await getDashboardData();

    expect(result.baseline).toBeNull();
    expect(result.comparisons).toBeNull();
  });

  it('should handle week with no meetings', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockBaseline = {
      baseline_talk_time_percentage: 50.0,
      baseline_words_per_minute: 140.0,
      baseline_words_per_segment: 12.5,
      baseline_interruption_rate: 10.0,
      meetings_included: 12,
      baseline_type: 'current' as const,
    };

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    };

    mockSupabase.from.mockReturnValue(mockQuery);

    // No weekly rollup for current week
    mockQuery.maybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      // Fallback: query meetings for the week (returns empty)
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      // But baseline exists
      .mockResolvedValueOnce({
        data: mockBaseline,
        error: null,
      });

    // Mock for getUnassignedMeetingsCount (ends with .or())
    mockQuery.or.mockResolvedValue({ data: [], error: null });

    const result = await getDashboardData();

    expect(result.weekMetrics).toBeNull();
    expect(result.comparisons).toBeNull(); // Can't compare without current week data
  });

  it('should throw error for unauthenticated user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    await expect(getDashboardData()).rejects.toThrow('Not authenticated');
  });

  it('should calculate correct status for interruption rate improvements', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockWeeklyRollup = {
      week_start_date: '2024-11-04',
      week_end_date: '2024-11-10',
      meetings_count: 3,
      avg_talk_time_percentage: 50.0,
      avg_words_per_minute: 140.0,
      avg_words_per_segment: 12.0,
      avg_interruption_rate: 5.0, // Much lower than baseline
    };

    const mockBaseline = {
      baseline_talk_time_percentage: 50.0,
      baseline_words_per_minute: 140.0,
      baseline_words_per_segment: 12.0,
      baseline_interruption_rate: 15.0, // Baseline was high
      meetings_included: 12,
      baseline_type: 'current' as const,
    };

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    };

    mockSupabase.from.mockReturnValue(mockQuery);

    mockQuery.maybeSingle
      .mockResolvedValueOnce({ data: mockWeeklyRollup, error: null })
      .mockResolvedValueOnce({ data: mockBaseline, error: null });

    // Mock for getUnassignedMeetingsCount (ends with .or())
    mockQuery.or.mockResolvedValue({ data: [], error: null });

    const result = await getDashboardData();

    // Interruption rate decreased by ~66% - should be "good"
    expect(result.comparisons?.interruptionRate.status).toBe('good');
    expect(result.comparisons?.interruptionRate.direction).toBe('down');
  });

  it('should calculate alert status for significant deviations', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockWeeklyRollup = {
      week_start_date: '2024-11-04',
      week_end_date: '2024-11-10',
      meetings_count: 3,
      avg_talk_time_percentage: 70.0, // 40% higher than baseline
      avg_words_per_minute: 140.0,
      avg_words_per_segment: 12.0,
      avg_interruption_rate: 10.0,
    };

    const mockBaseline = {
      baseline_talk_time_percentage: 50.0,
      baseline_words_per_minute: 140.0,
      baseline_words_per_segment: 12.0,
      baseline_interruption_rate: 10.0,
      meetings_included: 12,
      baseline_type: 'current' as const,
    };

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    };

    mockSupabase.from.mockReturnValue(mockQuery);

    mockQuery.maybeSingle
      .mockResolvedValueOnce({ data: mockWeeklyRollup, error: null })
      .mockResolvedValueOnce({ data: mockBaseline, error: null });

    // Mock for getUnassignedMeetingsCount (ends with .or())
    mockQuery.or.mockResolvedValue({ data: [], error: null });

    const result = await getDashboardData();

    // Talk time increased by 40% - should be "alert" (> 15% threshold)
    expect(result.comparisons?.talkTime.status).toBe('alert');
    expect(result.comparisons?.talkTime.percentageChange).toBeCloseTo(40.0, 1);
  });
});

describe('getMeetingCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createServerSupabaseClient as jest.Mock).mockResolvedValue(mockSupabase);
  });

  it('should return meeting count for authenticated user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn(),
    };

    mockSupabase.from.mockReturnValue(mockQuery);

    // Mock count response - .not() returns the final result
    mockQuery.not.mockResolvedValue({
      count: 3,
      error: null,
    });

    const result = await getMeetingCount();

    expect(result).toBe(3);
    expect(mockSupabase.from).toHaveBeenCalledWith('meetings');
  });

  it('should return 0 for user with no meetings', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn(),
    };

    mockSupabase.from.mockReturnValue(mockQuery);

    mockQuery.not.mockResolvedValue({
      count: 0,
      error: null,
    });

    const result = await getMeetingCount();

    expect(result).toBe(0);
  });

  it('should return 0 on error', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      not: jest.fn(),
    };

    mockSupabase.from.mockReturnValue(mockQuery);

    mockQuery.not.mockResolvedValue({
      count: null,
      error: { message: 'Database error' },
    });

    const result = await getMeetingCount();

    expect(result).toBe(0);
  });

  it('should return 0 for unauthenticated user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const result = await getMeetingCount();

    expect(result).toBe(0);
  });
});

describe('getGlobalUnassignedMeetings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createServerSupabaseClient as jest.Mock).mockResolvedValue(mockSupabase);
    (createServiceRoleClient as jest.Mock).mockReturnValue(
      mockServiceRoleSupabase
    );
  });

  it('should return count and firstMeetingId for user with unassigned meetings', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn(),
    };

    mockServiceRoleSupabase.from.mockReturnValue(mockQuery);

    // Mock data response with 3 unassigned meetings (ordered by start_time desc)
    mockQuery.order.mockResolvedValue({
      data: [
        {
          id: 'meeting-1',
          start_time: '2024-11-10T10:00:00Z',
          user_speaker_label: null,
        },
        {
          id: 'meeting-2',
          start_time: '2024-11-09T10:00:00Z',
          user_speaker_label: null,
        },
        {
          id: 'meeting-3',
          start_time: '2024-11-08T10:00:00Z',
          user_speaker_label: null,
        },
      ],
      error: null,
    });

    const result = await getGlobalUnassignedMeetings();

    expect(result.count).toBe(3);
    expect(result.firstMeetingId).toBe('meeting-1'); // Most recent
    expect(mockServiceRoleSupabase.from).toHaveBeenCalledWith('meetings');
  });

  it('should deduplicate meetings with multiple completed jobs', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn(),
    };

    mockServiceRoleSupabase.from.mockReturnValue(mockQuery);

    // Mock data with duplicate meeting IDs (same meeting, multiple jobs)
    mockQuery.order.mockResolvedValue({
      data: [
        {
          id: 'meeting-1',
          start_time: '2024-11-10T10:00:00Z',
          user_speaker_label: null,
        },
        {
          id: 'meeting-1',
          start_time: '2024-11-10T10:00:00Z',
          user_speaker_label: null,
        }, // Duplicate
        {
          id: 'meeting-2',
          start_time: '2024-11-09T10:00:00Z',
          user_speaker_label: null,
        },
      ],
      error: null,
    });

    const result = await getGlobalUnassignedMeetings();

    expect(result.count).toBe(2); // 2 unique meetings, not 3 records
    expect(result.firstMeetingId).toBe('meeting-1');
  });

  it('should return 0 count and null firstMeetingId for user with no unassigned meetings', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn(),
    };

    mockServiceRoleSupabase.from.mockReturnValue(mockQuery);

    mockQuery.order.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await getGlobalUnassignedMeetings();

    expect(result.count).toBe(0);
    expect(result.firstMeetingId).toBeNull();
    expect(mockServiceRoleSupabase.from).toHaveBeenCalledWith('meetings');
  });

  it('should return 0 count and null firstMeetingId on database error', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn(),
    };

    mockServiceRoleSupabase.from.mockReturnValue(mockQuery);

    mockQuery.order.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    });

    const result = await getGlobalUnassignedMeetings();

    expect(result.count).toBe(0);
    expect(result.firstMeetingId).toBeNull();
    // Verify the query was actually attempted
    expect(mockServiceRoleSupabase.from).toHaveBeenCalledWith('meetings');
  });

  it('should return 0 count and null firstMeetingId for unauthenticated user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Not authenticated' },
    });

    const result = await getGlobalUnassignedMeetings();

    expect(result.count).toBe(0);
    expect(result.firstMeetingId).toBeNull();
    // Should not attempt database query if not authenticated
    expect(mockServiceRoleSupabase.from).not.toHaveBeenCalled();
  });

  it('should handle null data gracefully', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });

    const mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn(),
    };

    mockServiceRoleSupabase.from.mockReturnValue(mockQuery);

    mockQuery.order.mockResolvedValue({
      data: null,
      error: null,
    });

    const result = await getGlobalUnassignedMeetings();

    expect(result.count).toBe(0);
    expect(result.firstMeetingId).toBeNull();
    expect(mockServiceRoleSupabase.from).toHaveBeenCalledWith('meetings');
  });
});
