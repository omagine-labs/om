'use client';

import { useState, useImperativeHandle, forwardRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Tables } from '@/supabase/database.types';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useMeetingData, type Meeting } from '@/hooks/useMeetingData';
import { useDragAndDrop } from '@/hooks/useDragAndDrop';
import { useDelayedSkeleton } from '@/hooks/useDelayedSkeleton';
import { createClient } from '@/lib/supabase';
import { reprocessMeeting } from '@/app/actions/reprocess';
import CreateManualMeetingModal from './CreateManualMeetingModal';
import DateGroupDivider from './meetings/DateGroupDivider';
import EmptyState from './meetings/EmptyState';
import MeetingCard from './meetings/MeetingCard';
import UnassignedRecordingCard from './meetings/UnassignedRecordingCard';
import { SpeakerIdentificationModal } from './analysis/SpeakerIdentificationModal';
import { Toast } from './ui/Toast';

interface MeetingsAndRecordingsProps {
  onCreateManualMeeting?: (
    meeting: {
      title: string;
      datetime: string;
      endDatetime?: string;
      description?: string;
    },
    file: File
  ) => void;
  onDeleteMeeting: (meeting: Meeting) => void;
  refreshTrigger?: number;
  hasDesktopApp?: boolean;
}

import type { SpeakerAssignmentInfo } from '@/hooks/useMeetingData';

export interface MeetingsAndRecordingsRef {
  removeMeetingOptimistic: (meetingId: string) => void;
  updateProcessingStatusOptimistic: (
    meetingId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed'
  ) => void;
  updateSpeakerAssignmentsOptimistic: (
    meetingId: string,
    speakerAssignments: SpeakerAssignmentInfo[]
  ) => void;
  addMeetingOptimistic: (meeting: Tables<'meetings'>) => void;
  openUploadModal: () => void;
}

const MeetingsAndRecordings = forwardRef<
  MeetingsAndRecordingsRef,
  MeetingsAndRecordingsProps
>(function MeetingsAndRecordings(
  {
    onCreateManualMeeting,
    onDeleteMeeting,
    refreshTrigger,
    hasDesktopApp = false,
  },
  ref
) {
  const [selectedMeetingForUpload, setSelectedMeetingForUpload] =
    useState<Meeting | null>(null);
  const [uploadingMeetingId, setUploadingMeetingId] = useState<string | null>(
    null
  );
  const [showUnifiedModal, setShowUnifiedModal] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
  } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [speakerModalMeetingId, setSpeakerModalMeetingId] = useState<
    string | null
  >(null);

  const router = useRouter();

  // Fetch current user ID on mount
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchCurrentUser();
  }, []);

  const { uploadFile, isUploading, uploadProgress } = useFileUpload();
  const {
    meetingsWithRecordings,
    unassignedRecordings,
    loading,
    error,
    reload,
    removeMeetingOptimistic,
    updateProcessingStatusOptimistic,
    updateSpeakerAssignmentsOptimistic,
    updateUserSpeakerLabelOptimistic,
    addMeetingOptimistic,
    hasMore,
    loadingMore,
    loadMore,
  } = useMeetingData({ refreshTrigger });

  // Delayed skeleton: only show if loading takes > 400ms
  const showSkeleton = useDelayedSkeleton(loading);

  // Expose optimistic update methods to parent via ref
  useImperativeHandle(ref, () => ({
    removeMeetingOptimistic,
    updateProcessingStatusOptimistic,
    updateSpeakerAssignmentsOptimistic,
    addMeetingOptimistic,
    openUploadModal: () => {
      setSelectedMeetingForUpload(null);
      setShowUnifiedModal(true);
    },
  }));

  const handleDeleteMeeting = (meeting: Meeting) => {
    onDeleteMeeting(meeting);
  };

  // Speaker identification modal handlers
  const handleIdentifySpeaker = (meetingId: string) => {
    setSpeakerModalMeetingId(meetingId);
  };

  const handleSpeakerModalClose = () => {
    setSpeakerModalMeetingId(null);
  };

  const handleAssignmentComplete = (
    meetingId: string,
    speakerLabel: string,
    speakerAssignments: SpeakerAssignmentInfo[]
  ) => {
    // Update both speaker assignments and user_speaker_label in local state
    updateSpeakerAssignmentsOptimistic(meetingId, speakerAssignments);
    updateUserSpeakerLabelOptimistic(meetingId, speakerLabel);

    // Navigate to the analysis page
    router.push(`/meetings/${meetingId}/analysis`);
  };

  const handleUnifiedModalSubmit = async (
    meeting: {
      title: string;
      datetime: string;
      endDatetime?: string;
      description?: string;
    },
    file: File
  ) => {
    try {
      // If we have a selected meeting, we're uploading to an existing meeting
      if (selectedMeetingForUpload) {
        setUploadingMeetingId(selectedMeetingForUpload.id);

        // Convert datetime-local to ISO with proper timezone handling
        const parseLocalDateTime = (dateTimeStr: string): string => {
          const [datePart, timePart] = dateTimeStr.split('T');
          const [year, month, day] = datePart.split('-').map(Number);
          const [hours, minutes] = timePart.split(':').map(Number);
          const localDate = new Date(year, month - 1, day, hours, minutes);
          return localDate.toISOString();
        };

        const startTimeISO = parseLocalDateTime(meeting.datetime);
        const endTimeISO = meeting.endDatetime
          ? parseLocalDateTime(meeting.endDatetime)
          : null;

        // Update meeting details if they changed
        const supabase = createClient();
        await supabase
          .from('meetings')
          .update({
            title: meeting.title,
            start_time: startTimeISO,
            end_time: endTimeISO,
          })
          .eq('id', selectedMeetingForUpload.id);

        // Optimistically show as processing
        updateProcessingStatusOptimistic(
          selectedMeetingForUpload.id,
          'processing'
        );

        // Upload file
        await uploadFile(file, {
          id: selectedMeetingForUpload.id,
          summary: meeting.title,
          start: startTimeISO,
        });

        // Reload to get real data from database
        await reload();
        setUploadingMeetingId(null);
      } else {
        // Creating a new manual meeting - delegate to parent
        if (onCreateManualMeeting) {
          onCreateManualMeeting(meeting, file);
        }
      }
    } catch (err) {
      console.error('Upload error:', err);
      setUploadingMeetingId(null);
    }
  };

  const handleFileDrop = async (file: File, meeting: Meeting) => {
    try {
      setUploadingMeetingId(meeting.id);
      await uploadFile(file, {
        id: meeting.id, // Database meeting ID
        summary: meeting.title,
        start: meeting.start_time,
      });
      // Wait briefly for database trigger to fire before refreshing
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Refresh the list to get the updated status
      await reload();

      // Clear uploading state after data is loaded
      setUploadingMeetingId(null);
    } catch (err) {
      console.error('Upload error:', err);
      setUploadingMeetingId(null);
    }
  };

  const {
    dragOverMeetingId,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useDragAndDrop({ onDrop: handleFileDrop });

  const handleReprocess = async (meeting: Meeting) => {
    try {
      // Optimistically update to processing status immediately (no scroll jump!)
      updateProcessingStatusOptimistic(meeting.id, 'processing');

      const result = await reprocessMeeting(meeting.id);

      if (result.success) {
        console.log('Reprocessing started for meeting:', meeting.id);
        const meetingTitle = meeting.title;
        const meetingId = meeting.id;
        const supabase = createClient();

        // Poll for auto-deletion (happens when no speech detected in recording)
        {
          // Poll for meeting deletion
          // Check every 5 seconds for up to 60 seconds
          let checkCount = 0;
          const maxChecks = 12; // 60 seconds total
          const checkInterval = setInterval(async () => {
            checkCount++;

            // Directly check database instead of full reload to avoid UI glitching
            const { data: meetingCheck } = await supabase
              .from('meetings')
              .select('id')
              .eq('id', meetingId)
              .maybeSingle();

            if (!meetingCheck) {
              clearInterval(checkInterval);
              // Optimistically remove from UI (no scroll jump!)
              removeMeetingOptimistic(meetingId);
              setToast({
                message: `"${meetingTitle}" was automatically deleted because no speech was detected in the recording. This usually happens with screen recordings that have no audio or voice.`,
                type: 'info',
              });
            } else if (checkCount >= maxChecks) {
              // Stop checking after max attempts
              clearInterval(checkInterval);
            }
          }, 5000);
        }
      } else {
        console.error('Failed to reprocess:', result.message);
        // Revert optimistic update on failure - set back to failed status
        updateProcessingStatusOptimistic(meeting.id, 'failed');
        setToast({
          message: `Failed to reprocess: ${result.message}`,
          type: 'error',
        });
      }
    } catch (err) {
      console.error('Reprocess error:', err);
      // Revert optimistic update on error - set back to failed status
      updateProcessingStatusOptimistic(meeting.id, 'failed');
      setToast({
        message:
          'An error occurred while trying to reprocess. Please try again.',
        type: 'error',
      });
    }
  };

  // Group meetings by date and sort by most recent first
  const groupedMeetings = meetingsWithRecordings.reduce(
    (groups, meetingWithRecording) => {
      const date = new Date(meetingWithRecording.meeting.start_time);
      const dateKey = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(meetingWithRecording);
      return groups;
    },
    {} as Record<string, typeof meetingsWithRecordings>
  );

  // Sort groups by date (most recent first) and sort meetings within each group
  const sortedDateGroups = Object.entries(groupedMeetings)
    .map(([dateKey, meetings]) => ({
      dateKey,
      date: new Date(meetings[0].meeting.start_time),
      meetings: meetings.sort(
        (a, b) =>
          new Date(b.meeting.start_time).getTime() -
          new Date(a.meeting.start_time).getTime()
      ),
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  // Check if we have any data to display
  const hasAnyData =
    sortedDateGroups.length > 0 || unassignedRecordings.length > 0;

  // Show loading or empty state
  if (loading || !hasAnyData) {
    return (
      <div>
        <EmptyState
          isLoading={loading}
          showSkeleton={showSkeleton}
          hasDesktopApp={hasDesktopApp}
        />
        <CreateManualMeetingModal
          isOpen={showUnifiedModal}
          onClose={() => {
            setShowUnifiedModal(false);
            setSelectedMeetingForUpload(null);
          }}
          onCreate={handleUnifiedModalSubmit}
          existingMeeting={selectedMeetingForUpload || undefined}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-8">
        {/* Past Meetings (last 7 days) - grouped by date */}
        {/* Calculate global animation indices for true sequential staggering */}
        {(() => {
          let globalAnimationIndex = 0;
          return (
            sortedDateGroups.length > 0 && (
              <div className="space-y-8">
                {sortedDateGroups.map((group) => (
                  <div key={group.dateKey}>
                    <DateGroupDivider dateLabel={group.dateKey} />

                    {/* Meetings for this date */}
                    <div className="space-y-3">
                      {group.meetings.map((meetingWithRecording) => {
                        const currentAnimationIndex = globalAnimationIndex++;
                        const isUploading =
                          uploadingMeetingId ===
                          meetingWithRecording.meeting.id;
                        const isDragOver =
                          dragOverMeetingId === meetingWithRecording.meeting.id;
                        const canUpload = !meetingWithRecording.recording;

                        return (
                          <MeetingCard
                            key={meetingWithRecording.meeting.id}
                            meeting={meetingWithRecording.meeting}
                            recording={meetingWithRecording.recording}
                            speakerAssignments={
                              meetingWithRecording.speakerAssignments
                            }
                            currentUserId={currentUserId}
                            isUploading={isUploading}
                            uploadProgress={uploadProgress}
                            isDragOver={isDragOver}
                            animationIndex={currentAnimationIndex}
                            onReprocess={handleReprocess}
                            onDelete={handleDeleteMeeting}
                            onIdentifySpeaker={handleIdentifySpeaker}
                            onDragEnter={
                              canUpload
                                ? (e) =>
                                    handleDragEnter(
                                      e,
                                      meetingWithRecording.meeting.id
                                    )
                                : undefined
                            }
                            onDragLeave={
                              canUpload ? handleDragLeave : undefined
                            }
                            onDragOver={canUpload ? handleDragOver : undefined}
                            onDrop={
                              canUpload
                                ? (e) =>
                                    handleDrop(e, meetingWithRecording.meeting)
                                : undefined
                            }
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          );
        })()}

        {/* Load More Button */}
        {hasMore && !loading && (
          <div className="flex justify-center mt-6">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          </div>
        )}

        {/* Unassigned Recordings */}
        {unassignedRecordings.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-slate-500 mb-3">
              Other Recordings
            </h3>
            <div className="space-y-3">
              {unassignedRecordings.map((recording) => (
                <UnassignedRecordingCard
                  key={recording.id}
                  recording={recording}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Unified Upload/Create Modal */}
      <CreateManualMeetingModal
        isOpen={showUnifiedModal}
        onClose={() => {
          setShowUnifiedModal(false);
          setSelectedMeetingForUpload(null);
        }}
        onCreate={handleUnifiedModalSubmit}
        existingMeeting={selectedMeetingForUpload || undefined}
      />

      {/* Speaker Identification Modal */}
      <SpeakerIdentificationModal
        meetingId={speakerModalMeetingId}
        currentUserId={currentUserId ?? undefined}
        onClose={handleSpeakerModalClose}
        onAssignmentComplete={handleAssignmentComplete}
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          duration={10000}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
});

export default MeetingsAndRecordings;
