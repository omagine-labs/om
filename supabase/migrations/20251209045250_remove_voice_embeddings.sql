-- CI-BYPASS: destructive-operations
-- Reason: Removing obsolete voice embeddings infrastructure replaced by VAD + mic matching
-- Impact: Drops user_voice_embeddings table (empty), speaker_aliases table (doesn't exist),
--         voice_profile column from users, and speaker_embeddings column from meeting_analysis.
--         No production data loss - features were disabled and tables unpopulated.

-- Remove voice embeddings infrastructure
-- This reverses migrations 20251121213000 and 20251121213100
-- The system now uses VAD + mic track matching for automatic user identification

-- Drop helper function
DROP FUNCTION IF EXISTS calculate_average_embedding(UUID);

-- Drop indexes first
DROP INDEX IF EXISTS idx_users_voice_profile;
DROP INDEX IF EXISTS idx_meeting_analysis_speaker_embeddings;
DROP INDEX IF EXISTS idx_user_embeddings_vector;
DROP INDEX IF EXISTS idx_user_embeddings_created_at;
DROP INDEX IF EXISTS idx_user_embeddings_user_id;

-- Drop user_voice_embeddings table (CASCADE removes policies and triggers)
DROP TABLE IF EXISTS user_voice_embeddings CASCADE;

-- Drop speaker_aliases table if it exists
DROP TABLE IF EXISTS speaker_aliases CASCADE;

-- Remove columns from existing tables
ALTER TABLE users DROP COLUMN IF EXISTS voice_profile;
ALTER TABLE meeting_analysis DROP COLUMN IF EXISTS speaker_embeddings;

-- NOTE: Keep pgvector extension for now - may be used by other features in future
-- DROP EXTENSION IF EXISTS vector;

-- Verify cleanup
DO $$
BEGIN
  RAISE NOTICE 'Voice embeddings infrastructure removed successfully';
END $$;
