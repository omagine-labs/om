-- Remove deprecated game tables after games table consolidation
-- PowerPoint Karaoke games now live entirely in the `games` table
-- This migration cleans up the old meetings-based approach
--
-- CI-BYPASS: destructive-operations
-- Justification: Intentional cleanup of deprecated tables after games table consolidation.
-- The game_analyses table is no longer used - all game data now lives in the games table.
-- The powerpoint_karaoke meetings have been migrated to the games table.

BEGIN;

-- Step 1: Delete processing_jobs linked to powerpoint_karaoke meetings
-- (Must delete these first due to foreign key constraint)
DELETE FROM public.processing_jobs
WHERE meeting_id IN (
  SELECT id FROM public.meetings WHERE meeting_type = 'powerpoint_karaoke'
);

-- Step 2: Delete powerpoint_karaoke meetings
DELETE FROM public.meetings WHERE meeting_type = 'powerpoint_karaoke';

-- Step 3: Drop game_analyses table (no longer used)
DROP TABLE IF EXISTS public.game_analyses CASCADE;

COMMIT;

-- Note: The 'powerpoint_karaoke' enum value in meeting_type cannot be easily removed
-- in PostgreSQL without recreating the column. It's harmless to leave it.
