'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { useSpeakerAssignment } from '@/hooks/useSpeakerAssignment';
import { useDelayedSkeleton } from '@/hooks/useDelayedSkeleton';
import * as Sentry from '@sentry/nextjs';
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
  // Metrics v2
  longest_segment_seconds: number | null;
  hedge_phrases_total: number | null;
  hedge_phrases_per_minute: number | null;
  hedge_phrases_breakdown: Record<string, number> | null;
  softeners_total: number | null;
  softeners_per_minute: number | null;
  softeners_breakdown: Record<string, number> | null;
  apologies_total: number | null;
  apologies_breakdown: Record<string, number> | null;
  signposting_total: number | null;
  signposting_per_segment: number | null;
  signposting_breakdown: Record<string, number> | null;
  incomplete_thoughts_count: number | null;
  incomplete_thoughts_percentage: number | null;
  specificity_score: number | null;
  specificity_details: Record<string, any> | null;
  avg_topics_per_segment: number | null;
  max_topics_in_segment: number | null;
  key_point_position: number | null;
  key_point_summary: string | null;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const meetingId = params.meetingId as string;
  const showMetricsV2 = searchParams.get('metricsV2') === 'true';

  // State
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('You');

  // Use ref instead of state for skipAutoAssignment to avoid async state issues
  const skipAutoAssignmentRef = useRef(false);

  // State for "Not You?" modal - separate from needsIdentification
  // This allows keeping the analysis visible while the modal is open
  const [isReassigning, setIsReassigning] = useState(false);

  // Delayed skeleton: only show if loading takes > 400ms
  const showSkeleton = useDelayedSkeleton(isLoading);

  // Fetch analysis data
  const fetchAnalysis = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);

        const { data: userData } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', user.id)
          .single();

        if (userData?.full_name) {
          setCurrentUserName(userData.full_name);
        }
      }

      // Fetch meeting data
      const { data: meetingData, error: meetingError } = await supabase
        .from('meetings')
        .select(
          'id, title, start_time, end_time, off_record_periods, attendees, user_speaker_label, shared_mic_detected'
        )
        .eq('id', meetingId)
        .single();

      if (meetingError) throw meetingError;
      if (!meetingData) {
        setError('Meeting not found');
        setIsLoading(false);
        return;
      }

      // Fetch processing job
      const { data: jobData, error: jobError } = await supabase
        .from('processing_jobs')
        .select('id, status')
        .eq('meeting_id', meetingId)
        .single();

      if (jobError || !jobData) {
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

      // Fetch speaker analysis records (without transcript_segments - now in transcripts table)
      // Query by meeting_id since job_id may be null in some records
      const { data: speakerRecords, error: analysisError } = await supabase
        .from('meeting_analysis')
        .select('*')
        .eq('meeting_id', meetingId);

      if (analysisError) throw analysisError;
      if (!speakerRecords || speakerRecords.length === 0) {
        setError('No speech detected in this recording.');
        setIsLoading(false);
        return;
      }

      // Fetch transcript from dedicated transcripts table
      const { data: transcriptData, error: transcriptError } = await supabase
        .from('transcripts')
        .select('segments, speakers, duration_seconds')
        .eq('meeting_id', meetingId)
        .single();

      if (transcriptError || !transcriptData) {
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

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  // Lightweight refetch that only updates speaker records without full page reload
  const refetchSpeakerRecords = useCallback(async () => {
    if (!analysis) return;

    try {
      const supabase = createClient();

      // Only fetch speaker records and meeting metadata
      // Query by meeting_id since job_id may be null in some records
      const [speakerResult, meetingResult] = await Promise.all([
        supabase
          .from('meeting_analysis')
          .select('*')
          .eq('meeting_id', meetingId),
        supabase
          .from('meetings')
          .select(
            'user_speaker_label, shared_mic_detected, alternative_speakers'
          )
          .eq('id', meetingId)
          .single(),
      ]);

      if (speakerResult.data && meetingResult.data) {
        setAnalysis((prev) =>
          prev
            ? {
                ...prev,
                speakerRecords:
                  speakerResult.data as unknown as SpeakerAnalysisRecord[],
                meeting: {
                  ...prev.meeting,
                  user_speaker_label: meetingResult.data.user_speaker_label,
                  shared_mic_detected: meetingResult.data.shared_mic_detected,
                  alternative_speakers: meetingResult.data.alternative_speakers,
                },
              }
            : null
        );
      }
    } catch (err) {
      console.error('Failed to refetch speaker records:', err);
    }
  }, [analysis, meetingId]);

  // Speaker assignment hook
  const { assignSpeaker, isAssigning } = useSpeakerAssignment({
    jobId: analysis?.jobId || '',
    currentUserId: currentUserId || undefined,
    onSuccess: refetchSpeakerRecords,
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

    // Refresh layout to update unassigned counter in sidebar (re-runs server component)
    router.refresh();
  };

  // Handle modal close (redirect to meetings)
  const handleCloseModal = () => {
    router.push('/meetings');
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
            href="/meetings"
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
            href="/meetings"
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
                href="/meetings"
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
                  href={`/meetings/${meetingId}/transcript`}
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
          METRICS V2 DEBUG PANEL (query param: ?metricsV2=true)
          ============================================ */}
          {showMetricsV2 && userSpeakerRecord && (
            <div className="mt-6 bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-lg font-mono text-sm">
              <h3 className="text-lg font-bold text-amber-400 mb-4 flex items-center gap-2">
                <span>🧪</span> Metrics V2 Debug Panel
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Longest Segment */}
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1 flex items-center gap-1">
                    Longest Segment
                    <span className="relative group cursor-help">
                      <svg
                        className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 pointer-events-none z-10 normal-case tracking-normal font-sans">
                        Duration of the longest uninterrupted speaking turn.
                        Helps detect monologuing patterns.
                      </span>
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {userSpeakerRecord.longest_segment_seconds?.toFixed(1) ??
                      'N/A'}
                    <span className="text-sm text-slate-400 ml-1">sec</span>
                  </div>
                </div>

                {/* Hedge Phrases */}
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1 flex items-center gap-1">
                    Hedge Phrases
                    <span className="relative group cursor-help">
                      <svg
                        className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 pointer-events-none z-10 normal-case tracking-normal font-sans">
                        Counts uncertainty language: &quot;I think&quot;,
                        &quot;maybe&quot;, &quot;probably&quot;, &quot;I
                        guess&quot;, &quot;perhaps&quot;, etc. High usage may
                        indicate lack of confidence.
                      </span>
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {userSpeakerRecord.hedge_phrases_total ?? 'N/A'}
                    <span className="text-sm text-slate-400 ml-1">
                      (
                      {userSpeakerRecord.hedge_phrases_per_minute?.toFixed(1) ??
                        '–'}
                      /min)
                    </span>
                  </div>
                  {userSpeakerRecord.hedge_phrases_breakdown && (
                    <div className="mt-2 text-xs text-slate-400">
                      {Object.entries(userSpeakerRecord.hedge_phrases_breakdown)
                        .slice(0, 3)
                        .map(([phrase, count]) => (
                          <span key={phrase} className="mr-2">
                            {phrase}: {count}
                          </span>
                        ))}
                    </div>
                  )}
                </div>

                {/* Softeners */}
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1 flex items-center gap-1">
                    Softeners
                    <span className="relative group cursor-help">
                      <svg
                        className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 pointer-events-none z-10 normal-case tracking-normal font-sans">
                        Detects minimizing language: &quot;just&quot;,
                        &quot;actually&quot;, &quot;kind of&quot;, &quot;sort
                        of&quot;, &quot;a little&quot;. May indicate reduced
                        assertiveness.
                      </span>
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {userSpeakerRecord.softeners_total ?? 'N/A'}
                    <span className="text-sm text-slate-400 ml-1">
                      (
                      {userSpeakerRecord.softeners_per_minute?.toFixed(1) ??
                        '–'}
                      /min)
                    </span>
                  </div>
                  {userSpeakerRecord.softeners_breakdown && (
                    <div className="mt-2 text-xs text-slate-400">
                      {Object.entries(userSpeakerRecord.softeners_breakdown)
                        .slice(0, 3)
                        .map(([phrase, count]) => (
                          <span key={phrase} className="mr-2">
                            {phrase}: {count}
                          </span>
                        ))}
                    </div>
                  )}
                </div>

                {/* Apologies */}
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1 flex items-center gap-1">
                    Apologies
                    <span className="relative group cursor-help">
                      <svg
                        className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 pointer-events-none z-10 normal-case tracking-normal font-sans">
                        Counts apology patterns: &quot;sorry&quot;, &quot;I
                        apologize&quot;, &quot;my apologies&quot;, &quot;pardon
                        me&quot;. Frequent apologies may undermine authority.
                      </span>
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {userSpeakerRecord.apologies_total ?? 'N/A'}
                  </div>
                  {userSpeakerRecord.apologies_breakdown && (
                    <div className="mt-2 text-xs text-slate-400">
                      {Object.entries(userSpeakerRecord.apologies_breakdown)
                        .slice(0, 3)
                        .map(([phrase, count]) => (
                          <span key={phrase} className="mr-2">
                            {phrase}: {count}
                          </span>
                        ))}
                    </div>
                  )}
                </div>

                {/* Signposting */}
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1 flex items-center gap-1">
                    Signposting
                    <span className="relative group cursor-help">
                      <svg
                        className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 pointer-events-none z-10 normal-case tracking-normal font-sans">
                        Structural markers that guide listeners:
                        &quot;first&quot;, &quot;next&quot;,
                        &quot;finally&quot;, &quot;to summarize&quot;, &quot;in
                        conclusion&quot;. Higher usage indicates clearer
                        organization.
                      </span>
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {userSpeakerRecord.signposting_total ?? 'N/A'}
                    <span className="text-sm text-slate-400 ml-1">
                      (
                      {userSpeakerRecord.signposting_per_segment?.toFixed(2) ??
                        '–'}
                      /seg)
                    </span>
                  </div>
                  {userSpeakerRecord.signposting_breakdown && (
                    <div className="mt-2 text-xs text-slate-400">
                      {Object.entries(userSpeakerRecord.signposting_breakdown)
                        .slice(0, 3)
                        .map(([phrase, count]) => (
                          <span key={phrase} className="mr-2">
                            {phrase}: {count}
                          </span>
                        ))}
                    </div>
                  )}
                </div>

                {/* Incomplete Thoughts */}
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1 flex items-center gap-1">
                    Incomplete Thoughts
                    <span className="relative group cursor-help">
                      <svg
                        className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 pointer-events-none z-10 normal-case tracking-normal font-sans">
                        Segments ending without closure: trailing off (...),
                        ending with &quot;um&quot;, &quot;so&quot;,
                        &quot;but&quot;, &quot;and&quot;. May indicate
                        hesitation or being interrupted.
                      </span>
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {userSpeakerRecord.incomplete_thoughts_count ?? 'N/A'}
                    <span className="text-sm text-slate-400 ml-1">
                      (
                      {userSpeakerRecord.incomplete_thoughts_percentage?.toFixed(
                        1
                      ) ?? '–'}
                      %)
                    </span>
                  </div>
                </div>

                {/* Specificity Score */}
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1 flex items-center gap-1">
                    Specificity Score
                    <span className="relative group cursor-help">
                      <svg
                        className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 pointer-events-none z-10 normal-case tracking-normal font-sans">
                        Ratio of specific vs vague language (0-10). Counts
                        numbers, dates, names, percentages vs words like
                        &quot;things&quot;, &quot;stuff&quot;, &quot;soon&quot;.
                        Higher = more concrete.
                      </span>
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {userSpeakerRecord.specificity_score?.toFixed(1) ?? 'N/A'}
                    <span className="text-sm text-slate-400 ml-1">/10</span>
                  </div>
                  {userSpeakerRecord.specificity_details && (
                    <div className="mt-2 text-xs text-slate-400">
                      Specific:{' '}
                      {userSpeakerRecord.specificity_details.total_specific ??
                        '–'}{' '}
                      | Vague:{' '}
                      {userSpeakerRecord.specificity_details.total_vague ?? '–'}
                    </div>
                  )}
                </div>

                {/* Topics per Segment */}
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1 flex items-center gap-1">
                    Avg Topics/Segment
                    <span className="relative group cursor-help">
                      <svg
                        className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 pointer-events-none z-10 normal-case tracking-normal font-sans">
                        Estimated topics per speaking turn based on sentence
                        count and transition phrases. High values may indicate
                        idea cramming or lack of focus.
                      </span>
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {userSpeakerRecord.avg_topics_per_segment?.toFixed(2) ??
                      'N/A'}
                  </div>
                </div>

                {/* Key Point Position */}
                <div className="bg-slate-800 rounded-lg p-4">
                  <div className="text-slate-400 text-xs uppercase tracking-wide mb-1 flex items-center gap-1">
                    Key Point Position
                    <span className="relative group cursor-help">
                      <svg
                        className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-700 text-slate-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity w-64 pointer-events-none z-10 normal-case tracking-normal font-sans">
                        Where the main point appears (0-100). 0 = leads with key
                        point, 100 = buries the lead. Uses LLM to identify the
                        most important statement.
                      </span>
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white">
                    {userSpeakerRecord.key_point_position?.toFixed(0) ?? 'N/A'}
                    <span className="text-sm text-slate-400 ml-1">
                      (0=start, 100=end)
                    </span>
                  </div>
                  {userSpeakerRecord.key_point_summary && (
                    <div className="mt-2 text-xs text-slate-400 truncate">
                      {userSpeakerRecord.key_point_summary}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700 text-xs text-slate-500">
                Debug panel visible via{' '}
                <code className="bg-slate-800 px-1 rounded">
                  ?metricsV2=true
                </code>
              </div>
            </div>
          )}

          {/* ============================================
          TRANSCRIPT CARD
          ============================================ */}
          <Link
            href={`/meetings/${meetingId}/transcript`}
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
