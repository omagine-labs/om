-- Enable pgvector extension for vector similarity search
-- Used for voice embeddings in speaker identification
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) THEN
    RAISE EXCEPTION 'pgvector extension failed to install';
  END IF;

  RAISE NOTICE 'pgvector extension enabled successfully';
END $$;
