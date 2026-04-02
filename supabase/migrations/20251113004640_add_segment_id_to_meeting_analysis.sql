-- ============================================================================
-- Add Segment ID to Meeting Analysis
-- ============================================================================
-- Adds segment_id to meeting_analysis to track which segment each speaker
-- analysis record came from. This allows proper speaker identity management
-- across multi-segment recordings without incorrectly merging speakers.
--
-- Problem: SPEAKER_A in segment 1 ` SPEAKER_A in segment 2 (different files)
-- Solution: Store segment_id, let users assign identities to combine metrics
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Add segment_id Column
-- ============================================================================

ALTER TABLE public.meeting_analysis
  ADD COLUMN IF NOT EXISTS segment_id UUID;

COMMENT ON COLUMN public.meeting_analysis.segment_id IS 'Recording segment this analysis came from (NULL for single-recording meetings)';

-- ============================================================================
-- Step 2: Add Index for Queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_meeting_analysis_segment_id
  ON public.meeting_analysis(segment_id)
  WHERE segment_id IS NOT NULL;

-- ============================================================================
-- Step 3: Update Existing Multi-Segment Records
-- ============================================================================

-- For existing multi-segment meetings, link analysis records to their segments
-- by matching job_id to the segment's processing_job_id
UPDATE public.meeting_analysis ma
SET segment_id = rs.id
FROM public.recording_segments rs
WHERE rs.processing_job_id = ma.job_id
  AND ma.segment_id IS NULL;

-- ============================================================================
-- Step 4: Drop Old Unique Constraint, Add New One
-- ============================================================================

-- Drop the old constraint that assumes speaker_label is unique per job
ALTER TABLE public.meeting_analysis
  DROP CONSTRAINT IF EXISTS meeting_analysis_job_id_speaker_label_key;

-- Add new constraint: unique per segment + speaker_label (or job + speaker for singles)
-- For multi-segment: segment_id + speaker_label must be unique
-- For single recordings: job_id + speaker_label must be unique (segment_id is NULL)
CREATE UNIQUE INDEX IF NOT EXISTS unique_segment_speaker
  ON public.meeting_analysis(segment_id, speaker_label)
  WHERE segment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_job_speaker
  ON public.meeting_analysis(job_id, speaker_label)
  WHERE segment_id IS NULL;

COMMIT;
