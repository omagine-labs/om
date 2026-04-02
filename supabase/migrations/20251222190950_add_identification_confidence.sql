-- Add identification_confidence column to meeting_analysis table
-- Stores per-speaker mic matching confidence (VAD overlap percentage)

ALTER TABLE meeting_analysis
ADD COLUMN IF NOT EXISTS identification_confidence FLOAT
CHECK (identification_confidence >= 0 AND identification_confidence <= 1);

COMMENT ON COLUMN meeting_analysis.identification_confidence IS
'Speaker identification confidence from mic matching (0.0-1.0). Represents VAD overlap percentage for this speaker.';
