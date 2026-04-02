import Link from 'next/link';
import { MeetingsListSkeleton } from './MeetingsListSkeleton';

interface EmptyStateProps {
  isLoading: boolean;
  showSkeleton: boolean;
  hasDesktopApp?: boolean;
}

export default function EmptyState({
  isLoading,
  showSkeleton,
  hasDesktopApp = false,
}: EmptyStateProps) {
  // Show skeleton only if loading AND delayed skeleton timer has fired
  if (isLoading && showSkeleton) {
    return <MeetingsListSkeleton />;
  }

  // Show nothing while loading (before skeleton delay)
  if (isLoading) {
    return <div className="h-48" />;
  }

  return (
    <div className="relative py-16 px-8 bg-white rounded-2xl overflow-hidden">
      {/* Decorative background element */}
      <div className="absolute top-8 right-8 opacity-[0.07]">
        <svg
          className="w-48 h-48 text-teal-600 animate-gentleFloat"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z" />
        </svg>
      </div>

      {/* Content - left aligned for editorial feel */}
      <div className="relative max-w-md">
        <h3 className="text-3xl font-medium text-teal-900 leading-tight font-display">
          Your first meeting awaits
        </h3>
        <p className="mt-3 text-lg text-slate-500">Ready when you are.</p>
        <p className="mt-4 text-sm text-slate-600 leading-relaxed">
          {hasDesktopApp
            ? 'Upload a past meeting recording or wait for the app to detect your next meeting.'
            : 'Download the desktop app to automatically capture and analyze your meetings. Get insights on communication patterns and track your growth over time.'}
        </p>
        {!hasDesktopApp && (
          <div className="mt-8">
            <Link
              href="https://omaginelabs.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
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
          </div>
        )}
      </div>
    </div>
  );
}
