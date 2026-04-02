/**
 * EmptyWeekMessage Component
 *
 * Displays a message when no meetings exist for the selected week.
 * Shows different messages for weeks with unassigned meetings vs no meetings.
 *
 * @param unassignedMeetingsCount - Number of meetings that need speaker assignment
 *
 * @example
 * ```tsx
 * // Week with unassigned meetings
 * <EmptyWeekMessage unassignedMeetingsCount={3} />
 *
 * // Week with no meetings at all
 * <EmptyWeekMessage unassignedMeetingsCount={0} />
 * ```
 */

interface EmptyWeekMessageProps {
  unassignedMeetingsCount: number;
}

export function EmptyWeekMessage({
  unassignedMeetingsCount,
}: EmptyWeekMessageProps) {
  const hasUnassignedMeetings = unassignedMeetingsCount > 0;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
      <div className="text-center">
        <h3 className="text-lg font-medium text-blue-900 mb-2">
          {hasUnassignedMeetings
            ? 'No analyzed meetings this week yet'
            : 'No meetings this week yet'}
        </h3>
        <p className="text-blue-700">
          {hasUnassignedMeetings
            ? 'Assign yourself as a speaker in your meetings to see them here.'
            : 'Upload a meeting to see your weekly performance metrics.'}
        </p>
      </div>
    </div>
  );
}
