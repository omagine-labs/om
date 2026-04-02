-- Add agentic analysis aggregation columns to user_weekly_rollups table
-- Part of Agentic Communication Analysis project
-- Adds 8 columns for weekly aggregated agentic scores (avg/median for 4 dimensions)
-- Updates calculate_user_weekly_rollup function to calculate these aggregations

BEGIN;

-- ============================================================================
-- Add columns to user_weekly_rollups table
-- ============================================================================

ALTER TABLE public.user_weekly_rollups
  ADD COLUMN IF NOT EXISTS avg_clarity_score numeric,
  ADD COLUMN IF NOT EXISTS median_clarity_score numeric,
  ADD COLUMN IF NOT EXISTS avg_confidence_score numeric,
  ADD COLUMN IF NOT EXISTS median_confidence_score numeric,
  ADD COLUMN IF NOT EXISTS avg_collaboration_score numeric,
  ADD COLUMN IF NOT EXISTS median_collaboration_score numeric,
  ADD COLUMN IF NOT EXISTS avg_attunement_score numeric,
  ADD COLUMN IF NOT EXISTS median_attunement_score numeric;

-- Add column comments
COMMENT ON COLUMN public.user_weekly_rollups.avg_clarity_score IS 'Average clarity score across all meetings in the week';
COMMENT ON COLUMN public.user_weekly_rollups.median_clarity_score IS 'Median clarity score across all meetings in the week';
COMMENT ON COLUMN public.user_weekly_rollups.avg_confidence_score IS 'Average confidence score across all meetings in the week';
COMMENT ON COLUMN public.user_weekly_rollups.median_confidence_score IS 'Median confidence score across all meetings in the week';
COMMENT ON COLUMN public.user_weekly_rollups.avg_collaboration_score IS 'Average collaboration score across all meetings in the week';
COMMENT ON COLUMN public.user_weekly_rollups.median_collaboration_score IS 'Median collaboration score across all meetings in the week';
COMMENT ON COLUMN public.user_weekly_rollups.avg_attunement_score IS 'Average attunement score across all meetings in the week';
COMMENT ON COLUMN public.user_weekly_rollups.median_attunement_score IS 'Median attunement score across all meetings in the week';

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
  -- Pre-aggregate counts before building JSON object to avoid nested aggregates
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

  -- Insert or update the rollup with all metrics including filler words and agentic scores
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
    median_clarity_score,
    avg_confidence_score,
    median_confidence_score,
    avg_collaboration_score,
    median_collaboration_score,
    avg_attunement_score,
    median_attunement_score
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
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ma.clarity_score),
    AVG(ma.confidence_score),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ma.confidence_score),
    AVG(ma.collaboration_score),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ma.collaboration_score),
    AVG(ma.attunement_score),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ma.attunement_score)
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
    median_clarity_score = EXCLUDED.median_clarity_score,
    avg_confidence_score = EXCLUDED.avg_confidence_score,
    median_confidence_score = EXCLUDED.median_confidence_score,
    avg_collaboration_score = EXCLUDED.avg_collaboration_score,
    median_collaboration_score = EXCLUDED.median_collaboration_score,
    avg_attunement_score = EXCLUDED.avg_attunement_score,
    median_attunement_score = EXCLUDED.median_attunement_score
  RETURNING id INTO v_rollup_id;

  RETURN v_rollup_id;
END;
$$;

COMMENT ON FUNCTION public.calculate_user_weekly_rollup IS 'Calculates weekly performance rollup for a user, including filler words aggregation and agentic analysis scores';

COMMIT;
