/**
 * useSpeakerIdentificationModal Hook
 *
 * Manages the speaker identification modal state and data fetching.
 * Enables showing the modal from any page without navigation.
 */

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
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
  meetingTitle: string;
  meetingStartTime: string;
  userSpeakerLabel: string | null;
  sharedMicDetected: boolean | null;
  alternativeSpeakers: string[] | null;
}

interface UseSpeakerIdentificationModalParams {
  meetingId: string | null;
  currentUserId: string | undefined;
  onAssignmentComplete?: (
    meetingId: string,
    speakerLabel: string,
    speakerAssignments: SpeakerAssignmentInfo[]
  ) => void;
  onClose?: () => void;
}

export function useSpeakerIdentificationModal({
  meetingId,
  currentUserId,
  onAssignmentComplete,
  onClose,
}: UseSpeakerIdentificationModalParams) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalData, setModalData] = useState<ModalData | null>(null);
  // Track when we're navigating after successful assignment (keeps loader visible)
  const [isNavigating, setIsNavigating] = useState(false);

  // Fetch modal data when opening
  const fetchModalData = useCallback(async (targetMeetingId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Fetch processing job to get jobId
      const { data: jobData, error: jobError } = await supabase
        .from('processing_jobs')
        .select('id, status')
        .eq('meeting_id', targetMeetingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (jobError || !jobData) {
        throw new Error('No processing job found for this meeting');
      }

      if (jobData.status !== 'completed') {
        throw new Error('Meeting is still being processed');
      }

      // Fetch meeting metadata
      const { data: meetingData, error: meetingError } = await supabase
        .from('meetings')
        .select(
          'title, start_time, user_speaker_label, shared_mic_detected, alternative_speakers'
        )
        .eq('id', targetMeetingId)
        .single();

      if (meetingError) {
        throw new Error('Failed to fetch meeting data');
      }

      // Fetch speaker records
      const { data: speakerRecords, error: speakersError } = await supabase
        .from('meeting_analysis')
        .select(
          'speaker_label, talk_time_percentage, identification_confidence, assigned_user_id, clarity_score, confidence_score, attunement_score'
        )
        .eq('job_id', jobData.id);

      if (speakersError || !speakerRecords || speakerRecords.length === 0) {
        throw new Error('No speaker data found');
      }

      // Fetch transcript segments
      const { data: transcriptData, error: transcriptError } = await supabase
        .from('transcripts')
        .select('segments')
        .eq('meeting_id', targetMeetingId)
        .single();

      if (transcriptError || !transcriptData) {
        throw new Error('No transcript found');
      }

      setModalData({
        speakerRecords: speakerRecords.map((r) => ({
          speaker_label: r.speaker_label,
          talk_time_percentage: r.talk_time_percentage,
          identification_confidence: r.identification_confidence,
        })),
        transcriptSegments:
          (transcriptData.segments as unknown as TranscriptSegment[]) || [],
        jobId: jobData.id,
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
  const openModal = useCallback(() => {
    if (!meetingId) return;
    // Clear any previous state before opening new modal
    setError(null);
    setModalData(null);
    setIsNavigating(false);
    setIsOpen(true);
    fetchModalData(meetingId);
  }, [meetingId, fetchModalData]);

  // Close modal and reset state
  const closeModal = useCallback(() => {
    setIsOpen(false);
    setModalData(null);
    setError(null);
    onClose?.();
  }, [onClose]);

  // Handle successful assignment - refetch speaker data and notify parent
  const handleAssignmentSuccess = useCallback(async () => {
    if (!meetingId || !modalData) return;

    try {
      const supabase = createClient();

      // Refetch speaker assignments to get updated scores
      const { data: speakerRecords } = await supabase
        .from('meeting_analysis')
        .select(
          'speaker_label, assigned_user_id, custom_speaker_name, clarity_score, confidence_score, attunement_score'
        )
        .eq('job_id', modalData.jobId);

      if (speakerRecords) {
        // Map to SpeakerAssignmentInfo format
        const speakerAssignments: SpeakerAssignmentInfo[] = speakerRecords.map(
          (r) => ({
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
          (r) => r.assigned_user_id === currentUserId
        );

        if (assignedSpeaker) {
          // If onAssignmentComplete is provided, it will navigate - keep loader visible
          if (onAssignmentComplete) {
            setIsNavigating(true);
            onAssignmentComplete(
              meetingId,
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
  }, [meetingId, modalData, currentUserId, onAssignmentComplete, closeModal]);

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
