-- Migration: Add 'microsoft' as a valid calendar provider
-- Created: 2025-10-27
-- Purpose: Extend calendar_provider constraint to support Microsoft Calendar integration
--
-- Changes:
-- - Drops existing check constraint on meetings.calendar_provider
-- - Adds new constraint allowing: 'google', 'microsoft', 'manual'
--
-- Rollback:
-- To revert this change, run:
-- ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_calendar_provider_check;
-- ALTER TABLE public.meetings ADD CONSTRAINT meetings_calendar_provider_check
--   CHECK (calendar_provider = ANY (ARRAY['google'::text, 'manual'::text]));

BEGIN;

-- Drop existing constraint
ALTER TABLE public.meetings
DROP CONSTRAINT IF EXISTS meetings_calendar_provider_check;

-- Add new constraint with microsoft included
ALTER TABLE public.meetings
ADD CONSTRAINT meetings_calendar_provider_check
  CHECK (calendar_provider = ANY (ARRAY['google'::text, 'microsoft'::text, 'manual'::text]));

COMMIT;
