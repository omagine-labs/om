-- Fix foreign keys to CASCADE delete when meeting is deleted
-- This prevents orphaned records with NULL meeting_id

-- 1. Fix meeting_analysis foreign key
ALTER TABLE meeting_analysis
DROP CONSTRAINT IF EXISTS meeting_analysis_meeting_id_fkey;

ALTER TABLE meeting_analysis
ADD CONSTRAINT meeting_analysis_meeting_id_fkey
FOREIGN KEY (meeting_id)
REFERENCES meetings(id)
ON DELETE CASCADE;

-- Clean up existing orphaned meeting_analysis records
DELETE FROM meeting_analysis
WHERE meeting_id IS NULL;

COMMENT ON CONSTRAINT meeting_analysis_meeting_id_fkey ON meeting_analysis IS
'Cascade delete analysis records when parent meeting is deleted';

-- 2. Fix processing_jobs foreign key
ALTER TABLE processing_jobs
DROP CONSTRAINT IF EXISTS processing_jobs_meeting_id_fkey;

ALTER TABLE processing_jobs
ADD CONSTRAINT processing_jobs_meeting_id_fkey
FOREIGN KEY (meeting_id)
REFERENCES meetings(id)
ON DELETE CASCADE;

-- Clean up existing orphaned processing_jobs records
DELETE FROM processing_jobs
WHERE meeting_id IS NULL;

COMMENT ON CONSTRAINT processing_jobs_meeting_id_fkey ON processing_jobs IS
'Cascade delete processing jobs when parent meeting is deleted';
