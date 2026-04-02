/**
 * AgenticScoresDisplay Component
 *
 * Displays all 3 agentic communication analysis scores:
 * - Clarity
 * - Confidence
 * - Attunement
 *
 * Each score includes the numeric value (1-10) and LLM-generated explanation.
 */

'use client';

import { AgenticScoreCard } from './AgenticScoreCard';

interface AgenticScore {
  score: number;
  explanation: string;
}

interface AgenticScoresDisplayProps {
  clarity?: AgenticScore | null;
  confidence?: AgenticScore | null;
  attunement?: AgenticScore | null;
}

export function AgenticScoresDisplay({
  clarity,
  confidence,
  attunement,
}: AgenticScoresDisplayProps) {
  // Don't render if no scores are available
  const hasAnyScore = clarity || confidence || attunement;
  if (!hasAnyScore) {
    return null;
  }

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
        <svg
          className="w-5 h-5 mr-2 text-purple-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
        Communication Analysis
      </h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {clarity && (
          <AgenticScoreCard
            dimension="Clarity"
            score={clarity.score}
            explanation={clarity.explanation}
            icon={
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            }
          />
        )}

        {confidence && (
          <AgenticScoreCard
            dimension="Confidence"
            score={confidence.score}
            explanation={confidence.explanation}
            icon={
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            }
          />
        )}

        {attunement && (
          <AgenticScoreCard
            dimension="Attunement"
            score={attunement.score}
            explanation={attunement.explanation}
            icon={
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
            }
          />
        )}
      </div>
    </div>
  );
}
