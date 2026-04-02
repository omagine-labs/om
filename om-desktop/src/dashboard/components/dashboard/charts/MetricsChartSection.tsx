/**
 * MetricsChartSection Component
 *
 * Displays a line chart showing meeting-level metrics over the last 4 weeks.
 * Allows users to switch between different metrics by clicking on metric values
 * in the cards above.
 */

'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getMeetingLevelMetrics } from '@/lib/dashboard-data';
import type {
  ChartMetricType,
  MeetingMetricDataPoint,
  MetricChartConfig,
} from '@/types/dashboard';

/**
 * Configuration for each metric type
 */
const METRIC_CONFIGS: Record<ChartMetricType, MetricChartConfig> = {
  pace: {
    label: 'Pace',
    unit: 'WPM',
    color: '#3b82f6',
    yAxisLabel: 'Words per Minute',
  },
  talkTime: {
    label: 'Talk Time',
    unit: '%',
    color: '#8b5cf6',
    yAxisLabel: 'Talk Time %',
  },
  verbosity: {
    label: 'Verbosity',
    unit: 'words/segment',
    color: '#ec4899',
    yAxisLabel: 'Words per Segment',
  },
  interruptionRate: {
    label: 'Interruption Rate',
    unit: '%',
    color: '#f59e0b',
    yAxisLabel: 'Interruption Rate %',
  },
  timesInterrupted: {
    label: 'Interruptions Received',
    unit: 'per meeting',
    color: '#f59e0b',
    yAxisLabel: 'Times Interrupted per Meeting',
  },
  timesInterrupting: {
    label: 'Interruptions Made',
    unit: 'per meeting',
    color: '#ef4444',
    yAxisLabel: 'Times Interrupting per Meeting',
  },
  fillerWords: {
    label: 'Filler Words',
    unit: 'count',
    color: '#ef4444',
    yAxisLabel: 'Filler Word Count',
  },
  fillerWordsPerMinute: {
    label: 'Filler Word Rate',
    unit: 'per minute',
    color: '#ef4444',
    yAxisLabel: 'Filler Words per Minute',
  },
  turnTakingBalance: {
    label: 'Turn Taking Balance',
    unit: '',
    color: '#06b6d4',
    yAxisLabel: 'Turn Taking Balance',
  },
  clarity: {
    label: 'Clarity',
    unit: 'score',
    color: '#10b981',
    yAxisLabel: 'Clarity Score (1-10)',
  },
  confidence: {
    label: 'Confidence',
    unit: 'score',
    color: '#6366f1',
    yAxisLabel: 'Confidence Score (1-10)',
  },
  collaboration: {
    label: 'Collaboration',
    unit: 'score',
    color: '#f59e0b',
    yAxisLabel: 'Collaboration Score (1-10)',
  },
  attunement: {
    label: 'Attunement',
    unit: 'score',
    color: '#8b5cf6',
    yAxisLabel: 'Attunement Score (1-10)',
  },
  contentPillar: {
    label: 'Content Pillar',
    unit: 'score',
    color: '#10b981',
    yAxisLabel: 'Content Pillar Score (0-10)',
  },
  poisePillar: {
    label: 'Poise Pillar',
    unit: 'score',
    color: '#6366f1',
    yAxisLabel: 'Poise Pillar Score (0-10)',
  },
  connectionPillar: {
    label: 'Connection Pillar',
    unit: 'score',
    color: '#f59e0b',
    yAxisLabel: 'Connection Pillar Score (0-10)',
  },
  attunementPillar: {
    label: 'Attunement Pillar',
    unit: 'score',
    color: '#8b5cf6',
    yAxisLabel: 'Attunement Pillar Score (0-10)',
  },
};

interface MetricsChartSectionProps {
  selectedMetric: ChartMetricType;
  onMetricSelect: (metric: ChartMetricType) => void;
  weekStartDate: string;
}

/**
 * Custom tooltip component for chart
 */
function CustomTooltip({ active, payload }: any): React.ReactElement | null {
  if (!active || !payload?.[0]) return null;

  const data = payload[0].payload as MeetingMetricDataPoint;

  // Format date as "Nov 4, 2025"
  const formattedDate = new Date(data.meetingDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
      <p className="font-semibold text-sm">{data.meetingTitle}</p>
      <p className="text-xs text-gray-600 mt-1">{formattedDate}</p>
      {data.metricValue !== null && (
        <p className="text-sm mt-2">
          <span className="font-medium">Value:</span>{' '}
          {data.metricValue.toFixed(1)}
        </p>
      )}
    </div>
  );
}

/**
 * Format date for X-axis display (e.g., "Nov 4")
 */
function formatXAxisDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format Y-axis tick values to 1 decimal point
 */
function formatYAxisTick(value: number): string {
  return value.toFixed(1);
}

export default function MetricsChartSection({
  selectedMetric,
  onMetricSelect: _onMetricSelect,
  weekStartDate,
}: MetricsChartSectionProps): React.ReactElement {
  const [data, setData] = useState<MeetingMetricDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const config = METRIC_CONFIGS[selectedMetric];

  // Fetch data when selectedMetric or weekStartDate changes
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        const metrics = await getMeetingLevelMetrics(
          selectedMetric,
          weekStartDate
        );
        // Filter out null values
        const filteredData = metrics.filter((m) => m.metricValue !== null);
        setData(filteredData);
      } catch (err) {
        console.error('Error fetching chart data:', err);
        setError('Failed to load chart data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [selectedMetric, weekStartDate]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {config.label} Over Time
        </h3>
        <p className="text-sm text-gray-600">Last 4 weeks of meetings</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-[300px]">
          <div className="text-gray-500">Loading chart...</div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-[300px]">
          <div className="text-red-600">{error}</div>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="flex flex-col items-center justify-center h-[300px] text-gray-500">
          <p className="text-sm">No data available for the last 4 weeks</p>
          <p className="text-xs mt-1">
            Meetings with {config.label.toLowerCase()} data will appear here
          </p>
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="meetingDate"
              tickFormatter={formatXAxisDate}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              stroke="#9ca3af"
            />
            <YAxis
              label={{
                value: config.yAxisLabel,
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 12, fill: '#6b7280' },
              }}
              domain={[
                (dataMin: number) => Math.floor(dataMin * 0.9),
                (dataMax: number) => Math.ceil(dataMax * 1.1),
              ]}
              tickFormatter={formatYAxisTick}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              stroke="#9ca3af"
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="metricValue"
              name={selectedMetric}
              stroke={config.color}
              strokeWidth={2}
              dot={{ r: 4, fill: config.color }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
