-- Add processing_priority column to processing_jobs table
-- This enables fast-track processing for anonymous uploads
ALTER TABLE processing_jobs
ADD COLUMN processing_priority text DEFAULT 'normal'
CHECK (processing_priority IN ('normal', 'high'));

-- Create index for efficient priority-based queries
CREATE INDEX idx_processing_jobs_priority ON processing_jobs(processing_priority, status)
WHERE status IN ('pending', 'processing');

-- Add comment explaining the column
COMMENT ON COLUMN processing_jobs.processing_priority IS 'Processing priority level: normal (default) or high (for anonymous uploads requiring fast turnaround)';
