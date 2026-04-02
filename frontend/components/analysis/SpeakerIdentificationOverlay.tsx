'use client';

import { useState, useMemo, useEffect } from 'react';

/**
 * SpeakerIdentificationOverlay Component
 *
 * Full-screen overlay prompting the user to identify which speaker they are.
 * Clean, minimal design with subtle color accents.
 */

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: string;
}

interface SpeakerRecord {
  speaker_label: string;
  talk_time_percentage: number;
  identification_confidence?: number | null;
}

interface SpeakerIdentificationOverlayProps {
  speakerRecords: SpeakerRecord[];
  transcriptSegments: TranscriptSegment[];
  onSelectSpeaker: (speakerLabel: string) => void;
  onClose?: () => void;
  isAssigning: boolean;
  meetingTitle?: string;
  meetingStartTime?: string;
  userSpeakerLabel?: string;
  sharedMicDetected?: boolean;
  alternativeSpeakers?: string[];
}

export function SpeakerIdentificationOverlay({
  speakerRecords,
  transcriptSegments,
  onSelectSpeaker,
  onClose,
  isAssigning,
  meetingTitle,
  meetingStartTime,
  userSpeakerLabel,
  sharedMicDetected,
  alternativeSpeakers,
}: SpeakerIdentificationOverlayProps) {
  // Track closing animation state
  const [isClosing, setIsClosing] = useState(false);

  // Handle close with animation
  const handleClose = () => {
    if (!onClose || isAssigning) return;
    setIsClosing(true);
    // Wait for animation to complete before calling onClose
    setTimeout(() => {
      onClose();
    }, 200); // Match animation duration
  };

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose && !isAssigning) {
        setIsClosing(true);
        setTimeout(() => {
          onClose();
        }, 200);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, isAssigning]);

  // Track scroll state for each speaker to show/hide fade
  const [scrollStates, setScrollStates] = useState<
    Record<string, { isAtBottom: boolean }>
  >({});

  // Prioritize speakers: identified > alternatives > others
  const sortedSpeakerRecords = useMemo(() => {
    // Deduplicate by speaker_label (keep first occurrence)
    const uniqueRecords = speakerRecords.filter(
      (record, index, self) =>
        index ===
        self.findIndex((r) => r.speaker_label === record.speaker_label)
    );

    // User's identified speaker
    const identifiedSpeaker = uniqueRecords.filter(
      (r) => r.speaker_label === userSpeakerLabel
    );

    // Alternative speakers (significant mic overlap)
    const alternativeSpeakerRecords = uniqueRecords.filter(
      (r) =>
        r.speaker_label !== userSpeakerLabel &&
        alternativeSpeakers?.includes(r.speaker_label)
    );

    // Other participants
    const otherSpeakers = uniqueRecords.filter(
      (r) =>
        r.speaker_label !== userSpeakerLabel &&
        !alternativeSpeakers?.includes(r.speaker_label)
    );

    // Sort each group alphabetically
    const sortAlpha = (a: SpeakerRecord, b: SpeakerRecord) =>
      a.speaker_label.localeCompare(b.speaker_label);

    return [
      ...identifiedSpeaker.sort(sortAlpha),
      ...alternativeSpeakerRecords.sort(sortAlpha),
      ...otherSpeakers.sort(sortAlpha),
    ];
  }, [speakerRecords, userSpeakerLabel, alternativeSpeakers]);

  // Get excerpt snippets for each speaker
  const getExcerpts = (speakerLabel: string, count: number = 8): string[] => {
    // Filter transcript segments for this speaker
    const speakerSegments = transcriptSegments.filter(
      (s) => s.speaker === speakerLabel
    );
    const meaningfulSegments = speakerSegments
      .filter((s) => s.text.length > 20)
      .slice(0, Math.min(count * 2, speakerSegments.length));

    const excerpts: string[] = [];
    const step = Math.max(1, Math.floor(meaningfulSegments.length / count));
    for (
      let i = 0;
      i < meaningfulSegments.length && excerpts.length < count;
      i += step
    ) {
      const text = meaningfulSegments[i].text;
      excerpts.push(text.length > 100 ? text.slice(0, 97) + '...' : text);
    }
    return excerpts;
  };

  // Simple, muted color palette
  const speakerColors = [
    {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      accent: 'bg-teal-500/90',
      text: 'text-teal-700',
    },
    {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      accent: 'bg-amber-500/90',
      text: 'text-amber-700',
    },
    {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      accent: 'bg-indigo-600/70',
      text: 'text-indigo-700',
    },
    {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      accent: 'bg-rose-600',
      text: 'text-rose-700',
    },
    {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      accent: 'bg-cyan-600',
      text: 'text-cyan-700',
    },
  ];

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${isClosing ? 'animate-fadeOut' : 'animate-fadeIn'}`}
    >
      {/* Backdrop - fades in/out smoothly, click to close */}
      <div
        className={`absolute inset-0 bg-slate-900/70 backdrop-blur-sm ${isClosing ? 'animate-fadeOut' : 'animate-fadeIn'}`}
        onClick={handleClose}
      />

      {/* Card - slides up/down smoothly */}
      <div
        className={`relative z-10 w-full max-w-4xl flex flex-col max-h-[90vh] ${isClosing ? 'animate-fadeOutDown' : 'animate-fadeInUp'}`}
      >
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-full">
          {/* Header */}
          <div className="px-8 pt-10 pb-8 md:px-12 md:pt-12 md:pb-10 border-b border-slate-100 relative flex-shrink-0">
            {/* Close button */}
            {onClose && (
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="Close"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-lime-400/50 mb-5">
                <svg
                  className="w-7 h-7 text-slate-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </div>

              <h2 className="text-3xl md:text-4xl font-medium text-gray-900 font-display tracking-tight">
                Which voice is yours?
              </h2>
              <p className="mt-3 text-base text-slate-500">
                Select your speaker to view your communication insights
              </p>

              {/* Meeting info */}
              {meetingTitle && (
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-lg">
                  <svg
                    className="w-4 h-4 text-slate-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-slate-700">
                    {meetingTitle}
                  </span>
                  {meetingStartTime && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className="text-sm text-slate-500">
                        {new Date(meetingStartTime).toLocaleDateString(
                          undefined,
                          {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          }
                        )}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Shared Microphone Warning */}
          {sharedMicDetected && (
            <div className="px-6 py-4 md:px-10 md:py-5 bg-slate-50/50 border-b border-slate-200 flex-shrink-0">
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0"
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
                  <div>
                    <h4 className="text-sm font-semibold text-yellow-800 mb-1">
                      Shared Microphone Detected
                    </h4>
                    <p className="text-sm text-yellow-700 mb-2">
                      Multiple speakers were detected on your microphone.
                      {alternativeSpeakers &&
                        alternativeSpeakers.length > 0 && (
                          <>
                            {' '}
                            We&apos;ve highlighted the most likely candidates
                            based on audio analysis.
                          </>
                        )}
                    </p>
                    <p className="text-xs text-yellow-600">
                      💡 For best results, use separate microphones when
                      possible
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Speaker Cards - Scrollable Section */}
          <div className="px-6 py-8 md:px-10 md:py-10 bg-slate-50/50 overflow-y-auto flex-1">
            {/* Section header for high-confidence candidates */}
            {(userSpeakerLabel ||
              (alternativeSpeakers && alternativeSpeakers.length > 0)) && (
              <div className="mb-4">
                <p className="text-sm text-slate-600 font-medium">
                  Most likely candidates based on your microphone audio:
                </p>
              </div>
            )}

            <div
              className={`grid gap-4 items-start ${
                sortedSpeakerRecords.length === 2
                  ? 'grid-cols-1 md:grid-cols-2'
                  : sortedSpeakerRecords.length === 3
                    ? 'grid-cols-1 md:grid-cols-3'
                    : sortedSpeakerRecords.length >= 4
                      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                      : 'grid-cols-1 max-w-md mx-auto'
              }`}
            >
              {sortedSpeakerRecords.map((record, index) => {
                const colors = speakerColors[index % speakerColors.length];
                const excerpts = getExcerpts(record.speaker_label);
                const isIdentifiedSpeaker =
                  record.speaker_label === userSpeakerLabel;

                const scrollState = scrollStates[record.speaker_label];
                const isAtBottom = scrollState?.isAtBottom ?? false;

                const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
                  const target = e.currentTarget;
                  const isScrolledToBottom =
                    Math.abs(
                      target.scrollHeight -
                        target.scrollTop -
                        target.clientHeight
                    ) < 1;

                  setScrollStates((prev) => ({
                    ...prev,
                    [record.speaker_label]: {
                      isAtBottom: isScrolledToBottom,
                    },
                  }));
                };

                return (
                  <button
                    key={record.speaker_label}
                    onClick={() => onSelectSpeaker(record.speaker_label)}
                    disabled={isAssigning}
                    className={`group relative text-left p-5 rounded-xl border bg-white
                      ${colors.border} hover:border-slate-300 hover:shadow-lg
                      transition-all duration-200 hover:-translate-y-0.5
                      disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0
                      animate-fadeInUp
                      ${isIdentifiedSpeaker ? 'ring-2 ring-blue-500' : ''}`}
                    style={{ animationDelay: `${100 + index * 75}ms` }}
                  >
                    {/* Speaker Header */}
                    <div className="flex items-start justify-between mb-4 gap-2">
                      <div className="flex flex-col gap-2">
                        <div
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${colors.accent}`}
                        >
                          <svg
                            className="w-3.5 h-3.5 text-white"
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
                          <span className="text-sm font-semibold text-white">
                            {record.speaker_label.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {/* Confidence Badge - show for all speakers with confidence */}
                        {record.identification_confidence != null && (
                          <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {`${Math.round(record.identification_confidence * 100)}% match`}
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-sm font-medium ${colors.text} flex-shrink-0`}
                      >
                        {record.talk_time_percentage.toFixed(0)}%
                      </span>
                    </div>

                    {/* Transcript Excerpts - Scrollable Container */}
                    <div className="relative">
                      <div
                        className="max-h-[240px] overflow-y-auto space-y-3 pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
                        onScroll={handleScroll}
                      >
                        {excerpts.map((excerpt, i) => (
                          <p
                            key={i}
                            className="text-sm text-slate-600 leading-relaxed"
                          >
                            &ldquo;{excerpt}&rdquo;
                          </p>
                        ))}
                        {excerpts.length === 0 && (
                          <p className="text-sm text-slate-400 italic">
                            No transcript available
                          </p>
                        )}
                      </div>
                      {/* Gradient fade indicator at bottom - hidden when scrolled to bottom */}
                      {excerpts.length > 3 && !isAtBottom && (
                        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent pointer-events-none" />
                      )}
                    </div>

                    {/* Hover indicator */}
                    <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400">
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
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </svg>
                    </div>

                    {/* Loading state */}
                    {isAssigning && (
                      <div className="absolute inset-0 rounded-xl bg-white/90 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Help text - Fixed at bottom */}
          <div className="px-6 py-4 md:px-10 md:py-5 bg-slate-50/50 border-t border-slate-200 flex-shrink-0">
            <p className="text-center text-base text-slate-500">
              Read the excerpts to identify which speaker sounds like you
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
