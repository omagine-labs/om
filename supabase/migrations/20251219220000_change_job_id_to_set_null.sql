-- Migration: Change meeting_analysis.job_id FK from CASCADE to SET NULL
-- Purpose: Preserve analysis data when processing jobs are cleaned up
-- This enables storage cleanup features without losing valuable analysis data

-- Step 1: Make job_id nullable (required for ON DELETE SET NULL)
ALTER TABLE public.meeting_analysis
  ALTER COLUMN job_id DROP NOT NULL;

-- Step 2: Drop the existing CASCADE constraint
ALTER TABLE public.meeting_analysis
  DROP CONSTRAINT IF EXISTS meeting_analysis_job_id_fkey;

-- Step 3: Re-add the constraint with ON DELETE SET NULL
ALTER TABLE public.meeting_analysis
  ADD CONSTRAINT meeting_analysis_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES public.processing_jobs(id)
  ON DELETE SET NULL;

-- Step 4: Add comment explaining the nullable column
COMMENT ON COLUMN public.meeting_analysis.job_id IS
  'Processing job ID - nullable, set to NULL when job is deleted during storage cleanup';
