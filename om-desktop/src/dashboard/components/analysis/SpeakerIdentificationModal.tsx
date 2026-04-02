'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSpeakerIdentificationModal } from '@/hooks/useSpeakerIdentificationModal';
import { SpeakerIdentificationOverlay } from './SpeakerIdentificationOverlay';
import type { SpeakerAssignmentInfo } from '@/hooks/useMeetingData';

interface SpeakerIdentificationModalProps {
  meetingId: string | null;
  currentUserId: string | undefined;
  onClose: () => void;
  onAssignmentComplete?: (
    meetingId: string,
    speakerLabel: string,
    speakerAssignments: SpeakerAssignmentInfo[]
  ) => void;
}

export function SpeakerIdentificationModal({
  meetingId,
  currentUserId,
  onClose,
  onAssignmentComplete,
}: SpeakerIdentificationModalProps) {
  const {
    isOpen,
    error,
    modalData,
    openModal,
    closeModal,
    handleSelectSpeaker,
    isAssigning,
  } = useSpeakerIdentificationModal({
    currentUserId,
    onAssignmentComplete,
    onClose,
  });

  // Track previous meetingId to detect changes
  const prevMeetingIdRef = useRef<string | null>(null);

  // Open modal when meetingId changes (including to a different meeting)
  useEffect(() => {
    if (meetingId && meetingId !== prevMeetingIdRef.current) {
      // Just open the new modal - don't call closeModal() as that triggers
      // onClose callback which sets meetingId prop to null before openModal completes
      openModal(meetingId);
    }
    prevMeetingIdRef.current = meetingId;
  }, [meetingId, openModal]);

  // Handle close
  const handleClose = () => {
    closeModal();
  };

  // Don't render anything until we have data (no loading skeleton)
  if (!meetingId || !isOpen || !modalData) {
    return null;
  }

  // Render error state
  if (error) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
          onClick={handleClose}
        />
        <div className="relative z-10 bg-white rounded-2xl shadow-2xl p-8 max-w-md text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-orange-100 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-orange-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Unable to Load
          </h3>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={handleClose}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // Render the overlay when data is ready
  return createPortal(
    <SpeakerIdentificationOverlay
      speakerRecords={modalData.speakerRecords}
      transcriptSegments={modalData.transcriptSegments}
      onSelectSpeaker={handleSelectSpeaker}
      onClose={handleClose}
      isAssigning={isAssigning}
      meetingTitle={modalData.meetingTitle}
      meetingStartTime={modalData.meetingStartTime}
      userSpeakerLabel={modalData.userSpeakerLabel ?? undefined}
      sharedMicDetected={modalData.sharedMicDetected ?? undefined}
      alternativeSpeakers={modalData.alternativeSpeakers ?? undefined}
    />,
    document.body
  );
}
