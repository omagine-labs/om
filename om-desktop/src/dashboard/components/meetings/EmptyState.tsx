interface EmptyStateProps {
  isLoading: boolean;
}

export default function EmptyState({ isLoading }: EmptyStateProps) {
  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-900"></div>
        <p className="mt-4 text-sm text-gray-600">Loading meetings...</p>
      </div>
    );
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
          Click the recording button in your menu bar when you're in a meeting.
          We'll automatically capture and analyze your conversation, giving you
          insights on communication patterns and tracking your growth over time.
        </p>
      </div>
    </div>
  );
}
