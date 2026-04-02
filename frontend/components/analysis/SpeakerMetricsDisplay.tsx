/**
 * SpeakerMetricsDisplay Component
 *
 * Displays speaker statistics with progress bar and key metrics.
 */

'use client';

import { AgenticScoresDisplay } from './AgenticScoresDisplay';

interface BasicMetrics {
  talkTimeSeconds: number;
  wordCount: number;
  talkTimePercentage: number;
  words_per_minute?: number | null;
  avg_response_latency_seconds?: number | null;
  quick_responses_percentage?: number | null;
  times_interrupted?: number | null;
  times_interrupting?: number | null;
  interruption_rate?: number | null;
  turn_taking_balance?: number | null;
  communication_tips?: string[] | null;
  // Agentic analysis scores
  clarity_score?: number | null;
  clarity_explanation?: string | null;
  confidence_score?: number | null;
  confidence_explanation?: string | null;
  attunement_score?: number | null;
  attunement_explanation?: string | null;
}

interface SpeakerMetricsDisplayProps {
  basicMetrics?: BasicMetrics;
  formatDuration: (seconds: number) => string;
  isAssigning?: boolean;
}

export function SpeakerMetricsDisplay({
  basicMetrics,
  formatDuration,
}: SpeakerMetricsDisplayProps) {
  // Return null if no metrics provided
  if (!basicMetrics) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Progress Bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div
          className="bg-blue-600 h-2 rounded-full"
          style={{
            width: `${basicMetrics.talkTimePercentage}%`,
          }}
        />
      </div>

      {/* Stats */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">Talk Time</span>
          <span className="text-sm font-medium text-gray-900">
            {formatDuration(basicMetrics.talkTimeSeconds)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">Word Count</span>
          <span className="text-sm font-medium text-gray-900">
            {basicMetrics.wordCount}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-600">% of Meeting</span>
          <span className="text-sm font-medium text-gray-900">
            {basicMetrics.talkTimePercentage.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Detailed Metrics */}
      {(basicMetrics.words_per_minute != null ||
        basicMetrics.avg_response_latency_seconds != null ||
        basicMetrics.quick_responses_percentage != null ||
        basicMetrics.times_interrupted != null ||
        basicMetrics.times_interrupting != null ||
        basicMetrics.interruption_rate != null ||
        basicMetrics.turn_taking_balance != null) && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-3">
            {basicMetrics.words_per_minute != null && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Words per Minute</span>
                <span className="text-sm font-medium text-gray-900">
                  {Math.round(basicMetrics.words_per_minute)}
                </span>
              </div>
            )}
            {basicMetrics.avg_response_latency_seconds != null && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Response Time</span>
                <span className="text-sm font-medium text-gray-900">
                  {basicMetrics.avg_response_latency_seconds.toFixed(2)}s
                </span>
              </div>
            )}
            {basicMetrics.quick_responses_percentage != null && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">
                  Quick Responses (&lt;1s)
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {basicMetrics.quick_responses_percentage.toFixed(1)}%
                </span>
              </div>
            )}
            {basicMetrics.times_interrupted != null && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Times Interrupted</span>
                <span className="text-sm font-medium text-gray-900">
                  {basicMetrics.times_interrupted}
                </span>
              </div>
            )}
            {basicMetrics.times_interrupting != null && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">
                  Times Interrupting
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {basicMetrics.times_interrupting}
                </span>
              </div>
            )}
            {basicMetrics.interruption_rate != null && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-600">Interruption Rate</span>
                <span className="text-sm font-medium text-gray-900">
                  {basicMetrics.interruption_rate.toFixed(2)}/min
                </span>
              </div>
            )}
            {basicMetrics.turn_taking_balance != null && (
              <div className="flex justify-between items-center col-span-2">
                <span className="text-xs text-gray-600">
                  Turn Taking Balance
                </span>
                <span
                  className={`text-sm font-medium ${
                    Math.abs(basicMetrics.turn_taking_balance) < 5
                      ? 'text-green-700'
                      : Math.abs(basicMetrics.turn_taking_balance) < 15
                        ? 'text-yellow-700'
                        : 'text-red-700'
                  }`}
                >
                  {basicMetrics.turn_taking_balance.toFixed(1)}%{' '}
                  {basicMetrics.turn_taking_balance > 5
                    ? '(dominating)'
                    : basicMetrics.turn_taking_balance < -5
                      ? '(under-participating)'
                      : '(balanced)'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Communication Tips */}
      {basicMetrics.communication_tips &&
        basicMetrics.communication_tips.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
              <svg
                className="w-4 h-4 mr-1 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              Communication Tips
            </p>
            <ul className="space-y-2">
              {basicMetrics.communication_tips.map((tip, idx) => (
                <li
                  key={idx}
                  className="text-sm text-gray-700 flex items-start"
                >
                  <span className="text-blue-600 mr-2 mt-0.5">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

      {/* Agentic Communication Analysis Scores */}
      <AgenticScoresDisplay
        clarity={
          basicMetrics.clarity_score != null
            ? {
                score: basicMetrics.clarity_score,
                explanation: basicMetrics.clarity_explanation || '',
              }
            : null
        }
        confidence={
          basicMetrics.confidence_score != null
            ? {
                score: basicMetrics.confidence_score,
                explanation: basicMetrics.confidence_explanation || '',
              }
            : null
        }
        attunement={
          basicMetrics.attunement_score != null
            ? {
                score: basicMetrics.attunement_score,
                explanation: basicMetrics.attunement_explanation || '',
              }
            : null
        }
      />
    </div>
  );
}
