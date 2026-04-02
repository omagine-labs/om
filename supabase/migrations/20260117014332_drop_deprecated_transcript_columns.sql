-- CI-BYPASS: destructive-operations
-- Reason: Final cleanup phase of transcript table migration - dropping deprecated columns
-- Impact: Removes ai_transcript, transcript_metadata from meetings table; transcript_segments from meeting_analysis table
-- Justification: Data was migrated to dedicated transcripts table in 20251219213904_migrate_transcript_data.sql. Code has been updated to use the new table. These columns are no longer read or written.

BEGIN;

-- Drop deprecated columns from meetings table
-- These were replaced by the transcripts table (1:1 relationship via meeting_id)
ALTER TABLE public.meetings
  DROP COLUMN IF EXISTS ai_transcript,
  DROP COLUMN IF EXISTS transcript_metadata;

-- Drop deprecated column from meeting_analysis table
-- Speaker-specific transcript segments are now derived from the transcripts table
ALTER TABLE public.meeting_analysis
  DROP COLUMN IF EXISTS transcript_segments;

COMMIT;
