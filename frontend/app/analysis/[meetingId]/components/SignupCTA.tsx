/**
 * SignupCTA Component
 *
 * Subtle, non-blocking signup call-to-action.
 * Can be rendered as sticky banner or bottom card.
 */

'use client';

interface SignupCTAProps {
  selectedSpeaker: string | null;
  signupUrl: string;
  isSticky: boolean;
}

export function SignupCTA({
  selectedSpeaker,
  signupUrl,
  isSticky,
}: SignupCTAProps) {
  if (isSticky) {
    // Sticky banner at top - updated with teal theme
    return (
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-teal-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              {selectedSpeaker ? (
                <>
                  <span className="font-semibold text-teal-700">Great!</span>{' '}
                  Now sign up to save your personalized insights
                </>
              ) : (
                'Sign up to save this analysis and access it anytime'
              )}
            </p>
            <a
              href={signupUrl}
              className="flex-shrink-0 text-sm font-semibold px-5 py-2.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 transition-colors"
            >
              {selectedSpeaker ? 'Save My Insights' : 'Create Free Account'}
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Bottom card CTA - updated with new design
  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg p-8 border-2 border-teal-200">
      <h3 className="font-display text-2xl font-semibold tracking-tight text-teal-950 mb-2">
        Want to access this analysis anytime?
      </h3>
      <p className="text-base text-slate-600 mb-6">
        Create a free account to save your analysis and track your communication
        metrics over time.
      </p>
      <a
        href={signupUrl}
        className="inline-block px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 active:bg-teal-800 transition-colors"
      >
        Create Free Account
      </a>
    </div>
  );
}
