-- Migration: Drop all deprecated multi-segment upload code
-- Safe to run since there are no users yet
-- CI-BYPASS: destructive-operations

BEGIN;

-- Drop deprecated table first (CASCADE removes triggers and foreign keys)
-- This will drop the on_segment_uploaded trigger which depends on auto_create_segment_processing_job()
DROP TABLE IF EXISTS public.recording_segments CASCADE;

-- Now drop deprecated database functions (triggers are already gone)
DROP FUNCTION IF EXISTS public.get_meeting_segments(UUID);
DROP FUNCTION IF EXISTS public.check_all_segments_uploaded(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.auto_create_segment_processing_job();
DROP FUNCTION IF EXISTS public.update_recording_segment_updated_at();

-- Remove deprecated columns from meetings table
ALTER TABLE public.meetings
  DROP COLUMN IF EXISTS has_segments,
  DROP COLUMN IF EXISTS session_id;

-- Remove segment_id from meeting_analysis (no longer needed)
ALTER TABLE public.meeting_analysis
  DROP COLUMN IF EXISTS segment_id;

-- Update processing job trigger to only check audio_storage_path
-- (Remove legacy recording_storage_path support)
DROP TRIGGER IF EXISTS on_meeting_recording_added ON public.meetings;

CREATE OR REPLACE FUNCTION public.auto_create_processing_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create processing job if meeting has audio_storage_path (M1+)
  IF NEW.audio_storage_path IS NOT NULL THEN
    -- Check if processing job already exists for this meeting
    IF NOT EXISTS (
      SELECT 1 FROM public.processing_jobs WHERE meeting_id = NEW.id
    ) THEN
      -- Create processing job with generated ID
      INSERT INTO public.processing_jobs (
        id,
        meeting_id,
        status
      ) VALUES (
        gen_random_uuid(),
        NEW.id,
        'pending'
      );

      RAISE LOG 'Auto-created processing job for meeting % (path: %)',
        NEW.id,
        NEW.audio_storage_path;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.auto_create_processing_job IS
  'Automatically creates processing job when meeting has audio_storage_path (M1 single-file uploads only)';

-- Recreate trigger to watch only audio_storage_path
CREATE TRIGGER on_meeting_recording_added
  AFTER INSERT OR UPDATE OF audio_storage_path ON public.meetings
  FOR EACH ROW
  WHEN (NEW.audio_storage_path IS NOT NULL)
  EXECUTE FUNCTION public.auto_create_processing_job();

COMMENT ON TRIGGER on_meeting_recording_added ON public.meetings IS
  'Creates processing job automatically when audio is uploaded (M1 single-file architecture only)';

COMMIT;
