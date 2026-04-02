-- Add unique constraint on processing_jobs.meeting_id to prevent duplicate jobs
-- This fixes a race condition that was creating multiple jobs per meeting

-- First, clean up any remaining duplicates (keep the first one per meeting)
DELETE FROM processing_jobs
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY meeting_id ORDER BY created_at) as rn
    FROM processing_jobs
  ) ranked
  WHERE rn > 1
);

-- Now add the unique constraint
ALTER TABLE processing_jobs
ADD CONSTRAINT processing_jobs_meeting_id_unique UNIQUE (meeting_id);
