-- Migration: Update processing job trigger to support M1 audio_storage_path
-- The trigger now creates processing jobs for both:
-- - recording_storage_path (legacy multi-segment uploads)
-- - audio_storage_path (M1 single stitched audio file)

-- Drop existing trigger
DROP TRIGGER IF EXISTS on_meeting_recording_added ON public.meetings;

-- Update function to check both recording_storage_path and audio_storage_path
CREATE OR REPLACE FUNCTION public.auto_create_processing_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Create processing job if meeting has EITHER:
  -- 1. recording_storage_path (legacy single file or will be deprecated)
  -- 2. audio_storage_path (M1+ stitched audio file)
  IF NEW.recording_storage_path IS NOT NULL OR NEW.audio_storage_path IS NOT NULL THEN
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
        COALESCE(NEW.audio_storage_path, NEW.recording_storage_path);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.auto_create_processing_job IS
  'Automatically creates processing job when meeting has recording_storage_path (legacy) or audio_storage_path (M1)';

-- Recreate trigger to watch BOTH columns
CREATE TRIGGER on_meeting_recording_added
  AFTER INSERT OR UPDATE OF recording_storage_path, audio_storage_path ON public.meetings
  FOR EACH ROW
  WHEN (NEW.recording_storage_path IS NOT NULL OR NEW.audio_storage_path IS NOT NULL)
  EXECUTE FUNCTION public.auto_create_processing_job();

COMMENT ON TRIGGER on_meeting_recording_added ON public.meetings IS
  'Creates processing job automatically when recording is added to meeting (supports both legacy and M1 paths)';
