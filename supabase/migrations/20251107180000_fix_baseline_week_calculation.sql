-- ============================================================================
-- Fix Baseline Week Calculation Functions
-- ============================================================================
-- Fixes the EXTRACT(WEEK FROM AGE(...)) error in baseline calculation functions
-- by using proper date arithmetic to calculate the number of weeks.
-- ============================================================================

BEGIN;

-- Fix calculate_initial_baseline function
CREATE OR REPLACE FUNCTION public.calculate_initial_baseline(p_user_id uuid)
RETURNS uuid AS $$
DECLARE
  v_baseline_id uuid;
  v_meeting_count integer;
  v_start_date date;
  v_end_date date;
  v_weeks_included integer;
BEGIN
  -- Check if initial baseline already exists
  IF EXISTS (
    SELECT 1 FROM public.user_baselines
    WHERE user_id = p_user_id AND baseline_type = 'initial'
  ) THEN
    RETURN NULL; -- Initial baseline already exists
  END IF;

  -- Check if user has at least 5 meetings with assigned speakers
  SELECT COUNT(DISTINCT meeting_id) INTO v_meeting_count
  FROM public.meeting_analysis
  WHERE assigned_user_id = p_user_id;

  IF v_meeting_count < 5 THEN
    RETURN NULL; -- Not enough meetings yet
  END IF;

  -- Get date range
  SELECT
    MIN(m.start_time::date),
    MAX(m.start_time::date)
  INTO v_start_date, v_end_date
  FROM public.meeting_analysis ma
  JOIN public.meetings m ON ma.meeting_id = m.id
  WHERE ma.assigned_user_id = p_user_id;

  -- Calculate weeks (divide days by 7, round up)
  v_weeks_included := CEIL((v_end_date - v_start_date) / 7.0)::integer;

  -- Create initial baseline
  INSERT INTO public.user_baselines (
    user_id, baseline_type, baseline_start_date, baseline_end_date,
    weeks_included, meetings_included,
    baseline_talk_time_percentage, baseline_talk_time_std_dev,
    baseline_words_per_minute, baseline_wpm_std_dev,
    baseline_times_interrupted_per_meeting, baseline_interrupted_std_dev,
    baseline_times_interrupting_per_meeting, baseline_interrupting_std_dev,
    baseline_interruption_rate, baseline_interruption_rate_std_dev,
    baseline_response_latency_seconds, baseline_response_latency_std_dev
  )
  SELECT
    p_user_id,
    'initial',
    v_start_date,
    v_end_date,
    v_weeks_included,
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
    STDDEV(ma.avg_response_latency_seconds)
  FROM public.meeting_analysis ma
  JOIN public.meetings m ON ma.meeting_id = m.id
  WHERE ma.assigned_user_id = p_user_id
  RETURNING id INTO v_baseline_id;

  RETURN v_baseline_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.calculate_initial_baseline IS 'Create initial baseline after user has 5+ meetings (fixed week calculation)';

COMMIT;
