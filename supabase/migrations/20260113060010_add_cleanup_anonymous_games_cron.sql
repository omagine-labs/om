-- ============================================================================
-- Cleanup Anonymous Games Cron Setup
-- ============================================================================
-- This migration documents the anonymous games cleanup system that uses
-- pg_cron to periodically delete unclaimed anonymous games older than 24 hours.
--
-- NOTE: pg_cron extension is enabled by default in Supabase projects.
-- Cron job schedules are configured in the Supabase Dashboard UI, not via SQL.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Verify pg_cron Extension (Read-Only Check)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    RAISE NOTICE 'pg_cron extension not found. Please enable it in Supabase Dashboard.';
  ELSE
    RAISE NOTICE 'pg_cron extension is already enabled.';
  END IF;
END $$;

-- ============================================================================
-- Step 2: Add Index for Efficient Cleanup Queries
-- ============================================================================
-- This index helps the cleanup job efficiently find anonymous games by
-- filtering on user_id IS NULL and ordering by created_at.

CREATE INDEX IF NOT EXISTS idx_games_anonymous_cleanup
  ON public.games(created_at)
  WHERE user_id IS NULL;

-- ============================================================================
-- Step 3: Add Comments for Documentation
-- ============================================================================

COMMENT ON TABLE public.games IS 'Standalone table for PowerPoint Karaoke games. Anonymous games (user_id IS NULL) older than 24 hours are cleaned up by the cleanup-anonymous-games cron job.';

COMMIT;

-- ============================================================================
-- Post-Deployment Configuration Checklist
-- ============================================================================
-- After this migration runs, complete the following in production:
--
-- 1. Deploy cleanup-anonymous-games Edge Function:
--    supabase functions deploy cleanup-anonymous-games
--
-- 2. Configure cron job in Supabase Dashboard:
--    Navigate to: Project -> Database -> Cron Jobs
--
--    Name: cleanup-anonymous-games
--    Schedule: every hour (0 * * * *)
--
--    SQL Command:
--    SELECT net.http_post(
--      url := '<SUPABASE_URL>/functions/v1/cleanup-anonymous-games',
--      headers := jsonb_build_object(
--        'Content-Type', 'application/json',
--        'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>'
--      ),
--      body := '{}'::jsonb
--    ) AS request_id;
--
-- 3. Verify the Edge Function is working:
--    curl -X POST https://<project-ref>.supabase.co/functions/v1/cleanup-anonymous-games \
--      -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>" \
--      -H "Content-Type: application/json"
--
-- 4. Monitor logs in Supabase Dashboard -> Edge Functions -> Logs
--
-- ============================================================================
