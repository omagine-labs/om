/**
 * WeeklyDashboard Component
 *
 * Main dashboard component displaying weekly performance metrics with
 * baseline comparisons. Shows:
 * - Talk time average vs baseline
 * - Words per minute vs baseline
 * - Interruption rate vs baseline
 *
 * Handles loading, empty, and error states.
 */

'use client';

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getDashboardData,
  getMeetingCount,
  getEarliestMeetingDate,
} from '@/lib/dashboard-data';
import { trackEvent, ActivationEvents } from '@/lib/analytics';
import type { DashboardData, ChartMetricType } from '@/types/dashboard';
import { useDelayedSkeleton } from '@/hooks/useDelayedSkeleton';
import { WeeklyMetricsCard } from './metrics/WeeklyMetricsCard';
import { EmptyDashboard } from './states/EmptyDashboard';
import { DashboardSkeleton } from './states/DashboardSkeleton';
import { TurnTakingBalanceDisplay } from './metrics/TurnTakingBalanceDisplay';
import { METRIC_TOOLTIPS } from '@/lib/metricTooltips';
import MetricsChartSection from './charts/MetricsChartSection';
import { authApi, dashboardApi } from '@/lib/api-client';
import { DashboardHeader } from './DashboardHeader';
import { EmptyWeekMessage } from './EmptyWeekMessage';
import * as Sentry from '@sentry/electron/renderer';

interface WeeklyDashboardProps {
  onWeekChange?: (weekStart: string, weekEnd: string) => void;
  onLoadingChange?: (loading: boolean) => void;
  onMeetingCountChange?: (count: number) => void;
}

export function WeeklyDashboard({
  onWeekChange,
  onLoadingChange,
  onMeetingCountChange,
}: WeeklyDashboardProps = {}) {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [meetingCount, setMeetingCount] = useState<number>(0);
  const [earliestMeetingDate, setEarliestMeetingDate] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);

  // Notify parent when loading state changes
  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(loading);
    }
  }, [loading, onLoadingChange]);

  // Notify parent when meeting count changes
  useEffect(() => {
    if (onMeetingCountChange) {
      onMeetingCountChange(meetingCount);
    }
  }, [meetingCount, onMeetingCountChange]);

  const [error, setError] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<ChartMetricType>('pace');
  const [selectedMetricKey, setSelectedMetricKey] = useState<string | null>(
    'pace'
  );

  // Delayed skeleton: only show if loading takes > 400ms
  const showSkeleton = useDelayedSkeleton(loading);

  useEffect(() => {
    loadDashboard();
    loadEarliestMeetingDate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWeekStart]);

  // Track analytics when dashboard successfully loads with data
  useEffect(() => {
    if (data && data.weekMetrics && data.weekMetrics.meetingsCount > 0) {
      const weekNumber = getISOWeek(new Date(data.weekMetrics.weekStart));
      trackEvent(ActivationEvents.WEEKLY_ROUNDUP_VIEWED, {
        week: weekNumber,
        meeting_count: data.weekMetrics.meetingsCount,
      });
    }
  }, [data]);

  // Notify parent when week range changes
  useEffect(() => {
    if (data?.weekMetrics && onWeekChange) {
      onWeekChange(data.weekMetrics.weekStart, data.weekMetrics.weekEnd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.weekMetrics?.weekStart, data?.weekMetrics?.weekEnd]);

  /**
   * Get ISO week number (YYYY-Www format)
   */
  const getISOWeek = (date: Date): string => {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
      ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
    );
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  };

  /**
   * Get the currently viewing week's Monday
   * Uses currentWeekStart state if set, otherwise current week
   */
  const getCurrentlyViewingMonday = (): Date => {
    if (currentWeekStart) {
      // Parse the stored week start date
      const [year, month, day] = currentWeekStart.split('-').map(Number);
      return new Date(year, month - 1, day);
    } else {
      // Default to current week
      return getMonday(new Date());
    }
  };

  /**
   * Navigate to previous week
   */
  const goToPreviousWeek = () => {
    const currentMonday = getCurrentlyViewingMonday();
    const previousMonday = new Date(currentMonday);
    previousMonday.setDate(currentMonday.getDate() - 7);

    const weekStart = formatDateForSQL(previousMonday);
    setCurrentWeekStart(weekStart);
  };

  /**
   * Navigate to next week
   */
  const goToNextWeek = () => {
    const currentMonday = getCurrentlyViewingMonday();
    const nextMonday = new Date(currentMonday);
    nextMonday.setDate(currentMonday.getDate() + 7);

    // Don't go beyond current week
    const today = new Date();
    const thisMonday = getMonday(today);
    if (nextMonday > thisMonday) return;

    const weekStart = formatDateForSQL(nextMonday);
    setCurrentWeekStart(weekStart);
  };

  /**
   * Return to current week
   */
  const goToCurrentWeek = () => {
    setCurrentWeekStart(null);
  };

  /**
   * Format date to YYYY-MM-DD for SQL queries
   * Uses local timezone to avoid date shifting issues
   */
  const formatDateForSQL = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /**
   * Get Monday of current week
   */
  const getMonday = (date: Date): Date => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  /**
   * Check if currently viewing current week
   */
  const isCurrentWeek = (): boolean => {
    const today = new Date();
    const thisMonday = getMonday(today);
    const viewingMonday = getCurrentlyViewingMonday();

    return formatDateForSQL(thisMonday) === formatDateForSQL(viewingMonday);
  };

  /**
   * Check if there are meetings in previous weeks
   * Compares the currently viewing week with the earliest meeting date
   */
  const hasPreviousMeetings = (): boolean => {
    if (!earliestMeetingDate) {
      // If we don't know the earliest date, allow navigation
      return true;
    }

    const viewingMonday = getCurrentlyViewingMonday();
    const earliestMonday = getMonday(new Date(earliestMeetingDate));

    // Can go to previous week if viewing week is after the earliest week
    return viewingMonday > earliestMonday;
  };

  async function loadEarliestMeetingDate() {
    try {
      const earliestDate = await getEarliestMeetingDate();
      setEarliestMeetingDate(earliestDate);
    } catch (err) {
      console.error('Error loading earliest meeting date:', err);
      // Non-blocking error - just log it
    }
  }

  async function loadDashboard() {
    const loadStart = Date.now();

    try {
      setLoading(true);
      setError(null);

      // Add breadcrumb for dashboard load start
      Sentry.addBreadcrumb({
        category: 'dashboard',
        message: 'WeeklyDashboard load started',
        level: 'info',
        data: {
          timestamp: loadStart,
          weekStart: currentWeekStart || 'current',
        },
      });

      // Ensure session is restored from main process before checking auth
      const sessionRestoreStart = Date.now();
      const { ensureSessionRestored } = await import('@/lib/supabase');
      await ensureSessionRestored();
      const sessionRestoreDuration = Date.now() - sessionRestoreStart;

      // Add breadcrumb for session restore in dashboard
      Sentry.addBreadcrumb({
        category: 'auth',
        message: 'WeeklyDashboard session restore completed',
        level: 'info',
        data: { duration: sessionRestoreDuration },
      });

      // Get current user from auth API (via IPC to main process)
      const user = await authApi.getCurrentUser();

      if (!user) {
        const error = new Error('Not authenticated');

        // This should no longer happen with the new state machine architecture
        Sentry.captureException(error, {
          level: 'warning',
          tags: {
            component: 'weekly_dashboard',
            error_type: 'auth_failure',
          },
          extra: {
            sessionRestoreDuration,
            totalTiming: Date.now() - loadStart,
            weekStart: currentWeekStart || 'current',
          },
        });

        throw error;
      }

      // Ensure weekly rollup is up-to-date before loading dashboard
      if (currentWeekStart) {
        const rollupResult = await dashboardApi.calculateWeeklyRollup(
          user.id,
          currentWeekStart
        );

        if (!rollupResult.success) {
          console.error(
            'Failed to recalculate weekly rollup:',
            rollupResult.error
          );

          // Capture rollup calculation errors
          Sentry.captureException(
            new Error(rollupResult.error || 'Unknown rollup error'),
            {
              level: 'warning',
              tags: {
                component: 'weekly_dashboard',
                error_type: 'rollup_calculation_failed',
              },
              extra: {
                weekStart: currentWeekStart,
                userId: user.id,
              },
            }
          );
        }
      }

      const dataFetchStart = Date.now();
      const [dashboardData, count] = await Promise.all([
        getDashboardData(currentWeekStart || undefined),
        getMeetingCount(),
      ]);
      const dataFetchDuration = Date.now() - dataFetchStart;

      setData(dashboardData);
      setMeetingCount(count);

      const totalDuration = Date.now() - loadStart;

      // Add breadcrumb for successful load
      Sentry.addBreadcrumb({
        category: 'dashboard',
        message: 'WeeklyDashboard load completed successfully',
        level: 'info',
        data: {
          totalDuration,
          sessionRestoreDuration,
          dataFetchDuration,
          meetingCount: count,
        },
      });

      // Track slow dashboard loads (potential performance issue)
      if (totalDuration > 5000) {
        Sentry.captureMessage('Slow WeeklyDashboard load detected', {
          level: 'warning',
          tags: { component: 'weekly_dashboard' },
          extra: {
            totalDuration,
            sessionRestoreDuration,
            dataFetchDuration,
            weekStart: currentWeekStart || 'current',
          },
        });
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);

      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to load dashboard. Please try again.';

      setError(errorMessage);

      // Capture dashboard load failures
      Sentry.captureException(err, {
        level: 'error',
        tags: {
          component: 'weekly_dashboard',
          error_type: 'load_failed',
        },
        extra: {
          duration: Date.now() - loadStart,
          weekStart: currentWeekStart || 'current',
          errorMessage,
        },
      });
    } finally {
      setLoading(false);
    }
  }

  const handleUploadClick = () => {
    // Navigate to meetings page with modal open
    navigate('/meetings?upload=true');
  };

  /**
   * Map metric key to ChartMetricType
   */
  const metricKeyToChartType = (key: string): ChartMetricType => {
    const mapping: Record<string, ChartMetricType> = {
      pace: 'pace',
      verbosity: 'verbosity',
      talktime: 'talkTime',
      turntaking: 'turnTakingBalance',
      interruptionrate: 'interruptionRate',
      interruptionsreceived: 'timesInterrupted',
      interruptionsmade: 'timesInterrupting',
      fillerwordrate: 'fillerWordsPerMinute',
      clarity: 'clarity',
      confidence: 'confidence',
      collaboration: 'collaboration',
      attunement: 'attunement',
    };
    return mapping[key] || 'pace';
  };

  /**
   * Handle metric click to switch chart display
   */
  const handleMetricClick = (metricKey: string) => {
    setSelectedMetricKey(metricKey);
    setSelectedMetric(metricKeyToChartType(metricKey));
  };

  // Loading state
  if (loading && showSkeleton) {
    return <DashboardSkeleton />;
  }

  // Show blank while loading (before skeleton delay)
  if (loading) {
    return <div className="h-96" />;
  }

  // Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">
              Unable to load dashboard
            </h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                onClick={loadDashboard}
                className="text-sm font-medium text-red-800 hover:text-red-900"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state (no meetings at all)
  if (meetingCount === 0) {
    return <EmptyDashboard onUploadClick={handleUploadClick} />;
  }

  // Check if data exists (should always be true after empty state check, but TypeScript needs verification)
  if (!data) {
    return null;
  }

  // No data for current week
  if (!data.weekMetrics) {
    // Calculate week dates for display even if no data
    const selectedMonday = getCurrentlyViewingMonday();
    const selectedSunday = new Date(selectedMonday);
    selectedSunday.setDate(selectedMonday.getDate() + 6);

    const weekStartFormatted = formatDateForSQL(selectedMonday);
    const weekEndFormatted = formatDateForSQL(selectedSunday);

    return (
      <div key={weekStartFormatted} className="space-y-6 animate-fadeInUp">
        <DashboardHeader
          weekStart={weekStartFormatted}
          weekEnd={weekEndFormatted}
          meetingsCount={0}
          unassignedMeetingsCount={data.unassignedMeetingsCount}
          isCurrentWeek={isCurrentWeek()}
          hasPreviousMeetings={hasPreviousMeetings()}
          onPreviousWeek={goToPreviousWeek}
          onNextWeek={goToNextWeek}
          onCurrentWeek={goToCurrentWeek}
          onMeetingsClick={() => navigate('/meetings')}
        />

        <EmptyWeekMessage
          unassignedMeetingsCount={data.unassignedMeetingsCount}
        />
      </div>
    );
  }

  // Success state: Display dashboard
  return (
    <div
      key={data.weekMetrics.weekStart}
      className="space-y-6 animate-fadeInUp"
    >
      <DashboardHeader
        weekStart={data.weekMetrics.weekStart}
        weekEnd={data.weekMetrics.weekEnd}
        meetingsCount={data.weekMetrics.meetingsCount}
        unassignedMeetingsCount={data.unassignedMeetingsCount}
        isCurrentWeek={isCurrentWeek()}
        hasPreviousMeetings={hasPreviousMeetings()}
        onPreviousWeek={goToPreviousWeek}
        onNextWeek={goToNextWeek}
        onCurrentWeek={goToCurrentWeek}
        onMeetingsClick={() => navigate('/meetings')}
      />

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        {/* Content - What you said */}
        <WeeklyMetricsCard
          header="Content"
          subheader="What you said"
          pillarScore={data.weekMetrics.weeklyContentPillarScore}
          pillarComparison={data.comparisons?.contentPillar || null}
          pillarColor="teal"
          animationIndex={0}
          metrics={[
            ...(data.weekMetrics.avgClarityScore !== null
              ? [
                  {
                    label: 'Clarity',
                    currentValue: data.weekMetrics.avgClarityScore,
                    unit: '',
                    comparison: data.comparisons?.clarity || null,
                  },
                ]
              : []),
            {
              label: 'Filler Word Rate',
              currentValue: data.weekMetrics.avgFillerWordsPerMinute,
              unit: 'per minute',
              comparison: data.comparisons?.fillerWordsPerMinute || null,
            },
          ]}
          tooltips={{
            clarity: METRIC_TOOLTIPS.clarity,
            fillerwordrate: METRIC_TOOLTIPS.fillerWords,
          }}
          onMetricClick={handleMetricClick}
          selectedMetricKey={selectedMetricKey}
        />

        {/* Poise - How you said it */}
        <WeeklyMetricsCard
          header="Poise"
          subheader="How you said it"
          pillarScore={data.weekMetrics.weeklyPoisePillarScore}
          pillarComparison={data.comparisons?.poisePillar || null}
          pillarColor="amber"
          animationIndex={1}
          metrics={[
            ...(data.weekMetrics.avgConfidenceScore !== null
              ? [
                  {
                    label: 'Confidence',
                    currentValue: data.weekMetrics.avgConfidenceScore,
                    unit: '',
                    comparison: data.comparisons?.confidence || null,
                  },
                ]
              : []),
            {
              label: 'Pace',
              currentValue: data.weekMetrics.avgWordsPerMinute,
              unit: 'WPM',
              comparison: data.comparisons?.wordsPerMinute || null,
            },
            {
              label: 'Verbosity',
              currentValue: data.weekMetrics.avgWordsPerSegment,
              unit: 'WPS',
              comparison: data.comparisons?.wordsPerSegment || null,
            },
          ]}
          tooltips={{
            confidence: METRIC_TOOLTIPS.confidence,
            pace: METRIC_TOOLTIPS.pace,
            verbosity: METRIC_TOOLTIPS.verbosity,
          }}
          onMetricClick={handleMetricClick}
          selectedMetricKey={selectedMetricKey}
        />

        {/* Connection - How you collaborate */}
        <WeeklyMetricsCard
          header="Connection"
          subheader="How you collaborate"
          pillarScore={data.weekMetrics.weeklyConnectionPillarScore}
          pillarComparison={data.comparisons?.connectionPillar || null}
          pillarColor="indigo"
          animationIndex={2}
          metrics={[
            ...(data.weekMetrics.avgAttunementScore !== null
              ? [
                  {
                    label: 'Attunement',
                    currentValue: data.weekMetrics.avgAttunementScore,
                    unit: '',
                    comparison: data.comparisons?.attunement || null,
                  },
                ]
              : []),
            ...(data.weekMetrics.avgTurnTakingBalance !== null
              ? [
                  {
                    label: 'Turn Taking',
                    currentValue: data.weekMetrics.avgTurnTakingBalance,
                    unit: '',
                    comparison: data.comparisons?.turnTakingBalance || null,
                    customDisplay: (
                      <TurnTakingBalanceDisplay
                        value={data.weekMetrics.avgTurnTakingBalance}
                      />
                    ),
                  },
                ]
              : []),
            {
              label: 'Interruptions Received',
              currentValue: data.weekMetrics.avgTimesInterruptedPerMeeting,
              unit: 'per meeting',
              comparison: data.comparisons?.timesInterrupted || null,
            },
            {
              label: 'Interruptions Made',
              currentValue: data.weekMetrics.avgTimesInterruptingPerMeeting,
              unit: 'per meeting',
              comparison: data.comparisons?.timesInterrupting || null,
            },
          ]}
          tooltips={{
            attunement: METRIC_TOOLTIPS.attunement,
            turntaking: METRIC_TOOLTIPS.turnTakingBalance,
            interruptionsreceived: METRIC_TOOLTIPS.interruptionsreceived,
            interruptionsmade: METRIC_TOOLTIPS.interruptionsmade,
          }}
          onMetricClick={handleMetricClick}
          selectedMetricKey={selectedMetricKey}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-white/20"></div>

      {/* Progress Section Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Progress</h2>
      </div>

      {/* Chart Section */}
      <MetricsChartSection
        selectedMetric={selectedMetric}
        onMetricSelect={setSelectedMetric}
        weekStartDate={data.weekMetrics.weekStart}
      />

      {/* Baseline Info */}
      {data.baseline && (
        <div className="text-sm text-white/60">
          <p>
            Baseline calculated from {data.baseline.meetingsIncluded} meetings
            {data.baseline.baselineType === 'current'
              ? ' (rolling 12-week average)'
              : ' (initial baseline)'}
          </p>
        </div>
      )}
    </div>
  );
}
