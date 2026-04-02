/**
 * Reprocess Meeting (Client-Side)
 *
 * Handles reprocessing of failed meeting recordings.
 * Uses IPC to main process for all Supabase operations.
 */

import { authApi, meetingsApi, processingJobsApi } from './api-client';
import { getSupabaseUrl } from './config';

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
 * @param meetingId - The ID of the meeting to reprocess
 * @returns ReprocessResult indicating success or failure
 */
export async function reprocessMeeting(
  meetingId: string
): Promise<ReprocessResult> {
  try {
    // Get current user from main process
    const user = await authApi.getCurrentUser();

    if (!user) {
      return {
        success: false,
        message: 'Not authenticated',
      };
    }

    // Get meeting with recording info and associated jobs via IPC
    const result = await meetingsApi.getMeetingForReprocess(meetingId, user.id);

    if (!result.success || !result.data) {
      console.error('Meeting not found:', result.error);
      return {
        success: false,
        message: 'Meeting not found or you do not have permission to access it',
      };
    }

    const meeting = result.data;

    // Verify recording exists
    if (!meeting.audio_storage_path) {
      return {
        success: false,
        message:
          'No recording found for this meeting. Please upload a recording first.',
      };
    }

    // Get the processing job
    const jobs = meeting.processing_jobs as Array<{
      id: string;
      status: string;
      processing_error: string | null;
    }>;

    if (!jobs || jobs.length === 0) {
      return {
        success: false,
        message: 'No processing job found for this meeting',
      };
    }

    // Get the most recent job
    const job = jobs[0];

    // Verify job is in a failed state
    if (job.status !== 'failed') {
      return {
        success: false,
        message: `Cannot reprocess: job is currently ${job.status}`,
      };
    }

    console.log(`[Reprocess] Resetting job ${job.id} for meeting ${meetingId}`);

    // Reset job status to pending and clear error via IPC
    const updateResult = await processingJobsApi.updateJobStatus(
      job.id,
      'pending',
      undefined // Clear error
    );

    if (!updateResult.success) {
      console.error('Failed to reset job status:', updateResult.error);
      return {
        success: false,
        message: 'Failed to reset job status. Please try again.',
      };
    }

    console.log(`[Reprocess] Job ${job.id} status reset to pending`);

    // Trigger the process-meeting Edge Function
    const supabaseUrl = getSupabaseUrl();

    // Get session from main process
    const session = await authApi.getSession();

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

      const edgeFunctionResult = await response.json();

      if (!response.ok || !edgeFunctionResult.success) {
        console.error('Edge Function error:', edgeFunctionResult);
        // Revert job status back to failed
        await processingJobsApi.updateJobStatus(
          job.id,
          'failed',
          edgeFunctionResult.error || 'Failed to start reprocessing'
        );

        return {
          success: false,
          message:
            edgeFunctionResult.error ||
            'Failed to start reprocessing. Please try again.',
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
      await processingJobsApi.updateJobStatus(
        job.id,
        'failed',
        'Failed to start reprocessing'
      );

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
