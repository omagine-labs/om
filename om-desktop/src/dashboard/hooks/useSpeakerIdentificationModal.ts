/**
 * useSpeakerIdentificationModal Hook
 *
 * Manages the speaker identification modal state and data fetching.
 * Enables showing the modal from the meetings page without navigation.
 */

import { useState, useCallback } from 'react';
import { meetingsApi } from '@/lib/api-client';
import { useSpeakerAssignment } from './useSpeakerAssignment';
import type { SpeakerAssignmentInfo } from './useMeetingData';

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: string;
}

interface SpeakerRecord {
  speaker_label: string;
  talk_time_percentage: number;
  identification_confidence?: number | null;
}

interface ModalData {
  speakerRecords: SpeakerRecord[];
  transcriptSegments: TranscriptSegment[];
  jobId: string;
  meetingId: string;
  meetingTitle: string;
  meetingStartTime: string;
  userSpeakerLabel: string | null;
  sharedMicDetected: boolean | null;
  alternativeSpeakers: string[] | null;
}

interface UseSpeakerIdentificationModalParams {
  currentUserId: string | undefined;
  onAssignmentComplete?: (
    meetingId: string,
    speakerLabel: string,
    speakerAssignments: SpeakerAssignmentInfo[]
  ) => void;
  onClose?: () => void;
}

export function useSpeakerIdentificationModal({
  currentUserId,
  onAssignmentComplete,
  onClose,
}: UseSpeakerIdentificationModalParams) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [targetMeetingId, setTargetMeetingId] = useState<string | null>(null);
  // Track when we're navigating after successful assignment (keeps loader visible)
  const [isNavigating, setIsNavigating] = useState(false);

  // Fetch modal data when opening
  const fetchModalData = useCallback(async (meetingId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch all page data via single IPC call
      const pageDataResult =
        await meetingsApi.getMeetingAnalysisPageData(meetingId);

      if (!pageDataResult.success || !pageDataResult.data) {
        throw new Error(pageDataResult.error || 'Failed to load meeting data');
      }

      const {
        meeting: meetingData,
        job: jobData,
        analyses: speakerRecords,
        transcript: transcriptData,
      } = pageDataResult.data;

      if (!meetingData) {
        throw new Error('Meeting not found');
      }

      if (!jobData) {
        throw new Error('No recording found for this meeting');
      }

      if (jobData.status !== 'completed') {
        throw new Error('Meeting is still being processed');
      }

      if (!speakerRecords || speakerRecords.length === 0) {
        throw new Error('No speaker data found');
      }

      if (!transcriptData) {
        throw new Error('No transcript found');
      }

      const segments =
        (transcriptData.segments as Array<{
          start: number;
          end: number;
          text: string;
          speaker: string;
        }>) || [];

      setModalData({
        speakerRecords: speakerRecords.map((r: any) => ({
          speaker_label: r.speaker_label,
          talk_time_percentage: r.talk_time_percentage,
          identification_confidence: r.identification_confidence,
        })),
        transcriptSegments: segments,
        jobId: jobData.id,
        meetingId: meetingId,
        meetingTitle: meetingData.title || 'Untitled Meeting',
        meetingStartTime: meetingData.start_time,
        userSpeakerLabel: meetingData.user_speaker_label,
        sharedMicDetected: meetingData.shared_mic_detected,
        alternativeSpeakers: meetingData.alternative_speakers,
      });
    } catch (err) {
      console.error('Failed to fetch modal data:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load speaker data'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Open modal and fetch data
  const openModal = useCallback(
    (meetingId: string) => {
      // Clear any previous state before opening new modal
      setError(null);
      setModalData(null);
      setIsNavigating(false);
      setTargetMeetingId(meetingId);
      setIsOpen(true);
      fetchModalData(meetingId);
    },
    [fetchModalData]
  );

  // Close modal and reset state
  const closeModal = useCallback(() => {
    setIsOpen(false);
    setModalData(null);
    setError(null);
    setTargetMeetingId(null);
    onClose?.();
  }, [onClose]);

  // Handle successful assignment - refetch speaker data and notify parent
  const handleAssignmentSuccess = useCallback(async () => {
    if (!targetMeetingId || !modalData) return;

    try {
      // Refetch to get updated speaker data
      const pageDataResult =
        await meetingsApi.getMeetingAnalysisPageData(targetMeetingId);

      if (pageDataResult.success && pageDataResult.data?.analyses) {
        const speakerRecords = pageDataResult.data.analyses;

        // Map to SpeakerAssignmentInfo format
        const speakerAssignments: SpeakerAssignmentInfo[] = speakerRecords.map(
          (r: any) => ({
            speakerLabel: r.speaker_label,
            assignedUserId: r.assigned_user_id,
            customSpeakerName: r.custom_speaker_name,
            clarityScore: r.clarity_score,
            confidenceScore: r.confidence_score,
            attunementScore: r.attunement_score,
          })
        );

        // Find the speaker that was assigned to the current user
        const assignedSpeaker = speakerRecords.find(
          (r: any) => r.assigned_user_id === currentUserId
        );

        if (assignedSpeaker) {
          // If onAssignmentComplete is provided, it will navigate - keep loader visible
          if (onAssignmentComplete) {
            setIsNavigating(true);
            onAssignmentComplete(
              targetMeetingId,
              assignedSpeaker.speaker_label,
              speakerAssignments
            );
            // Don't close - navigation will unmount the component
          } else {
            closeModal();
          }
          return;
        }
      }

      // No assigned speaker found, close modal
      closeModal();
    } catch (err) {
      console.error('Failed to refetch after assignment:', err);
      // Still close the modal - the assignment succeeded
      closeModal();
    }
  }, [
    targetMeetingId,
    modalData,
    currentUserId,
    onAssignmentComplete,
    closeModal,
  ]);

  // Speaker assignment hook
  const {
    assignSpeaker,
    isAssigning,
    error: assignError,
  } = useSpeakerAssignment({
    jobId: modalData?.jobId || '',
    currentUserId,
    onSuccess: handleAssignmentSuccess,
  });

  // Handle speaker selection
  const handleSelectSpeaker = useCallback(
    async (speakerLabel: string) => {
      await assignSpeaker(speakerLabel);
    },
    [assignSpeaker]
  );

  return {
    isOpen,
    isLoading,
    error: error || assignError,
    modalData,
    openModal,
    closeModal,
    handleSelectSpeaker,
    // Keep showing loader during assignment AND navigation
    isAssigning: isAssigning || isNavigating,
  };
}
