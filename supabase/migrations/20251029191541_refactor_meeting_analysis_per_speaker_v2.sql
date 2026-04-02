-- CI-BYPASS: destructive-operations
-- Reason: Intentional schema refactor from one-record-per-meeting to one-record-per-speaker
-- Impact: Drops existing meeting_analysis table and all data
-- Justification: Pre-launch, no production data to preserve
-- Confirmed on: 2025-10-30
--
-- Refactor meeting_analysis to one-record-per-speaker architecture (v2)
-- This re-applies the changes that were previously rolled back
-- Breaking change: Drops old table and creates new structure
-- Old analyses will not be migrated

BEGIN;

-- ============================================================================
-- Step 1: Drop old meeting_analysis table and related objects
-- ============================================================================

-- Drop RLS policies
DROP POLICY IF EXISTS "Users can view their own analysis" ON public.meeting_analysis;
DROP POLICY IF EXISTS "Users can create their own analysis" ON public.meeting_analysis;
DROP POLICY IF EXISTS "Users can delete their own analysis" ON public.meeting_analysis;
DROP POLICY IF EXISTS "Users can update their own analysis" ON public.meeting_analysis;

-- Drop indexes
DROP INDEX IF EXISTS idx_meeting_analysis_job_id;
DROP INDEX IF EXISTS idx_meeting_analysis_user_id;
DROP INDEX IF EXISTS idx_meeting_analysis_speaker_assignment;

-- Drop the table (CASCADE removes foreign key dependencies)
DROP TABLE IF EXISTS public.meeting_analysis CASCADE;

-- ============================================================================
-- Step 2: Create new meeting_analysis table (one record per speaker)
-- ============================================================================

CREATE TABLE public.meeting_analysis (
    -- Primary key
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    job_id uuid NOT NULL REFERENCES public.processing_jobs(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,

    -- Speaker identification
    speaker_label text NOT NULL, -- "Speaker A", "Speaker B", etc.
    assigned_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    custom_speaker_name text, -- Optional custom name if not assigned to a user

    -- Summary (kept for potential future use, but currently null)
    summary text,

    -- Transcript segments (only for this speaker)
    transcript_segments jsonb,

    -- Flat speaker metric columns (no JSONB parsing needed)
    talk_time_seconds numeric NOT NULL CHECK (talk_time_seconds >= 0),
    talk_time_percentage numeric NOT NULL CHECK (talk_time_percentage >= 0 AND talk_time_percentage <= 100),
    word_count integer NOT NULL CHECK (word_count >= 0),
    words_per_minute numeric CHECK (words_per_minute >= 0),
    segments_count integer NOT NULL CHECK (segments_count >= 0),

    -- Response metrics
    avg_response_latency_seconds numeric CHECK (avg_response_latency_seconds >= 0),
    response_count integer CHECK (response_count >= 0),
    quick_responses_percentage numeric CHECK (quick_responses_percentage >= 0 AND quick_responses_percentage <= 100),

    -- Interruption metrics
    times_interrupted integer CHECK (times_interrupted >= 0),
    times_interrupting integer CHECK (times_interrupting >= 0),
    interruption_rate numeric CHECK (interruption_rate >= 0),

    -- Communication tips (JSONB array of strings)
    communication_tips jsonb DEFAULT '[]'::jsonb,

    -- Behavioral insights (optional, for future video analysis)
    behavioral_insights jsonb,

    -- Timestamps
    created_at timestamptz DEFAULT now(),

    -- Ensure one record per speaker per job
    UNIQUE(job_id, speaker_label)
);

COMMENT ON TABLE public.meeting_analysis IS 'AI-generated speaker analysis - one record per speaker per meeting';
COMMENT ON COLUMN public.meeting_analysis.speaker_label IS 'Speaker identifier from transcription (e.g., "Speaker A")';
COMMENT ON COLUMN public.meeting_analysis.assigned_user_id IS 'User this speaker is assigned to (null until assigned)';
COMMENT ON COLUMN public.meeting_analysis.custom_speaker_name IS 'Custom name for speaker if not assigned to a registered user';
COMMENT ON COLUMN public.meeting_analysis.transcript_segments IS 'Transcript segments for this speaker only';
COMMENT ON COLUMN public.meeting_analysis.communication_tips IS 'AI-generated communication tips for this speaker';

-- ============================================================================
-- Step 3: Create indexes for fast queries
-- ============================================================================

-- Fast lookups for weekly dashboard (time-series queries on assigned speakers)
CREATE INDEX idx_meeting_analysis_assigned_user_created
ON public.meeting_analysis(assigned_user_id, created_at DESC)
WHERE assigned_user_id IS NOT NULL;

-- Fast lookups for assignment UI (all speakers in a meeting)
CREATE INDEX idx_meeting_analysis_job_id ON public.meeting_analysis(job_id);

-- Fast lookups for uploader's meeting list
CREATE INDEX idx_meeting_analysis_created_by ON public.meeting_analysis(created_by);

-- Fast lookups by meeting (if linked to calendar)
CREATE INDEX idx_meeting_analysis_meeting_id ON public.meeting_analysis(meeting_id)
WHERE meeting_id IS NOT NULL;

-- GIN index for communication tips (for potential text search)
CREATE INDEX idx_meeting_analysis_communication_tips
ON public.meeting_analysis USING gin (communication_tips);

-- ============================================================================
-- Step 4: Enable Row Level Security
-- ============================================================================

ALTER TABLE public.meeting_analysis ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Step 5: Create RLS Policies
-- ============================================================================

-- Users can view analyses where they are:
-- 1. The uploader (created_by = auth.uid())
-- 2. Assigned as the speaker (assigned_user_id = auth.uid())
CREATE POLICY "Users can view own or assigned analyses"
ON public.meeting_analysis
FOR SELECT
USING (
    created_by = auth.uid()
    OR assigned_user_id = auth.uid()
);

-- Only the uploader can create analysis records (Python backend uses service role)
CREATE POLICY "Users can create their own analysis"
ON public.meeting_analysis
FOR INSERT
WITH CHECK (created_by = auth.uid());

-- Only the uploader can update analysis records (for speaker assignment)
CREATE POLICY "Users can update their own analysis"
ON public.meeting_analysis
FOR UPDATE
USING (created_by = auth.uid());

-- Only the uploader can delete analysis records
CREATE POLICY "Users can delete their own analysis"
ON public.meeting_analysis
FOR DELETE
USING (created_by = auth.uid());

COMMIT;
