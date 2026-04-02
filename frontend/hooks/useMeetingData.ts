import { useState, useCallback, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import type { Tables } from '@/supabase/database.types';

type ProcessingJob = Tables<'processing_jobs'>;
export type Meeting = Tables<'meetings'>;

export interface SpeakerAssignmentInfo {
  speakerLabel: string;
  assignedUserId: string | null;
  customSpeakerName: string | null;
  clarityScore: number | null;
  confidenceScore: number | null;
  attunementScore: number | null;
}

export interface MeetingWithRecording {
  meeting: Meeting;
  recording?: ProcessingJob;
  speakerAssignments?: SpeakerAssignmentInfo[];
}

interface UseMeetingDataOptions {
  refreshTrigger?: number;
}

const PAGE_SIZE = 10;

export function useMeetingData({ refreshTrigger }: UseMeetingDataOptions = {}) {
  const [meetingsWithRecordings, setMeetingsWithRecordings] = useState<
    MeetingWithRecording[]
  >([]);
  const [unassignedRecordings, setUnassignedRecordings] = useState<
    ProcessingJob[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentOffset, setCurrentOffset] = useState(0);

  const loadData = useCallback(
    async (options: { append?: boolean; offset?: number } = {}) => {
      const { append = false, offset = 0 } = options;

      try {
        if (!append) {
          setLoading(true);
          setCurrentOffset(0);
        }
        setError(null);

        const supabase = createClient();

        // Fetch meetings with pagination
        // Fetch PAGE_SIZE + 1 to detect if there are more
        const { data: meetings, error: meetingsError } = await supabase
          .from('meetings')
          .select('*')
          .order('start_time', { ascending: false })
          .range(offset, offset + PAGE_SIZE);

        if (meetingsError) throw meetingsError;

        // Determine if there are more meetings
        const fetchedHasMore = (meetings?.length || 0) > PAGE_SIZE;
        const meetingsToProcess = fetchedHasMore
          ? meetings?.slice(0, PAGE_SIZE)
          : meetings;

        setHasMore(fetchedHasMore);

        // Get meeting IDs for fetching related data
        const meetingIds = meetingsToProcess?.map((m) => m.id) || [];

        // Fetch processing jobs for these meetings
        const { data: jobs, error: jobsError } =
          meetingIds.length > 0
            ? await supabase
                .from('processing_jobs')
                .select('*')
                .in('meeting_id', meetingIds)
                .order('created_at', { ascending: false })
            : { data: [], error: null };

        if (jobsError) throw jobsError;

        // Fetch meeting analysis records for these meetings
        const { data: analyses, error: analysesError } =
          meetingIds.length > 0
            ? await supabase
                .from('meeting_analysis')
                .select(
                  'meeting_id, job_id, speaker_label, assigned_user_id, custom_speaker_name, clarity_score, confidence_score, attunement_score'
                )
                .in('meeting_id', meetingIds)
            : { data: [], error: null };

        if (analysesError) throw analysesError;

        const meetingIdsWithAnalysis = new Set(
          analyses?.map((a) => a.meeting_id).filter(Boolean) || []
        );

        // Build a map of meeting_id -> most recent job_id (from processing_jobs)
        // This ensures we only show speakers from the current/active analysis
        const meetingToActiveJobId = new Map<string, string>();
        jobs?.forEach((job) => {
          if (job.meeting_id && job.status === 'completed') {
            // Keep the first completed job per meeting (already sorted by created_at desc)
            if (!meetingToActiveJobId.has(job.meeting_id)) {
              meetingToActiveJobId.set(job.meeting_id, job.id);
            }
          }
        });

        // Group speaker assignments by meeting_id, but only from the active job
        const speakerAssignmentsByMeeting = new Map<
          string,
          SpeakerAssignmentInfo[]
        >();
        analyses?.forEach((a) => {
          if (a.meeting_id && a.job_id) {
            // Only include speaker records from the active (most recent completed) job
            const activeJobId = meetingToActiveJobId.get(a.meeting_id);
            if (activeJobId && a.job_id === activeJobId) {
              if (!speakerAssignmentsByMeeting.has(a.meeting_id)) {
                speakerAssignmentsByMeeting.set(a.meeting_id, []);
              }
              speakerAssignmentsByMeeting.get(a.meeting_id)!.push({
                speakerLabel: a.speaker_label,
                assignedUserId: a.assigned_user_id,
                customSpeakerName: a.custom_speaker_name,
                clarityScore: a.clarity_score,
                confidenceScore: a.confidence_score,
                attunementScore: a.attunement_score,
              });
            }
          }
        });

        // Create a set of meeting IDs that have processing jobs
        const meetingIdsWithJobs = new Set(
          jobs?.map((j) => j.meeting_id).filter(Boolean) || []
        );

        // Match recordings to meetings
        const meetingsMap = new Map<string, MeetingWithRecording>();
        const unassigned: ProcessingJob[] = [];

        // Only include meetings that have an analysis OR a processing job OR a recording
        meetingsToProcess?.forEach((meeting) => {
          const hasAnalysis = meetingIdsWithAnalysis.has(meeting.id);
          const hasJob = meetingIdsWithJobs.has(meeting.id);
          const hasRecording = Boolean(meeting.audio_storage_path);

          if (hasAnalysis || hasJob || hasRecording) {
            meetingsMap.set(meeting.id, {
              meeting,
              recording: undefined,
              speakerAssignments: speakerAssignmentsByMeeting.get(meeting.id),
            });
          }
        });

        // Match recordings to meetings
        jobs?.forEach((job) => {
          if (job.meeting_id) {
            // Recording is linked to a meeting
            const meetingWithRecording = meetingsMap.get(job.meeting_id);
            if (meetingWithRecording) {
              // Keep the first job (most recent) for each meeting
              if (!meetingWithRecording.recording) {
                meetingWithRecording.recording = job;
              }
            } else {
              // Meeting was deleted but job still exists
              unassigned.push(job);
            }
          } else {
            // No meeting linked - standalone recording
            unassigned.push(job);
          }
        });

        const newMeetings = Array.from(meetingsMap.values());

        if (append) {
          // Append to existing meetings, avoiding duplicates
          setMeetingsWithRecordings((prev) => {
            const existingIds = new Set(prev.map((m) => m.meeting.id));
            const uniqueNew = newMeetings.filter(
              (m) => !existingIds.has(m.meeting.id)
            );
            return [...prev, ...uniqueNew];
          });
          setCurrentOffset(offset + PAGE_SIZE);
        } else {
          setMeetingsWithRecordings(newMeetings);
          setUnassignedRecordings(unassigned);
          setCurrentOffset(PAGE_SIZE);
        }
      } catch (err) {
        console.error('Error loading meetings and recordings:', err);
        setError('general');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  // Load more meetings (pagination)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadData({ append: true, offset: currentOffset });
  }, [loadData, loadingMore, hasMore, currentOffset]);

  // Optimistically remove a meeting from local state (for instant UI updates)
  const removeMeetingOptimistic = useCallback((meetingId: string) => {
    setMeetingsWithRecordings((prev) =>
      prev.filter((m) => m.meeting.id !== meetingId)
    );
  }, []);

  // Optimistically update a meeting's processing status (for instant UI updates during reprocess)
  const updateProcessingStatusOptimistic = useCallback(
    (
      meetingId: string,
      status: 'pending' | 'processing' | 'completed' | 'failed'
    ) => {
      setMeetingsWithRecordings((prev) =>
        prev.map((item) =>
          item.meeting.id === meetingId && item.recording
            ? {
                ...item,
                recording: {
                  ...item.recording,
                  status,
                },
              }
            : item
        )
      );
    },
    []
  );

  // Optimistically update speaker assignments for a meeting (for instant UI updates)
  const updateSpeakerAssignmentsOptimistic = useCallback(
    (meetingId: string, speakerAssignments: SpeakerAssignmentInfo[]) => {
      setMeetingsWithRecordings((prev) =>
        prev.map((item) =>
          item.meeting.id === meetingId
            ? {
                ...item,
                speakerAssignments,
              }
            : item
        )
      );
    },
    []
  );

  // Optimistically update user_speaker_label for a meeting (for instant UI after speaker assignment)
  const updateUserSpeakerLabelOptimistic = useCallback(
    (meetingId: string, speakerLabel: string | null) => {
      setMeetingsWithRecordings((prev) =>
        prev.map((item) =>
          item.meeting.id === meetingId
            ? {
                ...item,
                meeting: {
                  ...item.meeting,
                  user_speaker_label: speakerLabel,
                },
              }
            : item
        )
      );
    },
    []
  );

  // Optimistically add a new meeting to the list (for instant UI after upload)
  const addMeetingOptimistic = useCallback((meeting: Meeting) => {
    setMeetingsWithRecordings((prev) => {
      // Create an optimistic recording with "processing" status
      const optimisticRecording: ProcessingJob = {
        id: meeting.id, // Use meeting ID as temp job ID
        meeting_id: meeting.id,
        status: 'processing',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        python_job_id: null,
        processing_error: null,
        processing_priority: null,
        processing_type: null,
        triggered_by: null,
      };

      // Add new meeting to the start of the list (most recent first)
      return [
        {
          meeting,
          recording: optimisticRecording,
          speakerAssignments: [],
        },
        ...prev,
      ];
    });
  }, []);

  /**
   * Poll for processing job status updates with exponential backoff.
   *
   * Polling Strategy:
   * - Starts at 5s intervals when processing/pending jobs exist
   * - Backs off exponentially (1.5x multiplier) up to 30s max when no changes detected
   * - Resets to 5s when changes are detected (status updates)
   * - Only runs when there are active processing/pending jobs
   * - Prevents concurrent polls with isPolling flag
   * - Full reload on completion to fetch analysis/speaker data
   *
   * CRITICAL: reloadTimer uses ref to survive state updates from optimistic updates
   */
  const reloadTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let pollTimer: NodeJS.Timeout | null = null;
    let currentPollInterval = 5000; // Start with 5 seconds
    const maxInterval = 30000; // Cap at 30 seconds
    let isPolling = false;

    const pollProcessingJobs = async () => {
      if (isPolling) return; // Prevent concurrent polls
      isPolling = true;

      try {
        const supabase = createClient();

        // Get meeting IDs that have processing/pending jobs
        const trackingMeetingIds = meetingsWithRecordings
          .filter(
            (m) =>
              m.recording &&
              (m.recording.status === 'processing' ||
                m.recording.status === 'pending')
          )
          .map((m) => m.meeting.id);

        if (trackingMeetingIds.length === 0) {
          isPolling = false;
          return;
        }

        // Fetch status for the jobs we're tracking by meeting_id
        const { data: jobs, error } = await supabase
          .from('processing_jobs')
          .select('id, meeting_id, status')
          .in('meeting_id', trackingMeetingIds)
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Check each job against current state
        let hasChanges = false;
        jobs.forEach((job) => {
          const currentMeeting = meetingsWithRecordings.find(
            (m) => m.meeting.id === job.meeting_id
          );

          if (!currentMeeting?.recording) {
            return;
          }

          if (currentMeeting.recording.status !== job.status) {
            hasChanges = true;

            // Update status immediately so UI responds
            updateProcessingStatusOptimistic(
              currentMeeting.meeting.id,
              job.status as 'pending' | 'processing' | 'completed' | 'failed'
            );

            if (job.status === 'completed') {
              // Clear any existing reload timer to prevent duplicate reloads
              if (reloadTimerRef.current) {
                clearTimeout(reloadTimerRef.current);
              }
              // Reload to fetch speaker assignments
              // Small delay to allow database triggers to finish
              reloadTimerRef.current = setTimeout(() => {
                loadData();
                reloadTimerRef.current = null;
              }, 1500);
            }
          }
        });

        if (!hasChanges) {
          // Exponential backoff only when no changes
          currentPollInterval = Math.min(
            currentPollInterval * 1.5,
            maxInterval
          );
        } else {
          // Reset interval on changes
          currentPollInterval = 5000;
        }

        // Schedule next poll
        pollTimer = setTimeout(pollProcessingJobs, currentPollInterval);
      } catch (err) {
        console.error('[Polling] Error:', err);
        // Retry after current interval
        pollTimer = setTimeout(pollProcessingJobs, currentPollInterval);
      } finally {
        isPolling = false;
      }
    };

    // Start polling if we have processing jobs
    const hasProcessingJobs = meetingsWithRecordings.some(
      (m) =>
        m.recording &&
        (m.recording.status === 'processing' ||
          m.recording.status === 'pending')
    );

    if (hasProcessingJobs) {
      pollTimer = setTimeout(pollProcessingJobs, currentPollInterval);
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
      // DON'T clear reload timer - it needs to survive state updates from optimistic updates
      // The reload timer will clear itself after firing or be replaced if another completion happens
    };
  }, [meetingsWithRecordings, loadData, updateProcessingStatusOptimistic]);

  return {
    meetingsWithRecordings,
    unassignedRecordings,
    loading,
    error,
    reload: loadData,
    removeMeetingOptimistic,
    updateProcessingStatusOptimistic,
    updateSpeakerAssignmentsOptimistic,
    updateUserSpeakerLabelOptimistic,
    addMeetingOptimistic,
    hasMore,
    loadingMore,
    loadMore,
  };
}
