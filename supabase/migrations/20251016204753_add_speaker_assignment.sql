-- Add speaker_assignment column to meeting_analysis table
-- This column stores mappings between speaker labels (e.g., "Speaker A") and user identities

ALTER TABLE public.meeting_analysis
ADD COLUMN speaker_assignment jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.meeting_analysis.speaker_assignment IS 'Maps speaker labels to user identities. Format: {"Speaker A": "user_id", "Speaker B": null, ...}';

-- Create index for faster queries on speaker assignments
CREATE INDEX idx_meeting_analysis_speaker_assignment ON public.meeting_analysis USING gin (speaker_assignment);
