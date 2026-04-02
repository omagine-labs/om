/**
 * SpeakersView Component
 *
 * Displays speaker statistics and metrics with identity-grouped speakers.
 */

'use client';

import { SpeakerCard } from './SpeakerCard';
import { SpeakerIdentityGroup } from '@/hooks/useSpeakerIdentityGrouping';

// Full speaker record with all metrics (from database)
// Extends the basic SpeakerRecord from the hook
interface FullSpeakerRecord {
  id: string;
  speaker_label: string;
  assigned_user_id: string | null;
  custom_speaker_name: string | null;
  talk_time_seconds: number;
  talk_time_percentage: number;
  word_count: number;
  words_per_minute: number | null;
  avg_response_latency_seconds: number | null;
  quick_responses_percentage: number | null;
  times_interrupted: number | null;
  times_interrupting: number | null;
  interruption_rate: number | null;
  communication_tips: string[] | null;
  // Agentic analysis scores
  clarity_score: number | null;
  clarity_explanation: string | null;
  confidence_score: number | null;
  confidence_explanation: string | null;
  attunement_score: number | null;
  attunement_explanation: string | null;
}

interface SpeakersViewProps {
  speakerRecords: FullSpeakerRecord[];
  identityGroups: SpeakerIdentityGroup[];

  // Helper functions
  isAssignedToMe: (speaker: string) => boolean;
  getDisplayName: (speaker: string) => string;
  isAssigned: (speaker: string) => boolean;
  formatDuration: (seconds: number) => string;

  // Assignment state and handlers
  editingSpeaker: string | null;
  isAssigning: boolean;
  customName: string;
  setEditingSpeaker: (speaker: string | null) => void;
  setCustomName: (name: string) => void;
  handleAssignSpeaker: (speaker: string) => void;
  handleAssignCustomName: (speaker: string, name: string) => void;
  handleUnassignSpeaker: (speaker: string) => void;
}

export function SpeakersView({
  speakerRecords,
  identityGroups,
  isAssignedToMe,
  getDisplayName,
  isAssigned,
  formatDuration,
  editingSpeaker,
  isAssigning,
  customName,
  setEditingSpeaker,
  setCustomName,
  handleAssignSpeaker,
  handleAssignCustomName,
  handleUnassignSpeaker,
}: SpeakersViewProps) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Speaker Statistics & Metrics
      </h3>

      {/* Use identity groups to deduplicate speakers */}
      <div className="space-y-4">
        {identityGroups.map((group) => {
          const { identity, records, isMe, isAssigned, displayName, metrics } =
            group;

          return (
            <SpeakerCard
              key={identity}
              displayName={displayName}
              isMe={isMe}
              isAssigned={isAssigned}
              isEditing={editingSpeaker === records[0].speaker_label}
              isAssigning={isAssigning}
              customName={customName}
              onAssignToMe={() => handleAssignSpeaker(records[0].speaker_label)}
              onStartEditing={() => {
                setEditingSpeaker(records[0].speaker_label);
                setCustomName('');
              }}
              onStartEditingExisting={() => {
                setEditingSpeaker(records[0].speaker_label);
                setCustomName(displayName);
              }}
              onUnassign={() => handleUnassignSpeaker(records[0].speaker_label)}
              onNameChange={setCustomName}
              onSave={() =>
                handleAssignCustomName(records[0].speaker_label, customName)
              }
              onCancel={() => {
                setEditingSpeaker(null);
                setCustomName('');
              }}
              basicMetrics={{
                talkTimeSeconds: metrics.totalTalkTime,
                wordCount: metrics.totalWords,
                talkTimePercentage: metrics.avgPercentage,
                words_per_minute: metrics.words_per_minute,
                avg_response_latency_seconds:
                  metrics.avg_response_latency_seconds,
                quick_responses_percentage: metrics.quick_responses_percentage,
                times_interrupted: metrics.times_interrupted,
                times_interrupting: metrics.times_interrupting,
                interruption_rate: metrics.interruption_rate,
                communication_tips: metrics.communication_tips,
                clarity_score: metrics.clarity_score,
                clarity_explanation: metrics.clarity_explanation,
                confidence_score: metrics.confidence_score,
                confidence_explanation: metrics.confidence_explanation,
                attunement_score: metrics.attunement_score,
                attunement_explanation: metrics.attunement_explanation,
              }}
              formatDuration={formatDuration}
            />
          );
        })}
      </div>
    </div>
  );
}
