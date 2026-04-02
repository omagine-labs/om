-- Create daily_topics table for BlindSlide game
-- Each day has a unique topic for PowerPoint Karaoke

CREATE TABLE IF NOT EXISTS public.daily_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_date date NOT NULL UNIQUE,
  topic_name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add comments
COMMENT ON TABLE public.daily_topics IS 'Daily topics for BlindSlide PowerPoint Karaoke game';
COMMENT ON COLUMN public.daily_topics.topic_date IS 'The calendar date this topic is for (unique per day)';
COMMENT ON COLUMN public.daily_topics.topic_name IS 'The topic name shown to users, e.g. "Underwater Hockey"';

-- Create index for date lookups
CREATE INDEX IF NOT EXISTS idx_daily_topics_date ON public.daily_topics(topic_date DESC);

-- Enable RLS
ALTER TABLE public.daily_topics ENABLE ROW LEVEL SECURITY;

-- RLS Policies: topics are publicly readable
CREATE POLICY "Topics are publicly readable"
  ON public.daily_topics
  FOR SELECT
  USING (true);

-- Only service role can manage topics (admin only)
CREATE POLICY "Service role can manage topics"
  ON public.daily_topics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
