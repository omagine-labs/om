/**
 * SpeakerCard Component
 *
 * Displays a single speaker's information including:
 * - Speaker name/label
 * - Assignment controls ("This is me", "Assign name")
 * - Speaker metrics (talk time, word count, etc.)
 */

'use client';

import { SpeakerAssignmentControls } from './SpeakerAssignmentControls';
import { SpeakerMetricsDisplay } from './SpeakerMetricsDisplay';

interface SpeakerCardProps {
  // Display
  displayName: string;
  isMe: boolean;

  // Assignment
  isAssigned: boolean;
  isEditing: boolean;
  isAssigning: boolean;
  customName: string;
  onAssignToMe: () => void;
  onStartEditing: () => void;
  onStartEditingExisting: () => void;
  onUnassign: () => void;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;

  // Metrics
  basicMetrics?: {
    talkTimeSeconds: number;
    wordCount: number;
    talkTimePercentage: number;
    words_per_minute?: number | null;
    avg_response_latency_seconds?: number | null;
    quick_responses_percentage?: number | null;
    times_interrupted?: number | null;
    times_interrupting?: number | null;
    interruption_rate?: number | null;
    communication_tips?: string[] | null;
    // Agentic analysis scores
    clarity_score?: number | null;
    clarity_explanation?: string | null;
    confidence_score?: number | null;
    confidence_explanation?: string | null;
    attunement_score?: number | null;
    attunement_explanation?: string | null;
  };
  formatDuration: (seconds: number) => string;
}

export function SpeakerCard({
  displayName,
  isMe,
  isAssigned,
  isEditing,
  isAssigning,
  customName,
  onAssignToMe,
  onStartEditing,
  onStartEditingExisting,
  onUnassign,
  onNameChange,
  onSave,
  onCancel,
  basicMetrics,
  formatDuration,
}: SpeakerCardProps) {
  const showTopLevelUnassign = isMe || isAssigned;
  return (
    <div
      data-testid="speaker-card"
      className={`rounded-lg p-4 ${
        isMe ? 'bg-green-50 border-2 border-green-200' : 'bg-gray-50'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4
          className={`text-md font-semibold ${
            isMe ? 'text-green-900' : 'text-gray-900'
          }`}
        >
          {displayName}
          {isMe && (
            <span className="ml-2 text-xs bg-green-200 text-green-800 px-2 py-1 rounded-full">
              You
            </span>
          )}
        </h4>

        <SpeakerAssignmentControls
          isMe={isMe}
          isAssigned={isAssigned}
          isEditing={isEditing}
          isAssigning={isAssigning}
          customName={customName}
          displayName={displayName}
          showUnassign={showTopLevelUnassign}
          onAssignToMe={onAssignToMe}
          onStartEditing={onStartEditing}
          onStartEditingExisting={onStartEditingExisting}
          onUnassign={onUnassign}
          onNameChange={onNameChange}
          onSave={onSave}
          onCancel={onCancel}
        />
      </div>

      {/* Metrics */}
      <SpeakerMetricsDisplay
        basicMetrics={basicMetrics}
        formatDuration={formatDuration}
        isAssigning={isAssigning}
      />
    </div>
  );
}
