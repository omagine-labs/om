-- Add CASCADE delete to meeting_analysis foreign key
-- When a processing_job is deleted, automatically delete its meeting_analysis

-- Drop the existing foreign key constraint
ALTER TABLE meeting_analysis
DROP CONSTRAINT IF EXISTS meeting_analysis_job_id_fkey;

-- Re-add the foreign key constraint with ON DELETE CASCADE
ALTER TABLE meeting_analysis
ADD CONSTRAINT meeting_analysis_job_id_fkey
FOREIGN KEY (job_id)
REFERENCES processing_jobs(id)
ON DELETE CASCADE;

-- Also ensure the user_id foreign key has CASCADE (for consistency)
ALTER TABLE meeting_analysis
DROP CONSTRAINT IF EXISTS meeting_analysis_user_id_fkey;

ALTER TABLE meeting_analysis
ADD CONSTRAINT meeting_analysis_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES users(id)
ON DELETE CASCADE;
