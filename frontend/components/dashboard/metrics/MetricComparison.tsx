/**
 * MetricComparison Component
 *
 * Displays metric comparison with baseline including:
 * - Baseline value
 * - Percentage change
 * - Direction indicator (arrow)
 * - Color-coded status
 */

import type { MetricComparison, MetricStatus } from '@/types/dashboard';

interface MetricComparisonDisplayProps {
  comparison: MetricComparison;
}

/**
 * Get status color classes based on metric status
 */
function getStatusColors(status: MetricStatus): {
  text: string;
  bg: string;
  icon: string;
} {
  switch (status) {
    case 'good':
      return {
        text: 'text-green-700',
        bg: 'bg-green-50',
        icon: 'text-green-600',
      };
    case 'warning':
      return {
        text: 'text-yellow-700',
        bg: 'bg-yellow-50',
        icon: 'text-yellow-600',
      };
    case 'alert':
      return {
        text: 'text-red-700',
        bg: 'bg-red-50',
        icon: 'text-red-600',
      };
  }
}

export function MetricComparisonDisplay({
  comparison,
}: MetricComparisonDisplayProps) {
  const colors = getStatusColors(comparison.status);
  const showArrow = comparison.direction !== 'neutral';

  return (
    <div className="flex items-center justify-between text-sm">
      {/* Baseline Value */}
      <div className="text-gray-600">
        <span className="font-medium">Baseline:</span>{' '}
        {comparison.baselineValue.toFixed(1)}
      </div>

      {/* Change Indicator */}
      <div
        className={`flex items-center gap-1 px-2 py-1 rounded-md ${colors.bg}`}
      >
        {showArrow && (
          <>
            {comparison.direction === 'up' ? (
              <svg
                className={`w-4 h-4 ${colors.icon}`}
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-label="Increased"
              >
                <path
                  fillRule="evenodd"
                  d="M10 17a.75.75 0 01-.75-.75V5.612L5.29 9.77a.75.75 0 01-1.08-1.04l5.25-5.5a.75.75 0 011.08 0l5.25 5.5a.75.75 0 11-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0110 17z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className={`w-4 h-4 ${colors.icon}`}
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-label="Decreased"
              >
                <path
                  fillRule="evenodd"
                  d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </>
        )}
        <span className={`font-medium ${colors.text}`}>
          {comparison.percentageChange > 0 ? '+' : ''}
          {comparison.percentageChange.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
