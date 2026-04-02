import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { initSentry, flush } from '../_shared/sentry.ts';

// Initialize Sentry for error tracking
initSentry('get-job-status');

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
    // Initialize Supabase client with anon key (RLS will handle auth)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')!,
        },
      },
    });

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      await flush();
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized',
        }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get jobId from URL query params
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');

    if (!jobId) {
      throw new Error('Missing required parameter: jobId');
    }

    console.log(`[get-job-status] Fetching status for job: ${jobId}`);

    // Get job status from database (RLS ensures user can only see their own jobs)
    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .select('id, status, processing_error, created_at, updated_at')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      await flush();
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Job not found',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // If completed, check if analysis exists
    let hasAnalysis = false;
    if (job.status === 'completed') {
      const { data: analysis } = await supabase
        .from('meeting_analysis')
        .select('id')
        .eq('job_id', jobId)
        .single();

      hasAnalysis = !!analysis;
    }

    await flush();
    return new Response(
      JSON.stringify({
        success: true,
        job: {
          id: job.id,
          status: job.status,
          error: job.processing_error,
          createdAt: job.created_at,
          updatedAt: job.updated_at,
          hasAnalysis,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[get-job-status] Error:', error);

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
