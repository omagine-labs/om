/**
 * Reprocess Meeting Server Action Tests
 *
 * Unit tests for reprocessMeeting server action.
 * Tests validation, state transitions, and error handling.
 */

import { reprocessMeeting } from '@/app/actions/reprocess';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getSupabaseUrl } from '@/lib/config';

// Mock dependencies
jest.mock('@/lib/supabase-server');
jest.mock('@/lib/config');

// Mock fetch globally
global.fetch = jest.fn();

const mockSupabase = {
  auth: {
    getUser: jest.fn(),
    getSession: jest.fn(),
  },
  from: jest.fn(),
};

describe('reprocessMeeting', () => {
  // Suppress console logs during tests
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (createServerSupabaseClient as jest.Mock).mockResolvedValue(mockSupabase);
    (getSupabaseUrl as jest.Mock).mockReturnValue('http://localhost:54321');
  });

  describe('Authentication', () => {
    it('should return error if user is not authenticated', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      });

      const result = await reprocessMeeting('meeting-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Not authenticated');
    });
  });

  describe('Meeting Validation', () => {
    beforeEach(() => {
      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });
    });

    it('should return error if meeting not found', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Not found' },
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await reprocessMeeting('nonexistent-meeting');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Meeting not found or you do not have permission to access it'
      );
    });

    it('should return error if user does not own the meeting', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: null, // RLS will return null for unauthorized access
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await reprocessMeeting('other-users-meeting');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Meeting not found or you do not have permission to access it'
      );
    });

    it('should return error if meeting has no recording', async () => {
      const mockMeeting = {
        id: 'meeting-123',
        user_id: 'user-123',
        title: 'Test Meeting',
        audio_storage_path: null, // No recording
        recording_filename: null,
        processing_jobs: [
          {
            id: 'job-123',
            status: 'failed',
            processing_error: 'Test error',
          },
        ],
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockMeeting,
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await reprocessMeeting('meeting-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'No recording found for this meeting. Please upload a recording first.'
      );
    });

    it('should return error if meeting has no processing job', async () => {
      const mockMeeting = {
        id: 'meeting-123',
        user_id: 'user-123',
        title: 'Test Meeting',
        audio_storage_path: 'user-123/2025/11/recording.mov',
        recording_filename: 'recording.mov',
        processing_jobs: [], // No jobs
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockMeeting,
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await reprocessMeeting('meeting-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('No processing job found for this meeting');
    });

    it('should return error if job is not in failed state', async () => {
      const mockMeeting = {
        id: 'meeting-123',
        user_id: 'user-123',
        title: 'Test Meeting',
        audio_storage_path: 'user-123/2025/11/recording.mov',
        recording_filename: 'recording.mov',
        processing_jobs: [
          {
            id: 'job-123',
            status: 'processing', // Not failed
            processing_error: null,
          },
        ],
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockMeeting,
          error: null,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await reprocessMeeting('meeting-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Cannot reprocess: job is currently processing'
      );
    });
  });

  describe('Successful Reprocessing', () => {
    beforeEach(() => {
      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      // Mock session for Edge Function call
      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
            refresh_token: 'test-refresh',
          },
        },
        error: null,
      });
    });

    it('should successfully reprocess a failed meeting', async () => {
      const mockMeeting = {
        id: 'meeting-123',
        user_id: 'user-123',
        title: 'Test Meeting',
        audio_storage_path: 'user-123/2025/11/recording.mov',
        recording_filename: 'recording.mov',
        processing_jobs: [
          {
            id: 'job-123',
            status: 'failed',
            processing_error: 'Previous error',
          },
        ],
      };

      // Mock meeting fetch
      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockMeeting,
          error: null,
        }),
      };

      // Mock job status update
      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockSelectQuery) // First call: select meeting
        .mockReturnValueOnce(mockUpdateQuery); // Second call: update job

      // Mock successful Edge Function call
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          success: true,
          jobId: 'job-123',
          message: 'Processing started',
          pythonJobId: 'py_job-123',
        }),
      });

      const result = await reprocessMeeting('meeting-123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Reprocessing started successfully');
      expect(result.jobId).toBe('job-123');

      // Verify job status was reset
      expect(mockUpdateQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          processing_error: null,
        })
      );

      // Verify Edge Function was called
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:54321/functions/v1/process-meeting',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ jobId: 'job-123' }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      });

      mockSupabase.auth.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
            refresh_token: 'test-refresh',
          },
        },
        error: null,
      });
    });

    it('should rollback job status if Edge Function fails', async () => {
      const mockMeeting = {
        id: 'meeting-123',
        user_id: 'user-123',
        title: 'Test Meeting',
        audio_storage_path: 'user-123/2025/11/recording.mov',
        recording_filename: 'recording.mov',
        processing_jobs: [
          {
            id: 'job-123',
            status: 'failed',
            processing_error: 'Previous error',
          },
        ],
      };

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockMeeting,
          error: null,
        }),
      };

      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockSelectQuery)
        .mockReturnValueOnce(mockUpdateQuery) // First update: reset to pending
        .mockReturnValueOnce(mockUpdateQuery); // Second update: rollback to failed

      // Mock failed Edge Function call
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({
          success: false,
          error: 'Backend error',
        }),
      });

      const result = await reprocessMeeting('meeting-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Backend error');

      // Verify rollback happened
      const updateCalls = mockUpdateQuery.update.mock.calls;
      expect(updateCalls).toHaveLength(2);
      expect(updateCalls[0][0]).toMatchObject({
        status: 'pending',
        processing_error: null,
      });
      expect(updateCalls[1][0]).toMatchObject({
        status: 'failed',
        processing_error: 'Backend error',
      });
    });

    it('should return error if session expired', async () => {
      const mockMeeting = {
        id: 'meeting-123',
        user_id: 'user-123',
        title: 'Test Meeting',
        audio_storage_path: 'user-123/2025/11/recording.mov',
        recording_filename: 'recording.mov',
        processing_jobs: [
          {
            id: 'job-123',
            status: 'failed',
            processing_error: 'Previous error',
          },
        ],
      };

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockMeeting,
          error: null,
        }),
      };

      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockSelectQuery)
        .mockReturnValueOnce(mockUpdateQuery);

      // Mock expired session
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      const result = await reprocessMeeting('meeting-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Session expired. Please refresh and try again.'
      );
    });

    it('should handle fetch network errors', async () => {
      const mockMeeting = {
        id: 'meeting-123',
        user_id: 'user-123',
        title: 'Test Meeting',
        audio_storage_path: 'user-123/2025/11/recording.mov',
        recording_filename: 'recording.mov',
        processing_jobs: [
          {
            id: 'job-123',
            status: 'failed',
            processing_error: 'Previous error',
          },
        ],
      };

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockMeeting,
          error: null,
        }),
      };

      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: null,
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockSelectQuery)
        .mockReturnValueOnce(mockUpdateQuery)
        .mockReturnValueOnce(mockUpdateQuery);

      // Mock network error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await reprocessMeeting('meeting-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to start reprocessing. Please try again.'
      );
    });

    it('should return error if job status update fails', async () => {
      const mockMeeting = {
        id: 'meeting-123',
        user_id: 'user-123',
        title: 'Test Meeting',
        audio_storage_path: 'user-123/2025/11/recording.mov',
        recording_filename: 'recording.mov',
        processing_jobs: [
          {
            id: 'job-123',
            status: 'failed',
            processing_error: 'Previous error',
          },
        ],
      };

      const mockSelectQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: mockMeeting,
          error: null,
        }),
      };

      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({
          error: { message: 'Update failed' },
        }),
      };

      mockSupabase.from
        .mockReturnValueOnce(mockSelectQuery)
        .mockReturnValueOnce(mockUpdateQuery);

      const result = await reprocessMeeting('meeting-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Failed to reset job status. Please try again.'
      );
    });
  });
});
