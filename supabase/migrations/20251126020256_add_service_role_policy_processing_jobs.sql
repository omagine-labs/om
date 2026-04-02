-- ============================================================================
-- Add Service Role Policy for Processing Jobs
-- ============================================================================
-- This migration adds a service role policy to processing_jobs table to allow
-- the Python backend (which uses service role key) to query jobs for analytics
-- and operational purposes.
--
-- Context: The user_id column was removed from processing_jobs in migration
-- 20251104220000_add_meeting_intelligence_schema.sql. Access control now flows
-- through the meetings table. However, the backend still needs to query jobs
-- for analytics (e.g., checking if this is a user's first completed job).
-- ============================================================================

BEGIN;

-- Add service role policy to allow backend operations
CREATE POLICY "Service role can manage processing jobs"
  ON public.processing_jobs
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMIT;
