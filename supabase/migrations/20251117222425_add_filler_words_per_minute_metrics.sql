-- Migration: Add filler words per minute metrics
-- Description: Converts filler words from absolute counts to rate-based metrics (per minute)
--              to enable fair comparisons across meetings and baseline calculations

BEGIN;

-- ============================================================================
-- Add filler_words_per_minute columns to tables
-- ============================================================================

-- Add to meeting_analysis table (per-speaker metrics)
ALTER TABLE public.meeting_analysis
ADD COLUMN IF NOT EXISTS filler_words_per_minute NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.meeting_analysis.filler_words_per_minute IS 'Rate of filler words per minute of speaking time';

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_meeting_analysis_filler_words_per_minute
ON public.meeting_analysis(filler_words_per_minute);

-- Add to user_weekly_rollups table (weekly aggregations)
ALTER TABLE public.user_weekly_rollups
ADD COLUMN IF NOT EXISTS avg_filler_words_per_minute NUMERIC DEFAULT 0;

COMMENT ON COLUMN public.user_weekly_rollups.avg_filler_words_per_minute IS 'Weighted average rate of filler words per minute across all meetings in the week';

-- Add to user_baselines table
ALTER TABLE public.user_baselines
ADD COLUMN IF NOT EXISTS baseline_filler_words_per_minute NUMERIC;

COMMENT ON COLUMN public.user_baselines.baseline_filler_words_per_minute IS 'Baseline filler words per minute rate for comparison';

-- ============================================================================
-- Update calculate_user_weekly_rollup function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_user_weekly_rollup(
  p_user_id uuid,
  p_week_start date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rollup_id uuid;
  v_week_end date;
  v_meetings_count integer;
  v_total_words integer;
  v_total_segments integer;
  v_avg_words_per_segment numeric;
  v_total_filler_words integer;
  v_filler_words_breakdown jsonb;
  v_avg_filler_words_per_minute numeric;
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

  -- If no meetings, return NULL
  IF v_meetings_count = 0 THEN
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

  -- Calculate weighted average filler words per minute
  -- Formula: total_filler_words / (total_talk_time_seconds / 60)
  SELECT
    CASE
      WHEN SUM(ma.talk_time_seconds) > 0 THEN
        (SUM(ma.filler_words_total)::numeric / (SUM(ma.talk_time_seconds) / 60.0))
      ELSE 0
    END
  INTO v_avg_filler_words_per_minute
  FROM public.meeting_analysis ma
  JOIN public.meetings m ON ma.meeting_id = m.id
  WHERE ma.assigned_user_id = p_user_id
    AND m.start_time >= p_week_start
    AND m.start_time < v_week_end + INTERVAL '1 day';

  -- Insert or update the rollup with all metrics including agentic scores and filler words per minute
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
    avg_filler_words_per_minute,
    avg_clarity_score,
    avg_confidence_score,
    avg_collaboration_score,
    avg_attunement_score
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
    v_avg_filler_words_per_minute,
    AVG(ma.clarity_score),
    AVG(ma.confidence_score),
    AVG(ma.collaboration_score),
    AVG(ma.attunement_score)
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
    avg_filler_words_per_minute = EXCLUDED.avg_filler_words_per_minute,
    avg_clarity_score = EXCLUDED.avg_clarity_score,
    avg_confidence_score = EXCLUDED.avg_confidence_score,
    avg_collaboration_score = EXCLUDED.avg_collaboration_score,
    avg_attunement_score = EXCLUDED.avg_attunement_score
  RETURNING id INTO v_rollup_id;

  RETURN v_rollup_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_user_weekly_rollup IS 'Calculates weekly performance rollup for a user, including filler words per minute weighted average';

-- ============================================================================
-- Update calculate_initial_baseline function to include filler words
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

  -- Calculate baseline from first 5 meetings including filler words per minute
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
    meetings_included,
    is_active
  )
  SELECT
    p_user_id,
    'initial',
    start_date,
    end_date,
    1, -- Initial baseline is from first meetings, not weeks
    avg_talk_time,
    avg_wpm,
    avg_words_per_segment,
    avg_interruption,
    avg_filler_words_per_minute,
    avg_clarity,
    avg_confidence,
    avg_collaboration,
    avg_attunement,
    0, -- Will be calculated if needed
    0, -- Will be calculated if needed
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
    meetings_included = EXCLUDED.meetings_included
  RETURNING id INTO v_baseline_id;

  RETURN v_baseline_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_initial_baseline IS 'Calculates initial baseline from first 5 meetings including filler words per minute';

-- ============================================================================
-- Backfill existing data
-- ============================================================================

-- Backfill meeting_analysis table with calculated filler_words_per_minute
UPDATE public.meeting_analysis
SET filler_words_per_minute =
  CASE
    WHEN talk_time_seconds > 0 THEN
      (filler_words_total::numeric / (talk_time_seconds / 60.0))
    ELSE 0
  END
WHERE filler_words_per_minute = 0 OR filler_words_per_minute IS NULL;

-- Recalculate all existing weekly rollups to include filler words per minute
-- This will update both new and existing rollups
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT
      ma.assigned_user_id as user_id,
      DATE_TRUNC('week', m.start_time)::date as week_start
    FROM public.meeting_analysis ma
    JOIN public.meetings m ON ma.meeting_id = m.id
    WHERE ma.assigned_user_id IS NOT NULL
    ORDER BY user_id, week_start
  )
  LOOP
    PERFORM public.calculate_user_weekly_rollup(r.user_id, r.week_start);
  END LOOP;
END;
$$;

-- Recalculate all existing baselines to include filler words per minute
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT assigned_user_id as user_id
    FROM public.meeting_analysis
    WHERE assigned_user_id IS NOT NULL
  )
  LOOP
    PERFORM public.calculate_initial_baseline(r.user_id);
  END LOOP;
END;
$$;

COMMIT;
