/**
 * Dashboard Data Fetching (Client-Side)
 *
 * Client-side functions for fetching and processing weekly dashboard data.
 * Uses IPC API to query data from main process, then calculates metric
 * comparisons for the UI.
 *
 * Migrated from direct Supabase calls to IPC API for centralized auth management.
 */

import { authApi, dashboardApi } from './api-client';
import type {
  DashboardData,
  WeeklyMetrics,
  BaselineData,
  MetricComparison,
  MetricDirection,
  MetricStatus,
  MeetingMetricDataPoint,
  ChartMetricType,
} from '@/types/dashboard';

/**
 * Get the Monday (ISO week start) for a given date
 */
function getMonday(date: Date): Date {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(date);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Format date to YYYY-MM-DD for SQL queries
 * Uses local timezone to avoid date shifting issues
 */
function formatDateForSQL(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate metric comparison between current and baseline values
 */
function calculateComparison(
  currentValue: number,
  baselineValue: number,
  metricName: 'talkTime' | 'wpm' | 'interruption'
): MetricComparison {
  // Calculate percentage change
  const percentageChange =
    baselineValue > 0
      ? ((currentValue - baselineValue) / baselineValue) * 100
      : 0;

  // Determine direction
  let direction: MetricDirection = 'neutral';
  if (Math.abs(percentageChange) > 1) {
    // Consider changes > 1% as meaningful
    direction = percentageChange > 0 ? 'up' : 'down';
  }

  // Determine status based on metric type and deviation
  let status: MetricStatus = 'good';
  const absChange = Math.abs(percentageChange);

  // Different status logic per metric
  if (metricName === 'interruption') {
    // For interruption rate: lower is better
    if (percentageChange < -5) {
      status = 'good'; // Decreased interruptions
    } else if (percentageChange > 15) {
      status = 'alert'; // Significant increase in interruptions
    } else if (percentageChange > 5) {
      status = 'warning'; // Minor increase
    }
  } else {
    // For talk time and WPM: deviations from baseline are noteworthy
    if (absChange > 15) {
      status = 'alert'; // Significant deviation
    } else if (absChange > 5) {
      status = 'warning'; // Minor deviation
    } else {
      status = 'good'; // Within normal range
    }
  }

  return {
    currentValue,
    baselineValue,
    percentageChange,
    direction,
    status,
  };
}

/**
 * Calculate agentic score comparison (higher is better)
 */
function calculateAgenticComparison(
  currentValue: number,
  baselineValue: number
): MetricComparison {
  // Calculate percentage change
  const percentageChange =
    baselineValue > 0
      ? ((currentValue - baselineValue) / baselineValue) * 100
      : 0;

  // Determine direction
  let direction: MetricDirection = 'neutral';
  if (Math.abs(percentageChange) > 1) {
    // Consider changes > 1% as meaningful
    direction = percentageChange > 0 ? 'up' : 'down';
  }

  // For agentic scores: higher is better
  let status: MetricStatus = 'good';
  if (percentageChange > 5) {
    status = 'good'; // Improvement
  } else if (percentageChange < -15) {
    status = 'alert'; // Significant decline
  } else if (percentageChange < -5) {
    status = 'warning'; // Minor decline
  } else {
    status = 'good'; // Within normal range
  }

  return {
    currentValue,
    baselineValue,
    percentageChange,
    direction,
    status,
  };
}

/**
 * Fetch dashboard data for the current user's specified week
 *
 * @param weekStartDate - Optional ISO date string (YYYY-MM-DD) for the Monday of the week. Defaults to current week.
 * @returns DashboardData with weekly metrics, baseline, and comparisons
 * @throws Error if user is not authenticated
 */
export async function getDashboardData(
  weekStartDate?: string
): Promise<DashboardData> {
  try {
    // Get current user from auth API (via IPC to main process)
    const user = await authApi.getCurrentUser();

    if (!user) {
      throw new Error('Not authenticated');
    }

    // Get week boundaries (Monday-Sunday ISO)
    let monday: Date;
    if (weekStartDate) {
      // Use provided week start date
      // Parse as local timezone to avoid date shifting
      const [year, month, day] = weekStartDate.split('-').map(Number);
      monday = new Date(year, month - 1, day);
    } else {
      // Default to current week
      const today = new Date();
      monday = getMonday(today);
    }

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const weekStartSQL = formatDateForSQL(monday);
    const weekEndSQL = formatDateForSQL(sunday);

    console.log(
      '[Dashboard] Fetching data for week:',
      weekStartSQL,
      'to',
      weekEndSQL
    );

    // Fetch weekly rollup for current week via IPC
    const rollupResult = await dashboardApi.getWeeklyData(
      user.id,
      weekStartSQL
    );

    const weeklyRollup = rollupResult.success ? rollupResult.data : null;

    // If no rollup exists, calculate metrics on-the-fly from meetings
    let calculatedRollup = weeklyRollup;
    if (!weeklyRollup) {
      console.log('[Dashboard] No rollup found, calculating from meetings...');

      const weekEndPlusOne = new Date(sunday.getTime() + 86400000)
        .toISOString()
        .split('T')[0];

      // Fetch meetings for the week via IPC
      const meetingsResult = await dashboardApi.getMeetingAnalysisForWeek(
        user.id,
        weekStartSQL,
        weekEndPlusOne
      );

      if (
        meetingsResult.success &&
        meetingsResult.data &&
        meetingsResult.data.length > 0
      ) {
        const meetings = meetingsResult.data;

        // Calculate averages from meetings
        const avgTalkTime =
          meetings.reduce(
            (sum: number, m: any) => sum + (m.talk_time_percentage || 0),
            0
          ) / meetings.length;
        const avgWPM =
          meetings.reduce(
            (sum: number, m: any) => sum + (m.words_per_minute || 0),
            0
          ) / meetings.length;

        // Calculate words per segment (verbosity)
        const totalWords = meetings.reduce(
          (sum: number, m: any) => sum + (m.word_count || 0),
          0
        );
        const totalSegments = meetings.reduce(
          (sum: number, m: any) => sum + (m.segments_count || 0),
          0
        );
        const avgWordsPerSegment =
          totalSegments > 0 ? totalWords / totalSegments : 0;

        const avgInterruptions =
          meetings.reduce(
            (sum: number, m: any) => sum + (m.times_interrupted || 0),
            0
          ) / meetings.length;

        const avgTimesInterruptedPerMeeting =
          meetings.reduce(
            (sum: number, m: any) => sum + (m.times_interrupted || 0),
            0
          ) / meetings.length;
        const avgTimesInterruptingPerMeeting =
          meetings.reduce(
            (sum: number, m: any) => sum + (m.times_interrupting || 0),
            0
          ) / meetings.length;

        // Calculate turn taking balance metrics
        const turnTakingBalances = meetings
          .map((m: any) => m.turn_taking_balance)
          .filter((t: any): t is number => t !== null);
        const avgTurnTakingBalance =
          turnTakingBalances.length > 0
            ? turnTakingBalances.reduce(
                (sum: number, t: number) => sum + t,
                0
              ) / turnTakingBalances.length
            : null;
        const medianTurnTakingBalance =
          turnTakingBalances.length > 0
            ? turnTakingBalances.sort((a: number, b: number) => a - b)[
                Math.floor(turnTakingBalances.length / 2)
              ]
            : null;

        // Calculate average agentic scores
        const clarityScores = meetings
          .map((m: any) => m.clarity_score)
          .filter((s: any): s is number => s !== null);
        const avgClarityScore =
          clarityScores.length > 0
            ? clarityScores.reduce((sum: number, s: number) => sum + s, 0) /
              clarityScores.length
            : null;

        const confidenceScores = meetings
          .map((m: any) => m.confidence_score)
          .filter((s: any): s is number => s !== null);
        const avgConfidenceScore =
          confidenceScores.length > 0
            ? confidenceScores.reduce((sum: number, s: number) => sum + s, 0) /
              confidenceScores.length
            : null;

        const attunementScores = meetings
          .map((m: any) => m.attunement_score)
          .filter((s: any): s is number => s !== null);
        const avgAttunementScore =
          attunementScores.length > 0
            ? attunementScores.reduce((sum: number, s: number) => sum + s, 0) /
              attunementScores.length
            : null;

        // Count DISTINCT meeting IDs
        const uniqueMeetingIds = new Set(
          meetings.map((m: any) => m.meeting_id)
        );

        calculatedRollup = {
          week_start_date: weekStartSQL,
          week_end_date: weekEndSQL,
          meetings_count: uniqueMeetingIds.size,
          avg_talk_time_percentage: avgTalkTime,
          avg_words_per_minute: avgWPM,
          avg_words_per_segment: avgWordsPerSegment,
          avg_interruption_rate: avgInterruptions,
          avg_times_interrupted_per_meeting: avgTimesInterruptedPerMeeting,
          avg_times_interrupting_per_meeting: avgTimesInterruptingPerMeeting,
          total_filler_words: 0,
          avg_filler_words_per_minute: 0,
          filler_words_breakdown: {},
          avg_turn_taking_balance: avgTurnTakingBalance,
          median_turn_taking_balance: medianTurnTakingBalance,
          avg_clarity_score: avgClarityScore,
          avg_confidence_score: avgConfidenceScore,
          avg_attunement_score: avgAttunementScore,
          weekly_content_pillar_score: null,
          weekly_poise_pillar_score: null,
          weekly_connection_pillar_score: null,
        };

        console.log(
          '[Dashboard] Calculated rollup from',
          meetings.length,
          'meetings'
        );
      }
    }

    // Fetch active baseline via IPC
    const baselineResult = await dashboardApi.getBaseline(user.id, 'current');

    let finalBaseline = baselineResult.success ? baselineResult.data : null;

    // If no baseline exists yet, check for initial baseline
    if (!finalBaseline) {
      const initialBaselineResult = await dashboardApi.getBaseline(
        user.id,
        'initial'
      );
      finalBaseline = initialBaselineResult.success
        ? initialBaselineResult.data
        : null;
    }

    // Fetch unassigned meetings count
    const unassignedCount = await getUnassignedMeetingsCount(weekStartSQL);

    // Convert database rows to domain types
    let weekMetrics: WeeklyMetrics | null = null;
    let baselineData: BaselineData | null = null;
    let comparisons: DashboardData['comparisons'] = null;

    if (calculatedRollup) {
      weekMetrics = {
        weekStart: calculatedRollup.week_start_date,
        weekEnd: calculatedRollup.week_end_date,
        meetingsCount: calculatedRollup.meetings_count || 0,
        avgTalkTimePercentage: calculatedRollup.avg_talk_time_percentage || 0,
        avgWordsPerMinute: calculatedRollup.avg_words_per_minute || 0,
        avgWordsPerSegment: calculatedRollup.avg_words_per_segment || 0,
        avgInterruptionRate: calculatedRollup.avg_interruption_rate || 0,
        avgTimesInterruptedPerMeeting:
          calculatedRollup.avg_times_interrupted_per_meeting || 0,
        avgTimesInterruptingPerMeeting:
          calculatedRollup.avg_times_interrupting_per_meeting || 0,
        totalFillerWords: calculatedRollup.total_filler_words || 0,
        avgFillerWordsPerMinute:
          calculatedRollup.avg_filler_words_per_minute || 0,
        fillerWordsBreakdown:
          (calculatedRollup.filler_words_breakdown as Record<string, number>) ||
          {},
        avgTurnTakingBalance: calculatedRollup.avg_turn_taking_balance ?? null,
        medianTurnTakingBalance:
          calculatedRollup.median_turn_taking_balance ?? null,
        avgClarityScore: calculatedRollup.avg_clarity_score ?? null,
        avgConfidenceScore: calculatedRollup.avg_confidence_score ?? null,
        avgAttunementScore: calculatedRollup.avg_attunement_score ?? null,
        weeklyContentPillarScore:
          (calculatedRollup as any).weekly_content_pillar_score ?? null,
        weeklyPoisePillarScore:
          (calculatedRollup as any).weekly_poise_pillar_score ?? null,
        weeklyConnectionPillarScore:
          (calculatedRollup as any).weekly_connection_pillar_score ?? null,
      };
    }

    if (finalBaseline) {
      baselineData = {
        baselineTalkTimePercentage:
          finalBaseline.baseline_talk_time_percentage || 0,
        baselineWordsPerMinute: finalBaseline.baseline_words_per_minute || 0,
        baselineWordsPerSegment: finalBaseline.baseline_words_per_segment || 0,
        baselineInterruptionRate: finalBaseline.baseline_interruption_rate || 0,
        baselineTimesInterruptedPerMeeting:
          finalBaseline.baseline_times_interrupted_per_meeting || 0,
        baselineTimesInterruptingPerMeeting:
          finalBaseline.baseline_times_interrupting_per_meeting || 0,
        baselineFillerWordsPerMinute:
          finalBaseline.baseline_filler_words_per_minute || 0,
        baselineTurnTakingBalance:
          finalBaseline.baseline_turn_taking_balance ?? null,
        meetingsIncluded: finalBaseline.meetings_included || 0,
        baselineType: finalBaseline.baseline_type as
          | 'initial'
          | 'current'
          | 'historical_snapshot',
        baselineClarityScore: finalBaseline.baseline_clarity_score ?? null,
        baselineConfidenceScore:
          finalBaseline.baseline_confidence_score ?? null,
        baselineAttunementScore:
          finalBaseline.baseline_attunement_score ?? null,
        avgBaselineContentPillarScore:
          (finalBaseline as any).avg_baseline_content_pillar_score ?? null,
        avgBaselinePoisePillarScore:
          (finalBaseline as any).avg_baseline_poise_pillar_score ?? null,
        avgBaselineConnectionPillarScore:
          (finalBaseline as any).avg_baseline_connection_pillar_score ?? null,
      };

      // Calculate comparisons if we have both current week and baseline
      if (weekMetrics) {
        // Calculate agentic comparisons
        const clarityComparison =
          weekMetrics.avgClarityScore !== null &&
          baselineData.baselineClarityScore !== null
            ? calculateAgenticComparison(
                weekMetrics.avgClarityScore,
                baselineData.baselineClarityScore
              )
            : null;

        const confidenceComparison =
          weekMetrics.avgConfidenceScore !== null &&
          baselineData.baselineConfidenceScore !== null
            ? calculateAgenticComparison(
                weekMetrics.avgConfidenceScore,
                baselineData.baselineConfidenceScore
              )
            : null;

        const attunementComparison =
          weekMetrics.avgAttunementScore !== null &&
          baselineData.baselineAttunementScore !== null
            ? calculateAgenticComparison(
                weekMetrics.avgAttunementScore,
                baselineData.baselineAttunementScore
              )
            : null;

        const turnTakingBalanceComparison =
          weekMetrics.avgTurnTakingBalance !== null &&
          baselineData.baselineTurnTakingBalance !== null
            ? calculateComparison(
                weekMetrics.avgTurnTakingBalance,
                baselineData.baselineTurnTakingBalance,
                'talkTime'
              )
            : null;

        // Calculate pillar score comparisons
        const contentPillarComparison =
          weekMetrics.weeklyContentPillarScore !== null &&
          baselineData.avgBaselineContentPillarScore !== null
            ? calculateAgenticComparison(
                weekMetrics.weeklyContentPillarScore,
                baselineData.avgBaselineContentPillarScore
              )
            : null;

        const poisePillarComparison =
          weekMetrics.weeklyPoisePillarScore !== null &&
          baselineData.avgBaselinePoisePillarScore !== null
            ? calculateAgenticComparison(
                weekMetrics.weeklyPoisePillarScore,
                baselineData.avgBaselinePoisePillarScore
              )
            : null;

        const connectionPillarComparison =
          weekMetrics.weeklyConnectionPillarScore !== null &&
          baselineData.avgBaselineConnectionPillarScore !== null
            ? calculateAgenticComparison(
                weekMetrics.weeklyConnectionPillarScore,
                baselineData.avgBaselineConnectionPillarScore
              )
            : null;

        comparisons = {
          talkTime: calculateComparison(
            weekMetrics.avgTalkTimePercentage,
            baselineData.baselineTalkTimePercentage,
            'talkTime'
          ),
          wordsPerMinute: calculateComparison(
            weekMetrics.avgWordsPerMinute,
            baselineData.baselineWordsPerMinute,
            'wpm'
          ),
          wordsPerSegment: calculateComparison(
            weekMetrics.avgWordsPerSegment,
            baselineData.baselineWordsPerSegment,
            'wpm'
          ),
          interruptionRate: calculateComparison(
            weekMetrics.avgInterruptionRate,
            baselineData.baselineInterruptionRate,
            'interruption'
          ),
          timesInterrupted: calculateComparison(
            weekMetrics.avgTimesInterruptedPerMeeting,
            baselineData.baselineTimesInterruptedPerMeeting,
            'interruption'
          ),
          timesInterrupting: calculateComparison(
            weekMetrics.avgTimesInterruptingPerMeeting,
            baselineData.baselineTimesInterruptingPerMeeting,
            'interruption'
          ),
          fillerWordsPerMinute: calculateComparison(
            weekMetrics.avgFillerWordsPerMinute,
            baselineData.baselineFillerWordsPerMinute,
            'interruption'
          ),
          turnTakingBalance: turnTakingBalanceComparison,
          clarity: clarityComparison,
          confidence: confidenceComparison,
          attunement: attunementComparison,
          contentPillar: contentPillarComparison,
          poisePillar: poisePillarComparison,
          connectionPillar: connectionPillarComparison,
        };
      }
    }

    return {
      weekMetrics,
      baseline: baselineData,
      comparisons,
      unassignedMeetingsCount: unassignedCount,
    };
  } catch (error) {
    console.error('Error in getDashboardData:', error);
    throw error;
  }
}

/**
 * Get the count of meetings for the current user
 */
export async function getMeetingCount(): Promise<number> {
  try {
    // Get current user from auth API (via IPC to main process)
    const user = await authApi.getCurrentUser();

    if (!user) {
      throw new Error('Not authenticated');
    }

    const result = await dashboardApi.getMeetingCountForUser(user.id);

    if (!result.success || !result.data) {
      console.error('Error counting meetings:', result.error);
      return 0;
    }

    const uniqueMeetingIds = new Set(
      result.data?.map((ma: any) => ma.meeting_id) || []
    );
    return uniqueMeetingIds.size;
  } catch (error) {
    console.error('Error in getMeetingCount:', error);
    return 0;
  }
}

/**
 * Get the earliest meeting date for the current user
 * Used to determine if we can navigate to previous weeks
 */
export async function getEarliestMeetingDate(): Promise<string | null> {
  try {
    // Get current user from auth API (via IPC to main process)
    const user = await authApi.getCurrentUser();

    if (!user) {
      throw new Error('Not authenticated');
    }

    const result = await dashboardApi.getEarliestMeetingDate(user.id);

    if (!result.success || !result.data) {
      console.error('Error fetching earliest meeting:', result.error);
      return null;
    }

    if (!result.data.meetings) {
      return null;
    }

    // Return just the date part (YYYY-MM-DD)
    return (result.data.meetings as any).start_time.split('T')[0];
  } catch (error) {
    console.error('Error in getEarliestMeetingDate:', error);
    return null;
  }
}

/**
 * Get the count of unassigned meetings for a specific week
 */
export async function getUnassignedMeetingsCount(
  weekStartDate?: string
): Promise<number> {
  try {
    // Get current user from auth API (via IPC to main process)
    const user = await authApi.getCurrentUser();

    if (!user) {
      throw new Error('Not authenticated');
    }

    let monday: Date;
    if (weekStartDate) {
      // Parse as local timezone to avoid date shifting
      // new Date("YYYY-MM-DD") creates UTC midnight which becomes previous day in local time
      const [year, month, day] = weekStartDate.split('-').map(Number);
      monday = new Date(year, month - 1, day);
    } else {
      const today = new Date();
      monday = getMonday(today);
    }

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const weekStartSQL = formatDateForSQL(monday);
    const weekEndSQL = formatDateForSQL(sunday);

    // Get meetings where user has assigned speakers
    const assignedResult = await dashboardApi.getAssignedMeetingsForWeek(
      user.id,
      weekStartSQL,
      weekEndSQL
    );

    const assignedMeetingIds = new Set(
      assignedResult.data?.map((ma: any) => ma.meeting_id) || []
    );

    // Query for meetings with unassigned speakers
    const unassignedResult = await dashboardApi.getUnassignedMeetingsForWeek(
      user.id,
      weekStartSQL,
      weekEndSQL
    );

    // Count unique meeting IDs, excluding meetings where user's speaker is already identified
    const unassignedMeetingIds = new Set(
      unassignedResult.data
        ?.filter((ma: any) => {
          // Exclude if user already assigned in this meeting
          if (assignedMeetingIds.has(ma.meeting_id)) return false;

          // Exclude if speaker is already identified for this meeting
          const meeting = ma.meetings;
          if (meeting.user_speaker_label) {
            return false;
          }

          return true;
        })
        .map((ma: any) => ma.meeting_id) || []
    );

    return unassignedMeetingIds.size;
  } catch (error) {
    console.error('Error in getUnassignedMeetingsCount:', error);
    return 0;
  }
}

/**
 * Fetch meeting-level metrics for charting over the last 4 weeks
 */
export async function getMeetingLevelMetrics(
  metricType: ChartMetricType,
  weekStartDate?: string
): Promise<MeetingMetricDataPoint[]> {
  try {
    // Get current user from auth API (via IPC to main process)
    const user = await authApi.getCurrentUser();

    if (!user) {
      throw new Error('Not authenticated');
    }

    let endWeekMonday: Date;
    if (weekStartDate) {
      endWeekMonday = new Date(weekStartDate);
    } else {
      endWeekMonday = getMonday(new Date());
    }

    const startMonday = new Date(endWeekMonday);
    startMonday.setDate(startMonday.getDate() - 28);

    const endSunday = new Date(endWeekMonday);
    endSunday.setDate(endSunday.getDate() + 6);

    const startDateSQL = formatDateForSQL(startMonday);
    const endDateSQL = formatDateForSQL(endSunday);

    const metricColumn: Record<ChartMetricType, string> = {
      pace: 'words_per_minute',
      talkTime: 'talk_time_percentage',
      verbosity: 'verbosity',
      interruptionRate: 'interruption_rate',
      timesInterrupted: 'times_interrupted',
      timesInterrupting: 'times_interrupting',
      fillerWords: 'filler_words_total',
      fillerWordsPerMinute: 'filler_words_per_minute',
      turnTakingBalance: 'turn_taking_balance',
      clarity: 'clarity_score',
      confidence: 'confidence_score',
      collaboration: 'collaboration_score',
      attunement: 'attunement_score',
      contentPillar: 'content_pillar_score',
      poisePillar: 'poise_pillar_score',
      connectionPillar: 'connection_pillar_score',
      attunementPillar: 'attunement_pillar_score',
    };

    const column = metricColumn[metricType];

    const result = await dashboardApi.getMeetingLevelMetrics(
      user.id,
      column,
      startDateSQL,
      endDateSQL
    );

    if (!result.success) {
      console.error('Error fetching meeting metrics:', result.error);
      throw new Error('Failed to fetch meeting metrics');
    }

    const meetings = result.data || [];

    if (meetings.length === 0) {
      return [];
    }

    const dataPoints: MeetingMetricDataPoint[] = meetings
      .map((m: any) => ({
        meetingId: m.meetings.id,
        meetingTitle: m.meetings.title || 'Untitled Meeting',
        meetingDate: m.meetings.start_time.split('T')[0],
        metricValue:
          m[column] !== null && m[column] !== undefined ? m[column] : null,
        _startTime: m.meetings.start_time,
      }))
      .sort((a: any, b: any) => a._startTime.localeCompare(b._startTime))
      .map(({ _startTime, ...rest }: any) => rest);

    return dataPoints;
  } catch (error) {
    console.error('Error in getMeetingLevelMetrics:', error);
    throw error;
  }
}
