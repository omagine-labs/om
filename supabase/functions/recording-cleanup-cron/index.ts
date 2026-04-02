// Edge Function: Recording Cleanup Cron
// Deletes recordings that have passed their recording_available_until date
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { initSentry, flush } from '../_shared/sentry.ts';

// Initialize Sentry for error tracking
initSentry('recording-cleanup-cron');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(
      `[recording-cleanup-cron] Starting recording cleanup at ${new Date().toISOString()}`
    );

    // Get meetings with expired recordings
    const now = new Date().toISOString();
    const { data: expiredMeetings, error: fetchError } = await supabase
      .from('meetings')
      .select('id, user_id, recording_filename, recording_available_until')
      .not('recording_available_until', 'is', null)
      .lte('recording_available_until', now)
      .order('recording_available_until');

    if (fetchError) {
      throw new Error(
        `Failed to fetch expired meetings: ${fetchError.message}`
      );
    }

    if (!expiredMeetings || expiredMeetings.length === 0) {
      console.log('[recording-cleanup-cron] No recordings to clean up');
      await flush();
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No recordings to clean up',
          deleted_count: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(
      `[recording-cleanup-cron] Found ${expiredMeetings.length} recordings to clean up`
    );

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Delete each expired recording
    for (const meeting of expiredMeetings) {
      try {
        console.log(
          `[recording-cleanup-cron] Processing meeting: ${meeting.id}`
        );

        // Get associated processing jobs to find storage path
        const { data: jobs, error: jobsError } = await supabase
          .from('processing_jobs')
          .select('id')
          .eq('meeting_id', meeting.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (jobsError) {
          console.error(
            `[recording-cleanup-cron] Error fetching jobs for meeting ${meeting.id}: ${jobsError.message}`
          );
          errorCount++;
          results.push({
            meeting_id: meeting.id,
            success: false,
            error: `Failed to fetch jobs: ${jobsError.message}`,
          });
          continue;
        }

        if (!jobs || jobs.length === 0) {
          console.log(
            `[recording-cleanup-cron] No job found for meeting ${meeting.id}, skipping storage deletion`
          );
          // Still clear recording metadata from meeting
          await supabase
            .from('meetings')
            .update({
              audio_storage_path: null,
              recording_filename: null,
              recording_size_mb: null,
              recording_duration_seconds: null,
              recording_available_until: null,
            })
            .eq('id', meeting.id);

          successCount++;
          results.push({
            meeting_id: meeting.id,
            success: true,
            storage_deleted: false,
          });
          continue;
        }

        const jobId = jobs[0].id;

        // Build storage path
        const userId = meeting.user_id;
        const recordingDate = new Date(meeting.recording_available_until);
        const year = recordingDate.getFullYear();
        const month = String(recordingDate.getMonth() + 1).padStart(2, '0');
        const storagePath = `${userId}/${year}/${month}/${jobId}.mp4`;

        console.log(
          `[recording-cleanup-cron] Deleting from storage: ${storagePath}`
        );

        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('recordings')
          .remove([storagePath]);

        if (storageError) {
          console.error(
            `[recording-cleanup-cron] Storage deletion error for ${storagePath}: ${storageError.message}`
          );
          // Don't fail the entire operation, continue to clear metadata
        }

        // Clear recording metadata from meeting
        const { error: updateError } = await supabase
          .from('meetings')
          .update({
            audio_storage_path: null,
            recording_filename: null,
            recording_size_mb: null,
            recording_duration_seconds: null,
            recording_available_until: null,
          })
          .eq('id', meeting.id);

        if (updateError) {
          console.error(
            `[recording-cleanup-cron] Error updating meeting ${meeting.id}: ${updateError.message}`
          );
          errorCount++;
          results.push({
            meeting_id: meeting.id,
            success: false,
            error: `Failed to update meeting: ${updateError.message}`,
          });
        } else {
          console.log(
            `[recording-cleanup-cron] Successfully cleaned up meeting ${meeting.id}`
          );
          successCount++;
          results.push({
            meeting_id: meeting.id,
            success: true,
            storage_deleted: !storageError,
            storage_path: storagePath,
          });
        }
      } catch (error) {
        console.error(
          `[recording-cleanup-cron] Exception for meeting ${meeting.id}:`,
          error
        );
        errorCount++;
        results.push({
          meeting_id: meeting.id,
          success: false,
          error: error.message,
        });
      }
    }

    const duration = Date.now() - startTime;

    console.log(
      `[recording-cleanup-cron] Completed in ${duration}ms. Success: ${successCount}, Errors: ${errorCount}`
    );

    if (errorCount > 0) {
      const failedMeetings = results
        .filter((r) => !r.success)
        .map((r) => r.meeting_id);
      console.error(
        `[recording-cleanup-cron] Failed meetings:`,
        failedMeetings
      );
    }

    await flush();
    return new Response(
      JSON.stringify({
        success: true,
        deleted_count: successCount,
        error_count: errorCount,
        duration_ms: duration,
        results: results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[recording-cleanup-cron] Error:', error);

    await flush();
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
