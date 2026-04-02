-- Add pillar score columns to meeting_analysis, user_weekly_rollups, and user_baselines
-- These columns store composite scores (0-10, max 1 decimal) calculated from individual metrics

-- Add pillar scores to meeting_analysis (individual meeting level)
ALTER TABLE public.meeting_analysis
ADD COLUMN IF NOT EXISTS content_pillar_score numeric CHECK (content_pillar_score >= 0 AND content_pillar_score <= 10),
ADD COLUMN IF NOT EXISTS poise_pillar_score numeric CHECK (poise_pillar_score >= 0 AND poise_pillar_score <= 10),
ADD COLUMN IF NOT EXISTS connection_pillar_score numeric CHECK (connection_pillar_score >= 0 AND connection_pillar_score <= 10),
ADD COLUMN IF NOT EXISTS attunement_pillar_score numeric CHECK (attunement_pillar_score >= 0 AND attunement_pillar_score <= 10);

COMMENT ON COLUMN public.meeting_analysis.content_pillar_score IS 'Composite score (0-10) for content pillar: clarity + filler words rate';
COMMENT ON COLUMN public.meeting_analysis.poise_pillar_score IS 'Composite score (0-10) for poise pillar: confidence + pace + verbosity';
COMMENT ON COLUMN public.meeting_analysis.connection_pillar_score IS 'Composite score (0-10) for connection pillar: collaboration + talk time + turn taking + interruptions received';
COMMENT ON COLUMN public.meeting_analysis.attunement_pillar_score IS 'Composite score (0-10) for attunement pillar: attunement + interruptions made';

-- Add pillar scores to user_weekly_rollups (weekly aggregation level)
-- Note: These are calculated from rolled-up weekly metrics, NOT averaged from meeting pillar scores
ALTER TABLE public.user_weekly_rollups
ADD COLUMN IF NOT EXISTS weekly_content_pillar_score numeric CHECK (weekly_content_pillar_score >= 0 AND weekly_content_pillar_score <= 10),
ADD COLUMN IF NOT EXISTS weekly_poise_pillar_score numeric CHECK (weekly_poise_pillar_score >= 0 AND weekly_poise_pillar_score <= 10),
ADD COLUMN IF NOT EXISTS weekly_connection_pillar_score numeric CHECK (weekly_connection_pillar_score >= 0 AND weekly_connection_pillar_score <= 10),
ADD COLUMN IF NOT EXISTS weekly_attunement_pillar_score numeric CHECK (weekly_attunement_pillar_score >= 0 AND weekly_attunement_pillar_score <= 10);

COMMENT ON COLUMN public.user_weekly_rollups.weekly_content_pillar_score IS 'Weekly content pillar score calculated from weekly rolled-up metrics (avg clarity - filler penalty)';
COMMENT ON COLUMN public.user_weekly_rollups.weekly_poise_pillar_score IS 'Weekly poise pillar score calculated from weekly rolled-up metrics (avg confidence - pace penalty - verbosity penalty)';
COMMENT ON COLUMN public.user_weekly_rollups.weekly_connection_pillar_score IS 'Weekly connection pillar score calculated from weekly rolled-up metrics (avg collaboration × turn taking multiplier - interruptions penalty)';
COMMENT ON COLUMN public.user_weekly_rollups.weekly_attunement_pillar_score IS 'Weekly attunement pillar score calculated from weekly rolled-up metrics (avg attunement - interruptions penalty)';

-- Add pillar scores to user_baselines (baseline level)
-- Note: These are averaged from weekly pillar scores
ALTER TABLE public.user_baselines
ADD COLUMN IF NOT EXISTS avg_baseline_content_pillar_score numeric CHECK (avg_baseline_content_pillar_score >= 0 AND avg_baseline_content_pillar_score <= 10),
ADD COLUMN IF NOT EXISTS avg_baseline_poise_pillar_score numeric CHECK (avg_baseline_poise_pillar_score >= 0 AND avg_baseline_poise_pillar_score <= 10),
ADD COLUMN IF NOT EXISTS avg_baseline_connection_pillar_score numeric CHECK (avg_baseline_connection_pillar_score >= 0 AND avg_baseline_connection_pillar_score <= 10),
ADD COLUMN IF NOT EXISTS avg_baseline_attunement_pillar_score numeric CHECK (avg_baseline_attunement_pillar_score >= 0 AND avg_baseline_attunement_pillar_score <= 10);

COMMENT ON COLUMN public.user_baselines.avg_baseline_content_pillar_score IS 'Baseline content pillar score (averaged from weekly pillar scores)';
COMMENT ON COLUMN public.user_baselines.avg_baseline_poise_pillar_score IS 'Baseline poise pillar score (averaged from weekly pillar scores)';
COMMENT ON COLUMN public.user_baselines.avg_baseline_connection_pillar_score IS 'Baseline connection pillar score (averaged from weekly pillar scores)';
COMMENT ON COLUMN public.user_baselines.avg_baseline_attunement_pillar_score IS 'Baseline attunement pillar score (averaged from weekly pillar scores)';
