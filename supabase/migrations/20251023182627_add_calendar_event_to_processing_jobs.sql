-- Add calendar event linking columns to processing_jobs table
ALTER TABLE public.processing_jobs
ADD COLUMN calendar_event_id text,
ADD COLUMN calendar_event_summary text,
ADD COLUMN calendar_event_start timestamptz;

-- Add comments to document the columns
COMMENT ON COLUMN public.processing_jobs.calendar_event_id IS 'Google Calendar event ID if linked';
COMMENT ON COLUMN public.processing_jobs.calendar_event_summary IS 'Calendar event title/summary';
COMMENT ON COLUMN public.processing_jobs.calendar_event_start IS 'Calendar event start time';
