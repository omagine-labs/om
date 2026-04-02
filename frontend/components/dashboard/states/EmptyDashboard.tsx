/**
 * EmptyDashboard Component
 *
 * Displayed when the user has no meetings yet.
 * Encourages recording meetings and explains how to get started.
 */

import Link from 'next/link';

interface EmptyDashboardProps {
  onUploadClick: () => void;
  hasDesktopApp?: boolean;
}

export function EmptyDashboard({
  onUploadClick,
  hasDesktopApp = false,
}: EmptyDashboardProps) {
  return (
    <div
      className="relative py-16 px-8 bg-white rounded-2xl overflow-hidden"
      data-testid="empty-dashboard"
    >
      {/* Decorative background element */}
      <div className="absolute top-8 right-8 opacity-[0.07]">
        <svg
          className="w-48 h-48 text-teal-600 animate-gentleFloat"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>

      {/* Content - left aligned for editorial feel */}
      <div className="relative max-w-md">
        <h3 className="text-3xl font-medium text-teal-900 leading-tight font-display">
          Your insights dashboard awaits
        </h3>
        <p className="mt-3 text-lg text-slate-500">
          Start recording to see your weekly insights.
        </p>
        <p className="mt-4 text-sm text-slate-600 leading-relaxed">
          The desktop app automatically detects your meetings and you can start
          recording at any time. Track your communication patterns, monitor your
          growth, and unlock insights as you go.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          {!hasDesktopApp && (
            <Link
              href="https://omaginelabs.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download the App
            </Link>
          )}
          <button
            onClick={onUploadClick}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 transition-all"
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
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            Upload a Meeting
          </button>
        </div>
      </div>
    </div>
  );
}
