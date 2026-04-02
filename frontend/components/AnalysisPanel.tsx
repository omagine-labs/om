'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { trackEvent, EngagementEvents } from '@/lib/analytics';
import { useSpeakerAssignment } from '@/hooks/useSpeakerAssignment';
import { useSpeakerIdentityGrouping } from '@/hooks/useSpeakerIdentityGrouping';
import { TranscriptView } from './analysis/TranscriptView';
import { SpeakersView } from './analysis/SpeakersView';
import { MeetingHeader } from './analysis/MeetingHeader';
import { formatDuration } from '@/lib/formatters';
import {
  getSpeakerDisplayName,
  isSpeakerAssignedToMe,
  isSpeakerAssigned,
} from '@/lib/speakerHelpers';
import type { OffRecordPeriod } from '@/types/meetings';

interface SpeakerAssignmentUpdate {
  speakerLabel: string;
  assignedUserId: string | null;
  customSpeakerName: string | null;
}

interface AnalysisPanelProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string;
  filename: string;
  onDelete?: () => void;
  defaultTab?: 'transcript' | 'speakers';
  onSpeakerAssignmentChange?: (
    meetingId: string,
    speakerAssignments: SpeakerAssignmentUpdate[]
  ) => void;
}

// New schema: one record per speaker
interface SpeakerAnalysisRecord {
  id: string;
  job_id: string;
  created_by: string;
  speaker_label: string;
  assigned_user_id: string | null;
  custom_speaker_name: string | null;
  summary: string | null;
  transcript_segments: {
    segments: Array<{
      start: number;
      end: number;
      text: string;
      speaker: string;
      confidence?: number;
    }>;
  };
  talk_time_seconds: number;
  talk_time_percentage: number;
  word_count: number;
  words_per_minute: number | null;
  segments_count: number;
  avg_response_latency_seconds: number | null;
  response_count: number | null;
  quick_responses_percentage: number | null;
  times_interrupted: number | null;
  times_interrupting: number | null;
  interruption_rate: number | null;
  communication_tips: string[];
  behavioral_insights: any | null;
  created_at: string | null;
  segment_id: string | null;
  // Agentic analysis scores
  clarity_score: number | null;
  clarity_explanation: string | null;
  confidence_score: number | null;
  confidence_explanation: string | null;
  attunement_score: number | null;
  attunement_explanation: string | null;
}

// Attendee from calendar
interface Attendee {
  email: string;
  displayName?: string | null;
  isOrganizer: boolean;
}

// Derived interface for display (combines all speakers)
interface MeetingAnalysis {
  speakerRecords: SpeakerAnalysisRecord[];
  // Reconstructed full transcript from all speakers
  fullTranscript: {
    segments: Array<{
      start: number;
      end: number;
      text: string;
      speaker: string;
      confidence?: number;
    }>;
    speakers: string[];
    duration: number;
    num_speakers: number;
  };
  meetingId?: string;
  // Off-record periods (when recording was paused)
  offRecordPeriods?: OffRecordPeriod[];
  // Meeting attendees from calendar
  attendees?: Attendee[];
  // User's identified speaker label (source of truth for "You")
  userSpeakerLabel?: string | null;
}

export default function AnalysisPanel({
  isOpen,
  onClose,
  jobId,
  filename,
  onDelete,
  defaultTab,
  onSpeakerAssignmentChange,
}: AnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<MeetingAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'transcript' | 'speakers'>(
    defaultTab || 'transcript'
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('You');
  const [editingSpeaker, setEditingSpeaker] = useState<string | null>(null);
  const [customName, setCustomName] = useState<string>('');
  const [meetingDate, setMeetingDate] = useState<string | null>(null);
  const [meetingTitle, setMeetingTitle] = useState<string | null>(null);

  // Track when analysis panel is viewed
  useEffect(() => {
    if (isOpen && jobId) {
      trackEvent(EngagementEvents.ANALYSIS_VIEWED, {
        meeting_id: jobId,
      });
    }
  }, [isOpen, jobId]);

  // Reset active tab when panel opens with a new defaultTab
  useEffect(() => {
    if (isOpen && defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  const fetchAnalysis = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Get current user info
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);

        // Fetch user's full name from users table
        const { data: userData } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', user.id)
          .single();

        if (userData?.full_name) {
          setCurrentUserName(userData.full_name);
        }
      }

      // Fetch meeting info
      const { data: jobData } = await supabase
        .from('processing_jobs')
        .select('meeting_id, created_at')
        .eq('id', jobId)
        .single();

      let meetingId: string | undefined = jobData?.meeting_id || undefined;
      let createdAt: string | null = jobData?.created_at || null;

      // Get meeting metadata
      let offRecordPeriods: OffRecordPeriod[] | undefined;
      let attendees:
        | Array<{
            email: string;
            displayName?: string | null;
            isOrganizer: boolean;
          }>
        | undefined;
      let userSpeakerLabel: string | null = null;
      if (meetingId) {
        const { data: meeting } = await supabase
          .from('meetings')
          .select(
            'created_at, title, off_record_periods, attendees, user_speaker_label'
          )
          .eq('id', meetingId)
          .single();
        userSpeakerLabel = meeting?.user_speaker_label || null;

        // Use meeting created_at if available, otherwise fall back to job created_at
        createdAt = meeting?.created_at || createdAt;
        // Store the meeting title
        setMeetingTitle(meeting?.title || null);
        // Store off-record periods (cast from Json to OffRecordPeriod[])
        offRecordPeriods = meeting?.off_record_periods
          ? (meeting.off_record_periods as unknown as OffRecordPeriod[])
          : undefined;
        // Store attendees
        attendees = meeting?.attendees
          ? (meeting.attendees as unknown as Array<{
              email: string;
              displayName?: string | null;
              isOrganizer: boolean;
            }>)
          : undefined;
      }

      // Store the meeting date
      setMeetingDate(createdAt);

      // Query speaker records by job_id
      const { data: speakerRecords, error: fetchError } = await supabase
        .from('meeting_analysis')
        .select('*')
        .eq('job_id', jobId);

      if (fetchError) throw fetchError;
      if (!speakerRecords || speakerRecords.length === 0) {
        setError(
          'No speech detected in this recording. The recording may be silent, too short, or the audio quality may be too low for transcription.'
        );
        setIsLoading(false);
        return;
      }

      // Reconstruct full transcript from all speakers' segments
      const allSegments: Array<{
        start: number;
        end: number;
        text: string;
        speaker: string;
        confidence?: number;
      }> = [];

      speakerRecords.forEach((record: any) => {
        if (record.transcript_segments?.segments) {
          allSegments.push(...record.transcript_segments.segments);
        }
      });

      // Sort segments by start time
      allSegments.sort((a, b) => a.start - b.start);

      // Extract unique speakers and calculate duration
      const speakers = Array.from(
        new Set(speakerRecords.map((r: any) => r.speaker_label))
      );
      const duration =
        allSegments.length > 0 ? allSegments[allSegments.length - 1].end : 0;

      const analysisData: MeetingAnalysis = {
        speakerRecords: speakerRecords as any,
        fullTranscript: {
          segments: allSegments,
          speakers,
          duration,
          num_speakers: speakers.length,
        },
        meetingId,
        offRecordPeriods,
        attendees,
        userSpeakerLabel,
      };

      setAnalysis(analysisData);
    } catch (err) {
      setError('Failed to load analysis. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (isOpen && jobId) {
      fetchAnalysis();
    }
  }, [isOpen, jobId, fetchAnalysis]);

  // Speaker assignment hook
  const {
    assignSpeaker,
    assignCustomName,
    unassignSpeaker,
    isAssigning: hookIsAssigning,
    error: assignmentError,
  } = useSpeakerAssignment({
    jobId,
    currentUserId: currentUserId || undefined,
    onSuccess: async () => {
      await fetchAnalysis();
      // Note: We'll call onSpeakerAssignmentChange after analysis state updates
    },
  });

  // When analysis updates, notify parent with updated speaker assignments
  useEffect(() => {
    if (
      analysis?.meetingId &&
      analysis?.speakerRecords &&
      onSpeakerAssignmentChange
    ) {
      const speakerAssignments = analysis.speakerRecords.map((record) => ({
        speakerLabel: record.speaker_label,
        assignedUserId: record.assigned_user_id,
        customSpeakerName: record.custom_speaker_name,
      }));
      onSpeakerAssignmentChange(analysis.meetingId, speakerAssignments);
    }
  }, [
    analysis?.speakerRecords,
    analysis?.meetingId,
    onSpeakerAssignmentChange,
  ]);

  // Merge assignment state with local state
  const isAssigning = hookIsAssigning;

  // Override local error if assignment error exists
  useEffect(() => {
    if (assignmentError) {
      setError(assignmentError);
    }
  }, [assignmentError]);

  const handleAssignSpeaker = async (speakerLabel: string) => {
    if (!currentUserId || !analysis) return;
    await assignSpeaker(speakerLabel);
  };

  const handleAssignCustomName = async (speakerLabel: string, name: string) => {
    if (!analysis || !name.trim()) return;
    await assignCustomName(speakerLabel, name);

    // Clear editing state on success
    setEditingSpeaker(null);
    setCustomName('');
  };

  const handleUnassignSpeaker = async (speakerLabel: string) => {
    if (!analysis) return;
    await unassignSpeaker(speakerLabel);

    // Clear editing state on success
    setEditingSpeaker(null);
    setCustomName('');
  };

  // userSpeakerLabel is the source of truth for speaker identification
  const userSpeakerLabel = analysis?.userSpeakerLabel || null;

  // Speaker identity grouping hook
  const identityGroups = useSpeakerIdentityGrouping({
    speakerRecords: analysis?.speakerRecords || [],
    currentUserId,
    userSpeakerLabel,
  });

  // Helper functions using imported utilities

  const getDisplayName = (speakerLabel: string) =>
    getSpeakerDisplayName(
      speakerLabel,
      analysis?.speakerRecords || [],
      userSpeakerLabel,
      currentUserName
    );

  const isAssignedToMe = (speakerLabel: string) =>
    isSpeakerAssignedToMe(speakerLabel, userSpeakerLabel);

  const isAssigned = (speakerLabel: string) =>
    isSpeakerAssigned(
      speakerLabel,
      analysis?.speakerRecords || [],
      userSpeakerLabel
    );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - click to close */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Side panel */}
      <div className="fixed top-0 right-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <MeetingHeader
          meetingTitle={meetingTitle}
          meetingDate={meetingDate}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClose={onClose}
        />

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-gray-600">Loading analysis...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {!isLoading && !error && analysis && (
            <>
              {/* Transcript Tab */}
              {activeTab === 'transcript' && (
                <TranscriptView
                  fullTranscript={analysis.fullTranscript}
                  offRecordPeriods={analysis.offRecordPeriods}
                  speakerRecords={analysis.speakerRecords}
                  attendees={analysis.attendees}
                  isAssignedToMe={isAssignedToMe}
                  getDisplayName={getDisplayName}
                  isAssigned={isAssigned}
                  editingSpeaker={editingSpeaker}
                  isAssigning={isAssigning}
                  customName={customName}
                  setEditingSpeaker={setEditingSpeaker}
                  setCustomName={setCustomName}
                  handleAssignSpeaker={handleAssignSpeaker}
                  handleAssignCustomName={handleAssignCustomName}
                  handleUnassignSpeaker={handleUnassignSpeaker}
                />
              )}

              {/* Speakers Tab */}
              {activeTab === 'speakers' && (
                <SpeakersView
                  speakerRecords={analysis.speakerRecords}
                  identityGroups={identityGroups}
                  isAssignedToMe={isAssignedToMe}
                  getDisplayName={getDisplayName}
                  isAssigned={isAssigned}
                  formatDuration={formatDuration}
                  editingSpeaker={editingSpeaker}
                  isAssigning={isAssigning}
                  customName={customName}
                  setEditingSpeaker={setEditingSpeaker}
                  setCustomName={setCustomName}
                  handleAssignSpeaker={handleAssignSpeaker}
                  handleAssignCustomName={handleAssignCustomName}
                  handleUnassignSpeaker={handleUnassignSpeaker}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
