-- CI-BYPASS: destructive-operations
-- Drop user_speaker_confidence column from meetings table
-- This column is redundant - the existence of user_speaker_label is sufficient
-- to indicate that the speaker was identified with adequate confidence.
-- Per-speaker confidence is stored in meeting_analysis.identification_confidence.

ALTER TABLE meetings
DROP COLUMN IF EXISTS user_speaker_confidence;
