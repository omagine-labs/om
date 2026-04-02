-- ============================================================================
-- Weekly Dashboard Test Data Seed Script
-- ============================================================================
-- Generates 8-12 weeks of realistic meeting data for testing the weekly
-- performance dashboard.
--
-- Usage:
--   1. Set your test user email below in the configuration section
--   2. Run via Supabase CLI (local):
--      psql -h localhost -p 54322 -U postgres -d postgres -f scripts/seed-weekly-dashboard-data.sql
--   3. To clean up test data, run: SELECT cleanup_test_data('your-email@example.com');
--
-- This script will:
--   - Generate 8-12 weeks of meeting data
--   - Create 2-5 meetings per week with realistic metrics
--   - Populate meeting_analysis with speaker data
--   - Call database functions to calculate rollups and baselines
-- ============================================================================

-- ============================================================================
-- CONFIGURATION
-- ============================================================================
DO $$
DECLARE
  -- !!! CHANGE THIS TO YOUR TEST USER EMAIL !!!
  v_test_user_email text := 'user@example.com';

  v_user_id uuid;
  v_weeks_to_generate integer;
  v_start_week date;
  v_current_week date;
  v_meeting_id uuid;
  v_job_id uuid;
  v_analysis_id uuid;
  v_meetings_this_week integer;
  v_week_counter integer;
  v_meeting_counter integer;

  -- Realistic metric ranges
  v_talk_time numeric;
  v_wpm numeric;
  v_interruption_rate numeric;
  v_meeting_duration_mins integer;
  v_word_count integer;
  v_times_interrupted integer;
  v_times_interrupting integer;
  v_filler_words_total integer;
  v_response_count integer;
  v_verbosity numeric;
  v_talk_time_vs_expected numeric;
  v_filler_words_per_minute numeric;
  v_segments_count integer;
  v_turn_taking_balance numeric;
  v_clarity_score integer;
  v_confidence_score integer;
  v_collaboration_score integer;
  v_attunement_score integer;

BEGIN
  -- ============================================================================
  -- Step 1: Validate User Exists
  -- ============================================================================
  RAISE NOTICE 'Looking up user with email: %', v_test_user_email;

  SELECT id INTO v_user_id FROM auth.users WHERE email = v_test_user_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found. Please create the user first or update v_test_user_email.', v_test_user_email;
  END IF;

  RAISE NOTICE 'Found user ID: %', v_user_id;

  -- ============================================================================
  -- Step 2: Clean Up Existing Test Data
  -- ============================================================================
  RAISE NOTICE 'Cleaning up existing test data...';

  -- Delete in correct order due to foreign key constraints
  DELETE FROM public.user_weekly_rollups WHERE user_id = v_user_id;
  DELETE FROM public.user_baselines WHERE user_id = v_user_id;
  DELETE FROM public.meeting_analysis WHERE assigned_user_id = v_user_id;
  DELETE FROM public.processing_jobs WHERE meeting_id IN (
    SELECT id FROM public.meetings WHERE user_id = v_user_id
  );
  DELETE FROM public.meetings WHERE user_id = v_user_id;

  RAISE NOTICE 'Cleanup complete.';

  -- ============================================================================
  -- Step 3: Generate Meeting Data
  -- ============================================================================

  -- Start from 12 weeks ago to ensure we have full baseline window
  v_start_week := date_trunc('week', CURRENT_DATE - INTERVAL '12 weeks')::date;

  -- Calculate weeks from start to current week (inclusive)
  -- This ensures we always generate data up to the current week
  v_weeks_to_generate := CEIL((CURRENT_DATE - v_start_week) / 7.0)::integer + 1;

  RAISE NOTICE 'Generating % weeks of meeting data (from % to current week)...', v_weeks_to_generate, v_start_week;

  v_current_week := v_start_week;

  FOR v_week_counter IN 1..v_weeks_to_generate LOOP
    -- Random number of meetings per week (2-5)
    v_meetings_this_week := floor(random() * 4 + 2)::integer;

    RAISE NOTICE 'Week % (starting %): generating % meetings', v_week_counter, v_current_week, v_meetings_this_week;

    FOR v_meeting_counter IN 1..v_meetings_this_week LOOP
      -- Generate realistic metrics with natural variance
      v_talk_time := 20 + (random() * 40); -- 20-60%
      v_wpm := 120 + (random() * 60); -- 120-180 WPM
      v_interruption_rate := random() * 15; -- 0-15%
      v_meeting_duration_mins := floor(random() * 45 + 15)::integer; -- 15-60 mins

      -- Calculate derived metrics
      v_word_count := floor((v_meeting_duration_mins * v_wpm * (v_talk_time / 100)))::integer;
      v_times_interrupted := floor((v_interruption_rate / 100) * (v_meeting_duration_mins / 5))::integer; -- ~1 interruption per 5 mins at 20% rate
      v_times_interrupting := floor(v_times_interrupted * (random() * 0.5 + 0.5))::integer; -- Similar to being interrupted
      v_filler_words_total := floor(v_word_count * (random() * 0.05 + 0.01))::integer; -- 1-6% of words are filler words
      v_response_count := floor(v_meeting_duration_mins / 2 + random() * 5)::integer; -- ~1 response per 2 mins with variance
      v_segments_count := floor(random() * 20 + 10)::integer; -- 10-30 segments
      v_verbosity := 50 + (random() * 200); -- 50-250 words per segment (range 0-300)
      v_talk_time_vs_expected := (random() * 40) - 20; -- -20% to +20% vs expected
      v_filler_words_per_minute := v_filler_words_total / NULLIF((v_meeting_duration_mins * (v_talk_time / 100)), 0); -- Calculate rate
      v_turn_taking_balance := (random() * 40) - 20; -- -20 to +20 (balanced around 0)

      -- Generate agentic scores (1-10 range with realistic variance)
      v_clarity_score := floor(random() * 3 + 7)::integer; -- 7-10 (generally good)
      v_confidence_score := floor(random() * 3 + 7)::integer; -- 7-10
      v_collaboration_score := floor(random() * 3 + 7)::integer; -- 7-10
      v_attunement_score := floor(random() * 3 + 7)::integer; -- 7-10

      -- Create meeting record
      -- Spread meetings across the week (Monday = 0, Sunday = 6)
      v_meeting_id := gen_random_uuid();
      v_job_id := gen_random_uuid();

      INSERT INTO public.meetings (
        id,
        user_id,
        title,
        start_time,
        end_time,
        meeting_type,
        participant_count,
        user_role,
        audio_storage_path,
        created_at
      ) VALUES (
        v_meeting_id,
        v_user_id,
        'Test Meeting ' || v_week_counter || '.' || v_meeting_counter,
        v_current_week + (random() * 6)::integer + (random() * INTERVAL '8 hours'), -- Random day & time during work hours
        v_current_week + (random() * 6)::integer + (random() * INTERVAL '8 hours') + (v_meeting_duration_mins || ' minutes')::interval,
        'small_group',
        floor(random() * 3 + 3)::integer, -- 3-5 participants
        'participant',
        'test-data/' || v_meeting_id::text || '.mp4',
        NOW()
      );

      -- Create processing job (trigger will auto-create, but we'll create it manually with completed status)
      -- First, check if trigger already created it
      SELECT id INTO v_job_id FROM public.processing_jobs WHERE meeting_id = v_meeting_id;

      IF v_job_id IS NULL THEN
        v_job_id := gen_random_uuid();
        INSERT INTO public.processing_jobs (
          id,
          meeting_id,
          status
        ) VALUES (
          v_job_id,
          v_meeting_id,
          'completed'
        );
      ELSE
        -- Update existing job to completed
        UPDATE public.processing_jobs
        SET status = 'completed'
        WHERE id = v_job_id;
      END IF;

      -- Create meeting analysis record
      v_analysis_id := gen_random_uuid();

      INSERT INTO public.meeting_analysis (
        id,
        job_id,
        created_by,
        meeting_id,
        assigned_user_id,
        speaker_label,
        talk_time_seconds,
        talk_time_percentage,
        word_count,
        words_per_minute,
        segments_count,
        times_interrupted,
        times_interrupting,
        interruption_rate,
        avg_response_latency_seconds,
        quick_responses_percentage,
        response_count,
        talk_time_status,
        talk_time_vs_expected,
        filler_words_total,
        filler_words_breakdown,
        filler_words_per_minute,
        verbosity,
        turn_taking_balance,
        clarity_score,
        confidence_score,
        collaboration_score,
        attunement_score,
        summary,
        behavioral_insights,
        communication_tips,
        transcript_segments,
        created_at
      ) VALUES (
        v_analysis_id,
        v_job_id,
        v_user_id, -- User who created this analysis
        v_meeting_id,
        v_user_id, -- Also assigned to this user
        'Speaker A', -- User is Speaker A
        floor((v_meeting_duration_mins * 60 * (v_talk_time / 100)))::numeric,
        v_talk_time,
        v_word_count,
        v_wpm,
        v_segments_count,
        v_times_interrupted,
        v_times_interrupting,
        v_interruption_rate,
        random() * 2 + 0.5, -- 0.5-2.5 seconds response latency
        60 + (random() * 30), -- 60-90% quick responses
        v_response_count,
        'ideal',
        v_talk_time_vs_expected,
        v_filler_words_total,
        jsonb_build_object(
          'um', floor(v_filler_words_total * 0.3),
          'uh', floor(v_filler_words_total * 0.25),
          'like', floor(v_filler_words_total * 0.2),
          'you know', floor(v_filler_words_total * 0.15),
          'so', floor(v_filler_words_total * 0.1)
        ),
        v_filler_words_per_minute,
        v_verbosity,
        v_turn_taking_balance,
        v_clarity_score,
        v_confidence_score,
        v_collaboration_score,
        v_attunement_score,
        'This is a test meeting summary for Meeting ' || v_week_counter || '.' || v_meeting_counter || '. The discussion covered various topics with good engagement from all participants.',
        jsonb_build_array(
          jsonb_build_object(
            'category', 'communication_style',
            'insight', 'Maintains balanced talk time with clear and concise communication',
            'sentiment', 'positive'
          ),
          jsonb_build_object(
            'category', 'engagement',
            'insight', 'Active participant with good response timing',
            'sentiment', 'positive'
          )
        ),
        jsonb_build_array(
          'Continue maintaining balanced talk time to ensure all voices are heard',
          'Keep response latency low to show active engagement',
          'Consider reducing filler words for more concise communication'
        ),
        jsonb_build_array(
          jsonb_build_object(
            'speaker', 'Speaker A',
            'start_time', 0.0,
            'end_time', 5.5,
            'text', 'Sample transcript segment for testing purposes.',
            'confidence', 0.95
          )
        ),
        NOW()
      );

    END LOOP;

    -- Move to next week
    v_current_week := v_current_week + INTERVAL '1 week';

  END LOOP;

  -- ============================================================================
  -- Step 4: Calculate Weekly Rollups
  -- ============================================================================
  RAISE NOTICE 'Calculating weekly rollups for all weeks...';

  -- Reset to start week and calculate rollups for each week
  v_current_week := v_start_week;
  FOR v_week_counter IN 1..v_weeks_to_generate LOOP
    PERFORM public.calculate_user_weekly_rollup(v_user_id, v_current_week);
    v_current_week := v_current_week + INTERVAL '1 week';
  END LOOP;

  -- ============================================================================
  -- Step 5: Calculate Baselines
  -- ============================================================================
  RAISE NOTICE 'Calculating baselines...';
  PERFORM public.calculate_initial_baseline(v_user_id);
  PERFORM public.update_current_baseline(v_user_id);

  -- ============================================================================
  -- Step 6: Summary
  -- ============================================================================
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Test Data Generation Complete!';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'User ID: %', v_user_id;
  RAISE NOTICE 'Weeks generated: %', v_weeks_to_generate;
  RAISE NOTICE 'Total meetings: %', (SELECT COUNT(*) FROM public.meetings WHERE user_id = v_user_id);
  RAISE NOTICE 'Weekly rollups: %', (SELECT COUNT(*) FROM public.user_weekly_rollups WHERE user_id = v_user_id);
  RAISE NOTICE 'Baselines created: %', (SELECT COUNT(*) FROM public.user_baselines WHERE user_id = v_user_id);
  RAISE NOTICE '';
  RAISE NOTICE 'To clean up test data, run:';
  RAISE NOTICE '  SELECT cleanup_test_data(''%'');', v_test_user_email;
  RAISE NOTICE '==========================================';

END $$;

-- ============================================================================
-- Cleanup Function
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_test_data(p_user_email text)
RETURNS void AS $$
DECLARE
  v_user_id uuid;
  v_deleted_meetings integer;
BEGIN
  -- Get user ID
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_user_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', p_user_email;
  END IF;

  -- Delete in correct order
  DELETE FROM public.user_weekly_rollups WHERE user_id = v_user_id;
  DELETE FROM public.user_baselines WHERE user_id = v_user_id;
  DELETE FROM public.meeting_analysis WHERE assigned_user_id = v_user_id;
  DELETE FROM public.processing_jobs WHERE meeting_id IN (
    SELECT id FROM public.meetings WHERE user_id = v_user_id
  );

  -- Count meetings before deleting
  SELECT COUNT(*) INTO v_deleted_meetings FROM public.meetings WHERE user_id = v_user_id;

  DELETE FROM public.meetings WHERE user_id = v_user_id;

  RAISE NOTICE 'Cleanup complete for user %', p_user_email;
  RAISE NOTICE 'Deleted % meetings and all associated data', v_deleted_meetings;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_test_data IS 'Remove all test meeting data for a specific user';
