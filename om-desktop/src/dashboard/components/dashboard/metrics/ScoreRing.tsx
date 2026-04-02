/**
 * ScoreRing Component
 *
 * SVG-based circular progress ring that displays a score (0-10 scale).
 * The ring fill percentage corresponds to the score (e.g., 6.4 → 64% fill).
 */

interface ScoreRingProps {
  score: number | null;
  color: 'teal' | 'amber' | 'indigo';
  size?: number;
}

const COLOR_MAP = {
  teal: {
    stroke: '#14B8A6', // teal-500
    track: '#CCFBF1', // teal-100
  },
  amber: {
    stroke: '#FCD34D', // amber-300
    track: '#FEF3C7', // amber-100
  },
  indigo: {
    stroke: '#818CF8', // indigo-400
    track: '#E0E7FF', // indigo-100
  },
};

export function ScoreRing({ score, color, size = 160 }: ScoreRingProps) {
  const colors = COLOR_MAP[color];
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Calculate stroke offset based on score (0-10 scale → 0-100%)
  const percentage =
    score !== null ? Math.min(Math.max(score * 10, 0), 100) : 0;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Center coordinates
  const center = size / 2;
  // Inner radius for white fill circle
  const innerRadius = radius - strokeWidth / 2;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
        aria-hidden="true"
      >
        {/* White center fill */}
        <circle cx={center} cy={center} r={innerRadius} fill="white" />
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={colors.track}
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        {score !== null && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-500 ease-out"
          />
        )}
      </svg>

      {/* Score display in center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="mt-[2px] text-5xl font-semibold tracking-tight text-gray-900">
          {score !== null ? Math.round(score * 10) : 'N/A'}
        </span>
      </div>
    </div>
  );
}
