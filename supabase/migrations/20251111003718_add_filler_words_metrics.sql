-- Migration: Add filler words metrics to meeting_analysis table
-- Description: Adds columns to track filler word count and breakdown per speaker using JSONB

BEGIN;

-- ============================================================================
-- Add filler words columns to meeting_analysis table
-- ============================================================================

ALTER TABLE public.meeting_analysis
  ADD COLUMN filler_words_total integer DEFAULT 0 CHECK (filler_words_total >= 0),
  ADD COLUMN filler_words_breakdown jsonb DEFAULT '{}'::jsonb;

-- Add column comments
COMMENT ON COLUMN public.meeting_analysis.filler_words_total IS 'Total count of all filler words used by this speaker';
COMMENT ON COLUMN public.meeting_analysis.filler_words_breakdown IS 'JSONB object mapping filler words to their counts (e.g., {"um": 12, "like": 8})';

-- Create GIN index for efficient JSONB queries
CREATE INDEX idx_meeting_analysis_filler_words ON public.meeting_analysis USING gin (filler_words_breakdown);

COMMIT;
