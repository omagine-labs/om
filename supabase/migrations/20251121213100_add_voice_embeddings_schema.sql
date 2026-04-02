-- Voice embeddings schema for speaker identification
--
-- Architecture:
-- 1. meeting_analysis.speaker_embeddings (JSONB) - Temporary storage for all speakers
-- 2. user_voice_embeddings (table) - Historical record of user assignments
-- 3. users.voice_profile (JSONB) - Aggregated active profile

-- Create user_voice_embeddings table for historical speaker assignments
CREATE TABLE IF NOT EXISTS user_voice_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  embedding vector(192) NOT NULL,  -- SpeechBrain ECAPA-TDNN 192-dim embeddings
  source_meeting_id UUID REFERENCES meeting_analysis(id) ON DELETE SET NULL,
  source_speaker_label TEXT NOT NULL,  -- e.g., "SPEAKER_A", "SPEAKER_B"
  audio_duration_seconds FLOAT NOT NULL,  -- Total speech duration used for embedding
  embedding_label TEXT,  -- Optional label (e.g., "meeting-1", "baseline")
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_embeddings_user_id ON user_voice_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_embeddings_created_at ON user_voice_embeddings(created_at);

-- Vector similarity index for efficient cosine similarity search
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_user_embeddings_vector'
  ) THEN
    CREATE INDEX idx_user_embeddings_vector ON user_voice_embeddings
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
  END IF;
END $$;

-- RLS policies for data security
ALTER TABLE user_voice_embeddings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_voice_embeddings'
    AND policyname = 'Users can view their own embeddings'
  ) THEN
    CREATE POLICY "Users can view their own embeddings"
      ON user_voice_embeddings FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_voice_embeddings'
    AND policyname = 'Users can create their own embeddings'
  ) THEN
    CREATE POLICY "Users can create their own embeddings"
      ON user_voice_embeddings FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_voice_embeddings'
    AND policyname = 'Users can update their own embeddings'
  ) THEN
    CREATE POLICY "Users can update their own embeddings"
      ON user_voice_embeddings FOR UPDATE
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_voice_embeddings'
    AND policyname = 'Users can delete their own embeddings'
  ) THEN
    CREATE POLICY "Users can delete their own embeddings"
      ON user_voice_embeddings FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add trigger to automatically update updated_at timestamp
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_user_voice_embeddings_updated_at'
  ) THEN
    CREATE TRIGGER update_user_voice_embeddings_updated_at
      BEFORE UPDATE ON user_voice_embeddings
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Add speaker_embeddings column to meeting_analysis
-- This stores embeddings for ALL speakers in the meeting
ALTER TABLE meeting_analysis
ADD COLUMN IF NOT EXISTS speaker_embeddings JSONB DEFAULT '[]'::jsonb;

-- Format:
-- [
--   {
--     "speaker": "SPEAKER_A",
--     "embedding": [0.12, -0.34, ...],  -- 192 floats
--     "duration": 87.5,
--     "segments_count": 15
--   }
-- ]

-- Add index for speaker_embeddings queries
CREATE INDEX IF NOT EXISTS idx_meeting_analysis_speaker_embeddings
ON meeting_analysis USING GIN (speaker_embeddings);

-- Add voice_profile to users table for aggregated embedding
ALTER TABLE users
ADD COLUMN IF NOT EXISTS voice_profile JSONB;

-- Format:
-- {
--   "embedding": [192 floats],
--   "radius": 0.12,
--   "sample_count": 5,
--   "last_updated": "2025-11-20T12:00:00Z"
-- }

-- Add index for voice_profile queries
CREATE INDEX IF NOT EXISTS idx_users_voice_profile
ON users USING GIN (voice_profile);

-- Helper function to calculate embedding average
CREATE OR REPLACE FUNCTION calculate_average_embedding(user_id_param UUID)
RETURNS JSONB AS $$
DECLARE
  embeddings_array vector(192)[];
  avg_embedding vector(192);
  embedding_count INT;
  result JSONB;
BEGIN
  -- Get all embeddings for this user
  SELECT array_agg(embedding), count(*)
  INTO embeddings_array, embedding_count
  FROM user_voice_embeddings
  WHERE user_id = user_id_param;

  -- Return null if no embeddings
  IF embedding_count = 0 OR embeddings_array IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate average (element-wise mean)
  -- Note: This is a simplified version. In production, you'd calculate this in the application
  -- where you have better numeric libraries

  -- For now, just return the embedding count and signal that calculation is needed
  result := jsonb_build_object(
    'sample_count', embedding_count,
    'needs_calculation', true,
    'last_updated', now()
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON TABLE user_voice_embeddings IS 'Historical record of user speaker assignments. Used to calculate the averaged voice profile stored in users.voice_profile.';
COMMENT ON COLUMN user_voice_embeddings.embedding IS 'Historical voice embedding from a specific meeting assignment. Multiple embeddings per user are stored for averaging.';
COMMENT ON COLUMN user_voice_embeddings.embedding_label IS 'Optional label for the embedding (e.g., "meeting-1", "baseline"). NULL for backwards compatibility.';
COMMENT ON COLUMN user_voice_embeddings.audio_duration_seconds IS 'Total duration of speech used to generate the embedding (minimum 60 seconds required)';
COMMENT ON COLUMN meeting_analysis.speaker_embeddings IS 'Voice embeddings for all speakers in the meeting (JSONB array). Generated during transcription for future speaker identification.';
COMMENT ON COLUMN users.voice_profile IS 'Aggregated voice profile calculated from all user_voice_embeddings. Contains average embedding, radius (std dev), and metadata.';
