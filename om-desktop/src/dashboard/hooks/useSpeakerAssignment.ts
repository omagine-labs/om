/**
 * useSpeakerAssignment Hook
 *
 * Handles speaker assignment operations (assign to current user or custom name).
 * Manages speaker assignment for meeting recordings.
 *
 * Uses IPC to main process for all Supabase operations.
 */

import { useState } from 'react';
import { analysisApi } from '@/lib/api-client';

interface UseSpeakerAssignmentParams {
  jobId: string;
  currentUserId: string | undefined;
  onSuccess: () => Promise<void>;
}

export function useSpeakerAssignment({
  jobId,
  currentUserId,
  onSuccess,
}: UseSpeakerAssignmentParams) {
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Assign a speaker to the current user ("This is me" functionality)
   */
  const assignSpeaker = async (speakerLabel: string) => {
    if (!currentUserId) return;

    setIsAssigning(true);
    setError(null);

    try {
      const result = await analysisApi.assignSpeaker(
        jobId,
        speakerLabel,
        currentUserId
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to assign speaker');
      }

      // Refetch the analysis to get updated data
      await onSuccess();
    } catch (err) {
      setError('Failed to assign speaker. Please try again.');
      throw err;
    } finally {
      setIsAssigning(false);
    }
  };

  /**
   * Assign a custom name to a speaker
   */
  const assignCustomName = async (speakerLabel: string, name: string) => {
    if (!name.trim()) return;

    setIsAssigning(true);
    setError(null);

    try {
      const result = await analysisApi.assignCustomName(
        jobId,
        speakerLabel,
        name.trim()
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to assign custom name');
      }

      // Refetch the analysis to get updated data
      await onSuccess();
    } catch (err) {
      setError('Failed to assign name. Please try again.');
      throw err;
    } finally {
      setIsAssigning(false);
    }
  };

  /**
   * Unassign a speaker (remove both user assignment and custom name)
   */
  const unassignSpeaker = async (speakerLabel: string) => {
    setIsAssigning(true);
    setError(null);

    try {
      const result = await analysisApi.unassignSpeaker(jobId, speakerLabel);

      if (!result.success) {
        throw new Error(result.error || 'Failed to unassign speaker');
      }

      // Refetch the analysis to get updated data
      await onSuccess();
    } catch (err) {
      setError('Failed to unassign speaker. Please try again.');
      throw err;
    } finally {
      setIsAssigning(false);
    }
  };

  return {
    assignSpeaker,
    assignCustomName,
    unassignSpeaker,
    isAssigning,
    error,
    clearError: () => setError(null),
  };
}
