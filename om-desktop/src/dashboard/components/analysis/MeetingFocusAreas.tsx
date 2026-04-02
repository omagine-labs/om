/**
 * MeetingFocusAreas Component
 *
 * Displays executive summary and communication tips at the top of the analysis page.
 * Two sections: "Overview" (summary) and "Focus Areas" (3 actionable tips).
 * Giant numbers as visual anchors, editorial typography.
 */

interface MeetingFocusAreasProps {
  tips: string[];
  summary?: string;
}

export function MeetingFocusAreas({ tips, summary }: MeetingFocusAreasProps) {
  if (!tips || tips.length === 0) return null;

  // Take only the first 3 tips
  const displayTips = tips.slice(0, 3);

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden mb-6 animate-fadeInUp">
      {/* ============================================
          EXECUTIVE SUMMARY SECTION (only if summary exists)
          ============================================ */}
      {summary && (
        <>
          <div className="px-8 pt-7 pb-8">
            <h2 className="font-display text-4xl font-semibold tracking-tighter text-teal-950">
              Overview
            </h2>
            <p className="text-xl text-slate-600 mt-3 leading-relaxed">
              {summary}
            </p>
          </div>

          {/* Dashed separator */}
          <div className="border-t-2 border-dashed border-slate-200 mx-8" />
        </>
      )}

      {/* ============================================
          FOCUS AREAS SECTION
          ============================================ */}
      <div className="px-8 pt-6 pb-2">
        <h3 className="font-display text-3xl font-semibold tracking-tight text-teal-950">
          Focus Areas
        </h3>
        <p className="text-base text-slate-500 mt-0.5">
          Remember these for your next meeting
        </p>
      </div>

      {/* ============================================
          TIPS - EDITORIAL LAYOUT
          ============================================ */}
      <div className="divide-y divide-slate-100 mb-3">
        {displayTips.map((tip, index) => (
          <div
            key={index}
            className="group flex items-center gap-4 px-8 py-6 hover:bg-gradient-to-r hover:from-orange-50/80 hover:to-transparent transition-all duration-300 animate-fadeInUp"
            style={{ animationDelay: `${(index + 1) * 75}ms` }}
          >
            {/* Giant Number */}
            <div className="cursor-default flex-shrink-0 w-20 h-16 flex items-center justify-center">
              <span
                className="font-mono text-6xl font-bold leading-none tracking-tighter
                           bg-orange-400/70 bg-clip-text text-transparent
                           group-hover:bg-orange-500 transition-all duration-300"
              >
                {index + 1}
              </span>
            </div>

            {/* Tip Content */}
            <div className="flex-1">
              <p className="text-2xl cursor-default text-slate-600 leading-tight group-hover:text-slate-900 transition-colors">
                {tip}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
