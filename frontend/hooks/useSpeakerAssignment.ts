/**
 * useSpeakerAssignment Hook
 *
 * Handles speaker assignment operations (assign to current user or custom name).
 * Manages speaker assignment for meeting recordings.
 * Automatically recalculates weekly rollups after assignment changes.
 */

import { useState } from 'react';
import { createClient } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Get the Monday (ISO week start) for a given date string
 */
function getWeekStart(dateString: string): string {
  const date = new Date(dateString);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const dayStr = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayStr}`;
}

interface MeetingInfo {
  id: string;
  start_time: string;
  user_speaker_label: string | null;
}

/**
 * Get meeting info from a processing job ID
 */
async function getMeetingInfo(
  supabase: SupabaseClient,
  jobId: string
): Promise<MeetingInfo | null> {
  const { data, error } = await supabase
    .from('processing_jobs')
    .select('meetings!inner(id, start_time, user_speaker_label)')
    .eq('id', jobId)
    .single();

  if (error || !data) {
    console.error('Failed to get meeting info:', error);
    return null;
  }

  // The join returns meetings as an object (due to !inner single relation)
  const meetings = data.meetings as unknown as MeetingInfo | null;
  return meetings || null;
}

/**
 * Clear speaker identification from meetings table if the speaker label matches
 */
async function clearSpeakerIdentification(
  supabase: SupabaseClient,
  meetingId: string,
  speakerLabel: string,
  userSpeakerLabel: string | null
): Promise<void> {
  if (userSpeakerLabel && speakerLabel === userSpeakerLabel) {
    const { error } = await supabase
      .from('meetings')
      .update({
        user_speaker_label: null,
      })
      .eq('id', meetingId);

    if (error) {
      console.error('Failed to clear speaker identification:', error);
    }
  }
}

/**
 * Recalculate weekly rollup for a user after assignment changes
 */
async function recalculateRollup(
  supabase: SupabaseClient,
  userId: string,
  meetingStartTime: string
): Promise<void> {
  const weekStart = getWeekStart(meetingStartTime);
  const { error } = await supabase.rpc('calculate_user_weekly_rollup', {
    p_user_id: userId,
    p_week_start: weekStart,
  });

  if (error) {
    console.error('Failed to recalculate weekly rollup:', error);
  }
}

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
      const supabase = createClient();

      // Get meeting info first
      const meetingInfo = await getMeetingInfo(supabase, jobId);
      if (!meetingInfo) throw new Error('Meeting not found');

      // Update the assigned_user_id for this specific speaker record
      const { error: updateError } = await supabase
        .from('meeting_analysis')
        .update({
          assigned_user_id: currentUserId,
          custom_speaker_name: null,
        } as any)
        .eq('job_id', jobId)
        .eq('speaker_label', speakerLabel);

      if (updateError) throw updateError;

      // Also update user_speaker_label on the meeting so it becomes the single source of truth
      const { error: meetingUpdateError } = await supabase
        .from('meetings')
        .update({
          user_speaker_label: speakerLabel,
        })
        .eq('id', meetingInfo.id);

      if (meetingUpdateError) {
        console.error(
          'Failed to update user_speaker_label:',
          meetingUpdateError
        );
      }

      // Recalculate weekly rollup for the newly assigned user
      await recalculateRollup(supabase, currentUserId, meetingInfo.start_time);

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
      const supabase = createClient();

      // Get the current assignment before clearing (to recalculate their rollup)
      const { data: currentData } = await supabase
        .from('meeting_analysis')
        .select('assigned_user_id')
        .eq('job_id', jobId)
        .eq('speaker_label', speakerLabel)
        .single();

      const previousUserId = currentData?.assigned_user_id;

      // Update the custom_speaker_name for this specific speaker record
      const { error: updateError } = await supabase
        .from('meeting_analysis')
        .update({
          custom_speaker_name: name.trim(),
          assigned_user_id: null,
        } as any)
        .eq('job_id', jobId)
        .eq('speaker_label', speakerLabel);

      if (updateError) throw updateError;

      // Get meeting info for rollup recalculation
      const meetingInfo = await getMeetingInfo(supabase, jobId);
      if (meetingInfo) {
        // Clear speaker identification if this speaker was identified as the user
        await clearSpeakerIdentification(
          supabase,
          meetingInfo.id,
          speakerLabel,
          meetingInfo.user_speaker_label
        );

        // Recalculate weekly rollup for the previously assigned user (if any)
        if (previousUserId) {
          await recalculateRollup(
            supabase,
            previousUserId,
            meetingInfo.start_time
          );
        }
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
      const supabase = createClient();

      // Get the current assignment before clearing (to recalculate their rollup)
      const { data: currentData } = await supabase
        .from('meeting_analysis')
        .select('assigned_user_id')
        .eq('job_id', jobId)
        .eq('speaker_label', speakerLabel)
        .single();

      const previousUserId = currentData?.assigned_user_id;

      // Clear both assigned_user_id and custom_speaker_name
      const { error: updateError } = await supabase
        .from('meeting_analysis')
        .update({
          assigned_user_id: null,
          custom_speaker_name: null,
        } as any)
        .eq('job_id', jobId)
        .eq('speaker_label', speakerLabel);

      if (updateError) throw updateError;

      // Get meeting info for rollup recalculation
      const meetingInfo = await getMeetingInfo(supabase, jobId);
      if (meetingInfo) {
        // Clear speaker identification if this speaker was identified as the user
        await clearSpeakerIdentification(
          supabase,
          meetingInfo.id,
          speakerLabel,
          meetingInfo.user_speaker_label
        );

        // Recalculate weekly rollup for the previously assigned user
        if (previousUserId) {
          await recalculateRollup(
            supabase,
            previousUserId,
            meetingInfo.start_time
          );
        }
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
