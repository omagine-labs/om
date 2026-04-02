/**
 * DeltaChip Component
 *
 * Displays a percentage change with arrow indicator and color-coded styling.
 * Used to show metric changes compared to baseline.
 */

import React from 'react';
import type { MetricDirection } from '@/types/dashboard';

interface DeltaChipProps {
  /** Percentage change value (positive or negative) */
  percentageChange: number;
  /** Direction of change */
  direction: MetricDirection;
  /** Size variant of the chip */
  size?: 'small' | 'medium' | 'large';
  /** Style variant - 'default' for inline, 'badge' for card header badges */
  variant?: 'default' | 'badge';
}

export function DeltaChip({
  percentageChange,
  direction,
  size = 'large',
  variant: _variant = 'default',
}: DeltaChipProps) {
  // Background styles
  const bgStyles = {
    up: 'bg-lime-500/20',
    down: 'bg-orange-100',
    neutral: 'bg-slate-100',
  };

  // Icon/arrow color styles
  const iconStyles = {
    up: 'text-lime-600',
    down: 'text-orange-500',
    neutral: 'text-slate-500',
  };

  // Text color styles
  const textStyles = {
    up: 'text-lime-950',
    down: 'text-orange-950',
    neutral: 'text-slate-500',
  };

  const arrow = {
    up: '↑',
    down: '↓',
    neutral: '',
  };

  // Size-specific styling
  const sizeStyles = {
    small: 'px-2 py-0.5 text-xs gap-0.5',
    medium: 'px-2.5 py-1 text-sm gap-1',
    large: 'px-3 py-1 text-sm gap-1',
  };

  return (
    <div
      className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${bgStyles[direction]} ${sizeStyles[size]}`}
    >
      {arrow[direction] && (
        <span className={iconStyles[direction]}>{arrow[direction]}</span>
      )}
      <span className={textStyles[direction]}>
        {Math.abs(percentageChange).toFixed(1)}%
      </span>
    </div>
  );
}
