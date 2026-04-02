/**
 * AnalysisDetails Component
 *
 * Displays detailed metrics for the user's speaking performance as three separate cards:
 * 1. Talk Time card
 * 2. Metrics Grid card
 * 3. Interaction Patterns card
 */

import { formatDuration } from '@/lib/formatters';

/* ============================================
   TYPE DEFINITIONS
   ============================================ */

interface SpeakerRecord {
  speaker_label: string;
  custom_speaker_name: string | null;
  assigned_user_id: string | null;
  talk_time_seconds: number;
  talk_time_percentage: number;
  word_count: number;
  words_per_minute: number | null;
  avg_response_latency_seconds: number | null;
  quick_responses_percentage: number | null;
  times_interrupted: number | null;
  times_interrupting: number | null;
  interruption_rate: number | null;
  turn_taking_balance: number | null;
  segments_count: number;
}

interface AnalysisDetailsProps {
  speakerRecord: SpeakerRecord;
  allSpeakerRecords: SpeakerRecord[];
  totalDuration: number;
  currentUserId?: string | null;
  /** The speaker label from meetings.user_speaker_label (source of truth for "You") */
  userSpeakerLabel?: string | null;
}

/* ============================================
   SPEAKER COLOR PALETTE
   ============================================ */

// User gets teal, all others get same slate color
const USER_COLOR = {
  bg: 'bg-lime-500/80',
  hover: 'hover:bg-lime-500',
  dot: 'bg-lime-500',
};
const OTHER_COLOR = {
  bg: 'bg-slate-200',
  hover: 'hover:bg-slate-300',
  dot: 'bg-slate-300',
};

/* ============================================
   METRIC QUALITY THRESHOLDS
   ============================================ */

interface QualityBadge {
  label: string;
  className: string;
}

function getWordsSpokenQuality(count: number): QualityBadge | null {
  if (count >= 1000)
    return { label: 'High', className: 'bg-teal-500/20 text-teal-950' };
  if (count >= 300)
    return { label: 'Moderate', className: 'bg-slate-100 text-slate-600' };
  return { label: 'Low', className: 'bg-amber-500/20 text-amber-950' };
}

function getSpeakingPaceQuality(wpm: number | null): QualityBadge | null {
  if (wpm === null) return null;
  if (wpm >= 120 && wpm <= 150)
    return { label: 'Excellent', className: 'bg-lime-500/20 text-lime-950' };
  if (wpm >= 100 && wpm <= 170)
    return { label: 'Good', className: 'bg-teal-500/20 text-teal-950' };
  if (wpm < 100)
    return { label: 'Slow', className: 'bg-amber-500/20 text-amber-950' };
  return { label: 'Fast', className: 'bg-orange-100 text-orange-950' };
}

function getResponseTimeQuality(seconds: number | null): QualityBadge | null {
  if (seconds === null) return null;
  if (seconds >= 0.5 && seconds <= 2)
    return { label: 'Excellent', className: 'bg-lime-500/20 text-lime-950' };
  if (seconds >= 0.3 && seconds <= 3)
    return { label: 'Good', className: 'bg-teal-500/20 text-teal-950' };
  if (seconds < 0.3)
    return { label: 'Quick', className: 'bg-amber-500/20 text-amber-950' };
  return { label: 'Slow', className: 'bg-orange-100 text-orange-950' };
}

function getTurnBalanceQuality(balance: number | null): QualityBadge | null {
  if (balance === null) return null;
  const absBalance = Math.abs(balance);
  if (absBalance < 10)
    return { label: 'Balanced', className: 'bg-lime-500/20 text-lime-950' };
  if (absBalance < 20)
    return { label: 'Moderate', className: 'bg-amber-500/20 text-amber-950' };
  return { label: 'Imbalanced', className: 'bg-orange-100 text-orange-950' };
}

/* ============================================
   MAIN COMPONENT
   ============================================ */

export function AnalysisDetails({
  speakerRecord,
  allSpeakerRecords,
  totalDuration: _totalDuration,
  currentUserId: _currentUserId,
  userSpeakerLabel,
}: AnalysisDetailsProps) {
  // Helper to check if a speaker is the current user
  // userSpeakerLabel is the source of truth for speaker identification
  const isCurrentUserSpeaker = (speaker: SpeakerRecord) =>
    !!userSpeakerLabel && speaker.speaker_label === userSpeakerLabel;

  // Sort speakers by talk time (descending), but keep current user first
  const sortedSpeakers = [...allSpeakerRecords].sort((a, b) => {
    // Current user always first
    if (isCurrentUserSpeaker(a)) return -1;
    if (isCurrentUserSpeaker(b)) return 1;
    // Then by talk time descending
    return b.talk_time_percentage - a.talk_time_percentage;
  });

  // Assign colors: user gets teal, all others get same slate
  const speakerColorMap = new Map<string, typeof USER_COLOR>();
  sortedSpeakers.forEach((speaker) => {
    if (isCurrentUserSpeaker(speaker)) {
      speakerColorMap.set(speaker.speaker_label, USER_COLOR);
    } else {
      speakerColorMap.set(speaker.speaker_label, OTHER_COLOR);
    }
  });

  // Get display name for a speaker
  const getSpeakerDisplayName = (speaker: SpeakerRecord) => {
    if (isCurrentUserSpeaker(speaker)) return 'You';
    if (speaker.custom_speaker_name) return speaker.custom_speaker_name;
    return speaker.speaker_label;
  };

  // Single-speaker meetings don't have interaction metrics
  const isSingleSpeaker = allSpeakerRecords.length === 1;

  const hasInteractionData =
    !isSingleSpeaker &&
    (speakerRecord.times_interrupted !== null ||
      speakerRecord.times_interrupting !== null ||
      speakerRecord.turn_taking_balance !== null);

  return (
    <div className="space-y-6">
      {/* ============================================
          CARD 1: TALK TIME + STATUS COUPON
          ============================================ */}
      <div className="animate-fadeInUp" style={{ animationDelay: '300ms' }}>
        {/* Main Talk Time Card */}
        <div className="bg-white backdrop-blur-sm rounded-t-2xl shadow-lg p-6 xl:p-8 xl:pt-7">
          <h3 className="font-display text-4xl font-semibold tracking-tighter text-teal-950 mb-5">
            Talk Time
          </h3>

          {/* Multi-Speaker Stacked Bar with Labels Above */}
          <div className="flex gap-1 mt-8 mb-12">
            {sortedSpeakers.map((speaker) => {
              const colors = speakerColorMap.get(speaker.speaker_label)!;
              const actualPercentage = speaker.talk_time_percentage;
              const displayWidth = Math.max(actualPercentage, 6); // Minimum 6% for visibility
              const isCurrentUser = isCurrentUserSpeaker(speaker);

              return (
                <div
                  key={speaker.speaker_label}
                  className="flex flex-col"
                  style={{ width: `${displayWidth}%` }}
                >
                  {/* Percentage label above - always reserve space to prevent float */}
                  <div className="h-6 mb-1.5 flex items-center justify-center">
                    {actualPercentage >= 8 && (
                      <span className="text-sm font-semibold text-slate-700">
                        {actualPercentage.toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {/* Bar segment with tooltip */}
                  <div
                    className={`relative w-full h-10 ${colors.bg} ${colors.hover} rounded-lg transition-colors duration-200 cursor-default overflow-hidden`}
                    title={`${getSpeakerDisplayName(speaker)}: ${actualPercentage.toFixed(1)}% (${formatDuration(speaker.talk_time_seconds)})`}
                  >
                    {/* Teeth pattern overlay for current user */}
                    {isCurrentUser && (
                      <div
                        className="absolute inset-0 opacity-20"
                        style={{
                          backgroundImage: `url("data:image/svg+xml,%3Csvg width='150' height='40' viewBox='0 0 150 40' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cmask id='mask0' style='mask-type:alpha' maskUnits='userSpaceOnUse' x='0' y='0' width='150' height='40'%3E%3Crect width='150' height='40' fill='white'/%3E%3C/mask%3E%3Cg mask='url(%23mask0)'%3E%3Cpath d='M6 33.5C6 31.0147 8.01472 29 10.5 29C12.9853 29 15 31.0147 15 33.5V52.5C15 54.9853 12.9853 57 10.5 57C8.01472 57 6 54.9853 6 52.5V33.5Z' fill='%23151515'/%3E%3Cpath d='M21 27.5C21 25.0147 23.0147 23 25.5 23C27.9853 23 30 25.0147 30 27.5V46.5C30 48.9853 27.9853 51 25.5 51C23.0147 51 21 48.9853 21 46.5V27.5Z' fill='%23151515'/%3E%3Cpath d='M36 33.5C36 31.0147 38.0147 29 40.5 29C42.9853 29 45 31.0147 45 33.5V52.5C45 54.9853 42.9853 57 40.5 57C38.0147 57 36 54.9853 36 52.5V33.5Z' fill='%23151515'/%3E%3Cpath d='M51 30.5C51 28.0147 53.0147 26 55.5 26C57.9853 26 60 28.0147 60 30.5V49.5C60 51.9853 57.9853 54 55.5 54C53.0147 54 51 51.9853 51 49.5V30.5Z' fill='%23151515'/%3E%3Cpath d='M66 35.5C66 33.0147 68.0147 31 70.5 31C72.9853 31 75 33.0147 75 35.5V54.5C75 56.9853 72.9853 59 70.5 59C68.0147 59 66 56.9853 66 54.5V35.5Z' fill='%23151515'/%3E%3Cpath d='M81 30.5C81 28.0147 83.0147 26 85.5 26C87.9853 26 90 28.0147 90 30.5V49.5C90 51.9853 87.9853 54 85.5 54C83.0147 54 81 51.9853 81 49.5V30.5Z' fill='%23151515'/%3E%3Cpath d='M96 27.5C96 25.0147 98.0147 23 100.5 23C102.985 23 105 25.0147 105 27.5V46.5C105 48.9853 102.985 51 100.5 51C98.0147 51 96 48.9853 96 46.5V27.5Z' fill='%23151515'/%3E%3Cpath d='M111 33.5C111 31.0147 113.015 29 115.5 29C117.985 29 120 31.0147 120 33.5V52.5C120 54.9853 117.985 57 115.5 57C113.015 57 111 54.9853 111 52.5V33.5Z' fill='%23151515'/%3E%3Cpath d='M126 30.5C126 28.0147 128.015 26 130.5 26C132.985 26 135 28.0147 135 30.5V49.5C135 51.9853 132.985 54 130.5 54C128.015 54 126 51.9853 126 49.5V30.5Z' fill='%23151515'/%3E%3Cpath d='M141 35.5C141 33.0147 143.015 31 145.5 31C147.985 31 150 33.0147 150 35.5V54.5C150 56.9853 147.985 59 145.5 59C143.015 59 141 56.9853 141 54.5V35.5Z' fill='%23151515'/%3E%3C/g%3E%3C/svg%3E")`,
                          backgroundRepeat: 'repeat-x',
                          backgroundSize: '150px 40px',
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend - All Speakers */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm">
            {sortedSpeakers.map((speaker) => {
              const colors = speakerColorMap.get(speaker.speaker_label)!;
              return (
                <div
                  key={speaker.speaker_label}
                  className="flex items-center gap-2"
                >
                  <span className={`w-3 h-3 rounded-full ${colors.dot}`} />
                  <span className="text-slate-600">
                    {getSpeakerDisplayName(speaker)}:{' '}
                    {formatDuration(speaker.talk_time_seconds)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Talk Time Status Stub (Coupon-style) */}
        <div className="bg-white backdrop-blur-sm rounded-b-2xl shadow-lg p-6 xl:p-8 xl:pt-7 border-t-2 border-dashed border-slate-200">
          <TalkTimeStatus
            percentage={speakerRecord.talk_time_percentage}
            numSpeakers={allSpeakerRecords.length}
          />
        </div>
      </div>

      {/* ============================================
          CARD 2: METRICS GRID
          ============================================ */}
      <div
        className="bg-white backdrop-blur-sm rounded-2xl shadow-lg p-6 xl:p-8 xl:pt-7 animate-fadeInUp"
        style={{ animationDelay: '400ms' }}
      >
        <h3 className="font-display text-4xl font-semibold tracking-tighter text-teal-950 mb-5">
          Speaking Metrics
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <MetricCard
            label="Words Spoken"
            value={speakerRecord.word_count.toLocaleString()}
            quality={getWordsSpokenQuality(speakerRecord.word_count)}
            description="Total words you contributed to the conversation"
            contextNote="Depends on meeting length"
          />
          <MetricCard
            label="Speaking Pace"
            value={
              speakerRecord.words_per_minute
                ? Math.round(speakerRecord.words_per_minute).toString()
                : 'N/A'
            }
            unit="WPM"
            quality={getSpeakingPaceQuality(speakerRecord.words_per_minute)}
            description="How fast you speak on average"
            contextNote="Good range: 120-150 WPM"
          />
          <MetricCard
            label="Speaking Turns"
            value={speakerRecord.segments_count.toString()}
            quality={null}
            description={
              isSingleSpeaker
                ? 'Number of speaking segments'
                : 'Number of times you took the floor'
            }
            contextNote={isSingleSpeaker ? '' : 'More turns = more engagement'}
          />
          <MetricCard
            label="Response Time"
            value={
              isSingleSpeaker
                ? '–'
                : speakerRecord.avg_response_latency_seconds
                  ? speakerRecord.avg_response_latency_seconds.toFixed(1)
                  : '–'
            }
            unit={isSingleSpeaker ? undefined : 'sec'}
            quality={
              isSingleSpeaker
                ? null
                : getResponseTimeQuality(
                    speakerRecord.avg_response_latency_seconds
                  )
            }
            description={
              isSingleSpeaker
                ? 'Not applicable for solo recordings'
                : 'Average time before responding to others'
            }
            contextNote={isSingleSpeaker ? '' : 'Good range: 0.5-2 seconds'}
          />
        </div>
      </div>

      {/* ============================================
          CARD 3: INTERACTION PATTERNS + QUICK RESPONSES
          ============================================ */}
      {hasInteractionData && (
        <div
          className="animate-fadeInUp flex flex-col gap-0"
          style={{ animationDelay: '500ms' }}
        >
          {/* Main Interaction Patterns Card */}
          <div
            className={`bg-white backdrop-blur-sm shadow-lg p-6 xl:p-8 xl:pt-7 ${
              speakerRecord.quick_responses_percentage !== null
                ? 'rounded-t-2xl'
                : 'rounded-2xl'
            }`}
          >
            <h3 className="font-display text-4xl font-semibold tracking-tighter text-teal-950 mb-5">
              Interaction Patterns
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 my-8 md:mt-16 md:mb-12">
              {/* Times Interrupted */}
              {speakerRecord.times_interrupted !== null && (
                <div className="text-center">
                  <div className="text-5xl font-semibold text-slate-900 mb-3">
                    {speakerRecord.times_interrupted}
                  </div>
                  <div className="text-lg font-medium text-slate-600 mt-1">
                    Times Interrupted
                  </div>
                  <div className="text-sm text-slate-500 mt-0.5">
                    Others cut you off
                  </div>
                </div>
              )}

              {/* Times Interrupting */}
              {speakerRecord.times_interrupting !== null && (
                <div className="text-center">
                  <div className="text-5xl font-semibold text-slate-900 mb-3">
                    {speakerRecord.times_interrupting}
                  </div>
                  <div className="text-lg font-medium text-slate-600 mt-1">
                    Times Interrupting
                  </div>
                  <div className="text-sm text-slate-500 mt-0.5">
                    You cut others off
                  </div>
                </div>
              )}

              {/* Turn Taking Balance */}
              {speakerRecord.turn_taking_balance !== null && (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-3">
                    <span
                      className={`text-4xl font-semibold ${
                        Math.abs(speakerRecord.turn_taking_balance) < 10
                          ? 'text-lime-600'
                          : 'text-orange-600'
                      }`}
                    >
                      {speakerRecord.turn_taking_balance > 0 ? '+' : ''}
                      {speakerRecord.turn_taking_balance.toFixed(0)}%
                    </span>
                    {getTurnBalanceQuality(
                      speakerRecord.turn_taking_balance
                    ) && (
                      <span
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                          getTurnBalanceQuality(
                            speakerRecord.turn_taking_balance
                          )!.className
                        }`}
                      >
                        {
                          getTurnBalanceQuality(
                            speakerRecord.turn_taking_balance
                          )!.label
                        }
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-medium text-slate-600 mt-1">
                    Turn Balance
                  </div>
                  <div className="text-sm text-slate-500 mt-0.5">
                    {speakerRecord.turn_taking_balance > 10
                      ? 'More dominant in conversation'
                      : speakerRecord.turn_taking_balance < -10
                        ? 'Less dominant in conversation'
                        : 'Well-balanced participation'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Responses Stub (Coupon-style) */}
          {speakerRecord.quick_responses_percentage !== null && (
            <div className="bg-white backdrop-blur-sm rounded-b-2xl shadow-lg p-6 xl:p-8 xl:pt-7 border-t-2 border-dashed border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg font-medium text-slate-600">
                  Quick Responses
                </span>
                <span className="text-lg font-semibold text-slate-900">
                  {speakerRecord.quick_responses_percentage.toFixed(0)}%
                </span>
              </div>
              <div className="flex gap-1 h-10">
                <div
                  className="relative h-full bg-indigo-500/75 hover:bg-indigo-500/85 rounded-lg transition-colors overflow-hidden"
                  style={{
                    width: `${speakerRecord.quick_responses_percentage}%`,
                  }}
                >
                  {/* Speed stripes overlay */}
                  <div
                    className="absolute inset-0 opacity-15"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='40' viewBox='0 0 20 40' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M-5 45L15 -5' stroke='%23151515' stroke-width='8'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'repeat',
                      backgroundSize: '15px 20px',
                    }}
                  />
                </div>
                <div className="h-full bg-slate-200 hover:bg-slate-300 rounded-lg flex-1" />
              </div>
              <p className="text-sm text-slate-500 mt-2">
                Responses under 1 second — indicates active engagement
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================
   HELPER COMPONENTS
   ============================================ */

function MetricCard({
  label,
  value,
  unit,
  quality,
  description,
  contextNote,
}: {
  label: string;
  value: string;
  unit?: string;
  quality: QualityBadge | null;
  description: string;
  contextNote: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-5 hover:translate-y-[-2px] hover:bg-slate-100 transition-all">
      {/* Header: Label + Quality Badge */}
      <div className="flex items-start justify-between mb-3">
        <span className="text-lg font-medium tracking-[-0.015em] text-slate-600">
          {label}
        </span>
        {quality && (
          <span
            className={`text-sm font-medium px-2.5 py-0.5 rounded-full ${quality.className}`}
          >
            {quality.label}
          </span>
        )}
      </div>

      {/* Value */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-5xl font-semibold tracking-tight text-slate-900">
          {value}
        </span>
        {unit && (
          <span className="text-lg font-medium text-slate-400">{unit}</span>
        )}
      </div>

      {/* Context */}
      <p className="mt-3 text-sm text-slate-600">{description}</p>
      <p className=" text-xs text-slate-500/80">{contextNote}</p>
    </div>
  );
}

function TalkTimeStatus({
  percentage,
  numSpeakers,
}: {
  percentage: number;
  numSpeakers: number;
}) {
  // Solo meetings: special handling
  if (numSpeakers === 1) {
    return (
      <div className="flex items-start gap-3 p-5 rounded-xl bg-slate-100/50">
        <div className="mt-0.5 text-slate-600">
          <svg
            className="w-6 h-6"
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
        </div>
        <div className="flex-1">
          <p className="font-display font-semibold text-lg text-slate-900">
            Solo Meeting
          </p>
          <p className="mt-1 text-sm text-slate-600">
            This was a solo recording or presentation.
          </p>
        </div>
      </div>
    );
  }

  // Calculate expected percentage and tolerance bands based on number of speakers
  const idealPercentage = 100 / numSpeakers;

  // Define tolerance ranges based on number of speakers
  // More speakers = tighter tolerance (as small deviations matter more)
  let lowerBound: number;
  let upperBound: number;

  if (numSpeakers === 2) {
    // 2 speakers: ideal is 50%, balanced range 40-60%
    lowerBound = idealPercentage - 10;
    upperBound = idealPercentage + 10;
  } else if (numSpeakers === 3) {
    // 3 speakers: ideal is 33.3%, balanced range 25-42%
    lowerBound = idealPercentage - 8;
    upperBound = idealPercentage + 9;
  } else if (numSpeakers === 4) {
    // 4 speakers: ideal is 25%, balanced range 18-33%
    lowerBound = idealPercentage - 7;
    upperBound = idealPercentage + 8;
  } else {
    // 5+ speakers: ideal varies, use ±6 percentage points
    lowerBound = idealPercentage - 6;
    upperBound = idealPercentage + 6;
  }

  const isBalanced = percentage >= lowerBound && percentage <= upperBound;

  const status = isBalanced
    ? {
        label: 'Balanced Participation',
        description: 'Your speaking time is well-balanced with the group.',
        color: 'text-lime-600',
        bgColor: 'bg-lime-500/10',
      }
    : {
        label:
          percentage < lowerBound ? 'Low Participation' : 'High Participation',
        description:
          percentage < lowerBound
            ? 'Consider contributing more to discussions.'
            : 'Consider creating more space for others.',
        color: 'text-orange-600',
        bgColor: 'bg-orange-500/10',
      };

  return (
    <div className={`flex items-start gap-3 p-5 rounded-xl ${status.bgColor}`}>
      <div className={`mt-0.5 ${status.color}`}>
        <svg
          className="w-6 h-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isBalanced ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          )}
        </svg>
      </div>
      <div>
        <div className={`font-medium text-lg ${status.color}`}>
          {status.label}
        </div>
        <div className="text-sm tracking-[0.015em] text-slate-700">
          {status.description}
        </div>
      </div>
    </div>
  );
}
