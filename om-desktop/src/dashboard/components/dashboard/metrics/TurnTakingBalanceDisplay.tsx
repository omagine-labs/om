/**
 * TurnTakingBalanceDisplay Component
 *
 * Displays turn taking balance score with a status chip indicating whether
 * the user is balanced, over-participating, or under-participating.
 */

import React from 'react';

interface TurnTakingBalanceDisplayProps {
  /** Turn taking balance score (negative = under-participating, positive = over-participating) */
  value: number;
}

export function TurnTakingBalanceDisplay({
  value,
}: TurnTakingBalanceDisplayProps) {
  // Determine status based on value thresholds
  const getStatus = () => {
    if (value > 5) return 'over';
    if (value < -5) return 'under';
    return 'balanced';
  };

  const status = getStatus();

  // Status chip styling
  const chipStyles = {
    over: 'bg-yellow-100 text-yellow-950',
    under: 'bg-blue-100 text-blue-950',
    balanced: 'bg-lime-500/20 text-lime-950',
  };

  const chipLabels = {
    over: 'Over-participated',
    under: 'Under-participated',
    balanced: 'Balanced',
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {/* Value */}
      <div className="text-lg font-semibold text-gray-900">
        {value.toFixed(1)}
      </div>

      {/* Status chip */}
      <div
        className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${chipStyles[status]}`}
      >
        {chipLabels[status]}
      </div>
    </div>
  );
}
