import type { Json } from '@/supabase/database.types';
import type { SpeakerAssignmentInfo } from '@/hooks/useMeetingData';

interface Attendee {
  email: string;
  displayName?: string | null;
  isOrganizer: boolean;
}

interface DisplayParticipant {
  name: string;
  isOrganizer?: boolean;
  isMe?: boolean;
  source: 'calendar' | 'speaker';
}

interface AttendeeTooltipProps {
  attendees?: Json;
  speakerAssignments?: SpeakerAssignmentInfo[];
  currentUserId?: string | null;
}

/**
 * Displays meeting participants with a hover tooltip showing full list.
 * Shows up to 3 participant names, then +x others with full list on hover.
 *
 * Logic:
 * - If all speakers are assigned, show only assigned speaker names (confirmed participants)
 * - If some speakers are assigned, show "You +X others" format
 * - If no speakers assigned and no calendar attendees, show "X speakers"
 * - Otherwise merge calendar attendees with assigned speakers
 * - Shows "You" for speakers assigned to current user
 */
export default function AttendeeTooltip({
  attendees,
  speakerAssignments,
  currentUserId,
}: AttendeeTooltipProps) {
  try {
    const parsedAttendees = attendees as Attendee[] | null;
    const hasCalendarAttendees = parsedAttendees && parsedAttendees.length > 0;
    const hasSpeakerAssignments =
      speakerAssignments && speakerAssignments.length > 0;
    const totalSpeakerCount = speakerAssignments?.length || 0;

    // Get assigned speaker names (either custom name or user assigned)
    const assignedSpeakers =
      speakerAssignments?.filter(
        (sa) => sa.assignedUserId || sa.customSpeakerName
      ) || [];
    const allSpeakersAssigned =
      hasSpeakerAssignments &&
      assignedSpeakers.length === speakerAssignments!.length;

    // Check if current user is assigned to any speaker
    const userAssignedSpeaker = assignedSpeakers.find(
      (sa) => currentUserId && sa.assignedUserId === currentUserId
    );
    const unassignedSpeakerCount = totalSpeakerCount - assignedSpeakers.length;

    // Special case: No calendar attendees, no assigned speakers, but speakers exist
    // Show "X speakers" to indicate there are unidentified speakers
    if (
      !hasCalendarAttendees &&
      assignedSpeakers.length === 0 &&
      hasSpeakerAssignments
    ) {
      const speakerText =
        totalSpeakerCount === 1 ? '1 speaker' : `${totalSpeakerCount} speakers`;
      return (
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <span>{speakerText}</span>
        </div>
      );
    }

    // Special case: No calendar attendees, some speakers assigned (including "You")
    // Show assigned names up to 3, then "+X others" for rest
    if (
      !hasCalendarAttendees &&
      userAssignedSpeaker &&
      assignedSpeakers.length > 0
    ) {
      // Build list of assigned speaker names with "You" first
      const assignedNames: string[] = [];

      // Add "You" first
      assignedNames.push('You');

      // Add other assigned speakers (custom names)
      assignedSpeakers.forEach((sa) => {
        if (sa.assignedUserId !== currentUserId && sa.customSpeakerName) {
          assignedNames.push(sa.customSpeakerName);
        }
      });

      // Calculate how many unassigned speakers remain
      const maxVisible = 3;
      const visibleNames = assignedNames.slice(0, maxVisible);
      const remainingAssigned = assignedNames.length - maxVisible;
      const totalRemaining =
        Math.max(0, remainingAssigned) + unassignedSpeakerCount;

      let displayText: string;
      if (totalRemaining === 0) {
        displayText = visibleNames.join(', ');
      } else if (totalRemaining === 1) {
        displayText = `${visibleNames.join(', ')} +1 other`;
      } else {
        displayText = `${visibleNames.join(', ')} +${totalRemaining} others`;
      }

      return (
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <span>{displayText}</span>
        </div>
      );
    }

    // Build the list of participants to display
    let participants: DisplayParticipant[] = [];

    if (allSpeakersAssigned && assignedSpeakers.length > 0) {
      // All speakers assigned - show only speaker names
      participants = assignedSpeakers.map((sa) => {
        const isMe = currentUserId && sa.assignedUserId === currentUserId;
        return {
          name: isMe ? 'You' : sa.customSpeakerName || 'You',
          isMe: !!isMe,
          source: 'speaker' as const,
        };
      });
    } else {
      // Some/no speakers assigned - merge calendar attendees with assigned speakers
      const seenNames = new Set<string>();

      // First, add assigned speakers
      assignedSpeakers.forEach((sa) => {
        const isMe = currentUserId && sa.assignedUserId === currentUserId;
        const name = isMe ? 'You' : sa.customSpeakerName;
        if (name && !seenNames.has(name.toLowerCase())) {
          seenNames.add(name.toLowerCase());
          participants.push({
            name,
            isMe: !!isMe,
            source: 'speaker',
          });
        }
      });

      // Then, add calendar attendees (if not already in the list)
      if (hasCalendarAttendees) {
        parsedAttendees!.forEach((a) => {
          const name = a.displayName || a.email.split('@')[0];
          if (!seenNames.has(name.toLowerCase())) {
            seenNames.add(name.toLowerCase());
            participants.push({
              name,
              isOrganizer: a.isOrganizer,
              source: 'calendar',
            });
          }
        });
      }
    }

    // If no participants to show, return null
    if (participants.length === 0) {
      return null;
    }

    // Sort participants: "You" first, then organizers, then speakers, then alphabetically
    const sortedParticipants = [...participants].sort((a, b) => {
      // "You" always comes first
      if (a.isMe && !b.isMe) return -1;
      if (!a.isMe && b.isMe) return 1;

      // Organizer comes next
      if (a.isOrganizer && !b.isOrganizer) return -1;
      if (!a.isOrganizer && b.isOrganizer) return 1;

      // Then speakers before calendar-only
      if (a.source === 'speaker' && b.source === 'calendar') return -1;
      if (a.source === 'calendar' && b.source === 'speaker') return 1;

      // Then sort alphabetically
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    const participantCount = sortedParticipants.length;
    const maxVisible = 3;

    // Build the display string showing up to 3 names
    const visibleParticipants = sortedParticipants.slice(0, maxVisible);
    const remainingCount = participantCount - maxVisible;

    let displayText: string;
    if (participantCount <= maxVisible) {
      // Show all names joined by comma
      displayText = visibleParticipants.map((p) => p.name).join(', ');
    } else {
      // Show first 3 names + "+x others"
      displayText = `${visibleParticipants.map((p) => p.name).join(', ')} +${remainingCount} other${remainingCount === 1 ? '' : 's'}`;
    }

    return (
      <div className="relative group flex items-center gap-1.5 text-sm text-gray-500 cursor-default">
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
        <span>{displayText}</span>

        {/* Custom hover tooltip - show when there are more than visible */}
        {participantCount > maxVisible && (
          <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg pointer-events-none">
            <div className="space-y-1">
              {sortedParticipants.map((p, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="truncate">{p.name}</span>
                  <span className="ml-2 text-gray-400 text-xs flex-shrink-0">
                    {p.isOrganizer && 'Organizer'}
                  </span>
                </div>
              ))}
            </div>
            {/* Arrow pointing down */}
            <div className="absolute left-4 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        )}
      </div>
    );
  } catch (e) {
    console.warn('Failed to parse attendees:', e);
    return null;
  }
}
