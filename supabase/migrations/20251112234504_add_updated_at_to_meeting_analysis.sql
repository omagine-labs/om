-- ============================================================================
-- Add updated_at Column to meeting_analysis Table
-- ============================================================================
-- Adds audit trail capability to track when analysis records are modified.
-- Particularly useful for multi-segment recordings where metrics are
-- incrementally updated as each segment is processed.
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Add updated_at Column
-- ============================================================================

ALTER TABLE public.meeting_analysis
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN public.meeting_analysis.updated_at IS 'Timestamp of last update to this analysis record (for audit trail)';

-- ============================================================================
-- Step 2: Create Trigger to Auto-Update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_meeting_analysis_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.update_meeting_analysis_updated_at IS 'Automatically updates updated_at timestamp on record modification';

DROP TRIGGER IF EXISTS update_meeting_analysis_updated_at ON public.meeting_analysis;
CREATE TRIGGER update_meeting_analysis_updated_at
  BEFORE UPDATE ON public.meeting_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.update_meeting_analysis_updated_at();

COMMENT ON TRIGGER update_meeting_analysis_updated_at ON public.meeting_analysis IS 'Auto-updates updated_at timestamp on every UPDATE';

-- ============================================================================
-- Step 3: Backfill Existing Records
-- ============================================================================

-- Temporarily disable the trigger to prevent it from overwriting our backfill
ALTER TABLE public.meeting_analysis DISABLE TRIGGER update_meeting_analysis_updated_at;

-- Set updated_at = created_at for existing records (best approximation)
-- Use a separate UPDATE to avoid the trigger
UPDATE public.meeting_analysis
SET updated_at = created_at
WHERE updated_at IS NULL OR updated_at > created_at;

-- Re-enable the trigger
ALTER TABLE public.meeting_analysis ENABLE TRIGGER update_meeting_analysis_updated_at;

COMMIT;
