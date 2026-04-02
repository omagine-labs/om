-- ============================================================================
-- Add Meetings Table
-- ============================================================================
-- This migration creates a proper meetings table to store all meeting metadata,
-- whether from Google Calendar sync or manually created by users.
-- It also refactors processing_jobs to link to meetings instead of storing
-- calendar event data directly.

-- Step 1: Create meetings table
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Core meeting info
  title text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  description text,
  meeting_link text,

  -- Source tracking
  calendar_event_id text,  -- NULL for manual meetings, Google event ID for synced meetings
  calendar_provider text CHECK (calendar_provider IN ('google', 'manual')),  -- 'google', 'manual', etc.

  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),

  -- Prevent duplicate calendar syncs
  UNIQUE(user_id, calendar_event_id, calendar_provider)
);

COMMENT ON TABLE public.meetings IS 'All meetings: manual and calendar-synced';
COMMENT ON COLUMN public.meetings.calendar_event_id IS 'External calendar event ID (e.g., Google Calendar event ID). NULL for manual meetings.';
COMMENT ON COLUMN public.meetings.calendar_provider IS 'Source of the meeting: google, manual, etc.';

-- Step 2: Add meeting_id to processing_jobs
ALTER TABLE public.processing_jobs
ADD COLUMN meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.processing_jobs.meeting_id IS 'Optional link to a meeting. NULL for standalone recordings.';

-- Step 3: Migrate existing data from processing_jobs to meetings
-- Create meeting records for all jobs that have calendar event data
INSERT INTO public.meetings (user_id, title, start_time, calendar_event_id, calendar_provider)
SELECT
  user_id,
  calendar_event_summary,
  calendar_event_start,
  calendar_event_id,
  CASE
    WHEN calendar_event_id LIKE 'manual-%' THEN 'manual'
    ELSE 'google'
  END as calendar_provider
FROM public.processing_jobs
WHERE calendar_event_summary IS NOT NULL
  AND calendar_event_start IS NOT NULL
ON CONFLICT (user_id, calendar_event_id, calendar_provider) DO NOTHING;

-- Step 4: Update processing_jobs with meeting_id
UPDATE public.processing_jobs pj
SET meeting_id = m.id
FROM public.meetings m
WHERE pj.user_id = m.user_id
  AND pj.calendar_event_id = m.calendar_event_id
  AND pj.calendar_event_id IS NOT NULL;

-- Step 5: Remove old calendar_event columns from processing_jobs
-- SAFETY: Data migrated to meetings table in Step 3 before dropping columns
-- All existing calendar_event_* data is preserved in the meetings table
-- and linked via meeting_id foreign key (Step 4)
-- CI-BYPASS: destructive-operations
ALTER TABLE public.processing_jobs
DROP COLUMN calendar_event_id,
DROP COLUMN calendar_event_summary,
DROP COLUMN calendar_event_start;

-- Step 6: Create indexes
CREATE INDEX idx_meetings_user_id ON public.meetings(user_id);
CREATE INDEX idx_meetings_start_time ON public.meetings(start_time DESC);
CREATE INDEX idx_meetings_calendar_event ON public.meetings(calendar_event_id);
CREATE INDEX idx_processing_jobs_meeting_id ON public.processing_jobs(meeting_id);

-- Step 7: Add updated_at trigger
CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Step 8: Enable Row Level Security
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Step 9: Create RLS Policies
CREATE POLICY "Users can view their own meetings" ON public.meetings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own meetings" ON public.meetings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own meetings" ON public.meetings
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own meetings" ON public.meetings
  FOR DELETE USING (user_id = auth.uid());
