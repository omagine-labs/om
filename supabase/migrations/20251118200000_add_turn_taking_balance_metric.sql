-- Migration: Add Turn Taking Balance metric to meeting_analysis table
-- Description: Adds turn_taking_balance column to store composite balance metric
-- based on segment distribution, duration distribution, and word distribution

-- Add turn_taking_balance column to meeting_analysis table
ALTER TABLE meeting_analysis
ADD COLUMN IF NOT EXISTS turn_taking_balance NUMERIC;

-- Add comment explaining the metric
COMMENT ON COLUMN meeting_analysis.turn_taking_balance IS
'Composite Turn Taking Balance score: Average deviation from expected speaking distribution across three factors (segments, duration, words). Positive values indicate dominating conversation, negative values indicate under-participation. Expected value is 0 for balanced participation.';

-- Create index for querying turn_taking_balance
CREATE INDEX IF NOT EXISTS idx_meeting_analysis_turn_taking_balance
ON meeting_analysis(turn_taking_balance);
