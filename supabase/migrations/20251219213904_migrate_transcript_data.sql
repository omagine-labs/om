-- Migrate existing transcript data from meetings.ai_transcript to transcripts table
-- This populates the new transcripts table from existing data

BEGIN;

-- ============================================================================
-- Migrate data from meetings.ai_transcript to transcripts table
-- ============================================================================

INSERT INTO public.transcripts (
    meeting_id,
    language,
    duration_seconds,
    num_speakers,
    word_count,
    full_text,
    segments,
    speakers,
    provider,
    created_at
)
SELECT
    m.id as meeting_id,
    (m.ai_transcript->>'language')::text as language,
    (m.ai_transcript->>'duration')::numeric as duration_seconds,
    (m.ai_transcript->>'num_speakers')::integer as num_speakers,
    -- Calculate word count from full text
    COALESCE(
        array_length(
            regexp_split_to_array(
                COALESCE(m.ai_transcript->>'text', ''),
                '\s+'
            ),
            1
        ),
        0
    ) as word_count,
    m.ai_transcript->>'text' as full_text,
    COALESCE(m.ai_transcript->'segments', '[]'::jsonb) as segments,
    -- Extract unique speakers from segments
    ARRAY(
        SELECT DISTINCT s->>'speaker'
        FROM jsonb_array_elements(
            COALESCE(m.ai_transcript->'segments', '[]'::jsonb)
        ) as s
        WHERE s->>'speaker' IS NOT NULL
        ORDER BY s->>'speaker'
    ) as speakers,
    'assemblyai' as provider,
    COALESCE(m.created_at, now()) as created_at
FROM public.meetings m
WHERE m.ai_transcript IS NOT NULL
  AND m.ai_transcript != 'null'::jsonb
  AND NOT EXISTS (
      -- Don't insert if already migrated
      SELECT 1 FROM public.transcripts t WHERE t.meeting_id = m.id
  );

-- ============================================================================
-- Verify migration
-- ============================================================================

-- Log migration statistics (will be visible in migration output)
DO $$
DECLARE
    meetings_with_transcript INTEGER;
    transcripts_created INTEGER;
BEGIN
    SELECT COUNT(*) INTO meetings_with_transcript
    FROM public.meetings
    WHERE ai_transcript IS NOT NULL AND ai_transcript != 'null'::jsonb;

    SELECT COUNT(*) INTO transcripts_created
    FROM public.transcripts;

    RAISE NOTICE 'Migration complete: % meetings with transcripts, % transcript records created',
        meetings_with_transcript, transcripts_created;
END $$;

COMMIT;
