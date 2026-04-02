'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { useDelayedSkeleton } from '@/hooks/useDelayedSkeleton';
import { PageBackground } from '@/components/layout/PageBackground';
import { formatTime, formatDuration } from '@/lib/formatters';
import type { OffRecordPeriod } from '@/types/meetings';

/* ============================================
   TYPE DEFINITIONS
   ============================================ */

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: string;
  confidence?: number;
}

interface SpeakerRecord {
  speaker_label: string;
  assigned_user_id: string | null;
  custom_speaker_name: string | null;
}

interface TranscriptData {
  segments: TranscriptSegment[];
  speakers: string[];
  duration: number;
}

interface MeetingData {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  off_record_periods?: OffRecordPeriod[];
  user_speaker_label?: string | null;
}

/* ============================================
   MAIN PAGE COMPONENT
   ============================================ */

export default function MeetingTranscriptPage() {
  const params = useParams();
  const meetingId = params.meetingId as string;

  const [transcript, setTranscript] = useState<TranscriptData | null>(null);
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [speakerRecords, setSpeakerRecords] = useState<SpeakerRecord[]>([]);
  const [offRecordPeriods, setOffRecordPeriods] = useState<OffRecordPeriod[]>(
    []
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('You');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Delayed skeleton: only show if loading takes > 400ms
  const showSkeleton = useDelayedSkeleton(isLoading);

  const fetchTranscript = useCallback(async () => {
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

      // Fetch meeting
      const { data: meetingData, error: meetingError } = await supabase
        .from('meetings')
        .select(
          'id, title, start_time, end_time, off_record_periods, user_speaker_label'
        )
        .eq('id', meetingId)
        .single();

      if (meetingError) throw meetingError;
      if (!meetingData) {
        setError('Meeting not found');
        setIsLoading(false);
        return;
      }

      setMeeting({
        ...meetingData,
        off_record_periods: meetingData.off_record_periods as unknown as
          | OffRecordPeriod[]
          | undefined,
        user_speaker_label: meetingData.user_speaker_label,
      });
      setOffRecordPeriods(
        (meetingData.off_record_periods as unknown as OffRecordPeriod[]) || []
      );

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

      // Fetch speaker records (for speaker assignment info only)
      const { data: records, error: analysisError } = await supabase
        .from('meeting_analysis')
        .select('speaker_label, assigned_user_id, custom_speaker_name')
        .eq('job_id', jobData.id);

      if (analysisError) throw analysisError;

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

      setSpeakerRecords((records || []) as unknown as SpeakerRecord[]);

      // Use transcript data directly (no reconstruction needed)
      const segments =
        (transcriptData.segments as unknown as TranscriptSegment[]) || [];
      const speakers = (transcriptData.speakers as string[]) || [];
      const duration =
        transcriptData.duration_seconds ||
        (segments.length > 0 ? segments[segments.length - 1].end : 0);

      setTranscript({ segments, speakers, duration });
    } catch (err) {
      console.error('Failed to load transcript:', err);
      setError('Failed to load transcript. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    fetchTranscript();
  }, [fetchTranscript]);

  // Helper functions
  // user_speaker_label is the source of truth for speaker identification
  const userSpeakerLabel = meeting?.user_speaker_label;

  const isAssignedToMe = (speaker: string) => {
    return !!userSpeakerLabel && speaker === userSpeakerLabel;
  };

  const getDisplayName = (speaker: string) => {
    if (userSpeakerLabel && speaker === userSpeakerLabel)
      return currentUserName;
    const record = speakerRecords.find((r) => r.speaker_label === speaker);
    if (record?.custom_speaker_name) return record.custom_speaker_name;
    // Humanize speaker label (e.g., "SPEAKER_A" -> "Speaker A")
    return speaker.replace(/_/g, ' ');
  };

  // Calculate meeting duration
  const meetingDuration = meeting
    ? (() => {
        const start = new Date(meeting.start_time);
        const end = meeting.end_time
          ? new Date(meeting.end_time)
          : new Date(start.getTime() + (transcript?.duration || 0) * 1000);
        return Math.round((end.getTime() - start.getTime()) / 1000);
      })()
    : 0;

  /* ============================================
     LOADING STATE
     ============================================ */
  if (isLoading && showSkeleton) {
    return (
      <PageBackground maxWidth="max-w-4xl">
        <div className="mb-8">
          <div className="h-6 w-32 bg-white/20 rounded animate-pulse mb-4" />
          <div className="h-10 w-80 bg-white/30 rounded animate-pulse mb-2" />
          <div className="h-4 w-48 bg-white/20 rounded animate-pulse" />
        </div>
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg p-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="mb-6">
              <div className="h-4 w-24 bg-slate-200 rounded animate-pulse mb-2" />
              <div className="h-16 w-full bg-slate-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </PageBackground>
    );
  }

  // Show just background while loading (before skeleton delay)
  if (isLoading) {
    return (
      <PageBackground maxWidth="max-w-4xl">
        <div />
      </PageBackground>
    );
  }

  /* ============================================
     ERROR STATE
     ============================================ */
  if (error) {
    return (
      <PageBackground maxWidth="max-w-4xl">
        <div className="mb-8">
          <Link
            href={`/meetings/${meetingId}/analysis`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-white/10 hover:bg-white/20 transition-colors mb-4"
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
            <span className="text-sm font-medium">Back to Analysis</span>
          </Link>
          <h1 className="text-3xl sm:text-4xl font-medium text-white tracking-tighter font-display">
            Transcript
          </h1>
        </div>
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-8 text-center shadow-lg">
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
            Unable to Load Transcript
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href={`/meetings/${meetingId}/analysis`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors"
          >
            Return to Analysis
          </Link>
        </div>
      </PageBackground>
    );
  }

  if (!transcript || !meeting) return null;

  /* ============================================
     MAIN RENDER
     ============================================ */
  return (
    <PageBackground maxWidth="max-w-4xl">
      {/* ============================================
          HEADER
          ============================================ */}
      <div className="flex items-start justify-start gap-6 mb-6 animate-fadeInUp">
        {/* Title + metadata */}
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-white tracking-tighter font-display leading-[1] text-shadow-sm">
            {meeting.title}
          </h1>
          <p className="mt-2 text-sm uppercase tracking-wide font-bold text-teal-100">
            {new Date(meeting.start_time).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
            {' · '}
            {formatDuration(meetingDuration)}
            {' · '}
            {transcript.speakers.length} speakers
            {' · '}
            {transcript.segments.length} segments
          </p>
        </div>

        {/* Back button */}
        <Link
          href={`/meetings/${meetingId}/analysis`}
          className="inline-flex items-center mt-[6px] gap-2 pl-4 pr-5 py-2.5 rounded-lg text-white hover:text-white bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors shrink-0"
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
          <span className="text-sm font-medium">Analysis</span>
        </Link>
      </div>

      {/* ============================================
          TRANSCRIPT CONTENT
          ============================================ */}
      <div
        className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg overflow-hidden animate-fadeInUp"
        style={{ animationDelay: '100ms' }}
      >
        {/* Transcript header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <svg
                className="w-5 h-5 text-teal-600"
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
              Full Transcript
            </h2>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-lime-500" />
                <span>Me</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-slate-400" />
                <span>Others</span>
              </div>
            </div>
          </div>
        </div>

        {/* Transcript segments - Timeline Layout */}
        <div className="p-6 pl-4">
          {transcript.segments.map((segment, idx) => {
            const isMe = isAssignedToMe(segment.speaker);
            const nextSegment = transcript.segments[idx + 1];
            const isLast = idx === transcript.segments.length - 1;

            // Check for off-record period
            let offRecordGap: {
              start: number;
              end: number;
              duration: number;
            } | null = null;
            if (offRecordPeriods.length > 0 && nextSegment) {
              const gap = offRecordPeriods.find(
                (p) =>
                  p.placeholderStart >= segment.end &&
                  p.placeholderEnd <= nextSegment.start
              );
              if (gap) {
                offRecordGap = {
                  start: gap.placeholderStart,
                  end: gap.placeholderEnd,
                  duration: gap.actualDuration,
                };
              }
            }

            return (
              <div key={idx}>
                {/* Segment with Timeline */}
                <div className="flex">
                  {/* Timeline column */}
                  <div className="w-16 flex-shrink-0 flex flex-col items-center pt-3">
                    {/* Timestamp */}
                    <span className="text-xs font-mono text-slate-500 tabular-nums font-medium">
                      {formatTime(segment.start)}
                    </span>
                    {/* Dot */}
                    <div
                      className={`w-2.5 h-2.5 rounded-full mt-2 ${isMe ? 'bg-lime-500' : 'bg-slate-300'}`}
                    />
                    {/* Connecting line */}
                    {!isLast && !offRecordGap && (
                      <div className="flex-1 w-px bg-slate-200 min-h-[24px]" />
                    )}
                  </div>

                  {/* Content column */}
                  <div className="flex-1 pb-3">
                    <div
                      className={`cursor-default relative pl-4 pr-4 py-3 rounded-lg transition-colors hover:translate-y-[-2px] overflow-hidden ${
                        isMe
                          ? 'bg-lime-400/15 hover:bg-lime-400/20'
                          : 'bg-white hover:bg-slate-100'
                      }`}
                    >
                      {/* Teeth pattern overlay for "Me" segments */}
                      {isMe && (
                        <div
                          className="absolute bottom-0 left-0 right-0 h-10 opacity-5 mix-blend-color-burn pointer-events-none"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg width='150' height='40' viewBox='0 0 150 40' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cmask id='mask0' style='mask-type:alpha' maskUnits='userSpaceOnUse' x='0' y='0' width='150' height='40'%3E%3Crect width='150' height='40' fill='white'/%3E%3C/mask%3E%3Cg mask='url(%23mask0)'%3E%3Cpath d='M6 33.5C6 31.0147 8.01472 29 10.5 29C12.9853 29 15 31.0147 15 33.5V52.5C15 54.9853 12.9853 57 10.5 57C8.01472 57 6 54.9853 6 52.5V33.5Z' fill='%23151515'/%3E%3Cpath d='M21 27.5C21 25.0147 23.0147 23 25.5 23C27.9853 23 30 25.0147 30 27.5V46.5C30 48.9853 27.9853 51 25.5 51C23.0147 51 21 48.9853 21 46.5V27.5Z' fill='%23151515'/%3E%3Cpath d='M36 33.5C36 31.0147 38.0147 29 40.5 29C42.9853 29 45 31.0147 45 33.5V52.5C45 54.9853 42.9853 57 40.5 57C38.0147 57 36 54.9853 36 52.5V33.5Z' fill='%23151515'/%3E%3Cpath d='M51 30.5C51 28.0147 53.0147 26 55.5 26C57.9853 26 60 28.0147 60 30.5V49.5C60 51.9853 57.9853 54 55.5 54C53.0147 54 51 51.9853 51 49.5V30.5Z' fill='%23151515'/%3E%3Cpath d='M66 35.5C66 33.0147 68.0147 31 70.5 31C72.9853 31 75 33.0147 75 35.5V54.5C75 56.9853 72.9853 59 70.5 59C68.0147 59 66 56.9853 66 54.5V35.5Z' fill='%23151515'/%3E%3Cpath d='M81 30.5C81 28.0147 83.0147 26 85.5 26C87.9853 26 90 28.0147 90 30.5V49.5C90 51.9853 87.9853 54 85.5 54C83.0147 54 81 51.9853 81 49.5V30.5Z' fill='%23151515'/%3E%3Cpath d='M96 27.5C96 25.0147 98.0147 23 100.5 23C102.985 23 105 25.0147 105 27.5V46.5C105 48.9853 102.985 51 100.5 51C98.0147 51 96 48.9853 96 46.5V27.5Z' fill='%23151515'/%3E%3Cpath d='M111 33.5C111 31.0147 113.015 29 115.5 29C117.985 29 120 31.0147 120 33.5V52.5C120 54.9853 117.985 57 115.5 57C113.015 57 111 54.9853 111 52.5V33.5Z' fill='%23151515'/%3E%3Cpath d='M126 30.5C126 28.0147 128.015 26 130.5 26C132.985 26 135 28.0147 135 30.5V49.5C135 51.9853 132.985 54 130.5 54C128.015 54 126 51.9853 126 49.5V30.5Z' fill='%23151515'/%3E%3Cpath d='M141 35.5C141 33.0147 143.015 31 145.5 31C147.985 31 150 33.0147 150 35.5V54.5C150 56.9853 147.985 59 145.5 59C143.015 59 141 56.9853 141 54.5V35.5Z' fill='%23151515'/%3E%3C/g%3E%3C/svg%3E")`,
                            backgroundRepeat: 'repeat-x',
                            backgroundSize: '150px 40px',
                            backgroundPosition: 'bottom',
                          }}
                        />
                      )}
                      {/* Speaker name */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className={`text-sm font-semibold ${isMe ? 'text-lime-700' : 'text-slate-700'}`}
                        >
                          {isMe ? 'Me' : getDisplayName(segment.speaker)}
                        </span>
                      </div>
                      {/* Text */}
                      <p className="text-slate-700 leading-relaxed">
                        {segment.text}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Off-record indicator - spans full width */}
                {offRecordGap && (
                  <div className="flex">
                    {/* Timeline column - continue the line through */}
                    <div className="w-16 flex-shrink-0 flex flex-col items-center">
                      <div className="w-px h-4 bg-slate-200" />
                      <div
                        className="w-px h-4 bg-amber-300"
                        style={{ marginTop: '2px', marginBottom: '2px' }}
                      />
                      <div className="w-px h-4 bg-slate-200" />
                    </div>
                    {/* Off-record content */}
                    <div className="flex-1 my-3 flex items-center gap-3">
                      <div className="flex-1 border-t-2 border-dashed border-amber-300" />
                      <div className="bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5">
                        <span className="text-xs font-medium text-amber-700">
                          Recording paused ·{' '}
                          {formatDuration(offRecordGap.duration)}
                        </span>
                      </div>
                      <div className="flex-1 border-t-2 border-dashed border-amber-300" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-8 border-t-2 border-dashed border-slate-200 bg-slate-50/50">
          <p className="text-base text-slate-500 text-center">
            End of transcript · {formatDuration(transcript.duration)} total
          </p>
        </div>
      </div>
    </PageBackground>
  );
}
