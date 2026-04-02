// Edge Function: Process Meeting Recording
// Orchestrates the processing workflow for uploaded meeting recordings
//
// IMPORTANT: This function must work even if Sentry is broken.
// Sentry is best-effort only — a broken dependency should never prevent
// meetings from being processed.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Safe Sentry import - if this fails, processing still works
let Sentry: typeof import('@sentry/deno') | null = null;
let sentryReady = false;
let sentrySetUser: ((userId: string) => void) | null = null;
let sentryFlush: (() => Promise<void>) | null = null;
try {
  Sentry = await import('@sentry/deno');
  const shared = await import('../_shared/sentry.ts');
  sentryReady = shared.initSentry('process-meeting');
  sentrySetUser = shared.setUser;
  sentryFlush = shared.flush;
} catch (e) {
  console.error(
    '[process-meeting] Sentry failed to load - processing will continue without error tracking:',
    e
  );
}

/** Safe Sentry helpers - never throw */
function safeSentryCall(fn: () => void) {
  if (!sentryReady || !Sentry) return;
  try {
    fn();
  } catch {
    // Ignore Sentry errors
  }
}

async function safeFlush() {
  if (sentryFlush) {
    try {
      await sentryFlush();
    } catch {
      // Ignore
    }
  }
}

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

  let jobId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    // Initialize Supabase client with service role key
    supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request
    const body = await req.json();
    jobId = body.jobId;

    if (!jobId) {
      throw new Error('Missing required field: jobId');
    }

    // Set Sentry context for this job
    safeSentryCall(() => {
      Sentry!.setTag('job_id', jobId!);
      Sentry!.addBreadcrumb({
        category: 'edge-function',
        message: 'Edge Function invoked',
        level: 'info',
        data: { jobId },
      });
    });

    console.log(`[process-meeting] Processing job: ${jobId}`);

    // Get job details with meeting information
    const { data: job, error: fetchError } = await supabase
      .from('processing_jobs')
      .select(
        `
        id,
        status,
        meeting_id,
        meetings (
          id,
          user_id,
          title,
          recording_filename,
          audio_storage_path,
          recording_size_mb,
          recording_duration_seconds
        )
      `
      )
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Validate job can be processed
    if (job.status !== 'pending') {
      throw new Error(`Job cannot be processed. Current status: ${job.status}`);
    }

    // Get meeting details
    const meeting = job.meetings;
    if (!meeting || !meeting.user_id) {
      throw new Error(`Meeting not found for job: ${jobId}`);
    }

    // Set additional Sentry context
    safeSentryCall(() => {
      Sentry!.setTag('meeting_id', meeting.id);
      Sentry!.setTag('user_id', meeting.user_id);
      sentrySetUser?.(meeting.user_id);
      Sentry!.setContext('job_details', {
        jobId,
        meetingId: meeting.id,
        userId: meeting.user_id,
        status: job.status,
      });
    });

    // Get storage path from meeting
    const storagePath = (meeting as { audio_storage_path?: string })
      .audio_storage_path;
    const recordingFilename =
      (meeting as { recording_filename?: string }).recording_filename ||
      'recording.mp4';

    if (!storagePath) {
      throw new Error(`No audio storage path found for meeting: ${meeting.id}`);
    }

    safeSentryCall(() => {
      Sentry!.addBreadcrumb({
        category: 'processing',
        message: 'Meeting and storage path found',
        level: 'info',
        data: {
          meetingId: meeting.id,
          storagePath,
          userId: meeting.user_id,
        },
      });
    });

    console.log(
      `[process-meeting] Job found. Meeting ID: ${meeting.id}, User ID: ${meeting.user_id}`
    );
    console.log(`[process-meeting] Storage path: ${storagePath}`);
    console.log(
      `[process-meeting] Using storage path for direct SDK access (no signed URL needed)`
    );

    // Update job status to processing
    const { error: updateError } = await supabase
      .from('processing_jobs')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (updateError) {
      console.error('[process-meeting] Status update error:', updateError);
      throw new Error('Failed to update job status');
    }

    console.log(`[process-meeting] Job status updated to processing`);

    // Get Python backend URL
    const pythonUrl = Deno.env.get('PYTHON_BACKEND_URL');
    if (!pythonUrl) {
      const error = new Error('PYTHON_BACKEND_URL not configured');
      safeSentryCall(() => Sentry!.captureException(error));
      throw error;
    }

    console.log(`[process-meeting] Calling Python backend: ${pythonUrl}`);

    safeSentryCall(() => {
      Sentry!.addBreadcrumb({
        category: 'processing',
        message: 'Calling Python backend',
        level: 'info',
        data: {
          pythonUrl,
          jobId,
          meetingId: meeting.id,
        },
      });
    });

    // Call Python backend for transcription and analysis
    const pythonApiKey = Deno.env.get('PYTHON_BACKEND_API_KEY');
    console.log(
      `[process-meeting] API key length: ${pythonApiKey?.length}, first 10 chars: ${pythonApiKey?.substring(0, 10)}`
    );

    // Helper to make the backend request with timeout
    const callPythonBackend = (timeoutMs: number) => {
      return fetch(`${pythonUrl}/api/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(pythonApiKey && {
            Authorization: `Bearer ${pythonApiKey}`,
          }),
        },
        body: JSON.stringify({
          job_id: jobId,
          meeting_id: meeting.id,
          user_id: meeting.user_id,
          storage_path: storagePath,
          original_filename: recordingFilename,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    };

    // Try request with retry on timeout or 5xx errors
    let response: Response;
    const TIMEOUT_MS = 30000; // 30 second timeout for international users
    try {
      response = await callPythonBackend(TIMEOUT_MS);
      // Retry once on 5xx errors (infrastructure issues)
      if (response.status >= 500 && response.status < 600) {
        console.log(
          `[process-meeting] Got ${response.status}, retrying once...`
        );
        safeSentryCall(() => {
          Sentry!.addBreadcrumb({
            category: 'processing',
            message: `Retrying after ${response.status} error`,
            level: 'warning',
          });
        });
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s before retry
        response = await callPythonBackend(TIMEOUT_MS);
      }
    } catch (err) {
      // Retry once on timeout
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        console.log(`[process-meeting] Request timed out, retrying once...`);
        safeSentryCall(() => {
          Sentry!.addBreadcrumb({
            category: 'processing',
            message: 'Retrying after timeout',
            level: 'warning',
          });
        });
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s before retry
        response = await callPythonBackend(TIMEOUT_MS);
      } else {
        throw err;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[process-meeting] Python backend error:', errorText);

      // Capture error in Sentry with full context
      const error = new Error(`Python backend failed: ${errorText}`);
      safeSentryCall(() => {
        Sentry!.setContext('python_response', {
          status: response.status,
          statusText: response.statusText,
          errorText,
        });
        Sentry!.captureException(error);
      });

      // Update job to failed
      await supabase
        .from('processing_jobs')
        .update({
          status: 'failed',
          processing_error: `Backend error: ${response.statusText}`,
        })
        .eq('id', jobId);

      throw error;
    }

    const result = await response.json();
    console.log(`[process-meeting] Python backend responded:`, result);

    safeSentryCall(() => {
      Sentry!.addBreadcrumb({
        category: 'processing',
        message: 'Python backend accepted job',
        level: 'info',
        data: {
          pythonJobId: result.python_job_id,
          success: result.success,
        },
      });

      // Structured log: Edge Function completed successfully
      Sentry!.captureMessage('Edge Function invoked successfully', {
        level: 'info',
        extra: {
          jobId,
          meetingId: meeting.id,
          userId: meeting.user_id,
          component: 'edge-function',
          stage: 'edge-complete',
          pythonJobId: result.python_job_id,
        },
      });
    });

    await safeFlush();
    return new Response(
      JSON.stringify({
        success: true,
        jobId,
        message: 'Processing started',
        pythonJobId: result.python_job_id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[process-meeting] Edge Function error:', error);

    // Best-effort Sentry capture
    safeSentryCall(() => Sentry!.captureException(error));

    // CRITICAL: Update job status to failed to prevent stuck jobs
    if (jobId && supabase) {
      try {
        await supabase
          .from('processing_jobs')
          .update({
            status: 'failed',
            processing_error: `Edge Function error: ${error.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);
        console.log(`[process-meeting] Updated job ${jobId} to failed status`);
      } catch (updateError) {
        console.error(
          '[process-meeting] Failed to update job status:',
          updateError
        );
      }
    }

    await safeFlush();
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
