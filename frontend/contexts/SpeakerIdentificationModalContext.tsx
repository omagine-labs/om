'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SpeakerIdentificationModal } from '@/components/analysis/SpeakerIdentificationModal';
import type { SpeakerAssignmentInfo } from '@/hooks/useMeetingData';

interface SpeakerIdentificationModalContextType {
  openSpeakerModal: (meetingId: string) => void;
  closeSpeakerModal: () => void;
}

const SpeakerIdentificationModalContext =
  createContext<SpeakerIdentificationModalContextType | null>(null);

interface SpeakerIdentificationModalProviderProps {
  children: React.ReactNode;
  currentUserId: string;
}

export function SpeakerIdentificationModalProvider({
  children,
  currentUserId,
}: SpeakerIdentificationModalProviderProps) {
  const router = useRouter();
  const [modalMeetingId, setModalMeetingId] = useState<string | null>(null);

  const openSpeakerModal = useCallback((meetingId: string) => {
    setModalMeetingId(meetingId);
  }, []);

  const closeSpeakerModal = useCallback(() => {
    setModalMeetingId(null);
  }, []);

  const handleAssignmentComplete = useCallback(
    (
      meetingId: string,
      _speakerLabel: string,
      _speakerAssignments: SpeakerAssignmentInfo[]
    ) => {
      setModalMeetingId(null);
      // Refresh to update unassigned counter in sidebar, then navigate
      router.refresh();
      router.push(`/meetings/${meetingId}/analysis`);
    },
    [router]
  );

  return (
    <SpeakerIdentificationModalContext.Provider
      value={{ openSpeakerModal, closeSpeakerModal }}
    >
      {children}
      <SpeakerIdentificationModal
        meetingId={modalMeetingId}
        currentUserId={currentUserId}
        onClose={closeSpeakerModal}
        onAssignmentComplete={handleAssignmentComplete}
      />
    </SpeakerIdentificationModalContext.Provider>
  );
}

export function useSpeakerIdentificationModalContext() {
  const context = useContext(SpeakerIdentificationModalContext);
  if (!context) {
    throw new Error(
      'useSpeakerIdentificationModalContext must be used within a SpeakerIdentificationModalProvider'
    );
  }
  return context;
}
