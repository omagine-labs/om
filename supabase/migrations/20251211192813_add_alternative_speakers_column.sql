-- Add alternative_speakers column to meetings table
-- This stores other speakers with significant microphone overlap (>20%) in shared mic scenarios

ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS alternative_speakers TEXT[];

COMMENT ON COLUMN meetings.alternative_speakers IS 'Other speakers with significant microphone overlap (>20%) in shared mic scenarios. Only populated when shared_mic_detected is true.';
