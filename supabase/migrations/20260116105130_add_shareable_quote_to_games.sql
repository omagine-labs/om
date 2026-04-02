-- Add shareable_quote column to games table for social sharing
-- This stores the most entertaining/absurd quote selected by the LLM during analysis

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS shareable_quote text;

COMMENT ON COLUMN public.games.shareable_quote IS 'LLM-selected entertaining quote from the presentation for social sharing (15-40 words)';
