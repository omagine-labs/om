/**
 * ScoreSquare Component
 *
 * Displays a score (0-10) in a squared rectangle with a fill indicator.
 * Background color dynamically changes based on score range:
 * - Red (1-3): Low scores
 * - Yellow (4-6): Medium scores
 * - Green (7-10): High scores
 *
 * Used in game results, meeting analysis, and desktop app.
 */

interface ScoreSquareProps {
  score: number;
  maxScore?: number;
  animationDelay?: number;
}

type ScoreColorScheme = {
  bgColor: string;
  fillColor: string;
  hoverFillColor: string;
};

function getScoreColors(score: number): ScoreColorScheme {
  if (score <= 3) {
    // Low score - Red scheme
    return {
      bgColor: 'bg-[#feece7]',
      fillColor: 'bg-rose-400/50',
      hoverFillColor: 'group-hover:bg-rose-400/70',
    };
  }
  if (score <= 6) {
    // Medium score - Yellow scheme
    return {
      bgColor: 'bg-yellow-400/15',
      fillColor: 'bg-yellow-300/60',
      hoverFillColor: 'group-hover:bg-yellow-300/80',
    };
  }
  // High score - Green scheme
  return {
    bgColor: 'bg-lime-300/20',
    fillColor: 'bg-lime-400/55',
    hoverFillColor: 'group-hover:bg-lime-400/70',
  };
}

export function ScoreSquare({
  score,
  maxScore = 10,
  animationDelay = 0,
}: ScoreSquareProps) {
  const colors = getScoreColors(score);
  const fillPercentage = (score / maxScore) * 100;

  return (
    <div
      className={`relative w-28 h-28 rounded-xl overflow-hidden ${colors.bgColor} text-slate-900 flex items-center justify-center transition-colors`}
    >
      {/* Fill indicator - animated from bottom */}
      <div
        className={`absolute bottom-0 left-0 right-0 ${colors.fillColor} ${colors.hoverFillColor} rounded-b-lg animate-scoreFill`}
        style={{
          height: `${fillPercentage}%`,
          animationDelay: `${animationDelay}ms`,
        }}
      />
      {/* Scale indicator */}
      <span className="absolute bottom-1 right-1.5 text-[11px] font-bold text-slate-900/40 tracking-tight z-10">
        / {maxScore}
      </span>
      {/* Score value */}
      <span className="relative z-10 text-5xl font-semibold">
        {Math.round(score)}
      </span>
    </div>
  );
}

// Export the color utility for cases where only colors are needed
export { getScoreColors };
export type { ScoreColorScheme };
