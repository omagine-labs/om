/**
 * AnalysisPreview Component
 *
 * Public preview of meeting analysis for anonymous users.
 * Allows speaker assignment before signup.
 * Uses the new teal background design matching the authenticated analysis page.
 */

'use client';

import { useState, useEffect } from 'react';
import { formatDuration } from '@/lib/formatters';
import { SignupCTA } from './SignupCTA';
import { Database } from '@/supabase/database.types';
import { GUEST_USER_ID } from '@/lib/constants';
import { MeetingPillarScoreCard } from '@/components/analysis/MeetingPillarScoreCard';
import { MeetingFocusAreas } from '@/components/analysis/MeetingFocusAreas';
import { AnalysisDetails } from '@/components/analysis/AnalysisDetails';
import { SpeakerIdentificationOverlay } from '@/components/analysis/SpeakerIdentificationOverlay';
import { PageBackground } from '@/components/layout/PageBackground';

/**
 * Humanize speaker label (SPEAKER_A -> Speaker A)
 */
function humanizeSpeakerLabel(label: string): string {
  return label
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

type Meeting = Database['public']['Tables']['meetings']['Row'];
type MeetingAnalysis = Database['public']['Tables']['meeting_analysis']['Row'];

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: string;
}

interface AnalysisPreviewProps {
  meeting: Meeting;
  analysisRecords: MeetingAnalysis[];
  anonymousEmail: string;
  speakerExcerpts: Record<string, string[]>;
  transcriptSegments: TranscriptSegment[];
  user: { id: string; email?: string } | null;
  accessToken?: string;
}

export function AnalysisPreview({
  meeting,
  analysisRecords,
  anonymousEmail,
  speakerExcerpts,
  transcriptSegments,
  user,
  accessToken,
}: AnalysisPreviewProps) {
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [refreshedRecords, setRefreshedRecords] = useState(analysisRecords);
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);

  // Prevent scrolling when loading overlay is shown
  useEffect(() => {
    if (showLoadingOverlay) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [showLoadingOverlay]);

  // Count unique speakers (deduplicated by speaker_label)
  const uniqueSpeakerCount = new Set(
    refreshedRecords.map((r) => r.speaker_label)
  ).size;

  // Load speaker selection from localStorage or database on mount
  useEffect(() => {
    const loadSpeakerSelection = async () => {
      // For authenticated users, don't auto-load - let them pick fresh
      // (prevents auto-claiming from cached selection)
      if (user) {
        return;
      }

      // For anonymous users: check localStorage (fast)
      const stored = localStorage.getItem(`meeting_${meeting.id}_speaker`);
      if (stored) {
        setSelectedSpeaker(stored);
        return;
      }

      // If not in localStorage, check database via token-validated API route
      if (!accessToken) {
        return; // No token, can't check database
      }

      try {
        const response = await fetch(
          `/api/anonymous-speaker?meetingId=${meeting.id}&token=${accessToken}`
        );
        if (response.ok) {
          const { speakerLabel } = await response.json();
          if (speakerLabel) {
            // Found GUEST_USER_ID assignment, auto-select this speaker
            setSelectedSpeaker(speakerLabel);
            // Also store in localStorage for faster subsequent loads
            localStorage.setItem(`meeting_${meeting.id}_speaker`, speakerLabel);
          }
        }
      } catch (err) {
        console.error('Failed to load speaker selection:', err);
      }
    };

    loadSpeakerSelection();
  }, [meeting.id, user, accessToken]);

  // Handle speaker assignment
  const handleAssignSpeaker = async (speakerLabel: string) => {
    setIsAssigning(true);

    // For authenticated users: show loading overlay immediately to prevent flashing
    if (user) {
      setShowLoadingOverlay(true);
    }

    try {
      if (user) {
        // For authenticated users: call API route (uses service role to bypass RLS)
        const response = await fetch('/api/assign-speaker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId: meeting.id,
            speakerLabel,
          }),
        });

        if (!response.ok) {
          console.error('Failed to assign speaker:', await response.text());
          setIsAssigning(false);
          setShowLoadingOverlay(false);
          return;
        }

        // Auto-claim the meeting via API route (uses service role)
        const claimResponse = await fetch('/api/claim-meeting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId: meeting.id,
            anonymousEmail,
          }),
        });

        if (!claimResponse.ok) {
          const errorData = await claimResponse.json();
          console.error('Auto-claim failed:', errorData);
          setIsAssigning(false);
          setShowLoadingOverlay(false);
          return;
        }

        // Wait for DB commit, then redirect
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Hard redirect to ensure fresh page load with updated data
        window.location.href = `/meetings/${meeting.id}/analysis`;
      } else {
        // For anonymous users: assign via token-validated API route
        if (!accessToken) {
          console.error('No access token available');
          return;
        }

        const response = await fetch('/api/anonymous-speaker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId: meeting.id,
            speakerLabel,
            token: accessToken,
          }),
        });

        if (response.ok) {
          const { records } = await response.json();
          // Store in localStorage
          localStorage.setItem(`meeting_${meeting.id}_speaker`, speakerLabel);
          setSelectedSpeaker(speakerLabel);
          // Update records from response
          if (records) {
            setRefreshedRecords(records);
          }
        } else {
          console.error('Failed to assign speaker:', await response.text());
        }
      }
    } catch (err) {
      console.error('Failed to assign speaker:', err);
    } finally {
      setIsAssigning(false);
    }
  };

  // Handle speaker unassignment (return to step 1)
  const handleUnassignSpeaker = async () => {
    setIsAssigning(true);
    try {
      // Use token-validated API route for anonymous users
      if (!accessToken) {
        console.error('No access token available');
        return;
      }

      const response = await fetch(
        `/api/anonymous-speaker?meetingId=${meeting.id}&token=${accessToken}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        const { records } = await response.json();
        // Clear localStorage
        localStorage.removeItem(`meeting_${meeting.id}_speaker`);
        setSelectedSpeaker(null);
        // Update records from response
        if (records) {
          setRefreshedRecords(records);
        }
      } else {
        console.error('Failed to unassign speaker:', await response.text());
      }
    } catch (err) {
      console.error('Failed to unassign speaker:', err);
    } finally {
      setIsAssigning(false);
    }
  };

  // Build signup URL with params
  const signupUrl =
    `/signup?email=${encodeURIComponent(anonymousEmail)}&meeting_id=${meeting.id}` +
    (selectedSpeaker ? `&speaker=${encodeURIComponent(selectedSpeaker)}` : '');

  // Get unique speakers for selection step
  const uniqueSpeakers = Array.from(
    new Set(refreshedRecords.map((r) => r.speaker_label))
  ).sort();

  // Get selected speaker's record for the new design
  const selectedSpeakerRecord = selectedSpeaker
    ? refreshedRecords.find((r) => r.speaker_label === selectedSpeaker)
    : null;

  // Calculate meeting duration
  const meetingDuration = meeting.recording_duration_seconds || 0;

  return (
    <>
      {/* Loading overlay during claim/redirect (authenticated users only) */}
      {showLoadingOverlay && (
        <div className="fixed inset-0 z-[9999] bg-sky-700 overflow-hidden flex items-center justify-center px-8">
          {/* Noise texture background */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage: 'url(/noise.svg)',
              backgroundRepeat: 'repeat',
              backgroundSize: '200px 200px',
            }}
          />

          {/* Blurred emerald circle background */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-[150vw] max-w-[1200px] h-[1200px] bg-teal-400 pointer-events-none opacity-70"
            style={{
              top: '-440px',
              filter: 'blur(150px)',
              borderRadius: '50%',
            }}
          />

          {/* Blurred lime ellipse overlay */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-[200vw] max-w-[2000px] h-[500px] bg-emerald-400 pointer-events-none opacity-20"
            style={{
              top: '-300px',
              filter: 'blur(200px)',
              borderRadius: '50%',
            }}
          />

          {/* Blinds lighting effect */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/blinds.svg"
            alt=""
            className="absolute -top-[40px] left-1/2 -translate-x-1/2 -rotate-2 h-[300px] sm:h-[500px] w-auto pointer-events-none opacity-[0.06] mix-blend-plus-lighter blur-[3px] sm:blur-[10px]"
          />

          {/* Content */}
          <div
            className="relative z-10 max-w-xl w-full bg-white p-12 text-center"
            style={{
              borderRadius: '1rem',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div className="mb-6">
              {/* Spinner */}
              <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-teal-600 border-r-transparent"></div>
            </div>
            <h2 className="text-4xl font-semibold font-display text-slate-900 tracking-tighter mb-4">
              Saving Your Meeting...
            </h2>
            <p className="text-gray-600 text-lg">
              Taking you to your dashboard
            </p>
          </div>
        </div>
      )}

      {/* Sticky Signup CTA Banner (only show after speaker selection) */}
      {selectedSpeaker && (
        <SignupCTA
          selectedSpeaker={selectedSpeaker}
          signupUrl={signupUrl}
          isSticky
        />
      )}

      {/* Speaker Identification Modal (show when no speaker selected) */}
      {!selectedSpeaker && (
        <SpeakerIdentificationOverlay
          speakerRecords={refreshedRecords.map((r) => ({
            speaker_label: r.speaker_label,
            talk_time_percentage: r.talk_time_percentage,
            identification_confidence: r.identification_confidence,
          }))}
          transcriptSegments={transcriptSegments}
          onSelectSpeaker={handleAssignSpeaker}
          isAssigning={isAssigning}
        />
      )}

      <PageBackground>
        {/* Show full analysis immediately - modal will overlay on first visit */}
        {selectedSpeakerRecord ? (
          <>
            {/* Header */}
            <div className="flex items-start justify-between gap-6 mb-6">
              <div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-white tracking-tighter font-display leading-[1] text-shadow-sm">
                  {meeting.title || 'Meeting Analysis'}
                </h1>
                <p className="mt-2 text-sm uppercase tracking-wide font-bold text-teal-100">
                  {new Date(meeting.start_time || '').toLocaleDateString(
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
                  {uniqueSpeakerCount} speakers
                </p>
              </div>

              {/* "Not you?" button */}
              <div className="pt-[6px]">
                <button
                  onClick={handleUnassignSpeaker}
                  disabled={isAssigning}
                  className="inline-flex items-center gap-1.5 pl-4 pr-5 py-2.5 text-sm font-medium text-white bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-lg transition-colors disabled:opacity-50"
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
              </div>
            </div>

            {/* Meeting Focus Areas */}
            {selectedSpeakerRecord.communication_tips &&
              (selectedSpeakerRecord.communication_tips as string[]).length >
                0 && (
                <MeetingFocusAreas
                  tips={selectedSpeakerRecord.communication_tips as string[]}
                  summary={selectedSpeakerRecord.general_overview ?? undefined}
                />
              )}

            {/* Pillar Score Cards - only show cards with scores */}
            {(selectedSpeakerRecord.clarity_score !== null ||
              selectedSpeakerRecord.confidence_score !== null ||
              selectedSpeakerRecord.attunement_score !== null) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {selectedSpeakerRecord.clarity_score !== null && (
                  <MeetingPillarScoreCard
                    pillar="clarity"
                    score={selectedSpeakerRecord.clarity_score}
                    explanation={selectedSpeakerRecord.clarity_explanation}
                    animationIndex={0}
                  />
                )}
                {selectedSpeakerRecord.confidence_score !== null && (
                  <MeetingPillarScoreCard
                    pillar="confidence"
                    score={selectedSpeakerRecord.confidence_score}
                    explanation={selectedSpeakerRecord.confidence_explanation}
                    animationIndex={1}
                  />
                )}
                {selectedSpeakerRecord.attunement_score !== null && (
                  <MeetingPillarScoreCard
                    pillar="attunement"
                    score={selectedSpeakerRecord.attunement_score}
                    explanation={selectedSpeakerRecord.attunement_explanation}
                    animationIndex={2}
                  />
                )}
              </div>
            )}

            {/* Analysis Details */}
            <AnalysisDetails
              speakerRecord={selectedSpeakerRecord}
              allSpeakerRecords={refreshedRecords}
              totalDuration={meetingDuration}
              currentUserId={GUEST_USER_ID}
            />

            {/* Bottom CTA Card */}
            <div className="mt-6">
              <SignupCTA
                selectedSpeaker={selectedSpeaker}
                signupUrl={signupUrl}
                isSticky={false}
              />
            </div>
          </>
        ) : (
          <>
            {/* Loading state while modal is shown */}
            <div className="mb-6">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-white tracking-tighter font-display leading-[1] text-shadow-sm">
                {meeting.title || 'Meeting Analysis'}
              </h1>
              <p className="mt-2 text-sm uppercase tracking-wide font-bold text-teal-100">
                {new Date(meeting.start_time || '').toLocaleDateString(
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
                {uniqueSpeakerCount} speakers
              </p>
            </div>
          </>
        )}
      </PageBackground>
    </>
  );
}
