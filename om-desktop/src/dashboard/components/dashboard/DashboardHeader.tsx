/**
 * DashboardHeader Component
 *
 * Displays the weekly dashboard header with:
 * - Title and week range
 * - Meeting count and unassigned meetings warning
 * - Week navigation controls (previous/next/current)
 *
 * @example
 * ```tsx
 * <DashboardHeader
 *   weekStart="2024-01-01"
 *   weekEnd="2024-01-07"
 *   meetingsCount={5}
 *   unassignedMeetingsCount={2}
 *   isCurrentWeek={true}
 *   onPreviousWeek={() => navigateToPreviousWeek()}
 *   onNextWeek={() => navigateToNextWeek()}
 *   onCurrentWeek={() => navigateToCurrentWeek()}
 *   onMeetingsClick={() => setShowMeetingsModal(true)}
 * />
 * ```
 */

interface DashboardHeaderProps {
  weekStart: string;
  weekEnd: string;
  meetingsCount: number;
  unassignedMeetingsCount: number;
  isCurrentWeek: boolean;
  hasPreviousMeetings: boolean;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onCurrentWeek: () => void;
  onMeetingsClick: () => void;
}

export function DashboardHeader({
  weekStart,
  weekEnd,
  meetingsCount,
  unassignedMeetingsCount,
  isCurrentWeek,
  hasPreviousMeetings,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
  onMeetingsClick,
}: DashboardHeaderProps) {
  const formatWeekRange = (startDate: string, endDate: string): string => {
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

    const start = new Date(startYear, startMonth - 1, startDay);
    const end = new Date(endYear, endMonth - 1, endDay);

    const startMonthName = start.toLocaleDateString('en-US', {
      month: 'short',
    });
    const endMonthName = end.toLocaleDateString('en-US', { month: 'short' });

    if (startMonthName === endMonthName) {
      return `${startMonthName} ${startDay} - ${endDay}`;
    } else {
      return `${startMonthName} ${startDay} - ${endMonthName} ${endDay}`;
    }
  };

  const totalMeetings = meetingsCount + unassignedMeetingsCount;
  const showWarning = unassignedMeetingsCount > 0;

  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-5xl leading-[1] ml-[-2px] font-medium tracking-tighter text-white text-shadow-sm font-display">
          Weekly Performance
        </h2>
        <div className="mt-1 flex items-center gap-4 text-sm uppercase tracking-wide font-bold text-shadow-sm text-teal-100">
          <span>Week of {formatWeekRange(weekStart, weekEnd)}</span>
          <span>•</span>
          <span
            className={
              showWarning || totalMeetings > 0
                ? 'cursor-pointer hover:text-white hover:underline transition-colors flex items-center gap-2'
                : 'flex items-center gap-2'
            }
            onClick={
              showWarning || totalMeetings > 0 ? onMeetingsClick : undefined
            }
          >
            <span>
              {totalMeetings} {totalMeetings === 1 ? 'Meeting' : 'Meetings'}
              {showWarning && (
                <span className="bg-amber-500 font-medium ml-1 px-1 py-0.5 rounded-[6px]">
                  {unassignedMeetingsCount}{' '}
                  {unassignedMeetingsCount === 1 ? 'needs' : 'need'} assignment
                </span>
              )}
            </span>
          </span>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={onPreviousWeek}
          disabled={!hasPreviousMeetings}
          className={`p-2 rounded-lg transition-colors ${
            hasPreviousMeetings
              ? 'bg-white/10 text-white hover:bg-white/20'
              : 'bg-white/5 text-white/30 cursor-not-allowed'
          }`}
          aria-label="Previous week"
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>

        {!isCurrentWeek && (
          <button
            onClick={onCurrentWeek}
            className="px-3 py-1.5 text-sm font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
          >
            Current Week
          </button>
        )}

        <button
          onClick={onNextWeek}
          disabled={isCurrentWeek}
          className={`p-2 rounded-lg transition-colors ${
            isCurrentWeek
              ? 'bg-white/5 text-white/30 cursor-not-allowed'
              : 'bg-white/10 text-white hover:bg-white/20'
          }`}
          aria-label="Next week"
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
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
