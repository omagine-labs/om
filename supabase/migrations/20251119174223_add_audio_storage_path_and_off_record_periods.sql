-- Migration: Add single audio file support (M1)
-- Adds columns for stitched audio storage and off-record period tracking

-- Add audio storage path for single audio file uploads (M1)
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS audio_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS off_record_periods JSONB;

-- Create index for efficient lookup of meetings with stitched audio
CREATE INDEX IF NOT EXISTS idx_meetings_audio_storage_path
  ON meetings(audio_storage_path)
  WHERE audio_storage_path IS NOT NULL;

-- Add comments to document the new columns
COMMENT ON COLUMN meetings.audio_storage_path IS
  'Path to stitched audio file in Supabase Storage (M1+). Replaces recording_storage_path for new meetings with single audio file.';

COMMENT ON COLUMN meetings.off_record_periods IS
  'Array of off-record periods: [{start: 120, end: 125}, ...]. Start/end in seconds from audio file start. Represents gaps where recording was paused.';

-- Note: We keep recording_segments table and related columns for historical data
-- Old meetings will continue to use recording_storage_path
-- New meetings (M1+) will use audio_storage_path
