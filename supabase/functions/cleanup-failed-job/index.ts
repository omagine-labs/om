// Edge Function: Cleanup Failed Job
// Deletes storage files and database records for failed processing jobs
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { initSentry, flush } from '../_shared/sentry.ts';

// Initialize Sentry for error tracking
initSentry('cleanup-failed-job');

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

  try {
    const { job_id } = await req.json();

    if (!job_id) {
      await flush();
      return new Response(JSON.stringify({ error: 'job_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[cleanup-failed-job] Starting cleanup for job: ${job_id}`);

    // Create Supabase client with service role (bypasses RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Fetch job details
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .select('meeting_id, id')
      .eq('id', job_id)
      .single();

    if (jobError || !job) {
      // Job doesn't exist - nothing to clean up, consider it success
      console.log(
        `[cleanup-failed-job] Job ${job_id} not found - already cleaned up or never existed`
      );
      await flush();
      return new Response(
        JSON.stringify({
          success: true,
          job_id,
          message: 'Job not found - nothing to clean up',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(
      `[cleanup-failed-job] Found job ${job_id} for meeting ${job.meeting_id}`
    );

    // 2. Fetch meeting details to get storage path
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('audio_storage_path, user_id, recording_filename')
      .eq('id', job.meeting_id)
      .single();

    if (meetingError || !meeting) {
      console.error(
        `[cleanup-failed-job] Failed to fetch meeting:`,
        meetingError
      );
      await flush();
      return new Response(
        JSON.stringify({
          error: 'Meeting not found',
          details: meetingError?.message,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const storagePath = meeting.audio_storage_path;
    let storageDeleted = false;
    let storageError = null;

    // 3. Delete from storage (if path exists)
    if (storagePath) {
      console.log(`[cleanup-failed-job] Deleting storage file: ${storagePath}`);

      const { error: deleteError } = await supabase.storage
        .from('recordings')
        .remove([storagePath]);

      if (deleteError) {
        console.error(
          `[cleanup-failed-job] Failed to delete storage file:`,
          deleteError
        );
        storageError = deleteError.message;
      } else {
        storageDeleted = true;
        console.log(
          `[cleanup-failed-job] Successfully deleted storage file: ${storagePath}`
        );
      }
    } else {
      console.log(`[cleanup-failed-job] No storage path found, skipping`);
    }

    // 4. Clear recording metadata from meetings table
    console.log(
      `[cleanup-failed-job] Clearing recording metadata from meeting ${job.meeting_id}`
    );

    const { error: updateError } = await supabase
      .from('meetings')
      .update({
        recording_filename: null,
        audio_storage_path: null,
        recording_size_mb: null,
        recording_duration_seconds: null,
        recording_available_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.meeting_id);

    if (updateError) {
      console.error(
        `[cleanup-failed-job] Failed to update meeting:`,
        updateError
      );
    } else {
      console.log(
        `[cleanup-failed-job] Successfully cleared metadata from meeting ${job.meeting_id}`
      );
    }

    // 5. Delete processing_jobs record
    console.log(`[cleanup-failed-job] Deleting processing job ${job_id}`);

    const { error: deleteJobError } = await supabase
      .from('processing_jobs')
      .delete()
      .eq('id', job_id);

    if (deleteJobError) {
      console.error(
        `[cleanup-failed-job] Failed to delete job:`,
        deleteJobError
      );
    } else {
      console.log(
        `[cleanup-failed-job] Successfully deleted processing job ${job_id}`
      );
    }

    // Return summary
    const result = {
      success: true,
      job_id,
      meeting_id: job.meeting_id,
      storage_path: storagePath || null,
      storage_deleted: storageDeleted,
      storage_error: storageError,
      metadata_cleared: !updateError,
      job_deleted: !deleteJobError,
    };

    console.log(`[cleanup-failed-job] Cleanup completed:`, result);

    await flush();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[cleanup-failed-job] Cleanup failed:', error);

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
