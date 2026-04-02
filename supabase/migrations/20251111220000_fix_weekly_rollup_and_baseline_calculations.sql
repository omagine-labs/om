-- Migration: Fix weekly rollup and baseline calculation functions
-- Description: Fixes multiple issues in calculate_user_weekly_rollup and calculate_initial_baseline:
--   1. Nested aggregate function error in filler words aggregation
--   2. Meeting duration calculation (use end_time - start_time instead of non-existent duration_seconds)
--   3. GROUP BY issue in initial baseline calculation
--   4. Missing NOT NULL columns in baseline insert

BEGIN;

-- ============================================================================
-- Fix calculate_user_weekly_rollup function
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
  -- Sum up total_filler_words
  SELECT COALESCE(SUM(ma.filler_words_total), 0)
  INTO v_total_filler_words
  FROM public.meeting_analysis ma
  JOIN public.meetings m ON ma.meeting_id = m.id
  WHERE ma.assigned_user_id = p_user_id
    AND m.start_time >= p_week_start
    AND m.start_time < v_week_end + INTERVAL '1 day';

  -- Merge all filler_words_breakdown JSONBs by summing counts per word
  -- FIX: Pre-aggregate counts before building JSON object to avoid nested aggregates
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

  -- Insert or update the rollup with all metrics including filler words
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
    filler_words_breakdown
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
    v_filler_words_breakdown
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
    filler_words_breakdown = EXCLUDED.filler_words_breakdown
  RETURNING id INTO v_rollup_id;

  RETURN v_rollup_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_user_weekly_rollup IS 'Calculates weekly performance rollup for a user, including filler words aggregation (fixed nested aggregate issue)';

-- ============================================================================
-- Fix calculate_initial_baseline function GROUP BY issue
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

  -- Calculate baseline from first 5 meetings including words_per_segment
  -- FIX: Use subquery to properly aggregate without GROUP BY issues
  WITH first_five AS (
    SELECT
      ma.talk_time_percentage,
      ma.words_per_minute,
      ma.word_count,
      ma.segments_count,
      ma.interruption_rate,
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
    meetings_included = EXCLUDED.meetings_included
  RETURNING id INTO v_baseline_id;

  RETURN v_baseline_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_initial_baseline IS 'Calculates initial baseline from first 5 meetings (fixed GROUP BY issue)';

COMMIT;
