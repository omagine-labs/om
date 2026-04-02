// Edge Function: Baseline Update Cron
// Updates user baselines (initial and current) for performance tracking
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { initSentry, captureException, flush } from '../_shared/sentry.ts';

// Initialize Sentry for error tracking
initSentry('baseline-update-cron');

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
    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[baseline-update-cron] Starting baseline update...');

    // Get all users who have been identified as speakers in their meetings
    // Use user_speaker_label (not assigned_user_id) as the source of truth
    const { data: users, error: usersError } = await supabase
      .from('meetings')
      .select('user_id')
      .not('user_speaker_label', 'is', null)
      .order('user_id');

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    // Get unique user IDs
    const uniqueUserIds = [...new Set(users?.map((u) => u.user_id) || [])];

    console.log(
      `[baseline-update-cron] Found ${uniqueUserIds.length} users with meeting analysis`
    );

    const results = [];
    let initialBaselineCount = 0;
    let currentBaselineCount = 0;
    let errorCount = 0;

    // Process each user
    for (const userId of uniqueUserIds) {
      try {
        console.log(`[baseline-update-cron] Processing user: ${userId}`);

        // Step 1: Try to create initial baseline (if not exists)
        const { data: initialData, error: initialError } = await supabase.rpc(
          'calculate_initial_baseline',
          {
            p_user_id: userId,
          }
        );

        if (initialError) {
          console.error(
            `[baseline-update-cron] Initial baseline error for user ${userId}: ${initialError.message}`
          );
        } else if (initialData) {
          console.log(
            `[baseline-update-cron] Created initial baseline for user ${userId}: ${initialData}`
          );
          initialBaselineCount++;
        } else {
          console.log(
            `[baseline-update-cron] Initial baseline already exists or not enough data for user ${userId}`
          );
        }

        // Step 2: Update current baseline (12-week rolling window)
        const { data: currentData, error: currentError } = await supabase.rpc(
          'update_current_baseline',
          {
            p_user_id: userId,
          }
        );

        if (currentError) {
          console.error(
            `[baseline-update-cron] Current baseline error for user ${userId}: ${currentError.message}`
          );
          errorCount++;
          results.push({
            user_id: userId,
            success: false,
            error: currentError.message,
          });
        } else if (currentData) {
          console.log(
            `[baseline-update-cron] Updated current baseline for user ${userId}: ${currentData}`
          );
          currentBaselineCount++;
          results.push({
            user_id: userId,
            success: true,
            initial_baseline_id: initialData,
            current_baseline_id: currentData,
          });
        } else {
          console.log(
            `[baseline-update-cron] No baseline update needed for user ${userId}`
          );
          results.push({
            user_id: userId,
            success: true,
            initial_baseline_id: initialData,
            current_baseline_id: null,
          });
        }
      } catch (error) {
        console.error(
          `[baseline-update-cron] Exception for user ${userId}:`,
          error
        );
        errorCount++;
        results.push({
          user_id: userId,
          success: false,
          error: error.message,
        });
      }
    }

    console.log(
      `[baseline-update-cron] Completed. Initial: ${initialBaselineCount}, Current: ${currentBaselineCount}, Errors: ${errorCount}`
    );

    await flush();
    return new Response(
      JSON.stringify({
        success: true,
        users_processed: uniqueUserIds.length,
        initial_baselines_created: initialBaselineCount,
        current_baselines_updated: currentBaselineCount,
        error_count: errorCount,
        results: results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[baseline-update-cron] Error:', error);
    captureException(error);
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
