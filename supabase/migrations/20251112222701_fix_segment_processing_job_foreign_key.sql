-- ============================================================================
-- Fix Segment Processing Job Foreign Key Constraint
-- ============================================================================
-- Problem: The trigger was trying to insert into processing_jobs with a
-- segment_id foreign key BEFORE the segment record was committed, causing
-- a foreign key violation.
--
-- Solution: Change the trigger from BEFORE to AFTER so the segment record
-- is committed before creating the processing job.
-- ============================================================================

BEGIN;

-- Drop the old BEFORE trigger
DROP TRIGGER IF EXISTS on_segment_uploaded ON public.recording_segments;

-- Update the trigger function to work with AFTER trigger
-- Key change: Don't try to modify NEW.processing_job_id since it's AFTER
CREATE OR REPLACE FUNCTION public.auto_create_segment_processing_job()
RETURNS TRIGGER AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Only create processing job if segment is uploaded and doesn't have one yet
  IF NEW.upload_status = 'uploaded' AND NEW.processing_job_id IS NULL THEN
    -- Create processing job for this segment
    INSERT INTO public.processing_jobs (
      id,
      meeting_id,
      segment_id,
      status
    ) VALUES (
      gen_random_uuid(),
      NEW.meeting_id,
      NEW.id,  -- This now works because the segment record is committed
      'pending'
    )
    RETURNING id INTO v_job_id;

    -- Update the segment with the processing job ID
    UPDATE public.recording_segments
    SET processing_job_id = v_job_id
    WHERE id = NEW.id;

    RAISE LOG 'Auto-created processing job % for segment % (meeting %)', v_job_id, NEW.segment_id, NEW.meeting_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.auto_create_segment_processing_job IS 'Automatically creates processing job after segment upload completes';

-- Create AFTER trigger instead of BEFORE
CREATE TRIGGER on_segment_uploaded
  AFTER INSERT OR UPDATE OF upload_status ON public.recording_segments
  FOR EACH ROW
  WHEN (NEW.upload_status = 'uploaded')
  EXECUTE FUNCTION public.auto_create_segment_processing_job();

COMMENT ON TRIGGER on_segment_uploaded ON public.recording_segments IS 'Creates processing job automatically after segment upload completes';

COMMIT;
