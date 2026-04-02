-- ============================================================================
-- Multi-Segment Recording Support Migration
-- ============================================================================
-- This migration adds support for meetings with multiple recording segments,
-- enabling the "On/Off the Record" feature in the desktop app.
--
-- Architecture:
-- - Meetings can have multiple segments (one-to-many relationship)
-- - Each segment is transcribed and processed independently
-- - Analysis metrics are rolled up across all segments
-- - Backward compatible with existing single-recording meetings
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Add Session Tracking to Meetings Table
-- ============================================================================

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS has_segments BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS session_id UUID UNIQUE;

COMMENT ON COLUMN public.meetings.has_segments IS 'Whether this meeting has multiple recording segments (from desktop On/Off Record feature)';
COMMENT ON COLUMN public.meetings.session_id IS 'Desktop session ID - groups multiple segments into one meeting';

CREATE INDEX IF NOT EXISTS idx_meetings_session_id ON public.meetings(session_id) WHERE session_id IS NOT NULL;

-- ============================================================================
-- Step 2: Create Recording Segments Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.recording_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL UNIQUE,
  segment_number INTEGER NOT NULL,

  -- Timing
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,

  -- Storage
  storage_path TEXT NOT NULL UNIQUE,
  file_size_mb DECIMAL,
  duration_seconds INTEGER,

  -- Processing status
  upload_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (upload_status IN ('pending', 'uploading', 'uploaded', 'failed')),

  -- Transcript for this segment
  transcript JSONB,

  -- Link to processing job
  processing_job_id UUID REFERENCES public.processing_jobs(id),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT unique_meeting_segment UNIQUE(meeting_id, segment_number)
);

COMMENT ON TABLE public.recording_segments IS 'Individual recording segments for meetings with On/Off Record feature';
COMMENT ON COLUMN public.recording_segments.segment_id IS 'Unique segment UUID from desktop app';
COMMENT ON COLUMN public.recording_segments.segment_number IS 'Order of segment within meeting (1, 2, 3... may have gaps for off-record periods)';
COMMENT ON COLUMN public.recording_segments.storage_path IS 'Supabase Storage path to segment recording file';
COMMENT ON COLUMN public.recording_segments.upload_status IS 'Upload status: pending -> uploading -> uploaded (or failed)';
COMMENT ON COLUMN public.recording_segments.transcript IS 'AssemblyAI/Whisper transcript for this segment only';
COMMENT ON COLUMN public.recording_segments.processing_job_id IS 'Processing job that transcribed this segment';

-- ============================================================================
-- Step 3: Add Indexes for Performance
-- ============================================================================

CREATE INDEX idx_segments_meeting ON public.recording_segments(meeting_id);
CREATE INDEX idx_segments_session ON public.recording_segments(segment_id);
CREATE INDEX idx_segments_status ON public.recording_segments(upload_status);
CREATE INDEX idx_segments_meeting_number ON public.recording_segments(meeting_id, segment_number);

-- ============================================================================
-- Step 4: Add Segment Support to Processing Jobs
-- ============================================================================

-- Add segment_id column to link processing jobs to segments
ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS segment_id UUID REFERENCES public.recording_segments(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.processing_jobs.segment_id IS 'If set, this job processes a specific segment (not entire meeting)';

CREATE INDEX IF NOT EXISTS idx_processing_jobs_segment_id ON public.processing_jobs(segment_id) WHERE segment_id IS NOT NULL;

-- ============================================================================
-- Step 5: Add Trigger to Auto-Create Processing Jobs for Segments
-- ============================================================================

-- Function to automatically create processing job when segment is uploaded
CREATE OR REPLACE FUNCTION public.auto_create_segment_processing_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create processing job if segment is uploaded
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
      NEW.id,
      'pending'
    )
    RETURNING id INTO NEW.processing_job_id;

    RAISE LOG 'Auto-created processing job for segment % (meeting %)', NEW.segment_id, NEW.meeting_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.auto_create_segment_processing_job IS 'Automatically creates processing job when segment upload completes';

-- Create trigger on recording_segments table
DROP TRIGGER IF EXISTS on_segment_uploaded ON public.recording_segments;
CREATE TRIGGER on_segment_uploaded
  BEFORE INSERT OR UPDATE OF upload_status ON public.recording_segments
  FOR EACH ROW
  WHEN (NEW.upload_status = 'uploaded')
  EXECUTE FUNCTION public.auto_create_segment_processing_job();

COMMENT ON TRIGGER on_segment_uploaded ON public.recording_segments IS 'Creates processing job automatically when segment upload completes';

-- ============================================================================
-- Step 6: Add Updated At Trigger for Segments
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_recording_segment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_recording_segments_updated_at ON public.recording_segments;
CREATE TRIGGER update_recording_segments_updated_at
  BEFORE UPDATE ON public.recording_segments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_recording_segment_updated_at();

-- ============================================================================
-- Step 7: Enable RLS and Create Policies
-- ============================================================================

-- Enable RLS for recording_segments
ALTER TABLE public.recording_segments ENABLE ROW LEVEL SECURITY;

-- Users can view segments for their meetings
CREATE POLICY "Users can view segments for their meetings"
  ON public.recording_segments
  FOR SELECT
  USING (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
  );

-- Users can create segments for their meetings
CREATE POLICY "Users can create segments for their meetings"
  ON public.recording_segments
  FOR INSERT
  WITH CHECK (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
  );

-- Users can update segments for their meetings
CREATE POLICY "Users can update segments for their meetings"
  ON public.recording_segments
  FOR UPDATE
  USING (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
  );

-- Users can delete segments for their meetings
CREATE POLICY "Users can delete segments for their meetings"
  ON public.recording_segments
  FOR DELETE
  USING (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
  );

-- Service role can manage all segments (for processing jobs)
CREATE POLICY "Service role can manage all segments"
  ON public.recording_segments
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- Step 8: Add Helper Function to Get All Segments for Meeting
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_meeting_segments(p_meeting_id UUID)
RETURNS TABLE (
  id UUID,
  segment_id UUID,
  segment_number INTEGER,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  storage_path TEXT,
  file_size_mb DECIMAL,
  duration_seconds INTEGER,
  upload_status TEXT,
  transcript JSONB,
  processing_job_id UUID,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rs.id,
    rs.segment_id,
    rs.segment_number,
    rs.start_time,
    rs.end_time,
    rs.storage_path,
    rs.file_size_mb,
    rs.duration_seconds,
    rs.upload_status,
    rs.transcript,
    rs.processing_job_id,
    rs.created_at
  FROM public.recording_segments rs
  WHERE rs.meeting_id = p_meeting_id
  ORDER BY rs.segment_number ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_meeting_segments IS 'Get all segments for a meeting ordered by segment number';

-- ============================================================================
-- Step 9: Add Helper Function to Check if All Segments are Uploaded
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_all_segments_uploaded(
  p_meeting_id UUID,
  p_expected_count INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_uploaded_count INTEGER;
  v_total_count INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE upload_status = 'uploaded'),
    COUNT(*)
  INTO v_uploaded_count, v_total_count
  FROM public.recording_segments
  WHERE meeting_id = p_meeting_id;

  -- If expected count provided, check against that
  IF p_expected_count IS NOT NULL THEN
    RETURN v_uploaded_count = p_expected_count AND v_total_count = p_expected_count;
  END IF;

  -- Otherwise, just check that all existing segments are uploaded
  RETURN v_uploaded_count = v_total_count AND v_total_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.check_all_segments_uploaded IS 'Check if all segments for a meeting have been uploaded';

COMMIT;
