-- Add share_clip_path column to meetings table for storing generated share clips
-- This stores the storage path for the 30-second shareable video clip with scores overlay

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS share_clip_path TEXT;

COMMENT ON COLUMN meetings.share_clip_path IS 'Storage path for the shareable video clip (format: {user_id}/shares/game-{meeting_id}-share.mp4)';
