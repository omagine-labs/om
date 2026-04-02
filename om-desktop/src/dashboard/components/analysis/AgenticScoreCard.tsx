/**
 * AgenticScoreCard Component
 *
 * Displays a single agentic analysis score with its explanation.
 * Used to show LLM-generated communication dimension scores.
 */

'use client';

interface AgenticScoreCardProps {
  /**
   * Dimension name (e.g., "Clarity", "Confidence")
   */
  dimension: string;
  /**
   * Score from 1-10
   */
  score: number;
  /**
   * LLM-generated explanation
   */
  explanation: string;
  /**
   * Optional icon for the dimension
   */
  icon?: React.ReactNode;
}

export function AgenticScoreCard({
  dimension,
  score,
  explanation,
  icon,
}: AgenticScoreCardProps) {
  // Color coding based on score ranges
  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-700 bg-green-100 border-green-200';
    if (score >= 6) return 'text-blue-700 bg-blue-100 border-blue-200';
    if (score >= 4) return 'text-yellow-700 bg-yellow-100 border-yellow-200';
    return 'text-red-700 bg-red-100 border-red-200';
  };

  const scoreColorClass = getScoreColor(score);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {/* Header with dimension name and score */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && <div className="text-gray-600">{icon}</div>}
          <h5 className="text-sm font-semibold text-gray-900">{dimension}</h5>
        </div>
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-full font-bold text-lg border-2 ${scoreColorClass}`}
        >
          {score}
        </div>
      </div>

      {/* Explanation */}
      <p className="text-sm text-gray-700 leading-relaxed">{explanation}</p>
    </div>
  );
}
