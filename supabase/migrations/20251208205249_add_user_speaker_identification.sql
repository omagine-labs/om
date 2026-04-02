-- Add user speaker identification columns to meetings table
-- This enables automatic user identification via Voice Activity Detection (VAD)

-- Add columns to meetings table
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS user_speaker_label TEXT,
ADD COLUMN IF NOT EXISTS user_speaker_confidence FLOAT CHECK (user_speaker_confidence >= 0 AND user_speaker_confidence <= 1),
ADD COLUMN IF NOT EXISTS shared_mic_detected BOOLEAN DEFAULT false;

-- Add comments
COMMENT ON COLUMN meetings.user_speaker_label IS 'Automatically identified speaker label from AssemblyAI (e.g., "Speaker A")';
COMMENT ON COLUMN meetings.user_speaker_confidence IS 'Confidence score for user speaker identification (0.0-1.0)';
COMMENT ON COLUMN meetings.shared_mic_detected IS 'Flag indicating if multiple speakers were detected on the microphone track';

-- Add is_user column to meeting_analysis table
ALTER TABLE meeting_analysis
ADD COLUMN IF NOT EXISTS is_user BOOLEAN DEFAULT false;

COMMENT ON COLUMN meeting_analysis.is_user IS 'Flag indicating if this analysis is for the authenticated user (vs other participants)';

-- Create index for efficient querying of user's own analysis
CREATE INDEX IF NOT EXISTS idx_meeting_analysis_user
  ON meeting_analysis(meeting_id, is_user)
  WHERE is_user = true;
