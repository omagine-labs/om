-- Add mic_audio_path column to meetings table to store microphone-only audio
-- This enables automatic user identification via Voice Activity Detection (VAD)

ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS mic_audio_path TEXT;

COMMENT ON COLUMN meetings.mic_audio_path IS 'Storage path to microphone-only audio file for VAD-based user identification';
