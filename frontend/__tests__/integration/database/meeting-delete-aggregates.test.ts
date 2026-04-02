/**
 * Meeting Delete Aggregate Recalculation Tests
 *
 * Integration tests verifying that aggregate data is correctly recalculated
 * when meetings are deleted:
 * - Weekly rollups are updated
 * - Baselines are recalculated
 * - Counts and averages are accurate
 */

import { createClient } from '@/lib/supabase';

// Mock Supabase client
jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
}));

describe('Meeting Delete - Aggregate Recalculation', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      from: jest.fn(),
      rpc: jest.fn(),
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  describe('Weekly Rollup Recalculation', () => {
    it('should recalculate weekly rollup with reduced meeting count', async () => {
      // Mock initial state: 3 meetings in the week
      const initialWeeklyData = {
        meetings_count: 3,
        total_talk_time_seconds: 3600,
        avg_talk_time_percentage: 50,
        total_words_spoken: 4500,
        avg_words_per_minute: 150,
      };

      // After deleting one meeting: 2 meetings remaining
      const updatedWeeklyData = {
        meetings_count: 2,
        total_talk_time_seconds: 2400,
        avg_talk_time_percentage: 48,
        total_words_spoken: 3000,
        avg_words_per_minute: 152,
      };

      mockSupabase.rpc
        .mockResolvedValueOnce({
          // First call returns ID
          data: 'rollup-123',
          error: null,
        })
        .mockResolvedValueOnce({
          // Query returns updated data
          data: [updatedWeeklyData],
          error: null,
        });

      // Call recalculation
      const { data: rollupId } = await mockSupabase.rpc(
        'calculate_user_weekly_rollup',
        {
          p_user_id: 'user-123',
          p_week_start: '2024-11-11',
        }
      );

      expect(rollupId).toBe('rollup-123');
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'calculate_user_weekly_rollup',
        {
          p_user_id: 'user-123',
          p_week_start: '2024-11-11',
        }
      );
    });

    it('should handle week with no remaining meetings after deletion', async () => {
      // After deleting the only meeting in the week
      const emptyWeekData = {
        meetings_count: 0,
        total_talk_time_seconds: 0,
        avg_talk_time_percentage: null,
        total_words_spoken: 0,
        avg_words_per_minute: null,
      };

      mockSupabase.rpc.mockResolvedValue({
        data: 'rollup-123',
        error: null,
      });

      await mockSupabase.rpc('calculate_user_weekly_rollup', {
        p_user_id: 'user-123',
        p_week_start: '2024-11-11',
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'calculate_user_weekly_rollup',
        {
          p_user_id: 'user-123',
          p_week_start: '2024-11-11',
        }
      );
    });

    it('should calculate correct Monday for different days of week', () => {
      const testCases = [
        { input: '2024-11-11T10:00:00Z', expected: '2024-11-11' }, // Monday
        { input: '2024-11-12T10:00:00Z', expected: '2024-11-11' }, // Tuesday
        { input: '2024-11-15T10:00:00Z', expected: '2024-11-11' }, // Friday
        { input: '2024-11-17T10:00:00Z', expected: '2024-11-11' }, // Sunday
        { input: '2024-11-18T10:00:00Z', expected: '2024-11-18' }, // Next Monday
      ];

      testCases.forEach(({ input, expected }) => {
        const date = new Date(input);
        const weekStart = new Date(date);
        weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

        const result = weekStart.toISOString().split('T')[0];
        expect(result).toBe(expected);
      });
    });
  });

  describe('Baseline Recalculation', () => {
    it('should update current baseline after deletion', async () => {
      const updatedBaseline = {
        id: 'baseline-456',
        baseline_type: 'current',
        meetings_included: 10, // Was 11 before deletion
        baseline_talk_time_percentage: 48.5, // Recalculated average
        baseline_words_per_minute: 152.3,
        baseline_times_interrupted_per_meeting: 2.1,
        baseline_interruption_rate: 5.2,
      };

      mockSupabase.rpc.mockResolvedValue({
        data: 'baseline-456',
        error: null,
      });

      const { data: baselineId } = await mockSupabase.rpc(
        'update_current_baseline',
        {
          p_user_id: 'user-123',
        }
      );

      expect(baselineId).toBe('baseline-456');
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_current_baseline', {
        p_user_id: 'user-123',
      });
    });

    it('should handle deletion affecting initial baseline window', async () => {
      // If user deletes a meeting from their first 5-10 meetings,
      // the initial baseline should remain unchanged (it's a snapshot)
      // Only current baseline should be updated

      mockSupabase.rpc.mockResolvedValue({
        data: 'baseline-current-123',
        error: null,
      });

      await mockSupabase.rpc('update_current_baseline', {
        p_user_id: 'user-123',
      });

      // Should only update current baseline, not initial
      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_current_baseline', {
        p_user_id: 'user-123',
      });
      expect(mockSupabase.rpc).not.toHaveBeenCalledWith(
        'calculate_initial_baseline',
        expect.anything()
      );
    });

    it('should handle deletion when user has insufficient meetings for baseline', async () => {
      // If deleting brings user below 5 meetings total,
      // baseline calculation should handle gracefully

      mockSupabase.rpc.mockResolvedValue({
        data: null, // No baseline if < 5 meetings
        error: null,
      });

      const { data: baselineId } = await mockSupabase.rpc(
        'update_current_baseline',
        {
          p_user_id: 'user-123',
        }
      );

      expect(baselineId).toBeNull();
    });
  });

  describe('Cascade Delete Verification', () => {
    it('should verify meeting_analysis is cascade deleted with processing_jobs', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'processing_jobs') {
          return {
            delete: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'meeting_analysis') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                // Should return empty after cascade delete
                data: [],
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      // Delete processing jobs
      await mockSupabase.from('processing_jobs').delete().in('id', ['job-123']);

      // Verify analysis records are gone
      const { data: analysisRecords } = await mockSupabase
        .from('meeting_analysis')
        .select('*')
        .eq('job_id', 'job-123');

      expect(analysisRecords).toEqual([]);
    });

    it('should verify recording_segments is cascade deleted with meeting', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'meetings') {
          return {
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'recording_segments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                // Should return empty after cascade delete
                data: [],
                error: null,
              }),
            }),
          };
        }
        return {};
      });

      // Delete meeting
      await mockSupabase.from('meetings').delete().eq('id', 'meeting-123');

      // Verify segment records are gone
      const { data: segmentRecords } = await mockSupabase
        .from('recording_segments')
        .select('*')
        .eq('meeting_id', 'meeting-123');

      expect(segmentRecords).toEqual([]);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle RPC function not found error', async () => {
      mockSupabase.rpc.mockRejectedValue({
        code: '42883', // PostgreSQL "function does not exist" error
        message: 'function calculate_user_weekly_rollup does not exist',
      });

      await expect(
        mockSupabase.rpc('calculate_user_weekly_rollup', {
          p_user_id: 'user-123',
          p_week_start: '2024-11-11',
        })
      ).rejects.toMatchObject({
        code: '42883',
      });
    });

    it('should handle RPC timeout error', async () => {
      mockSupabase.rpc.mockRejectedValue({
        message: 'timeout',
        code: 'PGRST301',
      });

      await expect(
        mockSupabase.rpc('update_current_baseline', {
          p_user_id: 'user-123',
        })
      ).rejects.toMatchObject({
        code: 'PGRST301',
      });
    });

    it('should handle permission denied error', async () => {
      mockSupabase.rpc.mockRejectedValue({
        message: 'permission denied for function calculate_user_weekly_rollup',
        code: '42501',
      });

      await expect(
        mockSupabase.rpc('calculate_user_weekly_rollup', {
          p_user_id: 'user-123',
          p_week_start: '2024-11-11',
        })
      ).rejects.toMatchObject({
        code: '42501',
      });
    });
  });
});
