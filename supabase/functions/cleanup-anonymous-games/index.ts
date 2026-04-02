// Edge Function: Cleanup Anonymous Games
// Deletes storage files for unclaimed anonymous games older than 7 days
// Game records are preserved for metrics tracking
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { initSentry, flush } from '../_shared/sentry.ts';
import * as Sentry from '@sentry/deno';

// Initialize Sentry for error tracking
initSentry('cleanup-anonymous-games');

// Storage files older than this will be deleted (in hours)
// Game records are kept forever for metrics
const CLEANUP_THRESHOLD_HOURS = 24 * 7; // 7 days

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
      `[cleanup-anonymous-games] Starting cleanup at ${new Date().toISOString()}`
    );

    // Calculate threshold timestamp (7 days ago)
    const thresholdDate = new Date(
      Date.now() - CLEANUP_THRESHOLD_HOURS * 60 * 60 * 1000
    ).toISOString();

    // Find anonymous games older than threshold that still have storage files
    // We filter for games with storage paths since we only clean up storage now
    const { data: oldGames, error: fetchError } = await supabase
      .from('games')
      .select('id, audio_storage_path, video_storage_path, created_at')
      .is('user_id', null)
      .lt('created_at', thresholdDate)
      .or('audio_storage_path.not.is.null,video_storage_path.not.is.null');

    if (fetchError) {
      throw new Error(`Failed to fetch old games: ${fetchError.message}`);
    }

    const gameCount = oldGames?.length || 0;
    console.log(
      `[cleanup-anonymous-games] Found ${gameCount} anonymous games with storage files older than ${CLEANUP_THRESHOLD_HOURS} hours`
    );

    if (gameCount === 0) {
      const duration = Date.now() - startTime;
      console.log(
        `[cleanup-anonymous-games] No games to clean up. Completed in ${duration}ms`
      );

      await flush();
      return new Response(
        JSON.stringify({
          success: true,
          games_cleaned: 0,
          storage_files_deleted: 0,
          duration_ms: duration,
          threshold_hours: CLEANUP_THRESHOLD_HOURS,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Collect storage paths to delete
    const storagePaths: string[] = [];
    for (const game of oldGames) {
      if (game.audio_storage_path) {
        storagePaths.push(game.audio_storage_path);
      }
      if (game.video_storage_path) {
        storagePaths.push(game.video_storage_path);
      }
    }

    // Delete storage files
    let storageDeleteCount = 0;
    if (storagePaths.length > 0) {
      console.log(
        `[cleanup-anonymous-games] Deleting ${storagePaths.length} storage files`
      );

      const { data: deleteData, error: storageError } = await supabase.storage
        .from('recordings')
        .remove(storagePaths);

      if (storageError) {
        // Log but don't fail - storage cleanup is best-effort
        console.error(
          `[cleanup-anonymous-games] Storage delete error (continuing): ${storageError.message}`
        );
        Sentry.captureException(
          new Error(`Storage cleanup partial failure: ${storageError.message}`)
        );
      } else {
        storageDeleteCount = deleteData?.length || 0;
        console.log(
          `[cleanup-anonymous-games] Deleted ${storageDeleteCount} storage files`
        );
      }
    }

    // Update game records to null out storage paths (keep records for metrics)
    const gameIds = oldGames.map((g) => g.id);
    const { error: updateError } = await supabase
      .from('games')
      .update({
        audio_storage_path: null,
        video_storage_path: null,
      })
      .in('id', gameIds);

    if (updateError) {
      throw new Error(`Failed to update games: ${updateError.message}`);
    }

    console.log(
      `[cleanup-anonymous-games] Updated ${gameCount} game records (nulled storage paths)`
    );

    const duration = Date.now() - startTime;
    console.log(
      `[cleanup-anonymous-games] Completed in ${duration}ms. Games updated: ${gameCount}, Storage files deleted: ${storageDeleteCount}`
    );

    await flush();
    return new Response(
      JSON.stringify({
        success: true,
        games_cleaned: gameCount,
        storage_files_deleted: storageDeleteCount,
        duration_ms: duration,
        threshold_hours: CLEANUP_THRESHOLD_HOURS,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[cleanup-anonymous-games] Error:', error);

    // Capture cleanup errors in Sentry
    Sentry.captureException(error);

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
