-- Migration: Drop segment_id column from processing_jobs table
-- Completes the multi-segment infrastructure removal
-- The segment_id column is no longer needed after removing recording_segments table
-- CI-BYPASS: destructive-operations

BEGIN;

-- Drop the index first (will be dropped automatically with column, but being explicit)
DROP INDEX IF EXISTS public.idx_processing_jobs_segment_id;

-- Drop the segment_id column from processing_jobs
ALTER TABLE public.processing_jobs
  DROP COLUMN IF EXISTS segment_id;

COMMIT;
