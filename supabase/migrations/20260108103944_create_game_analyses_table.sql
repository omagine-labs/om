-- Create game_analyses table for PowerPoint Karaoke results
-- This is a simpler, faster alternative to meeting_analysis for games
-- Stores results from single Gemini video+audio analysis call

CREATE TABLE IF NOT EXISTS public.game_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.processing_jobs(id) ON DELETE SET NULL,

  -- Core scores (1-10 scale)
  clarity_score integer CHECK (clarity_score >= 1 AND clarity_score <= 10),
  confidence_score integer CHECK (confidence_score >= 1 AND confidence_score <= 10),

  -- Tips array (JSONB for flexibility)
  tips jsonb DEFAULT '[]'::jsonb,

  -- Speech metrics (calculated by Gemini from video+audio)
  word_count integer,
  words_per_minute numeric(5,1),
  duration_seconds integer,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Constraints
  CONSTRAINT game_analyses_meeting_id_unique UNIQUE (meeting_id)
);

-- Enable RLS
ALTER TABLE public.game_analyses ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read their own game analyses
CREATE POLICY "Users can read own game analyses"
ON public.game_analyses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = game_analyses.meeting_id
    AND m.user_id = auth.uid()
  )
);

-- RLS Policy: Service role can manage all game analyses
CREATE POLICY "Service role can manage game analyses"
ON public.game_analyses FOR ALL
USING (auth.role() = 'service_role');

-- Index for fast lookups by meeting_id
CREATE INDEX idx_game_analyses_meeting_id ON public.game_analyses(meeting_id);

-- Update trigger for updated_at
CREATE TRIGGER set_game_analyses_updated_at
  BEFORE UPDATE ON public.game_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
