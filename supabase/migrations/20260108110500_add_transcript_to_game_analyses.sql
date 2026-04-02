-- Add transcript column to game_analyses table
-- Stores the full transcription from Gemini for verification and debugging

ALTER TABLE public.game_analyses
ADD COLUMN IF NOT EXISTS transcript text;

COMMENT ON COLUMN public.game_analyses.transcript IS 'Full transcript from Gemini video+audio analysis';
