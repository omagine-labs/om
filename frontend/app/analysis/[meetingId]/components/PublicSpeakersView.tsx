/**
 * PublicSpeakersView Component
 *
 * Simplified speaker display for public analysis preview.
 * Handles deduplication and basic speaker assignment for anonymous users.
 */

'use client';

import { SpeakerCard } from '@/components/analysis/SpeakerCard';
import { useMemo } from 'react';

export interface SpeakerRecord {
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
  clarity_score: number | null;
  clarity_explanation: string | null;
  confidence_score: number | null;
  confidence_explanation: string | null;
  attunement_score: number | null;
  attunement_explanation: string | null;
}

interface DeduplicatedSpeaker {
  speaker_label: string;
  displayName: string;
  isSelected: boolean;
  metrics: {
    talkTimeSeconds: number;
    wordCount: number;
    talkTimePercentage: number;
    words_per_minute: number | null;
    avg_response_latency_seconds: number | null;
    quick_responses_percentage: number | null;
    times_interrupted: number | null;
    times_interrupting: number | null;
    interruption_rate: number | null;
    communication_tips: string[] | null;
    clarity_score: number | null;
    clarity_explanation: string | null;
    confidence_score: number | null;
    confidence_explanation: string | null;
    attunement_score: number | null;
    attunement_explanation: string | null;
  };
}

interface PublicSpeakersViewProps {
  speakerRecords: SpeakerRecord[];
  selectedSpeaker: string | null;
  isAssigning: boolean;
  onAssignSpeaker: (speakerLabel: string) => void;
  onUnassignSpeaker: () => void;
  formatDuration: (seconds: number) => string;
}

/**
 * Humanize speaker label (SPEAKER_A -> Speaker A)
 */
function humanizeSpeakerLabel(label: string): string {
  return label
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function PublicSpeakersView({
  speakerRecords,
  selectedSpeaker,
  isAssigning,
  onAssignSpeaker,
  onUnassignSpeaker,
  formatDuration,
}: PublicSpeakersViewProps) {
  // Deduplicate speakers by speaker_label and aggregate metrics
  const deduplicatedSpeakers = useMemo(() => {
    const speakerMap = new Map<string, SpeakerRecord[]>();

    // Group records by speaker_label
    speakerRecords.forEach((record) => {
      if (!speakerMap.has(record.speaker_label)) {
        speakerMap.set(record.speaker_label, []);
      }
      speakerMap.get(record.speaker_label)!.push(record);
    });

    // Aggregate metrics for each speaker
    const speakers: DeduplicatedSpeaker[] = [];

    speakerMap.forEach((records, speaker_label) => {
      // Sum talk time and word count
      const talkTimeSeconds = records.reduce(
        (sum, r) => sum + r.talk_time_seconds,
        0
      );
      const wordCount = records.reduce((sum, r) => sum + r.word_count, 0);

      // Average percentage
      const talkTimePercentage =
        records.reduce((sum, r) => sum + r.talk_time_percentage, 0) /
        records.length;

      // Average words per minute
      const recordsWithWPM = records.filter((r) => r.words_per_minute != null);
      const words_per_minute =
        recordsWithWPM.length > 0
          ? recordsWithWPM.reduce(
              (sum, r) => sum + (r.words_per_minute || 0),
              0
            ) / recordsWithWPM.length
          : null;

      // Average response latency
      const recordsWithLatency = records.filter(
        (r) => r.avg_response_latency_seconds != null
      );
      const avg_response_latency_seconds =
        recordsWithLatency.length > 0
          ? recordsWithLatency.reduce(
              (sum, r) => sum + (r.avg_response_latency_seconds || 0),
              0
            ) / recordsWithLatency.length
          : null;

      // Average quick responses
      const recordsWithQuickResponses = records.filter(
        (r) => r.quick_responses_percentage != null
      );
      const quick_responses_percentage =
        recordsWithQuickResponses.length > 0
          ? recordsWithQuickResponses.reduce(
              (sum, r) => sum + (r.quick_responses_percentage || 0),
              0
            ) / recordsWithQuickResponses.length
          : null;

      // Sum interruptions
      const times_interrupted = records.reduce(
        (sum, r) => sum + (r.times_interrupted || 0),
        0
      );
      const times_interrupting = records.reduce(
        (sum, r) => sum + (r.times_interrupting || 0),
        0
      );

      // Average interruption rate
      const recordsWithRate = records.filter(
        (r) => r.interruption_rate != null
      );
      const interruption_rate =
        recordsWithRate.length > 0
          ? recordsWithRate.reduce(
              (sum, r) => sum + (r.interruption_rate || 0),
              0
            ) / recordsWithRate.length
          : null;

      // Deduplicate communication tips
      const allTips = records
        .flatMap((r) => r.communication_tips || [])
        .filter((tip): tip is string => Boolean(tip));
      const communication_tips =
        allTips.length > 0 ? Array.from(new Set(allTips)) : null;

      // Average agentic scores and combine explanations
      const recordsWithClarity = records.filter((r) => r.clarity_score != null);
      const clarity_score =
        recordsWithClarity.length > 0
          ? Math.round(
              recordsWithClarity.reduce(
                (sum, r) => sum + (r.clarity_score || 0),
                0
              ) / recordsWithClarity.length
            )
          : null;
      const clarityExplanations = records
        .map((r) => r.clarity_explanation)
        .filter((exp): exp is string => Boolean(exp));
      const clarity_explanation =
        clarityExplanations.length > 0 ? clarityExplanations.join(' ') : null;

      const recordsWithConfidence = records.filter(
        (r) => r.confidence_score != null
      );
      const confidence_score =
        recordsWithConfidence.length > 0
          ? Math.round(
              recordsWithConfidence.reduce(
                (sum, r) => sum + (r.confidence_score || 0),
                0
              ) / recordsWithConfidence.length
            )
          : null;
      const confidenceExplanations = records
        .map((r) => r.confidence_explanation)
        .filter((exp): exp is string => Boolean(exp));
      const confidence_explanation =
        confidenceExplanations.length > 0
          ? confidenceExplanations.join(' ')
          : null;

      const recordsWithAttunement = records.filter(
        (r) => r.attunement_score != null
      );
      const attunement_score =
        recordsWithAttunement.length > 0
          ? Math.round(
              recordsWithAttunement.reduce(
                (sum, r) => sum + (r.attunement_score || 0),
                0
              ) / recordsWithAttunement.length
            )
          : null;
      const attunementExplanations = records
        .map((r) => r.attunement_explanation)
        .filter((exp): exp is string => Boolean(exp));
      const attunement_explanation =
        attunementExplanations.length > 0
          ? attunementExplanations.join(' ')
          : null;

      // Determine display name
      const isSelected = selectedSpeaker === speaker_label;
      const displayName = isSelected
        ? 'You'
        : humanizeSpeakerLabel(speaker_label);

      speakers.push({
        speaker_label,
        displayName,
        isSelected,
        metrics: {
          talkTimeSeconds,
          wordCount,
          talkTimePercentage,
          words_per_minute,
          avg_response_latency_seconds,
          quick_responses_percentage,
          times_interrupted,
          times_interrupting,
          interruption_rate,
          communication_tips,
          clarity_score,
          clarity_explanation,
          confidence_score,
          confidence_explanation,
          attunement_score,
          attunement_explanation,
        },
      });
    });

    return speakers;
  }, [speakerRecords, selectedSpeaker]);

  // Only show the selected speaker's analysis
  const selectedSpeakerData = deduplicatedSpeakers.find(
    (s) => s.speaker_label === selectedSpeaker
  );

  if (!selectedSpeakerData) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Your Communication Analysis
      </h3>

      <SpeakerCard
        key={selectedSpeakerData.speaker_label}
        displayName={selectedSpeakerData.displayName}
        isMe={true}
        isAssigned={true}
        isEditing={false}
        isAssigning={isAssigning}
        customName=""
        onAssignToMe={() => {}}
        onStartEditing={() => {}}
        onStartEditingExisting={() => {}}
        onUnassign={onUnassignSpeaker}
        onNameChange={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
        basicMetrics={selectedSpeakerData.metrics}
        formatDuration={formatDuration}
      />
    </div>
  );
}
