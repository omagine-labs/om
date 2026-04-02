-- Remove calendar sync and soft-delete related columns from meetings table
-- These are no longer needed since:
-- 1. Calendar sync has been removed from the web app
-- 2. All meeting deletes are now hard deletes
-- 3. Desktop app doesn't send calendar event IDs

-- CI-BYPASS: destructive-operations
-- Justification: Removing unused columns after calendar sync feature removal

-- Step 1: Drop indexes
DROP INDEX IF EXISTS idx_meetings_deleted_at;
DROP INDEX IF EXISTS idx_meetings_calendar_event;

-- Step 2: Drop the unique constraint that includes calendar_event_id
ALTER TABLE public.meetings
DROP CONSTRAINT IF EXISTS meetings_user_id_calendar_event_id_calendar_provider_key;

-- Step 3: Drop the columns
-- Note: We keep 'attendees' column as it's useful for showing metadata when linking
ALTER TABLE public.meetings
DROP COLUMN IF EXISTS deleted_at,
DROP COLUMN IF EXISTS calendar_event_id,
DROP COLUMN IF EXISTS recurring_event_id,
DROP COLUMN IF EXISTS calendar_provider;

-- Note: We keep meeting_link as it's populated by desktop app from detected meeting URLs
