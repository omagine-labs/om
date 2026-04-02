-- Add attendees and recurring event tracking to meetings table
-- This migration adds metadata for calendar event attendees and recurring event tracking

-- Add attendees column to store calendar event participants
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS attendees jsonb;

COMMENT ON COLUMN meetings.attendees IS 'Calendar event attendees: [{email, displayName, isOrganizer}]. Useful for speaker identification.';

-- Add recurring event ID column to link recurring meeting instances
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS recurring_event_id text;

COMMENT ON COLUMN meetings.recurring_event_id IS 'ID linking recurring meeting instances together from calendar providers';
