-- Add video_storage_path column for storing screen recordings
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS video_storage_path TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN meetings.video_storage_path IS 'Storage path for screen recording video (e.g., PowerPoint Karaoke game)';
