/**
 * FillerWordsDisplay Component
 *
 * Displays filler word metrics as rate-based metric (per minute) with top 3 most used filler words.
 * Shows "0" if no filler words detected, otherwise shows rate and breakdown list.
 */

import React from 'react';

interface FillerWordsDisplayProps {
  /** Rate of filler words per minute */
  ratePerMinute: number;
  /** JSONB breakdown object mapping filler words to counts (e.g., {"um": 12, "like": 8}) */
  breakdown: Record<string, number> | null;
  /** Number of top fillers to display (default: 3) */
  topN?: number;
}

export function FillerWordsDisplay({
  ratePerMinute,
  breakdown,
  topN = 3,
}: FillerWordsDisplayProps) {
  // If no filler words, show 0
  if (
    ratePerMinute === 0 ||
    !breakdown ||
    Object.keys(breakdown).length === 0
  ) {
    return (
      <div className="text-2xl font-bold text-gray-900 leading-tight">0</div>
    );
  }

  // Sort fillers by count (descending) and take top N
  const sortedFillers = Object.entries(breakdown)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, topN);

  return (
    <div className="space-y-2 pt-0">
      {/* Rate per minute */}
      <div className="text-2xl font-bold text-gray-900 leading-tight">
        {ratePerMinute.toFixed(1)}
      </div>

      {/* Top filler words list */}
      <div className="text-xs text-gray-500">
        <div className="font-medium mb-1">Top {topN}:</div>
        <ul className="space-y-0.5">
          {sortedFillers.map(([word, count]) => (
            <li key={word} className="flex justify-between gap-2">
              <span className="text-gray-600">&quot;{word}&quot;</span>
              <span className="font-medium text-gray-700">({count})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
