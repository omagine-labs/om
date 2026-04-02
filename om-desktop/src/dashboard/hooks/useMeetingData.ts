/**
 * useMeetingData Hook
 *
 * Fetches and manages meeting data with processing job status.
 * Uses IPC to main process for all Supabase operations.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { authApi, meetingsApi, processingJobsApi } from '@/lib/api-client';
import type { Tables } from '@/supabase/database.types';

type ProcessingJob = Tables<'processing_jobs'>;
type Meeting = Tables<'meetings'>;

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

        // Get current user from main process
        const user = await authApi.getCurrentUser();

        if (!user) {
          console.log('[useMeetingData] No authenticated user found');
          setMeetingsWithRecordings([]);
          setUnassignedRecordings([]);
          setLoading(false);
          setLoadingMore(false);
          return;
        }

        console.log('[useMeetingData] Fetching data for user:', user.id);

        // Use IPC to fetch meeting data with pagination
        const result = await meetingsApi.getMeetingsWithAnalysis(user.id, {
          limit: PAGE_SIZE + 1, // Fetch one extra to detect if more exist
          offset,
        });

        if (!result.success) {
          console.error('[useMeetingData] Error fetching data:', result.error);
          throw new Error(result.error || 'Failed to fetch meeting data');
        }

        const {
          meetings,
          jobs,
          analyses,
          hasMore: fetchedHasMore,
        } = result.data!;

        setHasMore(fetchedHasMore);

        console.log('[useMeetingData] Fetched meetings:', meetings?.length);
        if (meetings && meetings.length > 0) {
          console.log('[useMeetingData] Date range:', {
            oldest: meetings[meetings.length - 1]?.start_time,
            newest: meetings[0]?.start_time,
          });
        }

        console.log('[useMeetingData] Fetched jobs:', jobs?.length);

        const meetingIdsWithAnalysis = new Set(
          analyses?.map((a: any) => a.meeting_id).filter(Boolean) || []
        );

        // Build a map of meeting_id -> most recent job_id (from processing_jobs)
        // This ensures we only show speakers from the current/active analysis
        const meetingToActiveJobId = new Map<string, string>();
        jobs?.forEach((job: any) => {
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
        analyses?.forEach((a: any) => {
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
          jobs?.map((j: any) => j.meeting_id).filter(Boolean) || []
        );

        // Match recordings to meetings
        const meetingsMap = new Map<string, MeetingWithRecording>();
        const unassigned: ProcessingJob[] = [];

        // Include meetings that have:
        // 1. An analysis (completed processing)
        // 2. A processing job (pending/processing/failed)
        // 3. A recording path (upload in progress, job not created yet)
        meetings?.forEach((meeting: any) => {
          const hasAnalysis = meetingIdsWithAnalysis.has(meeting.id);
          const hasJob = meetingIdsWithJobs.has(meeting.id);
          const hasRecording = !!meeting.audio_storage_path;

          if (hasAnalysis || hasJob || hasRecording) {
            meetingsMap.set(meeting.id, {
              meeting,
              recording: undefined,
              speakerAssignments: speakerAssignmentsByMeeting.get(meeting.id),
            });
          }
        });

        // Match recordings to meetings
        jobs?.forEach((job: any) => {
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

        const finalMeetings = Array.from(meetingsMap.values());
        console.log(
          '[useMeetingData] Final meetings with recordings:',
          finalMeetings.length
        );
        console.log(
          '[useMeetingData] Unassigned recordings:',
          unassigned.length
        );

        if (append) {
          // Append to existing meetings, avoiding duplicates
          setMeetingsWithRecordings((prev) => {
            const existingIds = new Set(prev.map((m) => m.meeting.id));
            const uniqueNew = finalMeetings.filter(
              (m) => !existingIds.has(m.meeting.id)
            );
            return [...prev, ...uniqueNew];
          });
          setCurrentOffset(offset + PAGE_SIZE);
        } else {
          setMeetingsWithRecordings(finalMeetings);
          setUnassignedRecordings(unassigned);
          setCurrentOffset(PAGE_SIZE);
        }
      } catch (err) {
        console.error(
          '[useMeetingData] Error loading meetings and recordings:',
          err
        );
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

  // Optimistically update user_speaker_label for a meeting (for instant UI updates)
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

  // Optimistically add a new meeting to the list (for instant UI updates)
  const addMeetingOptimistic = useCallback((meeting: Meeting) => {
    setMeetingsWithRecordings((prev) => {
      // Add meeting to the beginning of the list with a pending job
      const optimisticJob: ProcessingJob = {
        id: 'temp-' + meeting.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: meeting.user_id,
        meeting_id: meeting.id,
        storage_path: null,
        original_filename: null,
        file_size_mb: null,
        status: 'pending',
        transcription_result: null,
        analysis_result: null,
        error_message: null,
        started_at: null,
        completed_at: null,
      };

      return [
        {
          meeting,
          recording: optimisticJob,
          speakerAssignments: undefined,
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

        // Use IPC to poll job status (lightweight - only returns id, meeting_id, status)
        const result =
          await processingJobsApi.pollJobStatus(trackingMeetingIds);

        if (!result.success) {
          throw new Error(result.error || 'Failed to poll job status');
        }

        const jobs = result.data || [];

        // Check each job against current state
        let hasChanges = false;
        jobs?.forEach((job: any) => {
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
