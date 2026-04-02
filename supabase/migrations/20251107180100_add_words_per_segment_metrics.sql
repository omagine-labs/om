-- Migration: Add words_per_segment (verbosity) metrics
-- Description: Adds avg_words_per_segment to user_weekly_rollups and baseline_words_per_segment to user_baselines
-- This metric tracks the average number of words per speaking segment (verbosity/conciseness)

-- ============================================================================
-- Step 1: Add avg_words_per_segment to user_weekly_rollups
-- ============================================================================

ALTER TABLE public.user_weekly_rollups
ADD COLUMN IF NOT EXISTS avg_words_per_segment numeric;

COMMENT ON COLUMN public.user_weekly_rollups.avg_words_per_segment IS 'Average words per speaking segment (verbosity metric)';

-- ============================================================================
-- Step 2: Add baseline_words_per_segment to user_baselines
-- ============================================================================

ALTER TABLE public.user_baselines
ADD COLUMN IF NOT EXISTS baseline_words_per_segment numeric;

COMMENT ON COLUMN public.user_baselines.baseline_words_per_segment IS 'Baseline average words per segment for comparison';

-- ============================================================================
-- Step 3: Update calculate_user_weekly_rollup function to include words_per_segment
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

  -- Insert or update the rollup with all metrics including words_per_segment
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
    quick_responses_percentage
  )
  SELECT
    p_user_id,
    p_week_start,
    v_week_end,
    COUNT(DISTINCT ma.meeting_id),
    SUM(m.duration_seconds),
    AVG(m.duration_seconds),
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
    AVG(ma.quick_responses_percentage)
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
    quick_responses_percentage = EXCLUDED.quick_responses_percentage
  RETURNING id INTO v_rollup_id;

  RETURN v_rollup_id;
END;
$$;

-- ============================================================================
-- Step 4: Update calculate_user_baseline functions to include words_per_segment
-- ============================================================================

-- Update initial baseline calculation
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
  WITH first_five AS (
    SELECT
      ma.talk_time_percentage,
      ma.words_per_minute,
      ma.word_count,
      ma.segments_count,
      ma.interruption_rate
    FROM public.meeting_analysis ma
    WHERE ma.assigned_user_id = p_user_id
    ORDER BY ma.created_at ASC
    LIMIT 5
  ),
  verbosity_calc AS (
    SELECT
      SUM(word_count)::numeric / NULLIF(SUM(segments_count), 0) as avg_words_per_segment
    FROM first_five
  )
  INSERT INTO public.user_baselines (
    user_id,
    baseline_type,
    baseline_talk_time_percentage,
    baseline_words_per_minute,
    baseline_words_per_segment,
    baseline_interruption_rate,
    meetings_included,
    is_active
  )
  SELECT
    p_user_id,
    'initial',
    AVG(f.talk_time_percentage),
    AVG(f.words_per_minute),
    v.avg_words_per_segment,
    AVG(f.interruption_rate),
    5,
    true
  FROM first_five f, verbosity_calc v
  ON CONFLICT (user_id, baseline_type)
  WHERE baseline_type = 'initial'
  DO UPDATE SET
    baseline_talk_time_percentage = EXCLUDED.baseline_talk_time_percentage,
    baseline_words_per_minute = EXCLUDED.baseline_words_per_minute,
    baseline_words_per_segment = EXCLUDED.baseline_words_per_segment,
    baseline_interruption_rate = EXCLUDED.baseline_interruption_rate,
    meetings_included = EXCLUDED.meetings_included,
    is_active = EXCLUDED.is_active
  RETURNING id INTO v_baseline_id;

  RETURN v_baseline_id;
END;
$$;

-- Update rolling baseline calculation
CREATE OR REPLACE FUNCTION public.calculate_rolling_baseline(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_baseline_id uuid;
  v_rollups_count integer;
  v_twelve_weeks_ago date;
BEGIN
  -- Calculate date 12 weeks ago
  v_twelve_weeks_ago := CURRENT_DATE - INTERVAL '12 weeks';

  -- Count rollups in the 12-week window
  SELECT COUNT(*)
  INTO v_rollups_count
  FROM public.user_weekly_rollups
  WHERE user_id = p_user_id
    AND week_start_date >= v_twelve_weeks_ago;

  -- Require at least 8 weeks of data
  IF v_rollups_count < 8 THEN
    RETURN NULL;
  END IF;

  -- Calculate rolling baseline including words_per_segment
  WITH recent_rollups AS (
    SELECT
      avg_talk_time_percentage,
      avg_words_per_minute,
      avg_words_per_segment,
      avg_interruption_rate
    FROM public.user_weekly_rollups
    WHERE user_id = p_user_id
      AND week_start_date >= v_twelve_weeks_ago
  )
  INSERT INTO public.user_baselines (
    user_id,
    baseline_type,
    baseline_talk_time_percentage,
    baseline_words_per_minute,
    baseline_words_per_segment,
    baseline_interruption_rate,
    meetings_included,
    is_active
  )
  SELECT
    p_user_id,
    'current',
    AVG(avg_talk_time_percentage),
    AVG(avg_words_per_minute),
    AVG(avg_words_per_segment),
    AVG(avg_interruption_rate),
    v_rollups_count,
    true
  FROM recent_rollups
  ON CONFLICT (user_id, baseline_type)
  WHERE baseline_type = 'current'
  DO UPDATE SET
    baseline_talk_time_percentage = EXCLUDED.baseline_talk_time_percentage,
    baseline_words_per_minute = EXCLUDED.baseline_words_per_minute,
    baseline_words_per_segment = EXCLUDED.baseline_words_per_segment,
    baseline_interruption_rate = EXCLUDED.baseline_interruption_rate,
    meetings_included = EXCLUDED.meetings_included,
    is_active = EXCLUDED.is_active
  RETURNING id INTO v_baseline_id;

  RETURN v_baseline_id;
END;
$$;
