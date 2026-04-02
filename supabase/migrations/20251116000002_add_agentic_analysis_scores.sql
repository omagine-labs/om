-- Add agentic analysis score columns to meeting_analysis table
-- Part of Agentic Communication Analysis project
-- Adds 8 columns for LLM-generated scores and explanations across 4 dimensions:
-- 1. Clarity - How clear and understandable communication was
-- 2. Confidence - Speaker's confidence level in communication
-- 3. Collaboration - Quality of collaborative communication patterns
-- 4. Attunement - Level of acknowledgement and responsiveness to others

BEGIN;

-- Add agentic analysis score columns to meeting_analysis table
ALTER TABLE public.meeting_analysis
  ADD COLUMN IF NOT EXISTS clarity_score integer CHECK (clarity_score >= 1 AND clarity_score <= 10),
  ADD COLUMN IF NOT EXISTS clarity_explanation text,
  ADD COLUMN IF NOT EXISTS confidence_score integer CHECK (confidence_score >= 1 AND confidence_score <= 10),
  ADD COLUMN IF NOT EXISTS confidence_explanation text,
  ADD COLUMN IF NOT EXISTS collaboration_score integer CHECK (collaboration_score >= 1 AND collaboration_score <= 10),
  ADD COLUMN IF NOT EXISTS collaboration_explanation text,
  ADD COLUMN IF NOT EXISTS attunement_score integer CHECK (attunement_score >= 1 AND attunement_score <= 10),
  ADD COLUMN IF NOT EXISTS attunement_explanation text;

-- Add column comments
COMMENT ON COLUMN public.meeting_analysis.clarity_score IS 'LLM-generated clarity score (1-10) evaluating how clear and understandable the speaker''s communication was';
COMMENT ON COLUMN public.meeting_analysis.clarity_explanation IS 'LLM-generated explanation for clarity score with specific examples from the transcript';

COMMENT ON COLUMN public.meeting_analysis.confidence_score IS 'LLM-generated confidence score (1-10) evaluating the speaker''s confidence level in their communication';
COMMENT ON COLUMN public.meeting_analysis.confidence_explanation IS 'LLM-generated explanation for confidence score with specific examples from the transcript';

COMMENT ON COLUMN public.meeting_analysis.collaboration_score IS 'LLM-generated collaboration score (1-10) evaluating the quality of collaborative communication patterns';
COMMENT ON COLUMN public.meeting_analysis.collaboration_explanation IS 'LLM-generated explanation for collaboration score with specific examples from the transcript';

COMMENT ON COLUMN public.meeting_analysis.attunement_score IS 'LLM-generated attunement score (1-10) evaluating the speaker''s level of acknowledgement and responsiveness to others';
COMMENT ON COLUMN public.meeting_analysis.attunement_explanation IS 'LLM-generated explanation for attunement score with specific examples from the transcript';

COMMIT;
