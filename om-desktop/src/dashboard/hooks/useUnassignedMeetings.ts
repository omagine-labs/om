/**
 * useUnassignedMeetings Hook
 *
 * Fetches global count of meetings without speaker identification.
 * Used for sidebar badge and navigation to first unassigned meeting.
 */

import { useState, useEffect, useCallback } from 'react';
import { authApi, dashboardApi } from '@/lib/api-client';

interface UnassignedMeetingsData {
  count: number;
  firstMeetingId: string | null;
}

interface UseUnassignedMeetingsOptions {
  userId?: string;
  refreshTrigger?: number;
}

export function useUnassignedMeetings(
  options: UseUnassignedMeetingsOptions = {}
) {
  const { userId, refreshTrigger } = options;

  const [data, setData] = useState<UnassignedMeetingsData>({
    count: 0,
    firstMeetingId: null,
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    // If userId is provided, use it directly (skip auth check)
    // This ensures we refetch when userId changes (e.g., on login)
    if (userId) {
      try {
        const result = await dashboardApi.getGlobalUnassignedMeetings(userId);
        if (result.success && result.data) {
          setData(result.data);
        } else {
          console.error(
            '[useUnassignedMeetings] Error fetching data:',
            result.error
          );
          setData({ count: 0, firstMeetingId: null });
        }
      } catch (error) {
        console.error('[useUnassignedMeetings] Exception:', error);
        setData({ count: 0, firstMeetingId: null });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Fallback: get user from auth (for backwards compatibility)
    try {
      // Wait for auth to be ready before fetching
      await authApi.waitForReady();

      const user = await authApi.getCurrentUser();
      if (!user) {
        setData({ count: 0, firstMeetingId: null });
        setLoading(false);
        return;
      }

      const result = await dashboardApi.getGlobalUnassignedMeetings(user.id);
      if (result.success && result.data) {
        setData(result.data);
      } else {
        console.error(
          '[useUnassignedMeetings] Error fetching data:',
          result.error
        );
        setData({ count: 0, firstMeetingId: null });
      }
    } catch (error) {
      // Silently handle auth errors (expected when not logged in or token expired)
      const errorMessage = error instanceof Error ? error.message : '';
      const isAuthError =
        errorMessage.includes('Not authenticated') ||
        errorMessage.includes('Auth in FAILED state') ||
        errorMessage.includes('invalid JWT');

      if (!isAuthError) {
        console.error('[useUnassignedMeetings] Exception:', error);
      }
      setData({ count: 0, firstMeetingId: null });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, userId, refreshTrigger]);

  // Listen for speaker assignment events to refresh counter
  useEffect(() => {
    const handleSpeakerAssigned = () => {
      fetchData();
    };

    window.addEventListener('speaker-assigned', handleSpeakerAssigned);
    return () => {
      window.removeEventListener('speaker-assigned', handleSpeakerAssigned);
    };
  }, [fetchData]);

  return {
    count: data.count,
    firstMeetingId: data.firstMeetingId,
    loading,
    refetch: fetchData,
  };
}
