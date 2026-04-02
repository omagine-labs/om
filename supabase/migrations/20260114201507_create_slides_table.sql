-- Create slides table for BlindSlide game
-- Stores slide images that are randomly selected for each game

CREATE TABLE IF NOT EXISTS public.slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add comment
COMMENT ON TABLE public.slides IS 'Slide images for BlindSlide PowerPoint Karaoke game';
COMMENT ON COLUMN public.slides.image_url IS 'URL to slide image in Supabase storage';
COMMENT ON COLUMN public.slides.metadata IS 'Future use: tags, difficulty, category, etc.';

-- Create index for random selection performance
CREATE INDEX IF NOT EXISTS idx_slides_created_at ON public.slides(created_at);

-- Enable RLS
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;

-- RLS Policies: slides are publicly readable (needed for game display)
CREATE POLICY "Slides are publicly readable"
  ON public.slides
  FOR SELECT
  USING (true);

-- Only service role can insert/update/delete slides (admin only)
CREATE POLICY "Service role can manage slides"
  ON public.slides
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
