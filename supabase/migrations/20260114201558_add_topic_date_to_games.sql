-- Add topic_date and slide_ids columns to games table
-- topic_date: which day's topic was played (for history organization)
-- slide_ids: array of slide UUIDs in play order (for replay feature)

ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS topic_date date;

ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS slide_ids jsonb;

-- Add comments
COMMENT ON COLUMN public.games.topic_date IS 'The date of the topic played (for grouping in history)';
COMMENT ON COLUMN public.games.slide_ids IS 'Array of slide UUIDs in the order they were shown';

-- Create index for topic_date lookups (history page grouping)
CREATE INDEX IF NOT EXISTS idx_games_topic_date ON public.games(topic_date DESC);
