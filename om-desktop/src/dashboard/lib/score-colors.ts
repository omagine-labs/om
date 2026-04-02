/**
 * Score Colors Utility
 *
 * Returns Tailwind color classes based on score ranges:
 * - Red (1-3): Low scores
 * - Yellow (4-6): Medium scores
 * - Green (7-10): High scores
 */

export type ScoreColorScheme = {
  bgColor: string;
  fillColor: string;
  hoverFillColor: string;
};

export function getScoreColors(score: number): ScoreColorScheme {
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
