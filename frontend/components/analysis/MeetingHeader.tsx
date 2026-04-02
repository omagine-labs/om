/**
 * MeetingHeader Component
 *
 * Displays the header section of the analysis panel including:
 * - Meeting title
 * - Meeting date and time
 * - Close button
 * - Tab navigation (Speakers & Metrics, Transcript)
 */

'use client';

interface MeetingHeaderProps {
  meetingTitle: string | null;
  meetingDate: string | null;
  activeTab: 'transcript' | 'speakers';
  onTabChange: (tab: 'transcript' | 'speakers') => void;
  onClose: () => void;
}

export function MeetingHeader({
  meetingTitle,
  meetingDate,
  activeTab,
  onTabChange,
  onClose,
}: MeetingHeaderProps) {
  // Format the meeting date and time
  const formatMeetingDate = (dateString: string | null) => {
    if (!dateString) return '';

    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    // Format time
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    const formattedTime = date.toLocaleTimeString('en-US', timeOptions);

    // Show relative date for recent meetings
    if (diffInDays === 0) {
      return `Today at ${formattedTime}`;
    } else if (diffInDays === 1) {
      return `Yesterday at ${formattedTime}`;
    } else if (diffInDays < 7) {
      const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
      return `${weekday} at ${formattedTime}`;
    } else {
      // For older meetings, show full date
      const dateOptions: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      };
      const formattedDate = date.toLocaleDateString('en-US', dateOptions);
      return `${formattedDate} at ${formattedTime}`;
    }
  };
  return (
    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1 min-w-0 mr-4">
          <h2 className="text-lg font-semibold text-gray-900 truncate">
            {meetingTitle || 'Meeting Analysis'}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {formatMeetingDate(meetingDate)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
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
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4">
        {[
          { id: 'speakers' as const, label: 'Speakers & Metrics' },
          { id: 'transcript' as const, label: 'Transcript' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
