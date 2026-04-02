-- Add agentic score columns to user_baselines table
-- These columns store baseline values for the four agentic dimensions:
-- Clarity, Confidence, Collaboration, and Attunement

ALTER TABLE user_baselines
ADD COLUMN IF NOT EXISTS baseline_clarity_score REAL,
ADD COLUMN IF NOT EXISTS baseline_confidence_score REAL,
ADD COLUMN IF NOT EXISTS baseline_collaboration_score REAL,
ADD COLUMN IF NOT EXISTS baseline_attunement_score REAL;

-- Add comments for documentation
COMMENT ON COLUMN user_baselines.baseline_clarity_score IS 'Baseline clarity score (1-10 scale) - measures how clear and structured communication is';
COMMENT ON COLUMN user_baselines.baseline_confidence_score IS 'Baseline confidence score (1-10 scale) - measures perceived confidence in communication';
COMMENT ON COLUMN user_baselines.baseline_collaboration_score IS 'Baseline collaboration score (1-10 scale) - measures collaborative behavior and openness';
COMMENT ON COLUMN user_baselines.baseline_attunement_score IS 'Baseline attunement score (1-10 scale) - measures social awareness and responsiveness';
