import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { authApi, meetingsApi } from '@/lib/api-client';
import { useSpeakerAssignment } from '@/hooks/useSpeakerAssignment';
import { useDelayedSkeleton } from '@/hooks/useDelayedSkeleton';
import { SpeakerIdentificationOverlay } from '@/components/analysis/SpeakerIdentificationOverlay';
import { MeetingPillarScoreCard } from '@/components/analysis/MeetingPillarScoreCard';
import { MeetingFocusAreas } from '@/components/analysis/MeetingFocusAreas';
import { AnalysisDetails } from '@/components/analysis/AnalysisDetails';
import { PageBackground } from '@/components/layout/PageBackground';
import { formatDuration } from '@/lib/formatters';
import type { OffRecordPeriod } from '@/types/meetings';

/* ============================================
   TYPE DEFINITIONS
   ============================================ */

interface SpeakerAnalysisRecord {
  id: string;
  job_id: string | null;
  created_by: string;
  speaker_label: string;
  assigned_user_id: string | null;
  custom_speaker_name: string | null;
  identification_confidence: number | null;
  summary: string | null;
  general_overview: string | null;
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
  turn_taking_balance: number | null;
  communication_tips: string[];
  behavioral_insights: any | null;
  clarity_score: number | null;
  clarity_explanation: string | null;
  confidence_score: number | null;
  confidence_explanation: string | null;
  attunement_score: number | null;
  attunement_explanation: string | null;
}

interface MeetingData {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  off_record_periods?: OffRecordPeriod[];
  attendees?: Array<{
    email: string;
    displayName?: string | null;
    isOrganizer: boolean;
  }>;
  user_speaker_label?: string | null;
  shared_mic_detected?: boolean | null;
  alternative_speakers?: string[] | null;
}

interface AnalysisData {
  speakerRecords: SpeakerAnalysisRecord[];
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
  jobId: string;
  meeting: MeetingData;
}

/* ============================================
   MAIN PAGE COMPONENT
   ============================================ */

export default function MeetingAnalysisPage() {
  const params = useParams();
  const navigate = useNavigate();
  const meetingId = params.meetingId as string;

  // State
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Delayed skeleton: only show if loading takes > 400ms
  const showSkeleton = useDelayedSkeleton(isLoading);

  // Use ref instead of state for skipAutoAssignment to avoid async state issues
  const skipAutoAssignmentRef = useRef(false);

  // State for "Not You?" modal - separate from needsIdentification
  // This allows keeping the analysis visible while the modal is open
  const [isReassigning, setIsReassigning] = useState(false);

  // Fetch analysis data
  const fetchAnalysis = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get current user from auth API (via IPC to main process)
      const user = await authApi.getCurrentUser();
      if (!user) {
        setError('Please sign in to view meeting analysis');
        setIsLoading(false);
        return;
      }

      setCurrentUserId(user.id);

      // Fetch all page data via single IPC call
      const pageDataResult =
        await meetingsApi.getMeetingAnalysisPageData(meetingId);

      if (!pageDataResult.success || !pageDataResult.data) {
        setError(pageDataResult.error || 'Failed to load meeting data');
        setIsLoading(false);
        return;
      }

      const {
        meeting: meetingData,
        job: jobData,
        analyses: speakerRecords,
        transcript: transcriptData,
      } = pageDataResult.data;

      if (!meetingData) {
        setError('Meeting not found');
        setIsLoading(false);
        return;
      }

      // Verify user owns this meeting
      if (meetingData.user_id !== user.id) {
        setError('Meeting not found');
        setIsLoading(false);
        return;
      }

      if (!jobData) {
        setError('No recording found for this meeting');
        setIsLoading(false);
        return;
      }

      if (jobData.status !== 'completed') {
        setError(
          `Recording is ${jobData.status}. Please wait for processing to complete.`
        );
        setIsLoading(false);
        return;
      }

      if (!speakerRecords || speakerRecords.length === 0) {
        setError('No speech detected in this recording.');
        setIsLoading(false);
        return;
      }

      if (!transcriptData) {
        setError('No transcript available for this meeting.');
        setIsLoading(false);
        return;
      }

      // Use transcript data directly (no reconstruction needed)
      const segments =
        (transcriptData.segments as Array<{
          start: number;
          end: number;
          text: string;
          speaker: string;
          confidence?: number;
        }>) || [];
      const speakers = transcriptData.speakers || [];
      const duration =
        transcriptData.duration_seconds ||
        (segments.length > 0 ? segments[segments.length - 1].end : 0);

      setAnalysis({
        speakerRecords: speakerRecords as unknown as SpeakerAnalysisRecord[],
        fullTranscript: {
          segments,
          speakers,
          duration,
          num_speakers: speakers.length,
        },
        jobId: jobData.id,
        meeting: {
          ...meetingData,
          off_record_periods: meetingData.off_record_periods as unknown as
            | OffRecordPeriod[]
            | undefined,
          attendees:
            meetingData.attendees as unknown as MeetingData['attendees'],
        },
      });
    } catch (err) {
      console.error('Failed to load analysis:', err);
      setError('Failed to load analysis. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [meetingId]);

  // Lightweight refetch that doesn't trigger loading state (for speaker assignment/unassignment)
  const refetchAnalysisLightweight = useCallback(async () => {
    try {
      const pageDataResult =
        await meetingsApi.getMeetingAnalysisPageData(meetingId);

      if (!pageDataResult.success || !pageDataResult.data) {
        return;
      }

      const {
        meeting: meetingData,
        job: jobData,
        analyses: speakerRecords,
        transcript: transcriptData,
      } = pageDataResult.data;

      if (!meetingData || !jobData || !speakerRecords || !transcriptData) {
        return;
      }

      const segments =
        (transcriptData.segments as Array<{
          start: number;
          end: number;
          text: string;
          speaker: string;
          confidence?: number;
        }>) || [];
      const speakers = transcriptData.speakers || [];
      const duration =
        transcriptData.duration_seconds ||
        (segments.length > 0 ? segments[segments.length - 1].end : 0);

      setAnalysis({
        speakerRecords: speakerRecords as unknown as SpeakerAnalysisRecord[],
        fullTranscript: {
          segments,
          speakers,
          duration,
          num_speakers: speakers.length,
        },
        jobId: jobData.id,
        meeting: {
          ...meetingData,
          off_record_periods: meetingData.off_record_periods as unknown as
            | OffRecordPeriod[]
            | undefined,
          attendees:
            meetingData.attendees as unknown as MeetingData['attendees'],
        },
      });
    } catch (err) {
      console.error('Failed to refetch analysis:', err);
    }
  }, [meetingId]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  // Speaker assignment hook - uses lightweight refetch to avoid loading flicker
  const { assignSpeaker, isAssigning } = useSpeakerAssignment({
    jobId: analysis?.jobId || '',
    currentUserId: currentUserId || undefined,
    onSuccess: refetchAnalysisLightweight,
  });

  // Check if user has identified themselves
  // user_speaker_label is the source of truth for speaker identification
  const needsIdentification =
    !analysis?.meeting.user_speaker_label && analysis !== null;

  // Get the user's speaker record based on user_speaker_label (source of truth)
  const userSpeakerRecord = analysis?.meeting.user_speaker_label
    ? analysis.speakerRecords.find(
        (r) => r.speaker_label === analysis.meeting.user_speaker_label
      )
    : undefined;

  // Calculate meeting duration
  const meetingDuration = analysis?.meeting
    ? (() => {
        const start = new Date(analysis.meeting.start_time);
        const end = analysis.meeting.end_time
          ? new Date(analysis.meeting.end_time)
          : new Date(start.getTime() + analysis.fullTranscript.duration * 1000);
        return Math.round((end.getTime() - start.getTime()) / 1000);
      })()
    : 0;

  // Handle speaker selection
  const handleSpeakerSelect = async (speakerLabel: string) => {
    await assignSpeaker(speakerLabel);
    // Close reassignment modal if open
    setIsReassigning(false);
    // Reset flag so auto-assignment can work on next visit
    skipAutoAssignmentRef.current = false;

    // Dispatch event to refresh unassigned counter in sidebar
    window.dispatchEvent(new CustomEvent('speaker-assigned'));
  };

  // Handle modal close (redirect to meetings)
  const handleCloseModal = () => {
    navigate('/meetings');
  };

  // Handle "Not You?" - just open modal, keep showing current analysis
  const handleNotYou = () => {
    skipAutoAssignmentRef.current = true;
    setIsReassigning(true);
  };

  // Handle modal close during reassignment
  const handleReassignmentClose = () => {
    setIsReassigning(false);
  };

  /* ============================================
     LOADING STATE
     ============================================ */
  if (isLoading && showSkeleton) {
    return (
      <PageBackground>
        {/* Header skeleton */}
        <div className="mb-8">
          <div className="h-6 w-32 bg-white/20 rounded animate-pulse mb-4" />
          <div className="h-12 w-96 bg-white/30 rounded animate-pulse mb-3" />
          <div className="h-5 w-64 bg-white/20 rounded animate-pulse" />
        </div>
        {/* Content skeletons */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 mb-6 animate-pulse h-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 h-64 animate-pulse"
            />
          ))}
        </div>
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-6 h-96 animate-pulse" />
      </PageBackground>
    );
  }

  // Show just background while loading (before skeleton delay)
  if (isLoading) {
    return (
      <PageBackground>
        <div />
      </PageBackground>
    );
  }

  /* ============================================
     ERROR STATE
     ============================================ */
  if (error) {
    return (
      <PageBackground>
        {/* Header against teal background */}
        <div className="mb-8">
          <Link
            to="/meetings"
            className="inline-flex items-center gap-2 p-2 -ml-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors mb-4"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            <span className="text-sm font-medium">Meetings</span>
          </Link>
          <h1 className="text-4xl sm:text-5xl font-medium text-white tracking-tighter font-display">
            Meeting Analysis
          </h1>
        </div>

        {/* Error card */}
        <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 text-center shadow-lg">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-100 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-orange-500"
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Unable to Load Analysis
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            to="/meetings"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
          >
            Return to Meetings
          </Link>
        </div>
      </PageBackground>
    );
  }

  if (!analysis) return null;

  /* ============================================
     MAIN RENDER
     ============================================ */
  return (
    <>
      {/* ============================================
          SPEAKER IDENTIFICATION OVERLAY
          (rendered outside PageBackground to avoid z-index issues)
          Shows for: initial identification OR "Not You?" reassignment
          ============================================ */}
      {(needsIdentification || isReassigning) && (
        <SpeakerIdentificationOverlay
          speakerRecords={analysis.speakerRecords}
          transcriptSegments={analysis.fullTranscript.segments}
          onSelectSpeaker={handleSpeakerSelect}
          onClose={isReassigning ? handleReassignmentClose : handleCloseModal}
          isAssigning={isAssigning}
          userSpeakerLabel={analysis.meeting.user_speaker_label ?? undefined}
          sharedMicDetected={analysis.meeting.shared_mic_detected ?? undefined}
          alternativeSpeakers={
            analysis.meeting.alternative_speakers ?? undefined
          }
        />
      )}

      <PageBackground>
        <div className="animate-fadeInUp">
          {/* ============================================
            HEADER (against teal background)
            ============================================ */}
          <div className="flex items-start justify-between gap-6 mb-6">
            {/* Title + metadata */}
            <div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-white tracking-tighter font-display leading-[1] text-shadow-sm">
                {analysis.meeting.title}
              </h1>
              <p className="mt-2 text-sm uppercase tracking-wide font-bold text-teal-100">
                {new Date(analysis.meeting.start_time).toLocaleDateString(
                  'en-US',
                  {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  }
                )}
                {' · '}
                {formatDuration(meetingDuration)}
                {' · '}
                {analysis.fullTranscript.num_speakers} speakers
              </p>
            </div>

            {/* Buttons */}
            <div className="pt-[6px] flex-1 flex items-center justify-between">
              <Link
                to="/meetings"
                className="inline-flex items-center gap-2 pl-4 pr-5 py-2.5 rounded-lg text-white hover:text-white bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                <span className="text-sm font-medium">Meetings</span>
              </Link>

              <div className="flex items-center gap-3">
                <Link
                  to={`/meetings/${meetingId}/transcript`}
                  className="inline-flex items-center gap-2 pl-4 pr-5 py-2.5 text-sm font-medium text-white bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg transition-colors"
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
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Transcript
                </Link>

                {userSpeakerRecord && (
                  <button
                    onClick={handleNotYou}
                    className="inline-flex items-center gap-1.5 pl-4 pr-5 py-2.5 text-sm font-medium text-white bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg transition-colors"
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
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    Not you?
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ============================================
          MEETING FOCUS AREAS (card)
          ============================================ */}
          {userSpeakerRecord &&
            userSpeakerRecord.communication_tips &&
            userSpeakerRecord.communication_tips.length > 0 && (
              <MeetingFocusAreas
                tips={userSpeakerRecord.communication_tips}
                summary={userSpeakerRecord.general_overview ?? undefined}
              />
            )}

          {/* ============================================
          PILLAR SCORE CARDS (3 separate cards)
          Always show all 3 cards - individual cards handle null scores with N/A
          ============================================ */}
          {userSpeakerRecord &&
            (userSpeakerRecord.clarity_score !== null ||
              userSpeakerRecord.confidence_score !== null ||
              userSpeakerRecord.attunement_score !== null) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <MeetingPillarScoreCard
                  pillar="clarity"
                  score={userSpeakerRecord.clarity_score}
                  explanation={userSpeakerRecord.clarity_explanation}
                  animationIndex={0}
                />
                <MeetingPillarScoreCard
                  pillar="confidence"
                  score={userSpeakerRecord.confidence_score}
                  explanation={userSpeakerRecord.confidence_explanation}
                  animationIndex={1}
                />
                <MeetingPillarScoreCard
                  pillar="attunement"
                  score={userSpeakerRecord.attunement_score}
                  explanation={userSpeakerRecord.attunement_explanation}
                  isSingleSpeaker={analysis.speakerRecords.length === 1}
                  animationIndex={2}
                />
              </div>
            )}

          {/* ============================================
          OVERVIEW METRICS (3 cards)
          ============================================ */}
          {userSpeakerRecord && (
            <AnalysisDetails
              speakerRecord={userSpeakerRecord}
              allSpeakerRecords={analysis.speakerRecords}
              totalDuration={analysis.fullTranscript.duration}
              currentUserId={currentUserId}
              userSpeakerLabel={analysis.meeting.user_speaker_label}
            />
          )}

          {/* ============================================
          TRANSCRIPT CARD
          ============================================ */}
          <Link
            to={`/meetings/${meetingId}/transcript`}
            className="mt-6 block bg-white hover:bg-sky-50 hover:translate-y-[-2px] backdrop-blur-sm rounded-2xl shadow-lg p-6 xl:p-8 xl:pt-7 pr-10 xl:pr-12 animate-fadeInUp transition-all group cursor-pointer hover:shadow-xl"
            style={{ animationDelay: '600ms' }}
          >
            <div className="flex items-center justify-between gap-8">
              {/* Left: Title + Metadata */}
              <div className="flex-1">
                <h3 className="font-display text-4xl font-semibold tracking-tighter text-teal-950">
                  Full Transcript
                </h3>
                <div className="flex items-center gap-4 mt-2 text-base text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    {analysis.fullTranscript.segments.length} segments
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    {analysis.fullTranscript.num_speakers} speakers
                  </span>
                  <span className="flex items-center gap-1.5">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {formatDuration(analysis.fullTranscript.duration)}
                  </span>
                </div>
              </div>

              {/* Right: View Button */}
              <div className="flex items-center gap-2 px-5 py-2.5 bg-teal-600/80 group-hover:bg-teal-600 group-active:bg-teal-700 text-white font-semibold text-sm rounded-lg transition-all ">
                <span>View Transcript</span>
              </div>
            </div>
          </Link>
        </div>
      </PageBackground>
    </>
  );
}
