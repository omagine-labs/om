-- Migration: Add Meeting Metrics v2 columns
-- Description: Adds all columns for the new 2-pillar metrics framework
--              (Confidence and Clarity) with 9 new behavioral metrics
--
-- New metrics:
-- - Longest segment (seconds) - monologuing detection
-- - Hedge phrases/min - hedging language detection
-- - Softeners/min - softening language detection
-- - Apologies count - apology detection
-- - Signposting phrases/segment - structural markers
-- - Incomplete thoughts % - trailing off detection
-- - Specificity score - vague vs specific language
-- - Topics per segment (LLM) - idea cramming detection
-- - Key point position (LLM) - burying the lead detection

BEGIN;

-- ============================================================================
-- Add new columns to meeting_analysis table (per-speaker metrics)
-- ============================================================================

-- Longest segment
ALTER TABLE public.meeting_analysis
ADD COLUMN IF NOT EXISTS longest_segment_seconds NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.meeting_analysis.longest_segment_seconds IS 'Longest uninterrupted speaking turn duration in seconds';

-- Hedge phrases
ALTER TABLE public.meeting_analysis
ADD COLUMN IF NOT EXISTS hedge_phrases_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS hedge_phrases_per_minute NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS hedge_phrases_breakdown JSONB DEFAULT '{}';

COMMENT ON COLUMN public.meeting_analysis.hedge_phrases_total IS 'Total count of hedging phrases (I think, maybe, probably, etc.)';
COMMENT ON COLUMN public.meeting_analysis.hedge_phrases_per_minute IS 'Rate of hedge phrases per minute of speaking time';
COMMENT ON COLUMN public.meeting_analysis.hedge_phrases_breakdown IS 'Breakdown of hedge phrases by type {"I think": 5, "maybe": 3}';

-- Softeners
ALTER TABLE public.meeting_analysis
ADD COLUMN IF NOT EXISTS softeners_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS softeners_per_minute NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS softeners_breakdown JSONB DEFAULT '{}';

COMMENT ON COLUMN public.meeting_analysis.softeners_total IS 'Total count of softening phrases (just, actually, sort of, etc.)';
COMMENT ON COLUMN public.meeting_analysis.softeners_per_minute IS 'Rate of softeners per minute of speaking time';
COMMENT ON COLUMN public.meeting_analysis.softeners_breakdown IS 'Breakdown of softeners by type {"just": 10, "actually": 5}';

-- Apologies
ALTER TABLE public.meeting_analysis
ADD COLUMN IF NOT EXISTS apologies_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS apologies_breakdown JSONB DEFAULT '{}';

COMMENT ON COLUMN public.meeting_analysis.apologies_total IS 'Total count of apology phrases (sorry, I apologize, etc.)';
COMMENT ON COLUMN public.meeting_analysis.apologies_breakdown IS 'Breakdown of apologies by type {"sorry": 3, "my bad": 1}';

-- Signposting
ALTER TABLE public.meeting_analysis
ADD COLUMN IF NOT EXISTS signposting_total INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS signposting_per_segment NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS signposting_breakdown JSONB DEFAULT '{}';

COMMENT ON COLUMN public.meeting_analysis.signposting_total IS 'Total count of structural/signposting phrases (first, to summarize, etc.)';
COMMENT ON COLUMN public.meeting_analysis.signposting_per_segment IS 'Average signposting phrases per speaking segment';
COMMENT ON COLUMN public.meeting_analysis.signposting_breakdown IS 'Breakdown of signposting by type {"first": 2, "to summarize": 1}';

-- Incomplete thoughts
ALTER TABLE public.meeting_analysis
ADD COLUMN IF NOT EXISTS incomplete_thoughts_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS incomplete_thoughts_percentage NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.meeting_analysis.incomplete_thoughts_count IS 'Number of segments that trail off or end incompletely';
COMMENT ON COLUMN public.meeting_analysis.incomplete_thoughts_percentage IS 'Percentage of segments with incomplete thoughts (0-100)';

-- Specificity score
ALTER TABLE public.meeting_analysis
ADD COLUMN IF NOT EXISTS specificity_score NUMERIC,
ADD COLUMN IF NOT EXISTS specificity_details JSONB DEFAULT '{}';

COMMENT ON COLUMN public.meeting_analysis.specificity_score IS 'Score (0-10) measuring specific vs vague language usage';
COMMENT ON COLUMN public.meeting_analysis.specificity_details IS 'Details: {"specific_count": 15, "vague_count": 5, "examples": [...]}';

-- Topics per segment (LLM-based)
ALTER TABLE public.meeting_analysis
ADD COLUMN IF NOT EXISTS avg_topics_per_segment NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_topics_in_segment INTEGER DEFAULT 0;

COMMENT ON COLUMN public.meeting_analysis.avg_topics_per_segment IS 'Average distinct topics/ideas introduced per speaking turn';
COMMENT ON COLUMN public.meeting_analysis.max_topics_in_segment IS 'Maximum topics found in any single segment';

-- Key point position (LLM-based)
ALTER TABLE public.meeting_analysis
ADD COLUMN IF NOT EXISTS key_point_position NUMERIC,
ADD COLUMN IF NOT EXISTS key_point_summary TEXT;

COMMENT ON COLUMN public.meeting_analysis.key_point_position IS 'Average position of main point (0=start, 100=end). Lower is better.';
COMMENT ON COLUMN public.meeting_analysis.key_point_summary IS 'Summary of key point positioning patterns';

-- ============================================================================
-- Add new columns to user_weekly_rollups table (weekly aggregations)
-- ============================================================================

ALTER TABLE public.user_weekly_rollups
ADD COLUMN IF NOT EXISTS avg_longest_segment_seconds NUMERIC,
ADD COLUMN IF NOT EXISTS max_longest_segment_seconds NUMERIC,
ADD COLUMN IF NOT EXISTS avg_hedge_phrases_per_minute NUMERIC,
ADD COLUMN IF NOT EXISTS avg_softeners_per_minute NUMERIC,
ADD COLUMN IF NOT EXISTS total_apologies INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS avg_apologies_per_meeting NUMERIC,
ADD COLUMN IF NOT EXISTS avg_signposting_per_segment NUMERIC,
ADD COLUMN IF NOT EXISTS avg_incomplete_thoughts_percentage NUMERIC,
ADD COLUMN IF NOT EXISTS avg_specificity_score NUMERIC,
ADD COLUMN IF NOT EXISTS avg_topics_per_segment NUMERIC,
ADD COLUMN IF NOT EXISTS avg_key_point_position NUMERIC;

COMMENT ON COLUMN public.user_weekly_rollups.avg_longest_segment_seconds IS 'Average longest segment across all meetings in the week';
COMMENT ON COLUMN public.user_weekly_rollups.max_longest_segment_seconds IS 'Maximum segment duration across all meetings in the week';
COMMENT ON COLUMN public.user_weekly_rollups.avg_hedge_phrases_per_minute IS 'Average hedge phrases per minute across the week';
COMMENT ON COLUMN public.user_weekly_rollups.avg_softeners_per_minute IS 'Average softeners per minute across the week';
COMMENT ON COLUMN public.user_weekly_rollups.total_apologies IS 'Total apologies across all meetings in the week';
COMMENT ON COLUMN public.user_weekly_rollups.avg_apologies_per_meeting IS 'Average apologies per meeting in the week';
COMMENT ON COLUMN public.user_weekly_rollups.avg_signposting_per_segment IS 'Average signposting phrases per segment across the week';
COMMENT ON COLUMN public.user_weekly_rollups.avg_incomplete_thoughts_percentage IS 'Average incomplete thoughts percentage across the week';
COMMENT ON COLUMN public.user_weekly_rollups.avg_specificity_score IS 'Average specificity score across the week';
COMMENT ON COLUMN public.user_weekly_rollups.avg_topics_per_segment IS 'Average topics per segment across the week';
COMMENT ON COLUMN public.user_weekly_rollups.avg_key_point_position IS 'Average key point position across the week';

-- ============================================================================
-- Add new columns to user_baselines table
-- ============================================================================

ALTER TABLE public.user_baselines
ADD COLUMN IF NOT EXISTS baseline_longest_segment_seconds NUMERIC,
ADD COLUMN IF NOT EXISTS baseline_hedge_phrases_per_minute NUMERIC,
ADD COLUMN IF NOT EXISTS baseline_softeners_per_minute NUMERIC,
ADD COLUMN IF NOT EXISTS baseline_apologies_per_meeting NUMERIC,
ADD COLUMN IF NOT EXISTS baseline_signposting_per_segment NUMERIC,
ADD COLUMN IF NOT EXISTS baseline_incomplete_thoughts_percentage NUMERIC,
ADD COLUMN IF NOT EXISTS baseline_specificity_score NUMERIC,
ADD COLUMN IF NOT EXISTS baseline_topics_per_segment NUMERIC,
ADD COLUMN IF NOT EXISTS baseline_key_point_position NUMERIC;

COMMENT ON COLUMN public.user_baselines.baseline_longest_segment_seconds IS 'Baseline longest segment duration';
COMMENT ON COLUMN public.user_baselines.baseline_hedge_phrases_per_minute IS 'Baseline hedge phrases per minute';
COMMENT ON COLUMN public.user_baselines.baseline_softeners_per_minute IS 'Baseline softeners per minute';
COMMENT ON COLUMN public.user_baselines.baseline_apologies_per_meeting IS 'Baseline apologies per meeting';
COMMENT ON COLUMN public.user_baselines.baseline_signposting_per_segment IS 'Baseline signposting per segment';
COMMENT ON COLUMN public.user_baselines.baseline_incomplete_thoughts_percentage IS 'Baseline incomplete thoughts percentage';
COMMENT ON COLUMN public.user_baselines.baseline_specificity_score IS 'Baseline specificity score';
COMMENT ON COLUMN public.user_baselines.baseline_topics_per_segment IS 'Baseline topics per segment';
COMMENT ON COLUMN public.user_baselines.baseline_key_point_position IS 'Baseline key point position';

-- ============================================================================
-- Update calculate_user_weekly_rollup function to include new metrics
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_user_weekly_rollup(p_user_id uuid, p_week_start date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_rollup_id uuid;
  v_week_end date;
  v_meetings_count integer;
  v_total_words integer;
  v_total_segments integer;
  v_avg_words_per_segment numeric;
  v_total_filler_words integer;
  v_filler_words_breakdown jsonb;
BEGIN
  -- Calculate week end (Sunday)
  v_week_end := p_week_start + INTERVAL '6 days';

  -- Get meetings count for validation
  SELECT COUNT(DISTINCT ma.meeting_id)
  INTO v_meetings_count
  FROM public.meeting_analysis ma
  JOIN public.meetings m ON ma.meeting_id = m.id
  WHERE ma.assigned_user_id = p_user_id
    AND m.start_time >= p_week_start
    AND m.start_time < v_week_end + INTERVAL '1 day';

  -- If no meetings, DELETE the rollup row (if exists) and return NULL
  IF v_meetings_count = 0 THEN
    DELETE FROM public.user_weekly_rollups
    WHERE user_id = p_user_id
      AND week_start_date = p_week_start;
    RETURN NULL;
  END IF;

  -- Calculate total words and segments for verbosity metric
  SELECT
    SUM(ma.word_count),
    SUM(ma.segments_count)
  INTO v_total_words, v_total_segments
  FROM public.meeting_analysis ma
  JOIN public.meetings m ON ma.meeting_id = m.id
  WHERE ma.assigned_user_id = p_user_id
    AND m.start_time >= p_week_start
    AND m.start_time < v_week_end + INTERVAL '1 day';

  -- Calculate average words per segment
  v_avg_words_per_segment := CASE
    WHEN v_total_segments > 0 THEN v_total_words::numeric / v_total_segments::numeric
    ELSE NULL
  END;

  -- Aggregate filler words across all meetings in the week
  SELECT COALESCE(SUM(ma.filler_words_total), 0)
  INTO v_total_filler_words
  FROM public.meeting_analysis ma
  JOIN public.meetings m ON ma.meeting_id = m.id
  WHERE ma.assigned_user_id = p_user_id
    AND m.start_time >= p_week_start
    AND m.start_time < v_week_end + INTERVAL '1 day';

  -- Merge all filler_words_breakdown JSONBs by summing counts per word
  WITH filler_aggregation AS (
    SELECT
      key as filler_word,
      SUM(value::text::integer) as total_count
    FROM public.meeting_analysis ma
    JOIN public.meetings m ON ma.meeting_id = m.id,
    LATERAL jsonb_each(COALESCE(ma.filler_words_breakdown, '{}'::jsonb))
    WHERE ma.assigned_user_id = p_user_id
      AND m.start_time >= p_week_start
      AND m.start_time < v_week_end + INTERVAL '1 day'
    GROUP BY key
  )
  SELECT COALESCE(jsonb_object_agg(filler_word, total_count), '{}'::jsonb)
  INTO v_filler_words_breakdown
  FROM filler_aggregation;

  -- Insert or update the rollup with all metrics including new Metrics v2
  INSERT INTO public.user_weekly_rollups (
    user_id,
    week_start_date,
    week_end_date,
    meetings_count,
    total_meeting_duration_seconds,
    avg_meeting_duration_seconds,
    total_talk_time_seconds,
    avg_talk_time_percentage,
    median_talk_time_percentage,
    total_words_spoken,
    avg_words_per_minute,
    median_words_per_minute,
    avg_words_per_segment,
    total_times_interrupted,
    avg_times_interrupted_per_meeting,
    total_times_interrupting,
    avg_times_interrupting_per_meeting,
    avg_interruption_rate,
    avg_response_latency_seconds,
    median_response_latency_seconds,
    quick_responses_percentage,
    total_filler_words,
    filler_words_breakdown,
    avg_clarity_score,
    avg_confidence_score,
    avg_attunement_score,
    avg_filler_words_per_minute,
    avg_turn_taking_balance,
    median_turn_taking_balance,
    weekly_content_pillar_score,
    weekly_poise_pillar_score,
    weekly_connection_pillar_score,
    -- New Metrics v2 columns
    avg_longest_segment_seconds,
    max_longest_segment_seconds,
    avg_hedge_phrases_per_minute,
    avg_softeners_per_minute,
    total_apologies,
    avg_apologies_per_meeting,
    avg_signposting_per_segment,
    avg_incomplete_thoughts_percentage,
    avg_specificity_score,
    avg_topics_per_segment,
    avg_key_point_position
  )
  SELECT
    p_user_id,
    p_week_start,
    v_week_end,
    COUNT(DISTINCT ma.meeting_id),
    SUM(EXTRACT(EPOCH FROM (m.end_time - m.start_time))),
    AVG(EXTRACT(EPOCH FROM (m.end_time - m.start_time))),
    SUM(ma.talk_time_seconds),
    AVG(ma.talk_time_percentage),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ma.talk_time_percentage),
    SUM(ma.word_count),
    AVG(ma.words_per_minute),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ma.words_per_minute),
    v_avg_words_per_segment,
    SUM(ma.times_interrupted),
    AVG(ma.times_interrupted),
    SUM(ma.times_interrupting),
    AVG(ma.times_interrupting),
    AVG(ma.interruption_rate),
    AVG(ma.avg_response_latency_seconds),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ma.avg_response_latency_seconds),
    AVG(ma.quick_responses_percentage),
    v_total_filler_words,
    v_filler_words_breakdown,
    AVG(ma.clarity_score),
    AVG(ma.confidence_score),
    AVG(ma.attunement_score),
    AVG(ma.filler_words_per_minute),
    AVG(ma.turn_taking_balance),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ma.turn_taking_balance),
    -- Calculate weekly pillar scores from rolled-up metrics
    GREATEST(0, LEAST(10, AVG(ma.clarity_score) - (AVG(ma.filler_words_per_minute) * 0.1))),
    GREATEST(0, LEAST(10,
      AVG(ma.confidence_score)
      - GREATEST(0, (GREATEST(ABS(AVG(ma.words_per_minute) - 150) - 10, 0) / 10.0 * 0.5))
      - GREATEST(0, (GREATEST(ABS(v_avg_words_per_segment - 150) - 150, 0) / 10.0 * 0.5))
    )),
    GREATEST(0, LEAST(10,
      AVG(ma.attunement_score) *
      CASE
        WHEN ABS(AVG(ma.turn_taking_balance)) <= 10 THEN 1.0
        ELSE GREATEST(0.5, 1.0 - ((ABS(AVG(ma.turn_taking_balance)) - 10) / 100.0))
      END
      - GREATEST(0, (AVG(ma.times_interrupted) - 10) * 0.1)
    )),
    -- New Metrics v2 aggregations
    AVG(ma.longest_segment_seconds),
    MAX(ma.longest_segment_seconds),
    AVG(ma.hedge_phrases_per_minute),
    AVG(ma.softeners_per_minute),
    SUM(ma.apologies_total),
    AVG(ma.apologies_total),
    AVG(ma.signposting_per_segment),
    AVG(ma.incomplete_thoughts_percentage),
    AVG(ma.specificity_score),
    AVG(ma.avg_topics_per_segment),
    AVG(ma.key_point_position)
  FROM public.meeting_analysis ma
  JOIN public.meetings m ON ma.meeting_id = m.id
  WHERE ma.assigned_user_id = p_user_id
    AND m.start_time >= p_week_start
    AND m.start_time < v_week_end + INTERVAL '1 day'
  ON CONFLICT (user_id, week_start_date)
  DO UPDATE SET
    week_end_date = EXCLUDED.week_end_date,
    meetings_count = EXCLUDED.meetings_count,
    total_meeting_duration_seconds = EXCLUDED.total_meeting_duration_seconds,
    avg_meeting_duration_seconds = EXCLUDED.avg_meeting_duration_seconds,
    total_talk_time_seconds = EXCLUDED.total_talk_time_seconds,
    avg_talk_time_percentage = EXCLUDED.avg_talk_time_percentage,
    median_talk_time_percentage = EXCLUDED.median_talk_time_percentage,
    total_words_spoken = EXCLUDED.total_words_spoken,
    avg_words_per_minute = EXCLUDED.avg_words_per_minute,
    median_words_per_minute = EXCLUDED.median_words_per_minute,
    avg_words_per_segment = EXCLUDED.avg_words_per_segment,
    total_times_interrupted = EXCLUDED.total_times_interrupted,
    avg_times_interrupted_per_meeting = EXCLUDED.avg_times_interrupted_per_meeting,
    total_times_interrupting = EXCLUDED.total_times_interrupting,
    avg_times_interrupting_per_meeting = EXCLUDED.avg_times_interrupting_per_meeting,
    avg_interruption_rate = EXCLUDED.avg_interruption_rate,
    avg_response_latency_seconds = EXCLUDED.avg_response_latency_seconds,
    median_response_latency_seconds = EXCLUDED.median_response_latency_seconds,
    quick_responses_percentage = EXCLUDED.quick_responses_percentage,
    total_filler_words = EXCLUDED.total_filler_words,
    filler_words_breakdown = EXCLUDED.filler_words_breakdown,
    avg_clarity_score = EXCLUDED.avg_clarity_score,
    avg_confidence_score = EXCLUDED.avg_confidence_score,
    avg_attunement_score = EXCLUDED.avg_attunement_score,
    avg_filler_words_per_minute = EXCLUDED.avg_filler_words_per_minute,
    avg_turn_taking_balance = EXCLUDED.avg_turn_taking_balance,
    median_turn_taking_balance = EXCLUDED.median_turn_taking_balance,
    weekly_content_pillar_score = EXCLUDED.weekly_content_pillar_score,
    weekly_poise_pillar_score = EXCLUDED.weekly_poise_pillar_score,
    weekly_connection_pillar_score = EXCLUDED.weekly_connection_pillar_score,
    -- New Metrics v2 updates
    avg_longest_segment_seconds = EXCLUDED.avg_longest_segment_seconds,
    max_longest_segment_seconds = EXCLUDED.max_longest_segment_seconds,
    avg_hedge_phrases_per_minute = EXCLUDED.avg_hedge_phrases_per_minute,
    avg_softeners_per_minute = EXCLUDED.avg_softeners_per_minute,
    total_apologies = EXCLUDED.total_apologies,
    avg_apologies_per_meeting = EXCLUDED.avg_apologies_per_meeting,
    avg_signposting_per_segment = EXCLUDED.avg_signposting_per_segment,
    avg_incomplete_thoughts_percentage = EXCLUDED.avg_incomplete_thoughts_percentage,
    avg_specificity_score = EXCLUDED.avg_specificity_score,
    avg_topics_per_segment = EXCLUDED.avg_topics_per_segment,
    avg_key_point_position = EXCLUDED.avg_key_point_position
  RETURNING id INTO v_rollup_id;

  RETURN v_rollup_id;
END;
$function$;

COMMENT ON FUNCTION public.calculate_user_weekly_rollup IS 'Calculates weekly performance rollup for a user, including Metrics v2';

-- ============================================================================
-- Update calculate_initial_baseline function to include new metrics
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_initial_baseline(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_baseline_id uuid;
  v_meetings_count integer;
BEGIN
  -- Count meetings for this user
  SELECT COUNT(*)
  INTO v_meetings_count
  FROM public.meeting_analysis
  WHERE assigned_user_id = p_user_id;

  -- Require at least 5 meetings for initial baseline
  IF v_meetings_count < 5 THEN
    RETURN NULL;
  END IF;

  -- Calculate baseline from first 5 meetings including new Metrics v2
  WITH first_five AS (
    SELECT
      ma.talk_time_percentage,
      ma.words_per_minute,
      ma.word_count,
      ma.segments_count,
      ma.interruption_rate,
      ma.filler_words_total,
      ma.talk_time_seconds,
      ma.clarity_score,
      ma.confidence_score,
      ma.collaboration_score,
      ma.attunement_score,
      -- New Metrics v2 columns
      ma.longest_segment_seconds,
      ma.hedge_phrases_per_minute,
      ma.softeners_per_minute,
      ma.apologies_total,
      ma.signposting_per_segment,
      ma.incomplete_thoughts_percentage,
      ma.specificity_score,
      ma.avg_topics_per_segment,
      ma.key_point_position,
      ma.created_at
    FROM public.meeting_analysis ma
    WHERE ma.assigned_user_id = p_user_id
    ORDER BY ma.created_at ASC
    LIMIT 5
  ),
  aggregated AS (
    SELECT
      AVG(talk_time_percentage) as avg_talk_time,
      AVG(words_per_minute) as avg_wpm,
      SUM(word_count)::numeric / NULLIF(SUM(segments_count), 0) as avg_words_per_segment,
      AVG(interruption_rate) as avg_interruption,
      CASE
        WHEN SUM(talk_time_seconds) > 0 THEN
          (SUM(filler_words_total)::numeric / (SUM(talk_time_seconds) / 60.0))
        ELSE 0
      END as avg_filler_words_per_minute,
      AVG(clarity_score) as avg_clarity,
      AVG(confidence_score) as avg_confidence,
      AVG(collaboration_score) as avg_collaboration,
      AVG(attunement_score) as avg_attunement,
      -- New Metrics v2 aggregations
      AVG(longest_segment_seconds) as avg_longest_segment,
      AVG(hedge_phrases_per_minute) as avg_hedge_phrases,
      AVG(softeners_per_minute) as avg_softeners,
      AVG(apologies_total) as avg_apologies,
      AVG(signposting_per_segment) as avg_signposting,
      AVG(incomplete_thoughts_percentage) as avg_incomplete_thoughts,
      AVG(specificity_score) as avg_specificity,
      AVG(avg_topics_per_segment) as avg_topics,
      AVG(key_point_position) as avg_key_point,
      MIN(created_at)::date as start_date,
      MAX(created_at)::date as end_date
    FROM first_five
  )
  INSERT INTO public.user_baselines (
    user_id,
    baseline_type,
    baseline_start_date,
    baseline_end_date,
    weeks_included,
    baseline_talk_time_percentage,
    baseline_words_per_minute,
    baseline_words_per_segment,
    baseline_interruption_rate,
    baseline_filler_words_per_minute,
    baseline_clarity_score,
    baseline_confidence_score,
    baseline_collaboration_score,
    baseline_attunement_score,
    baseline_times_interrupted_per_meeting,
    baseline_times_interrupting_per_meeting,
    -- New Metrics v2 baselines
    baseline_longest_segment_seconds,
    baseline_hedge_phrases_per_minute,
    baseline_softeners_per_minute,
    baseline_apologies_per_meeting,
    baseline_signposting_per_segment,
    baseline_incomplete_thoughts_percentage,
    baseline_specificity_score,
    baseline_topics_per_segment,
    baseline_key_point_position,
    meetings_included,
    is_active
  )
  SELECT
    p_user_id,
    'initial',
    start_date,
    end_date,
    1,
    avg_talk_time,
    avg_wpm,
    avg_words_per_segment,
    avg_interruption,
    avg_filler_words_per_minute,
    avg_clarity,
    avg_confidence,
    avg_collaboration,
    avg_attunement,
    0,
    0,
    -- New Metrics v2 values
    avg_longest_segment,
    avg_hedge_phrases,
    avg_softeners,
    avg_apologies,
    avg_signposting,
    avg_incomplete_thoughts,
    avg_specificity,
    avg_topics,
    avg_key_point,
    5,
    true
  FROM aggregated
  ON CONFLICT (user_id, baseline_type) WHERE is_active = true
  DO UPDATE SET
    baseline_talk_time_percentage = EXCLUDED.baseline_talk_time_percentage,
    baseline_words_per_minute = EXCLUDED.baseline_words_per_minute,
    baseline_words_per_segment = EXCLUDED.baseline_words_per_segment,
    baseline_interruption_rate = EXCLUDED.baseline_interruption_rate,
    baseline_filler_words_per_minute = EXCLUDED.baseline_filler_words_per_minute,
    baseline_clarity_score = EXCLUDED.baseline_clarity_score,
    baseline_confidence_score = EXCLUDED.baseline_confidence_score,
    baseline_collaboration_score = EXCLUDED.baseline_collaboration_score,
    baseline_attunement_score = EXCLUDED.baseline_attunement_score,
    -- New Metrics v2 updates
    baseline_longest_segment_seconds = EXCLUDED.baseline_longest_segment_seconds,
    baseline_hedge_phrases_per_minute = EXCLUDED.baseline_hedge_phrases_per_minute,
    baseline_softeners_per_minute = EXCLUDED.baseline_softeners_per_minute,
    baseline_apologies_per_meeting = EXCLUDED.baseline_apologies_per_meeting,
    baseline_signposting_per_segment = EXCLUDED.baseline_signposting_per_segment,
    baseline_incomplete_thoughts_percentage = EXCLUDED.baseline_incomplete_thoughts_percentage,
    baseline_specificity_score = EXCLUDED.baseline_specificity_score,
    baseline_topics_per_segment = EXCLUDED.baseline_topics_per_segment,
    baseline_key_point_position = EXCLUDED.baseline_key_point_position,
    meetings_included = EXCLUDED.meetings_included
  RETURNING id INTO v_baseline_id;

  RETURN v_baseline_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_initial_baseline IS 'Calculates initial baseline from first 5 meetings including Metrics v2';

COMMIT;
