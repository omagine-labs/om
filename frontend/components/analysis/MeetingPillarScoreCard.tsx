'use client';

import { ScoreSquare } from '@/components/ui/ScoreSquare';

/**
 * MeetingPillarScoreCard Component
 *
 * Displays a single communication pillar with its score and explanation.
 * Used on the meeting analysis page to show Clarity, Confidence, and Attunement.
 * Uses single-digit scores (0-10) in squared rectangles to differentiate from
 * dashboard roll-up scores which use x10 precision in circular rings.
 * Score colors are dynamic based on score value (red/yellow/green).
 */

interface MeetingPillarScoreCardProps {
  pillar: 'clarity' | 'confidence' | 'attunement';
  score: number | null;
  explanation: string | null;
  animationIndex?: number;
  /** For attunement pillar - indicates single-speaker meeting where attunement is N/A */
  isSingleSpeaker?: boolean;
}

const PILLAR_CONFIG = {
  clarity: {
    title: 'Clarity',
    subtitle: 'How clear your content is',
  },
  confidence: {
    title: 'Confidence',
    subtitle: 'How decisive you come across',
  },
  attunement: {
    title: 'Attunement',
    subtitle: 'How you connect with others',
  },
};

type ScoreQuality = { label: string; className: string };

function getScoreQuality(score: number | null): ScoreQuality | null {
  if (score === null) return null;
  if (score >= 8) {
    return { label: 'Excellent', className: 'bg-lime-500/20 text-lime-950' };
  }
  if (score >= 6) {
    return { label: 'Good', className: 'bg-teal-500/20 text-teal-950' };
  }
  if (score >= 4) {
    return { label: 'Fair', className: 'bg-amber-500/20 text-amber-950' };
  }
  return { label: 'Needs Work', className: 'bg-orange-100 text-orange-950' };
}

export function MeetingPillarScoreCard({
  pillar,
  score,
  explanation,
  animationIndex = 0,
  isSingleSpeaker = false,
}: MeetingPillarScoreCardProps) {
  const config = PILLAR_CONFIG[pillar];
  const quality = getScoreQuality(score);

  return (
    <div
      className="group bg-white backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl hover:translate-y-[-2px] transition-all p-6 xl:p-8 xl:pt-7 animate-fadeInUp"
      style={{ animationDelay: `${animationIndex * 100}ms` }}
    >
      {/* Header - title + chip on same line */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="font-display text-4xl font-semibold tracking-tighter text-teal-950">
          {config.title}
        </h3>
        {quality && (
          <span
            className={`text-xs font-semibold px-3 py-1 rounded-full ${quality.className}`}
          >
            {quality.label}
          </span>
        )}
      </div>
      {/* Subtitle - full width */}
      <p className="text-base text-slate-500 leading-tight mb-4">
        {config.subtitle}
      </p>

      {/* Score Display - Centered squared rectangle */}
      <div className="flex justify-center pt-6 pb-9">
        {score !== null ? (
          <ScoreSquare
            score={score}
            animationDelay={animationIndex * 100 + 200}
          />
        ) : (
          <div className="relative w-28 h-28 rounded-xl overflow-hidden bg-slate-100 text-slate-900 flex items-center justify-center">
            <span className="absolute bottom-1 right-1.5 text-[11px] font-bold text-slate-900/40 tracking-tight z-10">
              / 10
            </span>
            <span className="relative z-10 text-5xl font-semibold">–</span>
          </div>
        )}
      </div>

      {/* Explanation */}
      {explanation && (
        <div className="mt-2 pt-4 border-t-2 border-dashed border-slate-200">
          <p className="text-base text-slate-600 ">{explanation}</p>
        </div>
      )}

      {/* No score fallback */}
      {score === null && (
        <div className="mt-2 pt-4 border-t-2 border-dashed border-slate-100">
          <p className="text-sm text-slate-400 italic">
            {pillar === 'attunement' && isSingleSpeaker
              ? 'Attunement measures collaboration with others. This was a solo recording.'
              : 'Score not available for this meeting.'}
          </p>
        </div>
      )}
    </div>
  );
}
