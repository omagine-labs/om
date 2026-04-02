'use client';

import { useEffect, useState } from 'react';
import { authApi, analysisApi } from '@/lib/api-client';
import { trackEvent, ActivationEvents } from '@/lib/analytics';

interface WeeklyMetrics {
  avgTalkPercentage: number;
  avgWordsPerMinute: number;
  avgResponseLatency: number;
  totalInterruptions: number;
  uniqueTips: string[];
  meetingCount: number;
}

export default function WeeklyMetricsOverview() {
  const [metrics, setMetrics] = useState<WeeklyMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWeeklyMetrics();
  }, []);

  // Track when weekly roundup is viewed (metrics successfully loaded)
  useEffect(() => {
    if (metrics && metrics.meetingCount > 0) {
      // Calculate current week (ISO format: YYYY-Www)
      const now = new Date();
      const year = now.getFullYear();
      const weekNumber = getWeekNumber(now);
      const week = `${year}-W${String(weekNumber).padStart(2, '0')}`;

      trackEvent(ActivationEvents.WEEKLY_ROUNDUP_VIEWED, {
        week,
        meeting_count: metrics.meetingCount,
      });
    }
  }, [metrics]);

  // Helper to get ISO week number
  const getWeekNumber = (date: Date): number => {
    const d = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  };

  const fetchWeeklyMetrics = async () => {
    try {
      // Get current user from main process
      const user = await authApi.getCurrentUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Calculate date 7 days ago
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Fetch all speaker records assigned to current user from past 7 days via IPC
      const result = await analysisApi.getWeeklyAnalysisRecords(
        user.id,
        sevenDaysAgo.toISOString()
      );

      if (!result.success) {
        console.error('Error fetching weekly metrics:', result.error);
        setLoading(false);
        return;
      }

      const analysisRecords = result.data;

      if (!analysisRecords || analysisRecords.length === 0) {
        setMetrics({
          avgTalkPercentage: 0,
          avgWordsPerMinute: 0,
          avgResponseLatency: 0,
          totalInterruptions: 0,
          uniqueTips: [],
          meetingCount: 0,
        });
        setLoading(false);
        return;
      }

      // Calculate aggregates
      let totalTalkPercentage = 0;
      let totalWordsPerMinute = 0;
      let totalResponseLatency = 0;
      let totalInterruptions = 0;
      let wpmCount = 0; // Count non-null WPM values
      let latencyCount = 0; // Count non-null latency values
      const tipsSet = new Set<string>();

      analysisRecords.forEach((record: any) => {
        // Talk percentage
        totalTalkPercentage += record.talk_time_percentage || 0;

        // Words per minute (may be null for some records)
        if (
          record.words_per_minute !== null &&
          record.words_per_minute !== undefined
        ) {
          totalWordsPerMinute += record.words_per_minute;
          wpmCount++;
        }

        // Response latency (may be null)
        if (
          record.avg_response_latency_seconds !== null &&
          record.avg_response_latency_seconds !== undefined
        ) {
          totalResponseLatency += record.avg_response_latency_seconds;
          latencyCount++;
        }

        // Interruptions
        totalInterruptions += record.times_interrupting || 0;

        // Communication tips (deduplicate)
        const tips = record.communication_tips as string[] | null;
        if (Array.isArray(tips)) {
          tips.forEach((tip) => tipsSet.add(tip));
        }
      });

      const meetingCount = analysisRecords.length;

      setMetrics({
        avgTalkPercentage: totalTalkPercentage / meetingCount,
        avgWordsPerMinute: wpmCount > 0 ? totalWordsPerMinute / wpmCount : 0,
        avgResponseLatency:
          latencyCount > 0 ? totalResponseLatency / latencyCount : 0,
        totalInterruptions,
        uniqueTips: Array.from(tipsSet),
        meetingCount,
      });
      setLoading(false);
    } catch (err) {
      console.error('Error calculating weekly metrics:', err);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!metrics || metrics.meetingCount === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Weekly Overview
        </h2>
        <p className="text-gray-600">
          No assigned speaker data from the past 7 days. Upload and process
          meetings to see your weekly metrics here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Weekly Overview</h2>
        <span className="text-sm text-gray-500">
          {metrics.meetingCount} meeting{metrics.meetingCount !== 1 ? 's' : ''}{' '}
          analyzed
        </span>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {/* Talk Percentage */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Avg Talk Time</p>
          <p className="text-2xl font-bold text-gray-900">
            {metrics.avgTalkPercentage.toFixed(1)}%
          </p>
        </div>

        {/* Words Per Minute */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Avg Speaking Pace</p>
          <p className="text-2xl font-bold text-gray-900">
            {metrics.avgWordsPerMinute.toFixed(0)} WPM
          </p>
        </div>

        {/* Response Latency */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Avg Response Time</p>
          <p className="text-2xl font-bold text-gray-900">
            {metrics.avgResponseLatency.toFixed(1)}s
          </p>
        </div>

        {/* Total Interruptions */}
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Times Interrupting</p>
          <p className="text-2xl font-bold text-gray-900">
            {metrics.totalInterruptions}
          </p>
        </div>
      </div>

      {/* Communication Tips */}
      {metrics.uniqueTips.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            Communication Tips
          </h3>
          <ul className="space-y-2">
            {metrics.uniqueTips.slice(0, 5).map((tip, index) => (
              <li
                key={index}
                className="flex items-start text-gray-700 text-sm"
              >
                <span className="text-blue-500 mr-2 flex-shrink-0">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
          {metrics.uniqueTips.length > 5 && (
            <p className="text-sm text-gray-500 mt-2">
              +{metrics.uniqueTips.length - 5} more tips
            </p>
          )}
        </div>
      )}
    </div>
  );
}
