/**
 * Unit tests for useSpeakerAssignment hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSpeakerAssignment } from '@/hooks/useSpeakerAssignment';
import { createClient } from '@/lib/supabase';

// Mock Supabase client
jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
}));

describe('useSpeakerAssignment', () => {
  const mockUpdate = jest.fn();
  const mockEq = jest.fn();
  const mockSelect = jest.fn();
  const mockSingle = jest.fn();
  const mockFrom = jest.fn();
  const mockRpc = jest.fn();

  const mockSupabase = {
    from: mockFrom,
    rpc: mockRpc,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock chain for update queries: from().update().eq().eq()
    const mockUpdateQueryPromise = Promise.resolve({ data: {}, error: null });

    // Setup mock chain for select queries: from().select().eq().single()
    // getMeetingInfo returns meeting data with start_time for rollup recalculation
    const mockSelectQueryPromise = Promise.resolve({
      data: {
        meetings: {
          id: 'meeting-123',
          start_time: '2025-01-01T12:00:00Z',
          user_speaker_label: null,
        },
      },
      error: null,
    });

    // Setup mock chain for select with single (getting previous assignment)
    const mockSelectSinglePromise = Promise.resolve({
      data: { assigned_user_id: null },
      error: null,
    });

    // Mock RPC for rollup recalculation
    mockRpc.mockResolvedValue({ data: null, error: null });

    // Setup mockEq to support chaining and be awaitable
    const eqChainUpdate = Object.assign(mockUpdateQueryPromise, { eq: mockEq });
    const eqChainSelect = Object.assign(mockSelectQueryPromise, {
      eq: mockEq,
      single: mockSingle,
    });

    mockSingle.mockReturnValue(mockSelectSinglePromise);

    // mockFrom needs to return different things based on table name
    mockFrom.mockImplementation((table: string) => {
      if (table === 'processing_jobs') {
        // For getMeetingInfo
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  meetings: {
                    id: 'meeting-123',
                    start_time: '2025-01-01T12:00:00Z',
                    user_speaker_label: null,
                  },
                },
                error: null,
              }),
            }),
          }),
        };
      } else if (table === 'meetings') {
        // For clearAutoIdentification
        return {
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: {}, error: null }),
          }),
        };
      } else {
        // For meeting_analysis (update and select)
        return {
          update: mockUpdate,
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { assigned_user_id: null },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
    });

    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue(eqChainUpdate);

    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  const defaultProps = {
    jobId: 'job-123',
    currentUserId: 'user-123',
    onSuccess: jest.fn(),
  };

  describe('assignSpeaker', () => {
    it('updates speaker with user assignment', async () => {
      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      await act(async () => {
        await result.current.assignSpeaker('SPEAKER_00');
      });

      expect(mockFrom).toHaveBeenCalledWith('meeting_analysis');
      expect(mockUpdate).toHaveBeenCalledWith({
        assigned_user_id: 'user-123',
        custom_speaker_name: null,
      });
      expect(mockEq).toHaveBeenCalledWith('job_id', 'job-123');
      expect(mockEq).toHaveBeenCalledWith('speaker_label', 'SPEAKER_00');
    });

    it('calls onSuccess after successful assignment', async () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() =>
        useSpeakerAssignment({ ...defaultProps, onSuccess })
      );

      await act(async () => {
        await result.current.assignSpeaker('SPEAKER_00');
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it('sets error state on failure', async () => {
      const error = new Error('Database error');
      const mockQueryPromise = Promise.resolve({ data: null, error });
      const eqChain = Object.assign(mockQueryPromise, { eq: mockEq });
      mockEq.mockReturnValue(eqChain);

      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      await act(async () => {
        try {
          await result.current.assignSpeaker('SPEAKER_00');
        } catch (e) {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe(
          'Failed to assign speaker. Please try again.'
        );
      });
    });

    it('sets isAssigning to true during assignment', async () => {
      let resolveUpdate: any;
      const updatePromise = new Promise((resolve) => {
        resolveUpdate = resolve;
      });
      const eqChain = Object.assign(updatePromise, { eq: mockEq });
      mockEq.mockReturnValue(eqChain);

      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      act(() => {
        result.current.assignSpeaker('SPEAKER_00');
      });

      expect(result.current.isAssigning).toBe(true);

      await act(async () => {
        resolveUpdate({ data: {}, error: null });
        await updatePromise;
      });

      expect(result.current.isAssigning).toBe(false);
    });

    it('does not call onSuccess on error', async () => {
      const error = new Error('Database error');
      const mockQueryPromise = Promise.resolve({ data: null, error });
      const eqChain = Object.assign(mockQueryPromise, { eq: mockEq });
      mockEq.mockReturnValue(eqChain);
      const onSuccess = jest.fn();

      const { result } = renderHook(() =>
        useSpeakerAssignment({ ...defaultProps, onSuccess })
      );

      await act(async () => {
        try {
          await result.current.assignSpeaker('SPEAKER_00');
        } catch (e) {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(onSuccess).not.toHaveBeenCalled();
      });
    });
  });

  describe('assignCustomName', () => {
    it('updates speaker with custom name', async () => {
      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      await act(async () => {
        await result.current.assignCustomName('SPEAKER_00', 'John Doe');
      });

      expect(mockFrom).toHaveBeenCalledWith('meeting_analysis');
      expect(mockUpdate).toHaveBeenCalledWith({
        custom_speaker_name: 'John Doe',
        assigned_user_id: null,
      });
      expect(mockEq).toHaveBeenCalledWith('job_id', 'job-123');
      expect(mockEq).toHaveBeenCalledWith('speaker_label', 'SPEAKER_00');
    });

    it('calls onSuccess after successful custom name assignment', async () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() =>
        useSpeakerAssignment({ ...defaultProps, onSuccess })
      );

      await act(async () => {
        await result.current.assignCustomName('SPEAKER_00', 'John Doe');
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledTimes(1);
      });
    });

    it('sets error state on failure', async () => {
      const error = new Error('Database error');
      const mockQueryPromise = Promise.resolve({ data: null, error });
      const eqChain = Object.assign(mockQueryPromise, { eq: mockEq });
      mockEq.mockReturnValue(eqChain);

      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      await act(async () => {
        try {
          await result.current.assignCustomName('SPEAKER_00', 'John Doe');
        } catch (e) {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe(
          'Failed to assign name. Please try again.'
        );
      });
    });

    it('does not update when custom name is empty', async () => {
      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      await act(async () => {
        await result.current.assignCustomName('SPEAKER_00', '');
      });

      // Should not call update for empty name (trimmed)
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('handles special characters in custom name', async () => {
      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      await act(async () => {
        await result.current.assignCustomName('SPEAKER_00', '@#$%^&*()');
      });

      expect(mockUpdate).toHaveBeenCalledWith({
        custom_speaker_name: '@#$%^&*()',
        assigned_user_id: null,
      });
    });
  });

  describe('Error Handling', () => {
    it('clears previous errors on new assignment', async () => {
      const error = new Error('Database error');
      const mockQueryPromiseError = Promise.resolve({ data: null, error });
      const eqChainError = Object.assign(mockQueryPromiseError, {
        eq: jest.fn().mockReturnValue(mockQueryPromiseError),
      });
      mockEq.mockReturnValueOnce(eqChainError);

      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      await act(async () => {
        try {
          await result.current.assignSpeaker('SPEAKER_00');
        } catch (e) {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBe(
          'Failed to assign speaker. Please try again.'
        );
      });

      const mockQueryPromiseSuccess = Promise.resolve({
        data: {},
        error: null,
      });
      const eqChainSuccess = Object.assign(mockQueryPromiseSuccess, {
        eq: jest.fn().mockReturnValue(mockQueryPromiseSuccess),
      });
      mockEq.mockReturnValueOnce(eqChainSuccess);

      await act(async () => {
        await result.current.assignSpeaker('SPEAKER_01');
      });

      await waitFor(() => {
        expect(result.current.error).toBeNull();
      });
    });

    it('handles network errors', async () => {
      const mockQueryPromiseReject = Promise.reject(new Error('Network error'));
      const eqChainReject = Object.assign(mockQueryPromiseReject, {
        eq: mockEq,
      });
      mockEq.mockReturnValue(eqChainReject);

      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      await act(async () => {
        try {
          await result.current.assignSpeaker('SPEAKER_00');
        } catch (e) {
          // Expected to throw
        }
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles null currentUserId by returning early', async () => {
      const { result } = renderHook(() =>
        useSpeakerAssignment({ ...defaultProps, currentUserId: undefined })
      );

      await act(async () => {
        await result.current.assignSpeaker('SPEAKER_00');
      });

      // Should not call update when currentUserId is null/undefined
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('handles very long speaker labels', async () => {
      const longLabel = 'SPEAKER_' + '0'.repeat(100);
      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      await act(async () => {
        await result.current.assignSpeaker(longLabel);
      });

      expect(mockEq).toHaveBeenCalledWith('speaker_label', longLabel);
    });

    it('handles very long custom names', async () => {
      const longName = 'A'.repeat(500);
      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      await act(async () => {
        await result.current.assignCustomName('SPEAKER_00', longName);
      });

      expect(mockUpdate).toHaveBeenCalledWith({
        custom_speaker_name: longName,
        assigned_user_id: null,
      });
    });

    it('handles rapid successive calls', async () => {
      const { result } = renderHook(() => useSpeakerAssignment(defaultProps));

      await act(async () => {
        await Promise.all([
          result.current.assignSpeaker('SPEAKER_00'),
          result.current.assignSpeaker('SPEAKER_01'),
          result.current.assignCustomName('SPEAKER_02', 'Alice'),
        ]);
      });

      expect(mockUpdate).toHaveBeenCalledTimes(3);
    });
  });

  describe('With No-op onSuccess callback', () => {
    it('works with empty onSuccess callback', async () => {
      const { result } = renderHook(() =>
        useSpeakerAssignment({
          jobId: 'job-123',
          hasSegments: false,
          currentUserId: 'user-123',
          onSuccess: async () => {}, // Empty callback
        })
      );

      await act(async () => {
        await result.current.assignSpeaker('SPEAKER_00');
      });

      expect(result.current.error).toBeNull();
    });
  });
});
