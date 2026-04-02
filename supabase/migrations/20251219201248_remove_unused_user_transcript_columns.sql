-- CI-BYPASS: destructive-operations
-- Reason: Removing dead code - columns were added but never implemented
-- Impact: Drops user_transcript, user_transcript_filename, user_transcript_uploaded_at from meetings table
-- Justification: Columns are NULL in all rows and not referenced anywhere in the codebase

-- Remove unused user_transcript columns from meetings table
-- These columns were never populated or read anywhere in the codebase

ALTER TABLE public.meetings
  DROP COLUMN IF EXISTS user_transcript,
  DROP COLUMN IF EXISTS user_transcript_filename,
  DROP COLUMN IF EXISTS user_transcript_uploaded_at;
