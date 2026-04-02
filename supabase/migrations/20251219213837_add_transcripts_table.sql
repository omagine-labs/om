-- Add dedicated transcripts table
-- Moves transcript data out of meetings and meeting_analysis tables
-- to prevent accidental loading of large data via SELECT *

BEGIN;

-- ============================================================================
-- Step 1: Create transcripts table (one record per meeting)
-- ============================================================================

CREATE TABLE public.transcripts (
    -- Primary key
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key to meeting (1:1 relationship)
    meeting_id uuid NOT NULL UNIQUE REFERENCES public.meetings(id) ON DELETE CASCADE,

    -- Transcript metadata (lightweight, safe to load)
    language text,
    duration_seconds numeric,
    num_speakers integer,
    word_count integer,

    -- Transcript content
    full_text text,                    -- Combined transcript text (for search)
    segments jsonb NOT NULL,           -- [{start, end, text, speaker, confidence}, ...]
    speakers text[] NOT NULL,          -- Unique speaker labels detected

    -- Provider info
    provider text DEFAULT 'assemblyai',

    -- Timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.transcripts IS 'AI-generated transcripts - one record per meeting';
COMMENT ON COLUMN public.transcripts.meeting_id IS 'Foreign key to meetings table (1:1)';
COMMENT ON COLUMN public.transcripts.segments IS 'Transcript segments with speaker labels, timestamps, and text';
COMMENT ON COLUMN public.transcripts.full_text IS 'Combined transcript text for full-text search';
COMMENT ON COLUMN public.transcripts.speakers IS 'Array of unique speaker labels detected in transcript';

-- ============================================================================
-- Step 2: Create indexes
-- ============================================================================

-- Primary lookup by meeting
CREATE INDEX idx_transcripts_meeting_id ON public.transcripts(meeting_id);

-- Timestamp-based queries
CREATE INDEX idx_transcripts_created_at ON public.transcripts(created_at DESC);

-- ============================================================================
-- Step 3: Enable Row Level Security
-- ============================================================================

ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Step 4: Create RLS Policies
-- ============================================================================

-- Users can view transcripts for meetings they own
CREATE POLICY "Users can view transcripts for their meetings"
ON public.transcripts
FOR SELECT
USING (
    meeting_id IN (
        SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
);

-- Users can insert transcripts for meetings they own (frontend doesn't use this, but good to have)
CREATE POLICY "Users can create transcripts for their meetings"
ON public.transcripts
FOR INSERT
WITH CHECK (
    meeting_id IN (
        SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
);

-- Users can update transcripts for meetings they own
CREATE POLICY "Users can update transcripts for their meetings"
ON public.transcripts
FOR UPDATE
USING (
    meeting_id IN (
        SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
);

-- Users can delete transcripts for meetings they own
CREATE POLICY "Users can delete transcripts for their meetings"
ON public.transcripts
FOR DELETE
USING (
    meeting_id IN (
        SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
);

-- Public can view transcripts for unclaimed anonymous uploads (for share links)
CREATE POLICY "Public can view transcripts for unclaimed anonymous meetings"
ON public.transcripts
FOR SELECT
USING (
    meeting_id IN (
        SELECT m.id FROM public.meetings m
        INNER JOIN public.anonymous_uploads au ON au.meeting_id = m.id
        WHERE au.claimed_by_user_id IS NULL
    )
);

-- ============================================================================
-- Step 5: Add updated_at trigger
-- ============================================================================

CREATE TRIGGER update_transcripts_updated_at
    BEFORE UPDATE ON public.transcripts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Step 6: Grant permissions
-- ============================================================================

GRANT ALL ON public.transcripts TO authenticated;
GRANT ALL ON public.transcripts TO service_role;

COMMIT;
