-- Add verbosity (words per segment) column to meeting_analysis table
-- This metric indicates communication style: brief vs detailed responses

ALTER TABLE meeting_analysis
ADD COLUMN IF NOT EXISTS verbosity NUMERIC;

COMMENT ON COLUMN meeting_analysis.verbosity IS 'Average words per speaking segment (total_words / total_segments). Indicates communication style: low verbosity = brief/direct, high verbosity = detailed/explanatory.';
