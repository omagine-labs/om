-- ============================================================================
-- Stuck Jobs Monitor Setup
-- ============================================================================
-- This migration documents the stuck jobs monitoring system that uses
-- pg_cron to periodically check for jobs stuck in pending/processing status.
--
-- NOTE: pg_cron extension is enabled by default in Supabase projects.
-- Cron job schedules are configured in the Supabase Dashboard UI, not via SQL.
--
-- For cron job configuration instructions, see: docs/monitoring.md
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Verify pg_cron Extension (Read-Only Check)
-- ============================================================================
-- The pg_cron extension should already be enabled in Supabase.
-- This query verifies it exists (no changes made).

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
-- Step 2: Add Comments for Documentation
-- ============================================================================

COMMENT ON TABLE public.processing_jobs IS 'Processing jobs for meeting recordings. Monitored by stuck-jobs-monitor cron (every 5 min) for stuck jobs: pending >5min, processing >20min.';

COMMIT;

-- ============================================================================
-- Post-Deployment Configuration Checklist
-- ============================================================================
-- After this migration runs, complete the following in production:
--
-- 1. Deploy stuck-jobs-monitor Edge Function:
--    supabase functions deploy stuck-jobs-monitor
--
-- 2. Configure cron job in Supabase Dashboard:
--    Navigate to: Project -> Database -> Cron Jobs
--    Schedule: every 5 minutes (*/5 * * * *)
--    See docs/monitoring.md for full SQL command
--
-- 3. Verify Sentry DSN is configured in Edge Function secrets:
--    supabase secrets set SENTRY_DSN=<your-sentry-dsn>
--
-- 4. Test the Edge Function manually (see docs/monitoring.md)
--
-- 5. Monitor Sentry for stuck job alerts
--
-- ============================================================================
