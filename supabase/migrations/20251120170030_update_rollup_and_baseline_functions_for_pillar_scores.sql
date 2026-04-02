-- Update database functions to aggregate pillar scores
-- This migration updates calculate_user_weekly_rollup, calculate_initial_baseline,  and update_current_baseline
-- to include avg pillar scores

BEGIN;

-- ============================================================================
-- Update calculate_user_weekly_rollup function to include pillar scores
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

  -- Insert or update the rollup with all metrics including pillar scores
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
    avg_collaboration_score,
    avg_attunement_score,
    avg_filler_words_per_minute,
    avg_turn_taking_balance,
    median_turn_taking_balance,
    weekly_content_pillar_score,
    weekly_poise_pillar_score,
    weekly_connection_pillar_score,
    weekly_attunement_pillar_score
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
    AVG(ma.collaboration_score),
    AVG(ma.attunement_score),
    AVG(ma.filler_words_per_minute),
    AVG(ma.turn_taking_balance),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ma.turn_taking_balance),
    -- Calculate weekly pillar scores from rolled-up metrics
    -- Content: clarity_score - (filler_penalty)
    GREATEST(0, LEAST(10, AVG(ma.clarity_score) - (AVG(ma.filler_words_per_minute) * 0.1))),
    -- Poise: confidence_score - pace_penalty - verbosity_penalty
    GREATEST(0, LEAST(10,
      AVG(ma.confidence_score)
      - GREATEST(0, (GREATEST(ABS(AVG(ma.words_per_minute) - 150) - 10, 0) / 10.0 * 0.5))
      - GREATEST(0, (GREATEST(ABS(v_avg_words_per_segment - 150) - 150, 0) / 10.0 * 0.5))
    )),
    -- Connection: collaboration_score × turn_taking_multiplier - interruptions_penalty
    GREATEST(0, LEAST(10,
      AVG(ma.collaboration_score) *
      CASE
        WHEN ABS(AVG(ma.turn_taking_balance)) <= 10 THEN 1.0
        ELSE GREATEST(0.5, 1.0 - ((ABS(AVG(ma.turn_taking_balance)) - 10) / 100.0))
      END
      - GREATEST(0, (AVG(ma.times_interrupted) - 10) * 0.1)
    )),
    -- Attunement: attunement_score - interruptions_penalty
    GREATEST(0, LEAST(10, AVG(ma.attunement_score) - GREATEST(0, (AVG(ma.times_interrupting) - 3) * 0.2)))
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
    avg_collaboration_score = EXCLUDED.avg_collaboration_score,
    avg_attunement_score = EXCLUDED.avg_attunement_score,
    avg_filler_words_per_minute = EXCLUDED.avg_filler_words_per_minute,
    avg_turn_taking_balance = EXCLUDED.avg_turn_taking_balance,
    median_turn_taking_balance = EXCLUDED.median_turn_taking_balance,
    weekly_content_pillar_score = EXCLUDED.weekly_content_pillar_score,
    weekly_poise_pillar_score = EXCLUDED.weekly_poise_pillar_score,
    weekly_connection_pillar_score = EXCLUDED.weekly_connection_pillar_score,
    weekly_attunement_pillar_score = EXCLUDED.weekly_attunement_pillar_score
  RETURNING id INTO v_rollup_id;

  RETURN v_rollup_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_user_weekly_rollup IS 'Calculates weekly performance rollup for a user, including pillar scores';

-- ============================================================================
-- Update calculate_initial_baseline function to include pillar scores
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

  -- Calculate baseline from first 5 meetings
  WITH first_five AS (
    SELECT
      ma.talk_time_percentage,
      ma.words_per_minute,
      ma.word_count,
      ma.segments_count,
      ma.interruption_rate,
      ma.times_interrupted,
      ma.times_interrupting,
      ma.turn_taking_balance,
      ma.clarity_score,
      ma.confidence_score,
      ma.collaboration_score,
      ma.attunement_score,
      ma.filler_words_per_minute,
      ma.created_at
    FROM public.meeting_analysis ma
    WHERE ma.assigned_user_id = p_user_id
    ORDER BY ma.created_at ASC
    LIMIT 5
  ),
  aggregated AS (
    SELECT
      AVG(talk_time_percentage) as avg_talk_time,
      STDDEV(talk_time_percentage) as stddev_talk_time,
      AVG(words_per_minute) as avg_wpm,
      STDDEV(words_per_minute) as stddev_wpm,
      SUM(word_count)::numeric / NULLIF(SUM(segments_count), 0) as avg_words_per_segment,
      AVG(interruption_rate) as avg_interruption,
      STDDEV(interruption_rate) as stddev_interruption,
      AVG(turn_taking_balance) as avg_turn_taking,
      STDDEV(turn_taking_balance) as stddev_turn_taking,
      AVG(clarity_score) as avg_clarity,
      STDDEV(clarity_score) as stddev_clarity,
      AVG(confidence_score) as avg_confidence,
      STDDEV(confidence_score) as stddev_confidence,
      AVG(collaboration_score) as avg_collaboration,
      STDDEV(collaboration_score) as stddev_collaboration,
      AVG(attunement_score) as avg_attunement,
      STDDEV(attunement_score) as stddev_attunement,
      MIN(created_at)::date as start_date,
      MAX(created_at)::date as end_date,
      -- Calculate baseline pillar scores from aggregated first 5 meeting metrics
      -- Content: avg_clarity - filler_penalty
      GREATEST(0, LEAST(10, AVG(clarity_score) - (AVG(filler_words_per_minute) * 0.1))) as avg_content_pillar,
      -- Poise: avg_confidence - pace_penalty - verbosity_penalty
      GREATEST(0, LEAST(10,
        AVG(confidence_score)
        - GREATEST(0, (GREATEST(ABS(AVG(words_per_minute) - 150) - 10, 0) / 10.0 * 0.5))
        - GREATEST(0, (GREATEST(ABS((SUM(word_count)::numeric / NULLIF(SUM(segments_count), 0)) - 150) - 150, 0) / 10.0 * 0.5))
      )) as avg_poise_pillar,
      -- Connection: avg_collaboration × turn_taking_multiplier - interruptions_penalty
      GREATEST(0, LEAST(10,
        AVG(collaboration_score) *
        CASE
          WHEN ABS(AVG(turn_taking_balance)) <= 10 THEN 1.0
          ELSE GREATEST(0.5, 1.0 - ((ABS(AVG(turn_taking_balance)) - 10) / 100.0))
        END
        - GREATEST(0, (AVG(times_interrupted) - 10) * 0.1)
      )) as avg_connection_pillar,
      -- Attunement: avg_attunement - interruptions_penalty
      GREATEST(0, LEAST(10, AVG(attunement_score) - GREATEST(0, (AVG(times_interrupting) - 3) * 0.2))) as avg_attunement_pillar
    FROM first_five
  )
  INSERT INTO public.user_baselines (
    user_id,
    baseline_type,
    baseline_start_date,
    baseline_end_date,
    weeks_included,
    baseline_talk_time_percentage,
    baseline_talk_time_std_dev,
    baseline_words_per_minute,
    baseline_wpm_std_dev,
    baseline_words_per_segment,
    baseline_interruption_rate,
    baseline_interruption_rate_std_dev,
    baseline_times_interrupted_per_meeting,
    baseline_times_interrupting_per_meeting,
    baseline_turn_taking_balance,
    baseline_turn_taking_balance_std_dev,
    baseline_clarity_score,
    baseline_confidence_score,
    baseline_collaboration_score,
    baseline_attunement_score,
    avg_baseline_content_pillar_score,
    avg_baseline_poise_pillar_score,
    avg_baseline_connection_pillar_score,
    avg_baseline_attunement_pillar_score,
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
    stddev_talk_time,
    avg_wpm,
    stddev_wpm,
    avg_words_per_segment,
    avg_interruption,
    stddev_interruption,
    0, -- Will be calculated if needed
    0, -- Will be calculated if needed
    avg_turn_taking,
    stddev_turn_taking,
    avg_clarity,
    avg_confidence,
    avg_collaboration,
    avg_attunement,
    avg_content_pillar,
    avg_poise_pillar,
    avg_connection_pillar,
    avg_attunement_pillar,
    5,
    true
  FROM aggregated
  ON CONFLICT (user_id, baseline_type) WHERE is_active = true
  DO UPDATE SET
    baseline_talk_time_percentage = EXCLUDED.baseline_talk_time_percentage,
    baseline_talk_time_std_dev = EXCLUDED.baseline_talk_time_std_dev,
    baseline_words_per_minute = EXCLUDED.baseline_words_per_minute,
    baseline_wpm_std_dev = EXCLUDED.baseline_wpm_std_dev,
    baseline_words_per_segment = EXCLUDED.baseline_words_per_segment,
    baseline_interruption_rate = EXCLUDED.baseline_interruption_rate,
    baseline_interruption_rate_std_dev = EXCLUDED.baseline_interruption_rate_std_dev,
    baseline_turn_taking_balance = EXCLUDED.baseline_turn_taking_balance,
    baseline_turn_taking_balance_std_dev = EXCLUDED.baseline_turn_taking_balance_std_dev,
    baseline_clarity_score = EXCLUDED.baseline_clarity_score,
    baseline_confidence_score = EXCLUDED.baseline_confidence_score,
    baseline_collaboration_score = EXCLUDED.baseline_collaboration_score,
    baseline_attunement_score = EXCLUDED.baseline_attunement_score,
    avg_baseline_content_pillar_score = EXCLUDED.avg_baseline_content_pillar_score,
    avg_baseline_poise_pillar_score = EXCLUDED.avg_baseline_poise_pillar_score,
    avg_baseline_connection_pillar_score = EXCLUDED.avg_baseline_connection_pillar_score,
    avg_baseline_attunement_pillar_score = EXCLUDED.avg_baseline_attunement_pillar_score,
    meetings_included = EXCLUDED.meetings_included
  RETURNING id INTO v_baseline_id;

  RETURN v_baseline_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_initial_baseline IS 'Calculates initial baseline from first 5 meetings, including pillar scores';

-- ============================================================================
-- Update update_current_baseline function to include pillar scores
-- Note: Pillar scores are averaged from weekly rollup pillar scores
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_current_baseline(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_baseline_id uuid;
  v_previous_baseline_id uuid;
  v_twelve_weeks_ago date;
BEGIN
  v_twelve_weeks_ago := CURRENT_DATE - INTERVAL '12 weeks';

  -- Get previous current baseline if exists
  SELECT id INTO v_previous_baseline_id
  FROM public.user_baselines
  WHERE user_id = p_user_id AND baseline_type = 'current' AND is_active = true;

  -- Deactivate previous baseline
  IF v_previous_baseline_id IS NOT NULL THEN
    UPDATE public.user_baselines
    SET is_active = false
    WHERE id = v_previous_baseline_id;
  END IF;

  -- Create new current baseline from last 12 weeks
  INSERT INTO public.user_baselines (
    user_id,
    baseline_type,
    baseline_start_date,
    baseline_end_date,
    weeks_included,
    meetings_included,
    baseline_talk_time_percentage,
    baseline_talk_time_std_dev,
    baseline_words_per_minute,
    baseline_wpm_std_dev,
    baseline_times_interrupted_per_meeting,
    baseline_interrupted_std_dev,
    baseline_times_interrupting_per_meeting,
    baseline_interrupting_std_dev,
    baseline_interruption_rate,
    baseline_interruption_rate_std_dev,
    baseline_response_latency_seconds,
    baseline_response_latency_std_dev,
    avg_baseline_content_pillar_score,
    avg_baseline_poise_pillar_score,
    avg_baseline_connection_pillar_score,
    avg_baseline_attunement_pillar_score,
    supersedes_baseline_id
  )
  SELECT
    p_user_id,
    'current',
    MIN(m.start_time::date),
    MAX(m.start_time::date),
    12, -- Fixed 12-week window
    COUNT(DISTINCT ma.meeting_id),
    AVG(ma.talk_time_percentage),
    STDDEV(ma.talk_time_percentage),
    AVG(ma.words_per_minute),
    STDDEV(ma.words_per_minute),
    AVG(ma.times_interrupted),
    STDDEV(ma.times_interrupted),
    AVG(ma.times_interrupting),
    STDDEV(ma.times_interrupting),
    AVG(ma.interruption_rate),
    STDDEV(ma.interruption_rate),
    AVG(ma.avg_response_latency_seconds),
    STDDEV(ma.avg_response_latency_seconds),
    -- Average pillar scores from weekly rollups (not from individual meetings)
    (SELECT AVG(weekly_content_pillar_score)
     FROM public.user_weekly_rollups
     WHERE user_id = p_user_id AND week_start_date >= v_twelve_weeks_ago),
    (SELECT AVG(weekly_poise_pillar_score)
     FROM public.user_weekly_rollups
     WHERE user_id = p_user_id AND week_start_date >= v_twelve_weeks_ago),
    (SELECT AVG(weekly_connection_pillar_score)
     FROM public.user_weekly_rollups
     WHERE user_id = p_user_id AND week_start_date >= v_twelve_weeks_ago),
    (SELECT AVG(weekly_attunement_pillar_score)
     FROM public.user_weekly_rollups
     WHERE user_id = p_user_id AND week_start_date >= v_twelve_weeks_ago),
    v_previous_baseline_id
  FROM public.meeting_analysis ma
  JOIN public.meetings m ON ma.meeting_id = m.id
  WHERE ma.assigned_user_id = p_user_id
    AND m.start_time >= v_twelve_weeks_ago
  HAVING COUNT(DISTINCT ma.meeting_id) > 0
  RETURNING id INTO v_new_baseline_id;

  RETURN v_new_baseline_id;
END;
$$;

COMMENT ON FUNCTION public.update_current_baseline IS 'Update rolling 12-week current baseline including pillar scores averaged from weekly rollups';

COMMIT;
