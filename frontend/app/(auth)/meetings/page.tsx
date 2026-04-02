'use client';

import MeetingsAndRecordings, {
  type MeetingsAndRecordingsRef,
} from '@/components/MeetingsAndRecordings';
import DeleteConfirmationModal from '@/components/DeleteConfirmationModal';
import { PageBackground } from '@/components/layout/PageBackground';
import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useFileUpload } from '@/hooks/useFileUpload';
import type { Meeting } from '@/hooks/useMeetingData';

export default function MeetingsPage() {
  const searchParams = useSearchParams();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [hasDesktopApp, setHasDesktopApp] = useState(false);
  const { uploadFile } = useFileUpload();
  const meetingsRef = useRef<MeetingsAndRecordingsRef>(null);

  // Fetch user's app_version to check if they have the desktop app
  useEffect(() => {
    async function checkDesktopApp() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data: userData } = await supabase
          .from('users')
          .select('app_version')
          .eq('id', user.id)
          .single();

        setHasDesktopApp(!!userData?.app_version);
      } catch (error) {
        console.error('Error checking desktop app:', error);
      }
    }

    checkDesktopApp();
  }, []);

  // Check for upload parameter and open modal automatically
  useEffect(() => {
    const shouldOpenUpload = searchParams.get('upload') === 'true';
    if (shouldOpenUpload && meetingsRef.current) {
      meetingsRef.current.openUploadModal();
    }
  }, [searchParams]);

  const handleDeleteClick = (meeting: Meeting) => {
    setMeetingToDelete(meeting);
  };

  const handleDeleteConfirm = async () => {
    if (!meetingToDelete) return;

    // Optimistically remove from UI immediately
    meetingsRef.current?.removeMeetingOptimistic(meetingToDelete.id);

    setIsDeleting(true);
    try {
      const supabase = createClient();

      // Get current user for aggregate recalculation
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get all processing jobs for this meeting
      const { data: jobs, error: jobsError } = await supabase
        .from('processing_jobs')
        .select('id')
        .eq('meeting_id', meetingToDelete.id);

      if (jobsError) throw jobsError;

      // Delete storage file for meeting (if it has one)
      if (meetingToDelete.audio_storage_path) {
        const { error: storageError } = await supabase.storage
          .from('recordings')
          .remove([meetingToDelete.audio_storage_path]);

        if (storageError) {
          console.error('Storage deletion error:', storageError);
          // Continue anyway - we still want to delete the database records
        }
      }

      // Get meeting start time to determine which week to recalculate
      const meetingStartTime = new Date(meetingToDelete.start_time);
      const weekStart = new Date(meetingStartTime);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Get Monday of week

      // Hard delete the meeting (cascades to meeting_analysis via ON DELETE CASCADE)
      const { error: deleteMeetingError } = await supabase
        .from('meetings')
        .delete()
        .eq('id', meetingToDelete.id);

      if (deleteMeetingError) throw deleteMeetingError;

      // Delete all processing jobs
      if (jobs && jobs.length > 0) {
        const { error: deleteJobsError } = await supabase
          .from('processing_jobs')
          .delete()
          .in(
            'id',
            jobs.map((j) => j.id)
          );

        if (deleteJobsError) throw deleteJobsError;
      }

      // Recalculate weekly rollup and baseline for the user
      // This ensures aggregates remain accurate after deletion
      try {
        // Call the database function to recalculate weekly rollup
        await supabase.rpc('calculate_user_weekly_rollup', {
          p_user_id: user.id,
          p_week_start: weekStart.toISOString().split('T')[0],
        });

        // Recalculate current baseline (12-week rolling window)
        await supabase.rpc('update_current_baseline', {
          p_user_id: user.id,
        });
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
      const supabase = createClient();

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
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

      // Create manual meeting record
      const { data: newMeeting, error: meetingError } = await supabase
        .from('meetings')
        .insert({
          user_id: user.id,
          title: meeting.title,
          start_time: parseLocalDateTime(meeting.datetime),
        })
        .select()
        .single();

      if (meetingError || !newMeeting) {
        throw new Error('Failed to create meeting');
      }

      // Optimistically add meeting to the list immediately
      meetingsRef.current?.addMeetingOptimistic(newMeeting);

      // Upload file in the background (don't await - let it process async)
      uploadFile(file, {
        id: newMeeting.id,
        summary: newMeeting.title,
        start: newMeeting.start_time,
      }).catch((error) => {
        console.error('Upload failed:', error);
        // On error, refresh to get accurate state from database
        setRefreshTrigger((prev) => prev + 1);
      });
    } catch (err) {
      console.error('Error creating manual meeting:', err);
      throw err;
    }
  };

  return (
    <PageBackground variant="teal">
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
          onCreateManualMeeting={handleCreateManualMeeting}
          onDeleteMeeting={handleDeleteClick}
          refreshTrigger={refreshTrigger}
          hasDesktopApp={hasDesktopApp}
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
    </PageBackground>
  );
}
