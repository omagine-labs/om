/**
 * useSpeakerIdentityGrouping Hook
 *
 * Groups speaker records by identity (custom name, "You", or segment+label).
 * Handles the complex logic of combining speakers with the same assigned identity
 * while keeping unassigned speakers separate by segment.
 */

import { useMemo } from 'react';

// Basic speaker record structure (core fields used for grouping)
export interface SpeakerRecord {
  id: string;
  speaker_label: string;
  assigned_user_id: string | null;
  custom_speaker_name: string | null;
  talk_time_seconds: number;
  talk_time_percentage: number;
  word_count: number;
  communication_tips?: string[] | null;
  words_per_minute?: number | null;
  avg_response_latency_seconds?: number | null;
  quick_responses_percentage?: number | null;
  times_interrupted?: number | null;
  times_interrupting?: number | null;
  interruption_rate?: number | null;
  // Agentic analysis scores
  clarity_score?: number | null;
  clarity_explanation?: string | null;
  confidence_score?: number | null;
  confidence_explanation?: string | null;
  attunement_score?: number | null;
  attunement_explanation?: string | null;
}

export interface SpeakerIdentityGroup {
  identity: string;
  records: SpeakerRecord[]; // Uses basic SpeakerRecord (can be extended in components)
  isMe: boolean;
  isAssigned: boolean;
  displayName: string;
  metrics: {
    totalTalkTime: number;
    totalWords: number;
    avgPercentage: number;
    communication_tips?: string[];
    words_per_minute?: number;
    avg_response_latency_seconds?: number;
    quick_responses_percentage?: number;
    times_interrupted?: number;
    times_interrupting?: number;
    interruption_rate?: number;
    // Agentic analysis scores (aggregated)
    clarity_score?: number | null;
    clarity_explanation?: string | null;
    confidence_score?: number | null;
    confidence_explanation?: string | null;
    attunement_score?: number | null;
    attunement_explanation?: string | null;
  };
}

interface UseSpeakerIdentityGroupingParams {
  speakerRecords: SpeakerRecord[];
  currentUserId: string | null | undefined;
  /** The speaker label from meetings.user_speaker_label (source of truth for "You") */
  userSpeakerLabel?: string | null;
}

/**
 * Groups speaker records by identity and calculates rolled-up metrics
 */
export function useSpeakerIdentityGrouping({
  speakerRecords,
  currentUserId,
  userSpeakerLabel,
}: UseSpeakerIdentityGroupingParams): SpeakerIdentityGroup[] {
  return useMemo(() => {
    const identityGroups = new Map<string, SpeakerRecord[]>();

    // Group speakers by identity
    speakerRecords.forEach((record) => {
      // Group by assigned identity (custom name or "You")
      // For unassigned speakers, use speaker_label to keep them separate
      // userSpeakerLabel is the source of truth for identifying the current user's speaker
      const isMe =
        userSpeakerLabel && record.speaker_label === userSpeakerLabel;
      const identity =
        record.custom_speaker_name ||
        (isMe ? 'You' : null) ||
        record.speaker_label;

      if (!identityGroups.has(identity)) {
        identityGroups.set(identity, []);
      }
      identityGroups.get(identity)!.push(record);
    });

    // Convert to array and sort (current user first)
    const sortedGroups = Array.from(identityGroups.entries()).sort(
      ([identityA, recordsA], [identityB, recordsB]) => {
        // Check if any record in the group is the current user's speaker
        const isAMe = recordsA.some(
          (r) => userSpeakerLabel && r.speaker_label === userSpeakerLabel
        );
        const isBMe = recordsB.some(
          (r) => userSpeakerLabel && r.speaker_label === userSpeakerLabel
        );
        if (isAMe && !isBMe) return -1;
        if (!isAMe && isBMe) return 1;
        return 0;
      }
    );

    // Map to structured groups with metrics
    return sortedGroups.map(([identity, records]) => {
      const isMe = records.some(
        (r) => userSpeakerLabel && r.speaker_label === userSpeakerLabel
      );
      const isAssigned = records.some(
        (r) =>
          (userSpeakerLabel && r.speaker_label === userSpeakerLabel) ||
          r.custom_speaker_name
      );

      // Calculate rolled-up metrics
      const totalTalkTime = records.reduce(
        (sum, r) => sum + r.talk_time_seconds,
        0
      );
      const totalWords = records.reduce((sum, r) => sum + r.word_count, 0);
      const avgPercentage =
        records.reduce((sum, r) => sum + r.talk_time_percentage, 0) /
        records.length;

      // Aggregate communication tips (deduplicate)
      const allTips = records
        .flatMap((r) => r.communication_tips || [])
        .filter((tip): tip is string => Boolean(tip));
      const uniqueTips = Array.from(new Set(allTips));

      // Calculate averages for detailed metrics
      const recordsWithWPM = records.filter((r) => r.words_per_minute != null);
      const avgWordsPerMinute =
        recordsWithWPM.length > 0
          ? recordsWithWPM.reduce(
              (sum, r) => sum + (r.words_per_minute || 0),
              0
            ) / recordsWithWPM.length
          : undefined;

      const recordsWithLatency = records.filter(
        (r) => r.avg_response_latency_seconds != null
      );
      const avgResponseLatency =
        recordsWithLatency.length > 0
          ? recordsWithLatency.reduce(
              (sum, r) => sum + (r.avg_response_latency_seconds || 0),
              0
            ) / recordsWithLatency.length
          : undefined;

      const recordsWithQuickResponses = records.filter(
        (r) => r.quick_responses_percentage != null
      );
      const avgQuickResponses =
        recordsWithQuickResponses.length > 0
          ? recordsWithQuickResponses.reduce(
              (sum, r) => sum + (r.quick_responses_percentage || 0),
              0
            ) / recordsWithQuickResponses.length
          : undefined;

      // Sum for interruption counts
      const totalInterrupted = records.reduce(
        (sum, r) => sum + (r.times_interrupted || 0),
        0
      );
      const totalInterrupting = records.reduce(
        (sum, r) => sum + (r.times_interrupting || 0),
        0
      );

      // Average interruption rate
      const recordsWithRate = records.filter(
        (r) => r.interruption_rate != null
      );
      const avgInterruptionRate =
        recordsWithRate.length > 0
          ? recordsWithRate.reduce(
              (sum, r) => sum + (r.interruption_rate || 0),
              0
            ) / recordsWithRate.length
          : undefined;

      // For unassigned speakers, identity is just the speaker_label
      const displayName = identity;

      // Aggregate agentic scores - average scores, combine explanations
      const recordsWithClarity = records.filter((r) => r.clarity_score != null);
      const avgClarityScore =
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

      const recordsWithConfidence = records.filter(
        (r) => r.confidence_score != null
      );
      const avgConfidenceScore =
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

      const recordsWithAttunement = records.filter(
        (r) => r.attunement_score != null
      );
      const avgAttunementScore =
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

      return {
        identity,
        records,
        isMe,
        isAssigned,
        displayName,
        metrics: {
          totalTalkTime,
          totalWords,
          avgPercentage,
          communication_tips: uniqueTips.length > 0 ? uniqueTips : undefined,
          words_per_minute: avgWordsPerMinute,
          avg_response_latency_seconds: avgResponseLatency,
          quick_responses_percentage: avgQuickResponses,
          times_interrupted: totalInterrupted,
          times_interrupting: totalInterrupting,
          interruption_rate: avgInterruptionRate,
          // Agentic scores - averaged scores, combined explanations
          clarity_score: avgClarityScore,
          clarity_explanation:
            clarityExplanations.length > 0
              ? clarityExplanations.join(' ')
              : null,
          confidence_score: avgConfidenceScore,
          confidence_explanation:
            confidenceExplanations.length > 0
              ? confidenceExplanations.join(' ')
              : null,
          attunement_score: avgAttunementScore,
          attunement_explanation:
            attunementExplanations.length > 0
              ? attunementExplanations.join(' ')
              : null,
        },
      };
    });
  }, [speakerRecords, currentUserId, userSpeakerLabel]);
}
