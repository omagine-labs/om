-- Create games table to consolidate all game data
-- This replaces the use of meetings + game_analyses + processing_jobs for games

CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User ownership (nullable for anonymous/guest users)
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,

  -- Access control for anonymous users
  access_token uuid DEFAULT gen_random_uuid() NOT NULL,

  -- Recording metadata
  title text NOT NULL DEFAULT 'PowerPoint Karaoke',
  audio_storage_path text NOT NULL,
  video_storage_path text,
  recording_size_mb numeric,
  recording_duration_seconds integer,
  share_clip_path text,

  -- Analysis results (consolidated from game_analyses)
  clarity_score integer CHECK (clarity_score IS NULL OR (clarity_score >= 1 AND clarity_score <= 10)),
  confidence_score integer CHECK (confidence_score IS NULL OR (confidence_score >= 1 AND confidence_score <= 10)),
  tips jsonb DEFAULT '[]'::jsonb,
  word_count integer,
  words_per_minute numeric(5,1),
  transcript text,

  -- Job status (consolidated from processing_jobs)
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error text,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Unique constraint on access_token for lookups
  CONSTRAINT games_access_token_unique UNIQUE (access_token)
);

-- Indexes for common query patterns
CREATE INDEX idx_games_user_id ON public.games(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_games_access_token ON public.games(access_token);
CREATE INDEX idx_games_status ON public.games(status);
CREATE INDEX idx_games_created_at ON public.games(created_at DESC);

-- Enable RLS
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Authenticated users can read their own games
CREATE POLICY "Users can read own games"
  ON public.games
  FOR SELECT
  USING (auth.uid() = user_id);

-- Authenticated users can update their own games
CREATE POLICY "Users can update own games"
  ON public.games
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Anonymous users can read games with valid access_token header
CREATE POLICY "Anonymous read with access_token"
  ON public.games
  FOR SELECT
  USING (
    user_id IS NULL
    AND access_token::text = COALESCE(
      current_setting('request.headers', true)::json->>'x-access-token',
      ''
    )
  );

-- Anonymous users can update games with valid access_token header
CREATE POLICY "Anonymous update with access_token"
  ON public.games
  FOR UPDATE
  USING (
    user_id IS NULL
    AND access_token::text = COALESCE(
      current_setting('request.headers', true)::json->>'x-access-token',
      ''
    )
  );

-- Allow game creation with proper authorization
-- Service role can insert any game, authenticated users can insert for themselves,
-- anonymous users can only create games with null user_id
CREATE POLICY "Allow game creation"
  ON public.games
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR auth.uid() = user_id
    OR user_id IS NULL
  );

-- Service role has full access (for Python backend processing)
CREATE POLICY "Service role full access"
  ON public.games
  FOR ALL
  USING (auth.role() = 'service_role');

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.games IS 'Standalone table for PowerPoint Karaoke games, consolidating recording metadata, analysis results, and job status. Supports both authenticated and anonymous users via access_token.';

-- Note: Data migration from meetings table is in a separate migration file
-- (20260113053001_migrate_existing_games_data.sql)
