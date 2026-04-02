// Edge Function: Stuck Jobs Monitor
// Detects and alerts on jobs stuck in pending or processing status
//
// IMPORTANT: This function must work even if Sentry is broken.
// All Sentry calls are wrapped in try/catch to prevent Sentry failures
// from breaking the monitor itself (bootstrap problem).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Safe Sentry import - if this fails, the monitor still works
let Sentry: typeof import('@sentry/deno') | null = null;
let sentryReady = false;
try {
  Sentry = await import('@sentry/deno');
  const { initSentry } = await import('../_shared/sentry.ts');
  sentryReady = initSentry('stuck-jobs-monitor');
} catch (e) {
  console.error(
    '[stuck-jobs-monitor] Sentry failed to load - monitor will run without error tracking:',
    e
  );
}

/** Safe wrapper for Sentry calls - never throws */
function safeCapture(error: Error, context?: Record<string, unknown>) {
  if (!sentryReady || !Sentry) return;
  try {
    if (context) Sentry.setContext('stuck_jobs', context);
    Sentry.captureException(error);
  } catch (e) {
    console.error('[stuck-jobs-monitor] Sentry capture failed:', e);
  }
}

async function safeFlush() {
  if (!sentryReady || !Sentry) return;
  try {
    await Sentry.flush(2000);
  } catch {
    // Ignore flush errors
  }
}

// SLA thresholds (in minutes)
const PENDING_THRESHOLD_MINUTES = 5;
const PROCESSING_THRESHOLD_MINUTES = 20;

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
      `[stuck-jobs-monitor] Starting stuck jobs check at ${new Date().toISOString()}`
    );

    // Calculate threshold timestamps
    const pendingThreshold = new Date(
      Date.now() - PENDING_THRESHOLD_MINUTES * 60000
    ).toISOString();
    const processingThreshold = new Date(
      Date.now() - PROCESSING_THRESHOLD_MINUTES * 60000
    ).toISOString();

    // Find jobs stuck in pending (created more than 5 minutes ago)
    const { data: pendingJobs, error: pendingError } = await supabase
      .from('processing_jobs')
      .select(
        `
        id,
        meeting_id,
        created_at,
        meetings (
          user_id,
          title
        )
      `
      )
      .eq('status', 'pending')
      .lt('created_at', pendingThreshold)
      .order('created_at', { ascending: true });

    if (pendingError) {
      throw new Error(`Failed to fetch pending jobs: ${pendingError.message}`);
    }

    // Find jobs stuck in processing (no update in last 20 minutes)
    const { data: processingJobs, error: processingError } = await supabase
      .from('processing_jobs')
      .select(
        `
        id,
        meeting_id,
        created_at,
        updated_at,
        meetings (
          user_id,
          title
        )
      `
      )
      .eq('status', 'processing')
      .lt('updated_at', processingThreshold)
      .order('updated_at', { ascending: true });

    if (processingError) {
      throw new Error(
        `Failed to fetch processing jobs: ${processingError.message}`
      );
    }

    const pendingCount = pendingJobs?.length || 0;
    const processingCount = processingJobs?.length || 0;

    console.log(
      `[stuck-jobs-monitor] Found ${pendingCount} stuck pending jobs, ${processingCount} stuck processing jobs`
    );

    // Alert for jobs stuck in pending
    if (pendingCount > 0) {
      const jobDetails = pendingJobs.map((j) => ({
        job_id: j.id,
        meeting_id: j.meeting_id,
        created_at: j.created_at,
        minutes_stuck: Math.floor(
          (Date.now() - new Date(j.created_at).getTime()) / 60000
        ),
        user_id: (j.meetings as { user_id: string; title: string } | null)
          ?.user_id,
        title: (j.meetings as { user_id: string; title: string } | null)
          ?.title,
      }));

      // Always log to console (visible in Supabase Edge Function logs)
      console.error(
        `[stuck-jobs-monitor] ⚠️ ALERT: ${pendingCount} jobs stuck in pending:`,
        JSON.stringify(jobDetails)
      );

      // Best-effort Sentry alert
      safeCapture(
        new Error(`${pendingCount} jobs stuck in pending status`),
        {
          count: pendingCount,
          job_ids: pendingJobs.map((j) => j.id),
          status: 'pending',
          threshold_minutes: PENDING_THRESHOLD_MINUTES,
          jobs_details: jobDetails,
        }
      );
    }

    // Alert for jobs stuck in processing
    if (processingCount > 0) {
      const jobDetails = processingJobs.map((j) => ({
        job_id: j.id,
        meeting_id: j.meeting_id,
        updated_at: j.updated_at,
        minutes_stuck: Math.floor(
          (Date.now() - new Date(j.updated_at).getTime()) / 60000
        ),
        user_id: (j.meetings as { user_id: string; title: string } | null)
          ?.user_id,
        title: (j.meetings as { user_id: string; title: string } | null)
          ?.title,
      }));

      // Always log to console (visible in Supabase Edge Function logs)
      console.error(
        `[stuck-jobs-monitor] ⚠️ ALERT: ${processingCount} jobs stuck in processing:`,
        JSON.stringify(jobDetails)
      );

      // Best-effort Sentry alert
      safeCapture(
        new Error(`${processingCount} jobs stuck in processing status`),
        {
          count: processingCount,
          job_ids: processingJobs.map((j) => j.id),
          status: 'processing',
          threshold_minutes: PROCESSING_THRESHOLD_MINUTES,
          jobs_details: jobDetails,
        }
      );
    }

    const duration = Date.now() - startTime;

    console.log(
      `[stuck-jobs-monitor] Completed in ${duration}ms. Pending stuck: ${pendingCount}, Processing stuck: ${processingCount}`
    );

    await safeFlush();
    return new Response(
      JSON.stringify({
        success: true,
        sentry_enabled: sentryReady,
        pending_stuck: pendingCount,
        processing_stuck: processingCount,
        duration_ms: duration,
        thresholds: {
          pending_minutes: PENDING_THRESHOLD_MINUTES,
          processing_minutes: PROCESSING_THRESHOLD_MINUTES,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[stuck-jobs-monitor] Error:', error);

    // Best-effort Sentry capture
    safeCapture(error instanceof Error ? error : new Error(String(error)));

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
