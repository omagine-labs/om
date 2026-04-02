/**
 * Reprocess Meeting Server Action
 *
 * Handles reprocessing of failed meeting recordings.
 * This is used when a meeting has already been uploaded but processing failed.
 */

'use server';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getSupabaseUrl } from '@/lib/config';

export interface ReprocessResult {
  success: boolean;
  message: string;
  jobId?: string;
}

/**
 * Reprocess a failed meeting recording
 *
 * 1. Verifies the meeting has a stored recording (audio_storage_path exists)
 * 2. Verifies the user owns the meeting
 * 3. Resets the processing job status from 'failed' to 'pending'
 * 4. Triggers the process-meeting Edge Function to start reprocessing
 *
 * The existing polling infrastructure (useJobStatus) will automatically
 * detect the status change and resume polling. When processing completes,
 * the desktop app (if applicable) will receive the completion notification
 * via its polling callback and can clean up the local video file.
 *
 * @param meetingId - The ID of the meeting to reprocess
 * @returns ReprocessResult indicating success or failure
 */
export async function reprocessMeeting(
  meetingId: string
): Promise<ReprocessResult> {
  try {
    const supabase = await createServerSupabaseClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        message: 'Not authenticated',
      };
    }

    // Get meeting with recording info and associated jobs
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select(
        `
        id,
        user_id,
        title,
        audio_storage_path,
        recording_filename,
        processing_jobs (
          id,
          status,
          processing_error
        )
      `
      )
      .eq('id', meetingId)
      .eq('user_id', user.id) // Ensure user owns the meeting
      .single();

    if (meetingError || !meeting) {
      console.error('Meeting not found:', meetingError);
      return {
        success: false,
        message: 'Meeting not found or you do not have permission to access it',
      };
    }

    // Verify recording exists
    if (!meeting.audio_storage_path) {
      return {
        success: false,
        message:
          'No recording found for this meeting. Please upload a recording first.',
      };
    }

    // Get the processing job - handle both single object and array cases
    const processingJobsRaw = meeting.processing_jobs;
    const jobs = Array.isArray(processingJobsRaw)
      ? processingJobsRaw
      : processingJobsRaw
        ? [processingJobsRaw]
        : [];

    if (jobs.length === 0) {
      return {
        success: false,
        message: 'No processing job found for this meeting',
      };
    }

    // Get the most recent job (in case there are multiple)
    const job = jobs[0] as {
      id: string;
      status: string;
      processing_error: string | null;
    };

    // Verify job is in a failed state
    if (job.status !== 'failed') {
      return {
        success: false,
        message: `Cannot reprocess: job is currently ${job.status}`,
      };
    }

    console.log(`[Reprocess] Resetting job ${job.id} for meeting ${meetingId}`);

    // Reset job status to pending and clear error
    const { error: updateError } = await supabase
      .from('processing_jobs')
      .update({
        status: 'pending',
        processing_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (updateError) {
      console.error('Failed to reset job status:', updateError);
      return {
        success: false,
        message: 'Failed to reset job status. Please try again.',
      };
    }

    console.log(`[Reprocess] Job ${job.id} status reset to pending`);

    // Trigger the process-meeting Edge Function
    const supabaseUrl = getSupabaseUrl();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return {
        success: false,
        message: 'Session expired. Please refresh and try again.',
      };
    }

    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/process-meeting`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jobId: job.id }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        console.error('Edge Function error:', result);
        // Revert job status back to failed
        await supabase
          .from('processing_jobs')
          .update({
            status: 'failed',
            processing_error: result.error || 'Failed to start reprocessing',
          })
          .eq('id', job.id);

        return {
          success: false,
          message:
            result.error || 'Failed to start reprocessing. Please try again.',
        };
      }

      console.log(
        `[Reprocess] Successfully triggered reprocessing for job ${job.id}`
      );

      return {
        success: true,
        message: 'Reprocessing started successfully',
        jobId: job.id,
      };
    } catch (fetchError) {
      console.error('Failed to call Edge Function:', fetchError);

      // Revert job status back to failed
      await supabase
        .from('processing_jobs')
        .update({
          status: 'failed',
          processing_error: 'Failed to start reprocessing',
        })
        .eq('id', job.id);

      return {
        success: false,
        message: 'Failed to start reprocessing. Please try again.',
      };
    }
  } catch (error) {
    console.error('Error in reprocessMeeting:', error);
    return {
      success: false,
      message: 'An unexpected error occurred. Please try again.',
    };
  }
}
