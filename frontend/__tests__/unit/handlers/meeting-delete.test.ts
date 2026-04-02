/**
 * Meeting Delete Handler Unit Tests
 *
 * Unit tests for the meeting deletion business logic:
 * - Validates correct deletion order
 * - Verifies cascade deletes
 * - Tests aggregate recalculation
 * - Tests error handling
 */

import type { Tables } from '@/supabase/database.types';

type Meeting = Tables<'meetings'>;
type ProcessingJob = Tables<'processing_jobs'>;

/**
 * Test helper to simulate the delete handler logic
 */
async function deleteMeetingHandler(
  meeting: Meeting,
  supabase: any,
  userId: string
) {
  // Get current user for aggregate recalculation
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Get all processing jobs for this meeting
  const { data: jobs, error: jobsError } = await supabase
    .from('processing_jobs')
    .select('id')
    .eq('meeting_id', meeting.id);

  if (jobsError) throw jobsError;

  // Delete storage file for meeting (if it has one)
  if (meeting.audio_storage_path) {
    const { error: storageError } = await supabase.storage
      .from('recordings')
      .remove([meeting.audio_storage_path]);

    if (storageError) {
      console.error('Storage deletion error:', storageError);
    }
  }

  // Get meeting start time to determine which week to recalculate
  const meetingStartTime = new Date(meeting.start_time);
  const weekStart = new Date(meetingStartTime);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));

  // Delete the meeting from database
  const { error: deleteMeetingError } = await supabase
    .from('meetings')
    .delete()
    .eq('id', meeting.id);

  if (deleteMeetingError) throw deleteMeetingError;

  // Now delete all processing jobs (meeting_analysis will cascade delete)
  // This must happen AFTER meeting deletion to avoid FK constraint violation
  if (jobs && jobs.length > 0) {
    const { error: deleteJobsError } = await supabase
      .from('processing_jobs')
      .delete()
      .in(
        'id',
        jobs.map((j: any) => j.id)
      );

    if (deleteJobsError) throw deleteJobsError;
  }

  // Recalculate weekly rollup and baseline
  try {
    await supabase.rpc('calculate_user_weekly_rollup', {
      p_user_id: userId,
      p_week_start: weekStart.toISOString().split('T')[0],
    });

    await supabase.rpc('update_current_baseline', {
      p_user_id: userId,
    });
  } catch (recalcError) {
    console.error('Failed to recalculate aggregates:', recalcError);
  }
}

describe('Meeting Delete Handler', () => {
  let mockSupabase: any;
  let mockMeeting: Meeting;
  let mockJobs: ProcessingJob[];

  beforeEach(() => {
    jest.clearAllMocks();

    mockMeeting = {
      id: 'meeting-123',
      user_id: 'user-123',
      title: 'Test Meeting',
      start_time: '2024-11-15T10:00:00Z',
      end_time: '2024-11-15T11:00:00Z',
      description: null,
      meeting_link: null,
      created_at: '2024-11-15T09:00:00Z',
      updated_at: '2024-11-15T09:00:00Z',
      meeting_type: 'one_on_one',
      participant_count: 2,
      user_role: 'participant',
      recording_available_until: null,
      recording_filename: 'test.mp4',
      audio_storage_path: 'user-123/2024/11/recording.mp4',
      recording_size_mb: 50,
      recording_duration_seconds: 3600,
    };

    mockJobs = [
      {
        id: 'job-123',
        meeting_id: 'meeting-123',
        segment_id: null,
        status: 'completed',
        processing_error: null,
        processing_type: 'initial',
        python_job_id: null,
        triggered_by: 'auto',
        created_at: '2024-11-15T09:00:00Z',
        updated_at: '2024-11-15T09:30:00Z',
      },
    ];

    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'user-123' } },
        }),
      },
      from: jest.fn((table: string) => {
        if (table === 'processing_jobs') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: mockJobs,
                error: null,
              }),
            }),
            delete: jest.fn().mockReturnValue({
              in: jest.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'meetings') {
          return {
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      }),
      storage: {
        from: jest.fn().mockReturnValue({
          remove: jest.fn().mockResolvedValue({ error: null }),
        }),
      },
      rpc: jest.fn().mockResolvedValue({ error: null }),
    };
  });

  describe('Deletion Order', () => {
    it('should query processing jobs first', async () => {
      await deleteMeetingHandler(mockMeeting, mockSupabase, 'user-123');

      const calls = mockSupabase.from.mock.calls;
      expect(calls[0][0]).toBe('processing_jobs');
    });

    it('should delete storage files before database records', async () => {
      const callOrder: string[] = [];

      mockSupabase.storage.from = jest.fn().mockReturnValue({
        remove: jest.fn().mockImplementation(() => {
          callOrder.push('storage');
          return Promise.resolve({ error: null });
        }),
      });

      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'processing_jobs') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: mockJobs, error: null }),
            }),
            delete: jest.fn().mockReturnValue({
              in: jest.fn().mockImplementation(() => {
                callOrder.push('processing_jobs');
                return Promise.resolve({ error: null });
              }),
            }),
          };
        }
        if (table === 'meetings') {
          return {
            delete: jest.fn().mockReturnValue({
              eq: jest.fn().mockImplementation(() => {
                callOrder.push('meetings');
                return Promise.resolve({ error: null });
              }),
            }),
          };
        }
        return {};
      });

      await deleteMeetingHandler(mockMeeting, mockSupabase, 'user-123');

      // Updated order: storage → meeting → processing_jobs
      // Meeting must be deleted before processing_jobs due to FK constraints
      expect(callOrder).toEqual(['storage', 'meetings', 'processing_jobs']);
    });

    it('should delete meeting before processing jobs', async () => {
      await deleteMeetingHandler(mockMeeting, mockSupabase, 'user-123');

      const fromCalls = mockSupabase.from.mock.calls.map(
        (call: any) => call[0]
      );
      const jobsIndex = fromCalls.lastIndexOf('processing_jobs');
      const meetingsIndex = fromCalls.lastIndexOf('meetings');

      // Meeting must be deleted BEFORE processing_jobs due to FK constraints
      expect(meetingsIndex).toBeLessThan(jobsIndex);
    });
  });

  describe('Storage Deletion', () => {
    it('should delete main recording file from storage', async () => {
      await deleteMeetingHandler(mockMeeting, mockSupabase, 'user-123');

      expect(mockSupabase.storage.from).toHaveBeenCalledWith('recordings');
      expect(
        mockSupabase.storage.from('recordings').remove
      ).toHaveBeenCalledWith(['user-123/2024/11/recording.mp4']);
    });

    it('should not attempt storage deletion if no audio_storage_path', async () => {
      mockMeeting.audio_storage_path = null;

      await deleteMeetingHandler(mockMeeting, mockSupabase, 'user-123');

      // Should only call storage.from for segments, not main recording
      expect(mockSupabase.storage.from).not.toHaveBeenCalled();
    });
  });

  describe('Aggregate Recalculation', () => {
    it('should calculate correct week start for weekly rollup', async () => {
      // November 15, 2024 is a Friday
      // Week should start on Monday, November 11, 2024
      mockMeeting.start_time = '2024-11-15T10:00:00Z';

      await deleteMeetingHandler(mockMeeting, mockSupabase, 'user-123');

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'calculate_user_weekly_rollup',
        {
          p_user_id: 'user-123',
          p_week_start: '2024-11-11', // Monday
        }
      );
    });

    it('should recalculate weekly rollup for correct user', async () => {
      await deleteMeetingHandler(mockMeeting, mockSupabase, 'user-456');

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'calculate_user_weekly_rollup',
        expect.objectContaining({
          p_user_id: 'user-456',
        })
      );
    });

    it('should update current baseline after deletion', async () => {
      await deleteMeetingHandler(mockMeeting, mockSupabase, 'user-123');

      expect(mockSupabase.rpc).toHaveBeenCalledWith('update_current_baseline', {
        p_user_id: 'user-123',
      });
    });

    it('should not fail deletion if recalculation fails', async () => {
      mockSupabase.rpc = jest
        .fn()
        .mockRejectedValue(new Error('Recalculation failed'));

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Should not throw
      await expect(
        deleteMeetingHandler(mockMeeting, mockSupabase, 'user-123')
      ).resolves.not.toThrow();

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to recalculate aggregates:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should throw error if fetching jobs fails', async () => {
      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'processing_jobs') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: null,
                error: { message: 'DB error' },
              }),
            }),
          };
        }
        return {};
      });

      await expect(
        deleteMeetingHandler(mockMeeting, mockSupabase, 'user-123')
      ).rejects.toEqual({ message: 'DB error' });
    });

    it('should throw error if deleting meeting fails', async () => {
      mockSupabase.from = jest.fn((table: string) => {
        if (table === 'meetings') {
          return {
            delete: jest.fn().mockReturnValue({
              eq: jest
                .fn()
                .mockResolvedValue({ error: { message: 'Delete failed' } }),
            }),
          };
        }
        if (table === 'processing_jobs') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'recording_segments') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        return {};
      });

      await expect(
        deleteMeetingHandler(mockMeeting, mockSupabase, 'user-123')
      ).rejects.toEqual({ message: 'Delete failed' });
    });

    it('should continue deletion if storage deletion fails', async () => {
      mockSupabase.storage.from = jest.fn().mockReturnValue({
        remove: jest.fn().mockResolvedValue({
          error: { message: 'Storage error' },
        }),
      });

      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      // Should not throw
      await expect(
        deleteMeetingHandler(mockMeeting, mockSupabase, 'user-123')
      ).resolves.not.toThrow();

      // Should log error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Storage deletion error:',
        expect.objectContaining({ message: 'Storage error' })
      );

      // Should still delete meeting
      expect(mockSupabase.from).toHaveBeenCalledWith('meetings');

      consoleErrorSpy.mockRestore();
    });
  });
});
