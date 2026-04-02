import MeetingsAndRecordings, {
  type MeetingsAndRecordingsRef,
} from '@/components/MeetingsAndRecordings';
import DeleteConfirmationModal from '@/components/DeleteConfirmationModal';
import { SignInPrompt } from '@/components/SignInPrompt';
import { PageBackground } from '@/components/layout/PageBackground';
import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  authApi,
  dashboardApi,
  meetingsApi,
  processingJobsApi,
  storageApi,
} from '@/lib/api-client';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useDelayedSkeleton } from '@/hooks/useDelayedSkeleton';
import type { Tables } from '@/types/database';

type Meeting = Tables<'meetings'>;

export default function Meetings() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { uploadFile } = useFileUpload();
  const meetingsRef = useRef<MeetingsAndRecordingsRef>(null);

  // Delayed skeleton: only show if loading takes > 400ms
  const showSkeleton = useDelayedSkeleton(isAuthenticated === null);

  // Check for upload parameter and open modal automatically
  useEffect(() => {
    const shouldOpenUpload = searchParams.get('upload') === 'true';
    if (shouldOpenUpload && isAuthenticated && meetingsRef.current) {
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        meetingsRef.current?.openUploadModal();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [searchParams, isAuthenticated]);

  const handleViewAnalysis = async (data: {
    jobId: string;
    filename: string;
    defaultTab?: 'transcript' | 'speakers';
  }) => {
    // Get meetingId from jobId via IPC
    const result = await processingJobsApi.getJobById(data.jobId);

    if (result.success && result.data?.meeting_id) {
      // Navigate to analysis page, or transcript if defaultTab is 'transcript'
      if (data.defaultTab === 'transcript') {
        navigate(`/meetings/${result.data.meeting_id}/transcript`);
      } else {
        navigate(`/meetings/${result.data.meeting_id}/analysis`);
      }
    }
  };

  const handleDeleteClick = (meeting: Meeting) => {
    setMeetingToDelete(meeting);
  };

  const handleIdentifySpeakerComplete = (meetingId: string) => {
    // Navigate to analysis page after speaker identification
    navigate(`/meetings/${meetingId}/analysis`);
  };

  const handleDeleteConfirm = async () => {
    if (!meetingToDelete) return;

    // Optimistically remove from UI immediately
    meetingsRef.current?.removeMeetingOptimistic(meetingToDelete.id);

    setIsDeleting(true);
    try {
      // Get current user from auth API (via IPC to main process)
      const user = await authApi.getCurrentUser();
      if (!user) throw new Error('User not authenticated');

      // Get all processing jobs for this meeting via IPC
      const jobsResult = await processingJobsApi.getJobByMeetingId(
        meetingToDelete.id
      );
      const jobs =
        jobsResult.success && jobsResult.data ? [jobsResult.data] : [];

      // Delete storage file for meeting (if it has one)
      if (meetingToDelete.audio_storage_path) {
        const storageResult = await storageApi.deleteRecording(
          meetingToDelete.audio_storage_path
        );

        if (!storageResult.success) {
          console.error('Storage deletion error:', storageResult.error);
          // Continue anyway - we still want to delete the database records
        }
      }

      // Get meeting start time to determine which week to recalculate
      const meetingStartTime = new Date(meetingToDelete.start_time);
      const weekStart = new Date(meetingStartTime);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Get Monday of week

      // Hard delete the meeting (cascades to meeting_analysis via ON DELETE CASCADE)
      const deleteMeetingResult = await meetingsApi.deleteMeeting(
        meetingToDelete.id
      );

      if (!deleteMeetingResult.success) {
        throw new Error(
          deleteMeetingResult.error || 'Failed to delete meeting'
        );
      }

      // Delete all processing jobs
      if (jobs.length > 0) {
        const deleteJobsResult = await processingJobsApi.deleteJobsByIds(
          jobs.map((j: any) => j.id)
        );

        if (!deleteJobsResult.success) {
          console.error('Failed to delete jobs:', deleteJobsResult.error);
          // Continue anyway - meeting is already deleted
        }
      }

      // Recalculate weekly rollup and baseline for the user
      // This ensures aggregates remain accurate after deletion
      try {
        // Call the database function to recalculate weekly rollup
        const rollupResult = await dashboardApi.calculateWeeklyRollup(
          user.id,
          weekStart.toISOString().split('T')[0]
        );

        if (!rollupResult.success) {
          console.error(
            'Failed to recalculate weekly rollup:',
            rollupResult.error
          );
        }

        // Note: update_current_baseline is not yet exposed in API proxy
        // TODO: Add to API proxy or handle via background job
      } catch (recalcError) {
        console.error('Failed to recalculate aggregates:', recalcError);
        // Don't fail the whole operation - aggregates will be updated by cron eventually
      }

      // Close modal (no refresh needed - optimistic UI already updated)
      setMeetingToDelete(null);
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete meeting. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateManualMeeting = async (
    meeting: { title: string; datetime: string; description?: string },
    file: File
  ) => {
    try {
      // Get current user from auth API (via IPC to main process)
      const user = await authApi.getCurrentUser();
      if (!user) {
        throw new Error('You must be logged in');
      }

      // Convert datetime-local to ISO with proper timezone handling
      const parseLocalDateTime = (dateTimeStr: string): string => {
        const [datePart, timePart] = dateTimeStr.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        const localDate = new Date(year, month - 1, day, hours, minutes);
        return localDate.toISOString();
      };

      // Create manual meeting record via IPC
      const createResult = await meetingsApi.createMeeting({
        user_id: user.id,
        title: meeting.title,
        start_time: parseLocalDateTime(meeting.datetime),
      });

      if (!createResult.success || !createResult.data) {
        throw new Error(createResult.error || 'Failed to create meeting');
      }

      const newMeeting = createResult.data;

      // Show meeting optimistically with uploading state
      meetingsRef.current?.addMeetingOptimistic(newMeeting);

      // Upload file in background
      // Polling will automatically detect when the processing job is created and update the UI
      uploadFile(file, {
        id: newMeeting.id,
        summary: newMeeting.title,
        start: newMeeting.start_time,
      }).catch((error) => {
        console.error('Upload failed:', error);
        // On error, refresh to get accurate state
        setRefreshTrigger((prev) => prev + 1);
      });
    } catch (err) {
      console.error('Error creating manual meeting:', err);
      throw err;
    }
  };

  // Check authentication status
  useEffect(() => {
    const checkAuth = async () => {
      if (window.electronAPI?.auth?.getUser) {
        const user = await window.electronAPI.auth.getUser();
        setIsAuthenticated(!!user);
      } else {
        setIsAuthenticated(false);
      }
    };

    // Check auth on mount only
    // Auth Health Checker monitors auth state in main process
    checkAuth();
  }, []);

  // Show loading state while checking auth
  if (isAuthenticated === null && showSkeleton) {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Show background while loading (before skeleton delay)
  if (isAuthenticated === null) {
    return (
      <PageBackground variant="teal">
        <div />
      </PageBackground>
    );
  }

  // Show sign-in screen if not authenticated
  if (!isAuthenticated) {
    return <SignInPrompt />;
  }

  return (
    <PageBackground variant="teal">
      <div className="animate-fadeInUp">
        {/* Content Container Card */}
        <div className="bg-slate-50 rounded-2xl shadow-lg p-6 sm:p-8">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex-1">
              <h1 className="text-5xl font-medium text-teal-950 leading-[1] tracking-tighter font-display">
                Meetings & Recordings
              </h1>
              <p className="text-slate-600 mt-2 text-lg">
                View and manage your meeting recordings and calendar events
              </p>
            </div>
            <button
              onClick={() => meetingsRef.current?.openUploadModal()}
              className="pl-4 pr-5 py-2.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400/70 text-slate-600 hover:text-slate-700 active:text-slate-800 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Upload Meeting
            </button>
          </div>

          {/* Unified Meetings & Recordings */}
          <MeetingsAndRecordings
            ref={meetingsRef}
            onViewAnalysis={handleViewAnalysis}
            onCreateManualMeeting={handleCreateManualMeeting}
            onDeleteMeeting={handleDeleteClick}
            onIdentifySpeakerComplete={handleIdentifySpeakerComplete}
            refreshTrigger={refreshTrigger}
          />
        </div>

        {/* Delete Confirmation Modal */}
        <DeleteConfirmationModal
          isOpen={!!meetingToDelete}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setMeetingToDelete(null)}
          title="Delete Meeting"
          message={`Are you sure you want to delete "${meetingToDelete?.title}"? This will permanently remove the meeting and all associated recordings, transcripts, and analysis data. This action cannot be undone.`}
          confirmButtonText="Delete Meeting"
        />
      </div>
    </PageBackground>
  );
}
