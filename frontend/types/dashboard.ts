/**
 * Dashboard Data Types
 *
 * Type definitions for the weekly performance dashboard feature.
 * Includes interfaces for weekly metrics, baseline data, metric comparisons,
 * and complete dashboard payloads.
 */

import type { Tables } from '@/supabase/database.types';

// Database table types
type UserWeeklyRollup = Tables<'user_weekly_rollups'>;
type UserBaseline = Tables<'user_baselines'>;

/**
 * Weekly metrics for the current week
 */
export interface WeeklyMetrics {
  weekStart: string; // ISO date string (Monday)
  weekEnd: string; // ISO date string (Sunday)
  meetingsCount: number;
  avgTalkTimePercentage: number;
  avgWordsPerMinute: number;
  avgWordsPerSegment: number;
  avgInterruptionRate: number;
  avgTimesInterruptedPerMeeting: number; // How often user gets interrupted
  avgTimesInterruptingPerMeeting: number; // How often user interrupts others
  totalFillerWords: number;
  avgFillerWordsPerMinute: number; // Rate of filler words per minute
  fillerWordsBreakdown: Record<string, number>;
  avgTurnTakingBalance: number | null; // Average turn taking balance (positive = dominating, negative = under-participating)
  medianTurnTakingBalance: number | null; // Median turn taking balance
  // Agentic communication scores (1-10 scale)
  avgClarityScore: number | null;
  avgConfidenceScore: number | null;
  avgAttunementScore: number | null;
  // Pillar scores (0-10 scale, max 1 decimal)
  weeklyContentPillarScore: number | null;
  weeklyPoisePillarScore: number | null;
  weeklyConnectionPillarScore: number | null;
}

/**
 * User's baseline data for comparison
 */
export interface BaselineData {
  baselineTalkTimePercentage: number;
  baselineWordsPerMinute: number;
  baselineWordsPerSegment: number;
  baselineInterruptionRate: number;
  baselineTimesInterruptedPerMeeting: number; // Baseline for times interrupted
  baselineTimesInterruptingPerMeeting: number; // Baseline for times interrupting
  baselineFillerWordsPerMinute: number; // Baseline filler words per minute rate
  baselineTurnTakingBalance: number | null; // Baseline turn taking balance
  meetingsIncluded: number;
  baselineType: 'initial' | 'current' | 'historical_snapshot';
  // Agentic communication scores baselines (1-10 scale)
  baselineClarityScore: number | null;
  baselineConfidenceScore: number | null;
  baselineAttunementScore: number | null;
  // Pillar score baselines (0-10 scale, max 1 decimal)
  avgBaselineContentPillarScore: number | null;
  avgBaselinePoisePillarScore: number | null;
  avgBaselineConnectionPillarScore: number | null;
}

/**
 * Direction of metric change compared to baseline
 */
export type MetricDirection = 'up' | 'down' | 'neutral';

/**
 * Status indicator for metric comparison
 * - good: Metric improved or within ideal range
 * - warning: Minor deviation from baseline (5-15%)
 * - alert: Significant deviation requiring attention (15%+)
 */
export type MetricStatus = 'good' | 'warning' | 'alert';

/**
 * Comparison between current week metric and baseline
 */
export interface MetricComparison {
  currentValue: number;
  baselineValue: number;
  percentageChange: number; // Positive = increase, negative = decrease
  direction: MetricDirection;
  status: MetricStatus;
}

/**
 * Individual metric item within a category card
 */
export interface MetricItem {
  label: string;
  currentValue: number;
  unit: string;
  comparison: MetricComparison | null; // null when no baseline exists
  customDisplay?: React.ReactNode; // Optional custom display for the value
}

/**
 * Complete dashboard data payload
 */
export interface DashboardData {
  weekMetrics: WeeklyMetrics | null;
  baseline: BaselineData | null;
  comparisons: {
    talkTime: MetricComparison;
    wordsPerMinute: MetricComparison;
    wordsPerSegment: MetricComparison;
    interruptionRate: MetricComparison;
    timesInterrupted: MetricComparison; // How often user gets interrupted
    timesInterrupting: MetricComparison; // How often user interrupts others
    fillerWordsPerMinute: MetricComparison; // Filler words rate comparison
    turnTakingBalance: MetricComparison | null; // Turn taking balance comparison
    // Agentic communication scores
    clarity: MetricComparison | null;
    confidence: MetricComparison | null;
    attunement: MetricComparison | null;
    // Pillar scores
    contentPillar: MetricComparison | null;
    poisePillar: MetricComparison | null;
    connectionPillar: MetricComparison | null;
  } | null;
  unassignedMeetingsCount: number; // Count of meetings needing speaker assignment
}

/**
 * Helper type: Database weekly rollup mapped to WeeklyMetrics
 */
export type WeeklyRollupRow = Pick<
  UserWeeklyRollup,
  | 'week_start_date'
  | 'week_end_date'
  | 'meetings_count'
  | 'avg_talk_time_percentage'
  | 'avg_words_per_minute'
  | 'avg_interruption_rate'
>;

/**
 * Helper type: Database baseline mapped to BaselineData
 */
export type BaselineRow = Pick<
  UserBaseline,
  | 'baseline_talk_time_percentage'
  | 'baseline_words_per_minute'
  | 'baseline_interruption_rate'
  | 'meetings_included'
  | 'baseline_type'
>;

/**
 * Individual meeting data point for charting
 */
export interface MeetingMetricDataPoint {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string; // ISO date string (YYYY-MM-DD)
  metricValue: number | null; // null if metric not available
}

/**
 * Metric type for chart selection
 */
export type ChartMetricType =
  | 'pace'
  | 'talkTime'
  | 'verbosity'
  | 'interruptionRate'
  | 'timesInterrupted'
  | 'timesInterrupting'
  | 'fillerWords'
  | 'fillerWordsPerMinute'
  | 'turnTakingBalance'
  | 'clarity'
  | 'confidence'
  | 'attunement'
  | 'contentPillar'
  | 'poisePillar'
  | 'connectionPillar';

/**
 * Metric metadata for chart configuration
 */
export interface MetricChartConfig {
  label: string;
  unit: string;
  color: string; // Hex color for chart line
  yAxisLabel: string;
}
