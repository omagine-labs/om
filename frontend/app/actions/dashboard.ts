/**
 * Dashboard Server Actions
 *
 * Server actions for fetching and processing weekly dashboard data.
 * Uses Supabase to query weekly rollups and baseline data, then calculates
 * metric comparisons for the UI.
 */

'use server';

import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase-server';
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
    const supabase = await createServerSupabaseClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
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

    // Fetch weekly rollup for current week
    const { data: weeklyRollup, error: rollupError } = await supabase
      .from('user_weekly_rollups')
      .select(
        'week_start_date, week_end_date, meetings_count, avg_talk_time_percentage, avg_words_per_minute, avg_words_per_segment, avg_interruption_rate, avg_times_interrupted_per_meeting, avg_times_interrupting_per_meeting, total_filler_words, avg_filler_words_per_minute, filler_words_breakdown, avg_turn_taking_balance, median_turn_taking_balance, avg_clarity_score, avg_confidence_score, avg_attunement_score, weekly_content_pillar_score, weekly_poise_pillar_score, weekly_connection_pillar_score'
      )
      .eq('user_id', user.id)
      .eq('week_start_date', weekStartSQL)
      .maybeSingle();

    if (rollupError) {
      console.error('Error fetching weekly rollup:', rollupError);
      throw new Error('Failed to fetch weekly metrics');
    }

    // Use the rollup from the database - no fallback calculation needed
    // The weekly rollup is calculated on-demand in WeeklyDashboard.tsx before this function is called
    // If no rollup exists (weeklyRollup is null), weekMetrics will be null and UI shows appropriate state
    const calculatedRollup = weeklyRollup;

    // Fetch active baseline (current rolling baseline)
    // Note: Baseline is optional - dashboard should work without it
    const { data: baseline, error: baselineError } = await supabase
      .from('user_baselines')
      .select(
        'baseline_talk_time_percentage, baseline_words_per_minute, baseline_words_per_segment, baseline_interruption_rate, baseline_times_interrupted_per_meeting, baseline_times_interrupting_per_meeting, baseline_filler_words_per_minute, baseline_turn_taking_balance, meetings_included, baseline_type, baseline_clarity_score, baseline_confidence_score, baseline_attunement_score, avg_baseline_content_pillar_score, avg_baseline_poise_pillar_score, avg_baseline_connection_pillar_score'
      )
      .eq('user_id', user.id)
      .eq('baseline_type', 'current')
      .eq('is_active', true)
      .maybeSingle();

    if (baselineError) {
      console.error('Error fetching baseline (non-blocking):', baselineError);
      // Don't throw - baseline is optional
    }

    // If no baseline exists yet, check if user has initial baseline
    let finalBaseline = baseline;
    if (!finalBaseline && !baselineError) {
      const { data: initialBaseline, error: initialBaselineError } =
        await supabase
          .from('user_baselines')
          .select(
            'baseline_talk_time_percentage, baseline_words_per_minute, baseline_words_per_segment, baseline_interruption_rate, baseline_times_interrupted_per_meeting, baseline_times_interrupting_per_meeting, baseline_filler_words_per_minute, baseline_turn_taking_balance, meetings_included, baseline_type, baseline_clarity_score, baseline_confidence_score, baseline_attunement_score, avg_baseline_content_pillar_score, avg_baseline_poise_pillar_score, avg_baseline_connection_pillar_score'
          )
          .eq('user_id', user.id)
          .eq('baseline_type', 'initial')
          .eq('is_active', true)
          .maybeSingle();

      if (initialBaselineError) {
        console.error(
          'Error fetching initial baseline (non-blocking):',
          initialBaselineError
        );
        // Don't throw - baseline is optional
      } else {
        finalBaseline = initialBaseline;
      }
    }

    // Fetch unassigned meetings count for the week
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
        // Calculate agentic comparisons (only if both values are non-null)
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
                'talkTime' // Treat like talk time - deviations from baseline are noteworthy
              )
            : null;

        // Calculate pillar score comparisons (higher is better, like agentic scores)
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
            'interruption' // Lower is better, like interruptions
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
 * Used to determine if empty state should be displayed
 */
export async function getMeetingCount(): Promise<number> {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('Not authenticated');
    }

    // Count meetings where user owns the meeting AND has identified themselves as a speaker
    const { count, error } = await supabase
      .from('meetings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .not('user_speaker_label', 'is', null);

    if (error) {
      console.error('Error counting meetings:', error);
      return 0;
    }

    return count || 0;
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
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('Not authenticated');
    }

    // Find the earliest meeting where user is identified as a speaker
    // Use user_speaker_label (not assigned_user_id) as the source of truth
    const { data, error } = await supabase
      .from('meetings')
      .select('start_time')
      .eq('user_id', user.id)
      .not('user_speaker_label', 'is', null)
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching earliest meeting:', error);
      return null;
    }

    if (!data || !data.start_time) {
      return null;
    }

    // Return just the date part (YYYY-MM-DD)
    return data.start_time.split('T')[0];
  } catch (error) {
    console.error('Error in getEarliestMeetingDate:', error);
    return null;
  }
}

/**
 * Get the count of unassigned meetings for a specific week
 * Returns meetings that have been processed but the user hasn't assigned themselves as a speaker
 *
 * @param weekStartDate - Optional ISO date string (YYYY-MM-DD) for the Monday of the week
 * @returns Count of unassigned meetings for the week
 */
export async function getUnassignedMeetingsCount(
  weekStartDate?: string
): Promise<number> {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('Not authenticated');
    }

    // Calculate week boundaries
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

    // First, get all meetings where user has ANY speaker assigned
    const { data: assignedData, error: assignedError } = await supabase
      .from('meeting_analysis')
      .select(
        `
        meeting_id,
        meetings!inner(
          start_time
        )
      `
      )
      .eq('assigned_user_id', user.id)
      .gte('meetings.start_time', weekStartSQL)
      .lte('meetings.start_time', weekEndSQL);

    if (assignedError) {
      console.error('Error fetching assigned meetings:', assignedError);
      return 0;
    }

    const assignedMeetingIds = new Set(
      assignedData?.map((ma) => ma.meeting_id) || []
    );

    // Query for meetings where:
    // 1. User owns the meeting (meetings.user_id = auth.uid())
    // 2. Meeting has been analyzed (meeting_analysis exists)
    // 3. At least one speaker is unassigned (assigned_user_id IS NULL)
    // 4. Meeting is in the date range
    const { data, error } = await supabase
      .from('meeting_analysis')
      .select(
        `
        meeting_id,
        meetings!inner(
          id,
          user_id,
          start_time,
          user_speaker_label
        )
      `
      )
      .eq('meetings.user_id', user.id)
      .is('assigned_user_id', null)
      .gte('meetings.start_time', weekStartSQL)
      .lte('meetings.start_time', weekEndSQL);

    if (error) {
      console.error('Error counting unassigned meetings:', error);
      return 0;
    }

    // Count unique meeting IDs, excluding meetings where user's speaker is already identified
    const unassignedMeetingIds = new Set(
      data
        ?.filter((ma) => {
          // Exclude if user already assigned in this meeting
          if (assignedMeetingIds.has(ma.meeting_id)) return false;

          // Exclude if speaker is already identified for this meeting
          const meeting = ma.meetings;
          if (meeting.user_speaker_label) {
            return false;
          }

          return true;
        })
        .map((ma) => ma.meeting_id) || []
    );
    return unassignedMeetingIds.size;
  } catch (error) {
    console.error('Error in getUnassignedMeetingsCount:', error);
    return 0;
  }
}

/**
 * Fetch meeting-level metrics for charting over the last 4 weeks
 *
 * @param metricType - The type of metric to fetch
 * @param weekStartDate - Optional ISO date string for the end week's Monday. Defaults to current week.
 * @returns Array of meeting data points with the specified metric
 * @throws Error if user is not authenticated
 */
export async function getMeetingLevelMetrics(
  metricType: ChartMetricType,
  weekStartDate?: string
): Promise<MeetingMetricDataPoint[]> {
  try {
    const supabase = await createServerSupabaseClient();

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('Not authenticated');
    }

    // Calculate 4-week date range
    let endWeekMonday: Date;
    if (weekStartDate) {
      endWeekMonday = new Date(weekStartDate);
    } else {
      endWeekMonday = getMonday(new Date());
    }

    // Go back 4 weeks (28 days) to get the start Monday
    const startMonday = new Date(endWeekMonday);
    startMonday.setDate(startMonday.getDate() - 28);

    // End Sunday is 6 days after end Monday
    const endSunday = new Date(endWeekMonday);
    endSunday.setDate(endSunday.getDate() + 6);

    const startDateSQL = formatDateForSQL(startMonday);
    const endDateSQL = formatDateForSQL(endSunday);

    console.log(
      `[Dashboard] Fetching ${metricType} metrics from ${startDateSQL} to ${endDateSQL}`
    );

    // Map metric type to database column
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
      attunement: 'attunement_score',
      contentPillar: 'content_pillar_score',
      poisePillar: 'poise_pillar_score',
      connectionPillar: 'connection_pillar_score',
    };

    const column = metricColumn[metricType];

    const selectQuery = `
      meeting_id,
      speaker_label,
      ${column},
      meetings!inner(
        id,
        title,
        start_time,
        user_speaker_label
      )
    `;

    // Fetch meetings with analysis data where user is identified as a speaker
    // Use user_speaker_label (not assigned_user_id) as the source of truth
    const { data: meetings, error } = await supabase
      .from('meeting_analysis')
      .select(selectQuery)
      .eq('meetings.user_id', user.id)
      .not('meetings.user_speaker_label', 'is', null)
      .gte('meetings.start_time', startDateSQL)
      .lte('meetings.start_time', endDateSQL);

    if (error) {
      console.error('Error fetching meeting metrics:', error);
      throw new Error('Failed to fetch meeting metrics');
    }

    if (!meetings || meetings.length === 0) {
      console.log('[Dashboard] No meetings found for date range');
      return [];
    }

    // Filter to only include analysis records that match the user's speaker label
    // and transform to MeetingMetricDataPoint format
    const dataPoints: MeetingMetricDataPoint[] = meetings
      .filter((m: any) => m.speaker_label === m.meetings.user_speaker_label)
      .map((m: any) => ({
        meetingId: m.meetings.id,
        meetingTitle: m.meetings.title || 'Untitled Meeting',
        meetingDate: m.meetings.start_time.split('T')[0], // Extract YYYY-MM-DD
        metricValue:
          m[column] !== null && m[column] !== undefined ? m[column] : null,
        _startTime: m.meetings.start_time, // Temporary field for sorting
      }))
      .sort((a: any, b: any) => a._startTime.localeCompare(b._startTime))
      .map(({ _startTime, ...rest }) => rest); // Remove temporary field

    console.log(
      `[Dashboard] Found ${dataPoints.length} meetings with ${metricType} data`
    );

    return dataPoints;
  } catch (error) {
    console.error('Error in getMeetingLevelMetrics:', error);
    throw error;
  }
}

/**
 * Internal function to fetch unassigned meetings for a user
 * Uses service role client since userId is passed as parameter (not from session).
 */
async function fetchUnassignedMeetingsForUser(userId: string): Promise<{
  count: number;
  firstMeetingId: string | null;
}> {
  const supabase = createServiceRoleClient();

  // Query for meetings where:
  // 1. User owns the meeting (meetings.user_id = auth.uid())
  // 2. Has a completed processing job
  // 3. user_speaker_label IS NULL (not yet identified)
  const { data, error } = await supabase
    .from('meetings')
    .select(
      `
      id,
      start_time,
      user_speaker_label,
      processing_jobs!inner(
        status
      )
    `
    )
    .eq('user_id', userId)
    .is('user_speaker_label', null)
    .eq('processing_jobs.status', 'completed')
    .order('start_time', { ascending: false });

  if (error) {
    console.error('Error fetching global unassigned meetings:', error);
    return { count: 0, firstMeetingId: null };
  }

  // Get unique meeting IDs (a meeting might have multiple completed jobs)
  const uniqueMeetings = new Map<string, string>();
  for (const meeting of data || []) {
    if (!uniqueMeetings.has(meeting.id)) {
      uniqueMeetings.set(meeting.id, meeting.id);
    }
  }

  const meetingIds = Array.from(uniqueMeetings.keys());
  return {
    count: meetingIds.length,
    firstMeetingId: meetingIds[0] || null,
  };
}

/**
 * Get the global count of unassigned meetings (no week filter)
 * Returns meetings that have been processed but the user hasn't identified themselves as a speaker
 *
 * @returns Object with count of unassigned meetings and ID of the first (most recent) one
 */
export async function getGlobalUnassignedMeetings(): Promise<{
  count: number;
  firstMeetingId: string | null;
}> {
  try {
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('Not authenticated');
    }

    // Fetch fresh data on every request - caching caused stale data issues
    // after speaker assignment due to race conditions with router.refresh()
    return await fetchUnassignedMeetingsForUser(user.id);
  } catch (error) {
    console.error('Error in getGlobalUnassignedMeetings:', error);
    return { count: 0, firstMeetingId: null };
  }
}
