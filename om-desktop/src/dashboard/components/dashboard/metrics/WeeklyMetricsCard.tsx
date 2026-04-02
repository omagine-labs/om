/**
 * WeeklyMetricsCard Component
 *
 * Displays a pillar score card with circular progress ring and metrics.
 * Layout: Header with title/subtitle + delta badge, centered ring, metrics below.
 */

import type { MetricItem, MetricComparison } from '@/types/dashboard';
import { MetricTooltip } from './MetricTooltip';
import type { TooltipContent } from './MetricTooltip';
import { DeltaChip } from './DeltaChip';
import { ScoreRing } from './ScoreRing';

interface WeeklyMetricsCardProps {
  header: string;
  subheader: string;
  metrics: MetricItem[];
  tooltips?: Record<string, TooltipContent>;
  onMetricClick?: (metricKey: string) => void;
  selectedMetricKey?: string | null;
  pillarScore?: number | null;
  pillarComparison?: MetricComparison | null;
  pillarColor: 'teal' | 'amber' | 'indigo';
  animationIndex?: number;
}

export function WeeklyMetricsCard({
  header,
  subheader,
  metrics,
  tooltips = {},
  onMetricClick,
  selectedMetricKey,
  pillarScore,
  pillarComparison,
  pillarColor,
  animationIndex = 0,
}: WeeklyMetricsCardProps) {
  return (
    <div
      className="relative bg-white rounded-2xl shadow-lg hover:shadow-2xl hover:translate-y-[-2px] transition-all p-6 animate-fadeInUp overflow-visible hover:z-50"
      style={{ animationDelay: `${animationIndex * 100}ms` }}
      data-testid={`metric-card-${header.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {/* ============================================
          CARD HEADER
          ============================================ */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-display text-4xl font-semibold tracking-tighter text-gray-900">
            {header}
          </h3>
          <p className="text-base text-gray-500 ">{subheader}</p>
        </div>
        {pillarComparison && (
          <DeltaChip
            percentageChange={pillarComparison.percentageChange}
            direction={pillarComparison.direction}
            size="medium"
            variant="badge"
          />
        )}
      </div>

      {/* ============================================
          SCORE RING
          ============================================ */}
      <div className="flex justify-center pt-8 pb-16">
        <ScoreRing score={pillarScore ?? null} color={pillarColor} size={140} />
      </div>

      {/* Dashed separator */}
      <div className="border-t-2 border-dashed border-slate-200 mb-4" />

      {/* ============================================
          METRICS LIST
          ============================================ */}
      <div className="space-y-3">
        {metrics.map((metric, index) => {
          const tooltipKey = metric.label.toLowerCase().replace(/\s+/g, '');
          const tooltip = tooltips[tooltipKey];
          const isSelected = selectedMetricKey === tooltipKey;

          return (
            <div
              key={index}
              className={`rounded-xl pt-2.5 pb-4 px-4 transition-colors ${
                onMetricClick ? 'cursor-pointer' : ''
              } ${
                isSelected
                  ? 'bg-slate-100/80'
                  : onMetricClick
                    ? 'bg-white hover:bg-slate-50 active:bg-slate-100/80'
                    : 'bg-white'
              }`}
              onClick={() => onMetricClick?.(tooltipKey)}
            >
              {/* Custom display for special metrics like Turn Taking */}
              {metric.customDisplay ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-medium text-gray-700">
                      {metric.label}
                    </span>
                    {tooltip && <MetricTooltip content={tooltip} />}
                  </div>
                  {metric.customDisplay}
                </div>
              ) : (
                <>
                  {/* Row 1: Label + Value */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-medium text-gray-800">
                        {metric.label}
                      </span>
                      {tooltip && <MetricTooltip content={tooltip} />}
                    </div>
                    <div className="flex items-baseline gap-1">
                      {metric.unit === 'WPM' || metric.unit === 'WPS' ? (
                        <>
                          <span className="text-base font-medium text-slate-400">
                            {metric.unit}
                          </span>
                          <span className="text-2xl font-semibold text-gray-900">
                            {metric.currentValue != null
                              ? metric.currentValue.toFixed(0)
                              : 'N/A'}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-2xl font-semibold text-gray-900">
                            {metric.currentValue != null
                              ? metric.currentValue.toFixed(1)
                              : 'N/A'}
                          </span>
                          {metric.unit && (
                            <span className="text-base font-medium text-slate-400">
                              {metric.unit === 'per minute'
                                ? '/min'
                                : metric.unit === 'per meeting'
                                  ? '/meeting'
                                  : metric.unit === 'per hour'
                                    ? '/hour'
                                    : metric.unit}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Baseline + Delta */}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500">
                      {metric.comparison
                        ? `Baseline: ${metric.comparison.baselineValue.toFixed(1)}`
                        : 'Baseline: n/a'}
                    </span>
                    {metric.comparison ? (
                      <DeltaChip
                        percentageChange={metric.comparison.percentageChange}
                        direction={metric.comparison.direction}
                        size="small"
                      />
                    ) : (
                      <span className="text-xs text-gray-400">— 0%</span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
