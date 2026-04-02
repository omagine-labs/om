-- ============================================================================
-- Meeting Intelligence Schema Migration
-- ============================================================================
-- This migration adds comprehensive meeting intelligence features:
-- 1. Meeting type classification and role-based benchmarking
-- 2. User baselines for personalized performance tracking
-- 3. Weekly performance rollups for dashboard analytics
-- 4. Recording metadata management
-- 5. Enhanced transcript handling (AI + user-uploaded)
-- ============================================================================

BEGIN;

-- ============================================================================
-- Step 1: Create Enum Types
-- ============================================================================

-- Meeting type enum
CREATE TYPE public.meeting_type AS ENUM (
  'one_on_one',
  'small_group',
  'large_group',
  'presentation',
  'interview',
  'unknown'
);

-- User role in meeting enum
CREATE TYPE public.user_role AS ENUM (
  'presenter',
  'participant',
  'interviewer',
  'interviewee',
  'facilitator',
  'unknown'
);

-- Talk time status enum
CREATE TYPE public.talk_time_status AS ENUM (
  'too_low',
  'below_ideal',
  'ideal',
  'above_ideal',
  'too_high',
  'unknown'
);

-- Processing type enum
CREATE TYPE public.processing_type AS ENUM ('initial', 'retry');

-- Triggered by enum
CREATE TYPE public.triggered_by AS ENUM ('auto', 'manual');

-- ============================================================================
-- Step 2: Add Columns to Existing Tables
-- ============================================================================

-- Add columns to meetings table
ALTER TABLE public.meetings
  ADD COLUMN meeting_type public.meeting_type DEFAULT 'unknown',
  ADD COLUMN participant_count integer,
  ADD COLUMN user_role public.user_role DEFAULT 'unknown',
  ADD COLUMN user_transcript jsonb,
  ADD COLUMN user_transcript_filename text,
  ADD COLUMN user_transcript_uploaded_at timestamptz,
  ADD COLUMN ai_transcript jsonb,
  ADD COLUMN transcript_metadata jsonb,
  ADD COLUMN recording_captured_at timestamptz,
  ADD COLUMN recording_available_until timestamptz,
  ADD COLUMN recording_filename text,
  ADD COLUMN recording_storage_path text,
  ADD COLUMN recording_size_mb numeric,
  ADD COLUMN recording_duration_seconds integer;

COMMENT ON COLUMN public.meetings.meeting_type IS 'Type of meeting for context-aware analysis';
COMMENT ON COLUMN public.meetings.participant_count IS 'Number of participants in the meeting';
COMMENT ON COLUMN public.meetings.user_role IS 'User role in this meeting';
COMMENT ON COLUMN public.meetings.user_transcript IS 'User-uploaded transcript (if provided)';
COMMENT ON COLUMN public.meetings.ai_transcript IS 'AI-generated transcript from AssemblyAI';
COMMENT ON COLUMN public.meetings.transcript_metadata IS 'Additional transcript metadata (language, confidence, etc.)';
COMMENT ON COLUMN public.meetings.recording_captured_at IS 'When the recording was originally captured';
COMMENT ON COLUMN public.meetings.recording_available_until IS 'When the recording will be automatically deleted';
COMMENT ON COLUMN public.meetings.recording_filename IS 'Original filename of uploaded recording';
COMMENT ON COLUMN public.meetings.recording_storage_path IS 'Supabase Storage path to the recording file';
COMMENT ON COLUMN public.meetings.recording_size_mb IS 'Size of recording file in MB';
COMMENT ON COLUMN public.meetings.recording_duration_seconds IS 'Duration of recording in seconds';

-- Add columns to processing_jobs table
ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS processing_type public.processing_type DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS triggered_by public.triggered_by DEFAULT 'auto';

COMMENT ON COLUMN public.processing_jobs.processing_type IS 'Whether this is initial processing or a retry';
COMMENT ON COLUMN public.processing_jobs.triggered_by IS 'Whether processing was triggered automatically or manually';

-- Add columns to meeting_analysis table
ALTER TABLE public.meeting_analysis
  ADD COLUMN talk_time_status public.talk_time_status DEFAULT 'unknown',
  ADD COLUMN talk_time_vs_expected numeric;

COMMENT ON COLUMN public.meeting_analysis.talk_time_status IS 'How user talk time compares to ideal range for meeting type/role';
COMMENT ON COLUMN public.meeting_analysis.talk_time_vs_expected IS 'Percentage difference from expected talk time (positive = over, negative = under)';

-- ============================================================================
-- Step 3: Remove Columns from processing_jobs (BREAKING CHANGE)
-- ============================================================================
-- CI-BYPASS: destructive-operations
-- Reason: Moving recording metadata to meetings table where it belongs
-- Impact: Removes 6 columns from processing_jobs (user_id, storage_path, original_filename, file_size_mb, duration_seconds, delete_after)
-- Justification: These fields are now in meetings table; processing_jobs should only track job status
-- Data migration: Not needed - these values will be populated in meetings table going forward

-- First, drop RLS policies that depend on user_id column
DROP POLICY IF EXISTS "Users can view their own jobs" ON public.processing_jobs;
DROP POLICY IF EXISTS "Users can create their own jobs" ON public.processing_jobs;
DROP POLICY IF EXISTS "Users can update their own jobs" ON public.processing_jobs;
DROP POLICY IF EXISTS "Users can delete their own jobs" ON public.processing_jobs;

-- Now we can safely drop the columns
ALTER TABLE public.processing_jobs
  DROP COLUMN IF EXISTS user_id,
  DROP COLUMN IF EXISTS storage_path,
  DROP COLUMN IF EXISTS original_filename,
  DROP COLUMN IF EXISTS file_size_mb,
  DROP COLUMN IF EXISTS duration_seconds,
  DROP COLUMN IF EXISTS delete_after;

-- Recreate RLS policies using meeting_id instead
-- Note: Access control now flows through meetings table
CREATE POLICY "Users can view jobs for their meetings"
  ON public.processing_jobs
  FOR SELECT
  USING (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create jobs for their meetings"
  ON public.processing_jobs
  FOR INSERT
  WITH CHECK (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update jobs for their meetings"
  ON public.processing_jobs
  FOR UPDATE
  USING (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete jobs for their meetings"
  ON public.processing_jobs
  FOR DELETE
  USING (
    meeting_id IN (
      SELECT id FROM public.meetings WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- Step 4: Create New Tables
-- ============================================================================

-- User Weekly Rollups Table
CREATE TABLE public.user_weekly_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_start_date date NOT NULL,
  week_end_date date NOT NULL,

  -- Participation metrics
  meetings_count integer NOT NULL DEFAULT 0,
  total_meeting_duration_seconds numeric NOT NULL DEFAULT 0,
  avg_meeting_duration_seconds numeric,

  -- Speaking metrics
  total_talk_time_seconds numeric NOT NULL DEFAULT 0,
  avg_talk_time_percentage numeric,
  median_talk_time_percentage numeric,
  total_words_spoken integer NOT NULL DEFAULT 0,
  avg_words_per_minute numeric,
  median_words_per_minute numeric,

  -- Interaction metrics
  total_times_interrupted integer NOT NULL DEFAULT 0,
  avg_times_interrupted_per_meeting numeric,
  total_times_interrupting integer NOT NULL DEFAULT 0,
  avg_times_interrupting_per_meeting numeric,
  avg_interruption_rate numeric,

  -- Response metrics
  avg_response_latency_seconds numeric,
  median_response_latency_seconds numeric,
  quick_responses_percentage numeric,

  -- Metadata
  calculated_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE(user_id, week_start_date)
);

COMMENT ON TABLE public.user_weekly_rollups IS 'Weekly aggregated performance metrics for dashboard analytics';
COMMENT ON COLUMN public.user_weekly_rollups.week_start_date IS 'Monday of the week (ISO week start)';
COMMENT ON COLUMN public.user_weekly_rollups.week_end_date IS 'Sunday of the week';

CREATE INDEX idx_weekly_rollups_user_date ON public.user_weekly_rollups(user_id, week_start_date DESC);

-- User Baselines Table
CREATE TABLE public.user_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  baseline_type text CHECK (baseline_type IN ('initial', 'current', 'historical_snapshot')) NOT NULL,
  baseline_start_date date NOT NULL,
  baseline_end_date date NOT NULL,
  weeks_included integer NOT NULL,
  meetings_included integer NOT NULL,

  -- Core metrics with mean and std dev
  baseline_talk_time_percentage numeric NOT NULL,
  baseline_talk_time_std_dev numeric,
  baseline_words_per_minute numeric NOT NULL,
  baseline_wpm_std_dev numeric,
  baseline_times_interrupted_per_meeting numeric NOT NULL,
  baseline_interrupted_std_dev numeric,
  baseline_times_interrupting_per_meeting numeric NOT NULL,
  baseline_interrupting_std_dev numeric,
  baseline_interruption_rate numeric NOT NULL,
  baseline_interruption_rate_std_dev numeric,
  baseline_response_latency_seconds numeric,
  baseline_response_latency_std_dev numeric,

  -- Version tracking
  supersedes_baseline_id uuid REFERENCES public.user_baselines(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.user_baselines IS 'User performance baselines for personalized comparisons';
COMMENT ON COLUMN public.user_baselines.baseline_type IS 'initial = first 5-10 meetings, current = rolling 12-week, historical_snapshot = archived baseline';
COMMENT ON COLUMN public.user_baselines.supersedes_baseline_id IS 'Previous baseline that this one replaces (for version history)';
COMMENT ON COLUMN public.user_baselines.is_active IS 'Only one baseline of each type can be active per user';

CREATE UNIQUE INDEX idx_user_baselines_active ON public.user_baselines(user_id, baseline_type) WHERE is_active = true;
CREATE INDEX idx_user_baselines_user ON public.user_baselines(user_id);

-- Meeting Type Benchmarks Table
CREATE TABLE public.meeting_type_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_type text NOT NULL,
  user_role text NOT NULL,
  participant_count_min integer,
  participant_count_max integer,

  ideal_talk_time_min numeric NOT NULL,
  ideal_talk_time_max numeric NOT NULL,
  typical_talk_time_mean numeric NOT NULL,
  typical_talk_time_std_dev numeric,
  guidance_text text,

  created_at timestamptz DEFAULT now(),
  UNIQUE(meeting_type, user_role, participant_count_min, participant_count_max)
);

COMMENT ON TABLE public.meeting_type_benchmarks IS 'Industry benchmarks for expected talk time by meeting type and role';
COMMENT ON COLUMN public.meeting_type_benchmarks.ideal_talk_time_min IS 'Lower bound of ideal talk time percentage';
COMMENT ON COLUMN public.meeting_type_benchmarks.ideal_talk_time_max IS 'Upper bound of ideal talk time percentage';
COMMENT ON COLUMN public.meeting_type_benchmarks.guidance_text IS 'Human-readable guidance for this scenario';

-- ============================================================================
-- Step 5: Seed Benchmark Data
-- ============================================================================

INSERT INTO public.meeting_type_benchmarks
  (meeting_type, user_role, participant_count_min, participant_count_max, ideal_talk_time_min, ideal_talk_time_max, typical_talk_time_mean, guidance_text)
VALUES
  ('one_on_one', 'participant', 2, 2, 40, 60, 50, 'In 1:1 meetings, aim for balanced conversation around 50/50'),
  ('small_group', 'participant', 3, 5, 15, 35, 25, 'In small groups of 3-5, expect to speak 20-30% of the time'),
  ('small_group', 'facilitator', 3, 5, 30, 50, 40, 'As facilitator, guide discussion while ensuring others contribute'),
  ('presentation', 'presenter', 2, 10, 60, 85, 75, 'As presenter, you should drive most of the conversation'),
  ('presentation', 'participant', 2, 10, 5, 25, 15, 'As audience member, listen actively and ask clarifying questions'),
  ('interview', 'interviewer', 2, 2, 20, 40, 30, 'As interviewer, ask questions but let candidate speak'),
  ('interview', 'interviewee', 2, 2, 60, 80, 70, 'As interviewee, speak clearly about your experience'),
  ('large_group', 'participant', 6, 999, 5, 20, 10, 'In large meetings, focus on high-value contributions'),
  ('large_group', 'facilitator', 6, 999, 25, 45, 35, 'As facilitator, guide discussion and ensure diverse participation');

-- ============================================================================
-- Step 6: Create Helper Functions
-- ============================================================================

-- Calculate weekly rollup for a user
CREATE OR REPLACE FUNCTION public.calculate_user_weekly_rollup(
  p_user_id uuid,
  p_week_start date
)
RETURNS uuid AS $$
DECLARE
  v_rollup_id uuid;
  v_week_end date;
BEGIN
  v_week_end := p_week_start + INTERVAL '6 days';

  INSERT INTO public.user_weekly_rollups (
    user_id, week_start_date, week_end_date,
    meetings_count, total_meeting_duration_seconds, avg_meeting_duration_seconds,
    total_talk_time_seconds, avg_talk_time_percentage, median_talk_time_percentage,
    total_words_spoken, avg_words_per_minute, median_words_per_minute,
    total_times_interrupted, avg_times_interrupted_per_meeting,
    total_times_interrupting, avg_times_interrupting_per_meeting, avg_interruption_rate,
    avg_response_latency_seconds, median_response_latency_seconds, quick_responses_percentage
  )
  SELECT
    p_user_id, p_week_start, v_week_end,
    COUNT(DISTINCT ma.meeting_id),
    SUM(EXTRACT(EPOCH FROM (m.end_time - m.start_time))),
    AVG(EXTRACT(EPOCH FROM (m.end_time - m.start_time))),
    SUM(ma.talk_time_seconds),
    AVG(ma.talk_time_percentage),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ma.talk_time_percentage),
    SUM(ma.word_count),
    AVG(ma.words_per_minute),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ma.words_per_minute),
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
    AND ma.assigned_user_id IS NOT NULL
  ON CONFLICT (user_id, week_start_date)
  DO UPDATE SET
    meetings_count = EXCLUDED.meetings_count,
    total_meeting_duration_seconds = EXCLUDED.total_meeting_duration_seconds,
    avg_meeting_duration_seconds = EXCLUDED.avg_meeting_duration_seconds,
    total_talk_time_seconds = EXCLUDED.total_talk_time_seconds,
    avg_talk_time_percentage = EXCLUDED.avg_talk_time_percentage,
    median_talk_time_percentage = EXCLUDED.median_talk_time_percentage,
    total_words_spoken = EXCLUDED.total_words_spoken,
    avg_words_per_minute = EXCLUDED.avg_words_per_minute,
    median_words_per_minute = EXCLUDED.median_words_per_minute,
    total_times_interrupted = EXCLUDED.total_times_interrupted,
    avg_times_interrupted_per_meeting = EXCLUDED.avg_times_interrupted_per_meeting,
    total_times_interrupting = EXCLUDED.total_times_interrupting,
    avg_times_interrupting_per_meeting = EXCLUDED.avg_times_interrupting_per_meeting,
    avg_interruption_rate = EXCLUDED.avg_interruption_rate,
    avg_response_latency_seconds = EXCLUDED.avg_response_latency_seconds,
    median_response_latency_seconds = EXCLUDED.median_response_latency_seconds,
    quick_responses_percentage = EXCLUDED.quick_responses_percentage,
    updated_at = NOW()
  RETURNING id INTO v_rollup_id;

  RETURN v_rollup_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.calculate_user_weekly_rollup IS 'Calculate or update weekly rollup metrics for a user (called by cron job)';

-- Calculate initial baseline (captured once after first 5-10 meetings)
CREATE OR REPLACE FUNCTION public.calculate_initial_baseline(p_user_id uuid)
RETURNS uuid AS $$
DECLARE
  v_baseline_id uuid;
  v_meeting_count integer;
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
    MIN(m.start_time::date),
    MAX(m.start_time::date),
    EXTRACT(WEEK FROM AGE(MAX(m.start_time), MIN(m.start_time)))::integer,
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

COMMENT ON FUNCTION public.calculate_initial_baseline IS 'Create initial baseline after user has 5+ meetings';

-- Update rolling current baseline (12-week window)
CREATE OR REPLACE FUNCTION public.update_current_baseline(p_user_id uuid)
RETURNS uuid AS $$
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
    user_id, baseline_type, baseline_start_date, baseline_end_date,
    weeks_included, meetings_included,
    baseline_talk_time_percentage, baseline_talk_time_std_dev,
    baseline_words_per_minute, baseline_wpm_std_dev,
    baseline_times_interrupted_per_meeting, baseline_interrupted_std_dev,
    baseline_times_interrupting_per_meeting, baseline_interrupting_std_dev,
    baseline_interruption_rate, baseline_interruption_rate_std_dev,
    baseline_response_latency_seconds, baseline_response_latency_std_dev,
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
    v_previous_baseline_id
  FROM public.meeting_analysis ma
  JOIN public.meetings m ON ma.meeting_id = m.id
  WHERE ma.assigned_user_id = p_user_id
    AND m.start_time >= v_twelve_weeks_ago
  HAVING COUNT(DISTINCT ma.meeting_id) > 0
  RETURNING id INTO v_new_baseline_id;

  RETURN v_new_baseline_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.update_current_baseline IS 'Update rolling 12-week current baseline (called by cron job)';

-- ============================================================================
-- Step 7: Enable RLS and Create Policies
-- ============================================================================

-- Enable RLS for new tables
ALTER TABLE public.user_weekly_rollups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_type_benchmarks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_weekly_rollups
CREATE POLICY "Users can view their own weekly rollups"
  ON public.user_weekly_rollups
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role can manage weekly rollups"
  ON public.user_weekly_rollups
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for user_baselines
CREATE POLICY "Users can view their own baselines"
  ON public.user_baselines
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role can manage baselines"
  ON public.user_baselines
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policies for meeting_type_benchmarks
CREATE POLICY "All authenticated users can view benchmarks"
  ON public.meeting_type_benchmarks
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================================
-- Step 8: Add Performance Indexes
-- ============================================================================

-- Meetings indexes
CREATE INDEX idx_meetings_meeting_type ON public.meetings(meeting_type) WHERE meeting_type IS NOT NULL;
CREATE INDEX idx_meetings_user_start_time ON public.meetings(user_id, start_time DESC);
CREATE INDEX idx_meetings_recording_cleanup ON public.meetings(recording_available_until) WHERE recording_available_until IS NOT NULL;

-- Meeting analysis indexes (enhanced)
CREATE INDEX idx_meeting_analysis_assigned_created
  ON public.meeting_analysis(assigned_user_id, created_at DESC)
  WHERE assigned_user_id IS NOT NULL;

-- Processing jobs indexes (upgrade existing index with WHERE clause)
DROP INDEX IF EXISTS public.idx_processing_jobs_meeting_id;
CREATE INDEX idx_processing_jobs_meeting_id ON public.processing_jobs(meeting_id) WHERE meeting_id IS NOT NULL;

-- ============================================================================
-- Step 9: Create Trigger to Auto-Create Processing Jobs
-- ============================================================================

-- Function to automatically create processing job when meeting has recording
CREATE OR REPLACE FUNCTION public.auto_create_processing_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create processing job if meeting has recording storage path
  IF NEW.recording_storage_path IS NOT NULL THEN
    -- Check if processing job already exists for this meeting
    IF NOT EXISTS (
      SELECT 1 FROM public.processing_jobs WHERE meeting_id = NEW.id
    ) THEN
      -- Create processing job with generated ID
      INSERT INTO public.processing_jobs (
        id,
        meeting_id,
        status
      ) VALUES (
        gen_random_uuid(),
        NEW.id,
        'pending'
      );

      RAISE LOG 'Auto-created processing job for meeting %', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.auto_create_processing_job IS 'Automatically creates processing job when meeting has recording storage path';

-- Create trigger on meetings table
DROP TRIGGER IF EXISTS on_meeting_recording_added ON public.meetings;
CREATE TRIGGER on_meeting_recording_added
  AFTER INSERT OR UPDATE OF recording_storage_path ON public.meetings
  FOR EACH ROW
  WHEN (NEW.recording_storage_path IS NOT NULL)
  EXECUTE FUNCTION public.auto_create_processing_job();

COMMENT ON TRIGGER on_meeting_recording_added ON public.meetings IS 'Creates processing job automatically when recording is added to meeting';

COMMIT;
