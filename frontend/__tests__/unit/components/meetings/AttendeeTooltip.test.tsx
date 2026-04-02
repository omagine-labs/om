/**
 * Unit tests for AttendeeTooltip component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import AttendeeTooltip from '@/components/meetings/AttendeeTooltip';

describe('AttendeeTooltip', () => {
  describe('No attendees, unassigned speakers only', () => {
    it('shows "2 speakers" when there are 2 unassigned speakers', () => {
      render(
        <AttendeeTooltip
          attendees={null}
          speakerAssignments={[
            {
              speakerLabel: 'SPEAKER_00',
              assignedUserId: null,
              customSpeakerName: null,
            },
            {
              speakerLabel: 'SPEAKER_01',
              assignedUserId: null,
              customSpeakerName: null,
            },
          ]}
          currentUserId="user-123"
        />
      );

      expect(screen.getByText('2 speakers')).toBeInTheDocument();
    });

    it('shows "1 speaker" when there is 1 unassigned speaker', () => {
      render(
        <AttendeeTooltip
          attendees={null}
          speakerAssignments={[
            {
              speakerLabel: 'SPEAKER_00',
              assignedUserId: null,
              customSpeakerName: null,
            },
          ]}
          currentUserId="user-123"
        />
      );

      expect(screen.getByText('1 speaker')).toBeInTheDocument();
    });

    it('shows "3 speakers" when there are 3 unassigned speakers', () => {
      render(
        <AttendeeTooltip
          attendees={null}
          speakerAssignments={[
            {
              speakerLabel: 'SPEAKER_00',
              assignedUserId: null,
              customSpeakerName: null,
            },
            {
              speakerLabel: 'SPEAKER_01',
              assignedUserId: null,
              customSpeakerName: null,
            },
            {
              speakerLabel: 'SPEAKER_02',
              assignedUserId: null,
              customSpeakerName: null,
            },
          ]}
          currentUserId="user-123"
        />
      );

      expect(screen.getByText('3 speakers')).toBeInTheDocument();
    });
  });

  describe('No attendees, user assigned to speaker', () => {
    it('shows "You" when user is the only speaker', () => {
      render(
        <AttendeeTooltip
          attendees={null}
          speakerAssignments={[
            {
              speakerLabel: 'SPEAKER_00',
              assignedUserId: 'user-123',
              customSpeakerName: null,
            },
          ]}
          currentUserId="user-123"
        />
      );

      expect(screen.getByText('You')).toBeInTheDocument();
    });

    it('shows "You +1 other" when user is assigned and there is 1 unassigned speaker', () => {
      render(
        <AttendeeTooltip
          attendees={null}
          speakerAssignments={[
            {
              speakerLabel: 'SPEAKER_00',
              assignedUserId: 'user-123',
              customSpeakerName: null,
            },
            {
              speakerLabel: 'SPEAKER_01',
              assignedUserId: null,
              customSpeakerName: null,
            },
          ]}
          currentUserId="user-123"
        />
      );

      expect(screen.getByText('You +1 other')).toBeInTheDocument();
    });

    it('shows "You +2 others" when user is assigned and there are 2 unassigned speakers', () => {
      render(
        <AttendeeTooltip
          attendees={null}
          speakerAssignments={[
            {
              speakerLabel: 'SPEAKER_00',
              assignedUserId: 'user-123',
              customSpeakerName: null,
            },
            {
              speakerLabel: 'SPEAKER_01',
              assignedUserId: null,
              customSpeakerName: null,
            },
            {
              speakerLabel: 'SPEAKER_02',
              assignedUserId: null,
              customSpeakerName: null,
            },
          ]}
          currentUserId="user-123"
        />
      );

      expect(screen.getByText('You +2 others')).toBeInTheDocument();
    });

    it('shows "You, John Doe" when user and another speaker are both assigned', () => {
      render(
        <AttendeeTooltip
          attendees={null}
          speakerAssignments={[
            {
              speakerLabel: 'SPEAKER_00',
              assignedUserId: 'user-123',
              customSpeakerName: null,
            },
            {
              speakerLabel: 'SPEAKER_01',
              assignedUserId: null,
              customSpeakerName: 'John Doe',
            },
          ]}
          currentUserId="user-123"
        />
      );

      expect(screen.getByText('You, John Doe')).toBeInTheDocument();
    });

    it('shows "You, John, Alice +1 other" when 3 assigned and 1 unassigned', () => {
      render(
        <AttendeeTooltip
          attendees={null}
          speakerAssignments={[
            {
              speakerLabel: 'SPEAKER_00',
              assignedUserId: 'user-123',
              customSpeakerName: null,
            },
            {
              speakerLabel: 'SPEAKER_01',
              assignedUserId: null,
              customSpeakerName: 'John',
            },
            {
              speakerLabel: 'SPEAKER_02',
              assignedUserId: null,
              customSpeakerName: 'Alice',
            },
            {
              speakerLabel: 'SPEAKER_03',
              assignedUserId: null,
              customSpeakerName: null,
            },
          ]}
          currentUserId="user-123"
        />
      );

      expect(screen.getByText('You, John, Alice +1 other')).toBeInTheDocument();
    });

    it('shows "You, John, Alice +2 others" when 4 assigned', () => {
      render(
        <AttendeeTooltip
          attendees={null}
          speakerAssignments={[
            {
              speakerLabel: 'SPEAKER_00',
              assignedUserId: 'user-123',
              customSpeakerName: null,
            },
            {
              speakerLabel: 'SPEAKER_01',
              assignedUserId: null,
              customSpeakerName: 'John',
            },
            {
              speakerLabel: 'SPEAKER_02',
              assignedUserId: null,
              customSpeakerName: 'Alice',
            },
            {
              speakerLabel: 'SPEAKER_03',
              assignedUserId: null,
              customSpeakerName: 'Bob',
            },
            {
              speakerLabel: 'SPEAKER_04',
              assignedUserId: null,
              customSpeakerName: 'Carol',
            },
          ]}
          currentUserId="user-123"
        />
      );

      expect(
        screen.getByText('You, John, Alice +2 others')
      ).toBeInTheDocument();
    });
  });

  describe('With calendar attendees', () => {
    it('shows attendee names when calendar attendees exist', () => {
      render(
        <AttendeeTooltip
          attendees={[
            {
              email: 'alice@example.com',
              displayName: 'Alice',
              isOrganizer: false,
            },
            {
              email: 'bob@example.com',
              displayName: 'Bob',
              isOrganizer: false,
            },
          ]}
          speakerAssignments={[]}
          currentUserId="user-123"
        />
      );

      expect(screen.getByText('Alice, Bob')).toBeInTheDocument();
    });

    it('merges assigned speakers with calendar attendees when not all speakers assigned', () => {
      render(
        <AttendeeTooltip
          attendees={[
            {
              email: 'alice@example.com',
              displayName: 'Alice',
              isOrganizer: false,
            },
          ]}
          speakerAssignments={[
            {
              speakerLabel: 'SPEAKER_00',
              assignedUserId: 'user-123',
              customSpeakerName: null,
            },
            {
              speakerLabel: 'SPEAKER_01',
              assignedUserId: null,
              customSpeakerName: null,
            },
          ]}
          currentUserId="user-123"
        />
      );

      // When not all speakers are assigned, calendar attendees are merged with assigned speakers
      expect(screen.getByText('You, Alice')).toBeInTheDocument();
    });

    it('shows only assigned speaker names when all speakers are assigned', () => {
      render(
        <AttendeeTooltip
          attendees={[
            {
              email: 'alice@example.com',
              displayName: 'Alice',
              isOrganizer: false,
            },
          ]}
          speakerAssignments={[
            {
              speakerLabel: 'SPEAKER_00',
              assignedUserId: 'user-123',
              customSpeakerName: null,
            },
          ]}
          currentUserId="user-123"
        />
      );

      // When all speakers are assigned, shows only confirmed participants (speaker assignments)
      expect(screen.getByText('You')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('returns null when no attendees and no speakers', () => {
      const { container } = render(
        <AttendeeTooltip
          attendees={null}
          speakerAssignments={[]}
          currentUserId="user-123"
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('returns null when attendees is empty array and no speakers', () => {
      const { container } = render(
        <AttendeeTooltip
          attendees={[]}
          speakerAssignments={[]}
          currentUserId="user-123"
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });
});
