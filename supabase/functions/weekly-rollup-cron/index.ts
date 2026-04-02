// Edge Function: Weekly Rollup Cron
// Calculates weekly performance rollups for all active users
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { initSentry, flush } from '../_shared/sentry.ts';

// Initialize Sentry for error tracking
initSentry('weekly-rollup-cron');

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

    console.log('[weekly-rollup-cron] Starting weekly rollup calculation...');

    // Calculate the week start date (Monday of current week)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ...
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days to go back to Monday
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);

    const weekStartDate = weekStart.toISOString().split('T')[0];

    console.log(`[weekly-rollup-cron] Week start date: ${weekStartDate}`);

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
      `[weekly-rollup-cron] Found ${uniqueUserIds.length} users with meeting analysis`
    );

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Calculate rollup for each user
    for (const userId of uniqueUserIds) {
      try {
        console.log(
          `[weekly-rollup-cron] Calculating rollup for user: ${userId}`
        );

        // Call the database function to calculate rollup
        const { data, error } = await supabase.rpc(
          'calculate_user_weekly_rollup',
          {
            p_user_id: userId,
            p_week_start: weekStartDate,
          }
        );

        if (error) {
          console.error(
            `[weekly-rollup-cron] Error for user ${userId}: ${error.message}`
          );
          errorCount++;
          results.push({
            user_id: userId,
            success: false,
            error: error.message,
          });
        } else {
          console.log(
            `[weekly-rollup-cron] Successfully calculated rollup for user ${userId}, rollup_id: ${data}`
          );
          successCount++;
          results.push({
            user_id: userId,
            success: true,
            rollup_id: data,
          });
        }
      } catch (error) {
        console.error(
          `[weekly-rollup-cron] Exception for user ${userId}:`,
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
      `[weekly-rollup-cron] Completed. Success: ${successCount}, Errors: ${errorCount}`
    );

    await flush();
    return new Response(
      JSON.stringify({
        success: true,
        week_start: weekStartDate,
        users_processed: uniqueUserIds.length,
        success_count: successCount,
        error_count: errorCount,
        results: results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[weekly-rollup-cron] Error:', error);

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
