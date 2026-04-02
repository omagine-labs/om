/**
 * Unit tests for useSpeakerIdentityGrouping hook
 *
 * This hook now uses userSpeakerLabel (from meetings.user_speaker_label) as the
 * source of truth for determining which speaker is the current user.
 */

import { renderHook } from '@testing-library/react';
import {
  useSpeakerIdentityGrouping,
  SpeakerRecord,
} from '@/hooks/useSpeakerIdentityGrouping';

describe('useSpeakerIdentityGrouping', () => {
  const mockSegments = [
    { id: 'seg-1', segmentNumber: 1 },
    { id: 'seg-2', segmentNumber: 2 },
  ];

  describe('Single Recording', () => {
    const speakerRecords: SpeakerRecord[] = [
      {
        id: 'rec-1',
        speaker_label: 'SPEAKER_00',
        assigned_user_id: 'user-123',
        custom_speaker_name: null,
        talk_time_seconds: 120,
        talk_time_percentage: 60,
        word_count: 200,
      },
      {
        id: 'rec-2',
        speaker_label: 'SPEAKER_01',
        assigned_user_id: null,
        custom_speaker_name: 'John Doe',
        talk_time_seconds: 80,
        talk_time_percentage: 40,
        word_count: 150,
      },
    ];

    it('creates identity groups for single recording', () => {
      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: 'user-123',
          userSpeakerLabel: 'SPEAKER_00',
        })
      );

      expect(result.current).toHaveLength(2);
    });

    it('marks speaker as "me" when speaker_label matches userSpeakerLabel', () => {
      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: 'user-123',
          userSpeakerLabel: 'SPEAKER_00',
        })
      );

      const myGroup = result.current.find((g) => g.isMe);
      expect(myGroup).toBeDefined();
      expect(myGroup?.identity).toBe('You');
      expect(myGroup?.displayName).toBe('You');
    });

    it('uses custom name for display', () => {
      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: 'user-999',
          userSpeakerLabel: null, // Not identified
        })
      );

      const johnGroup = result.current.find(
        (g) => g.displayName === 'John Doe'
      );
      expect(johnGroup).toBeDefined();
      expect(johnGroup?.identity).toBe('John Doe');
    });

    it('sorts current user first', () => {
      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: 'user-123',
          userSpeakerLabel: 'SPEAKER_00',
        })
      );

      expect(result.current[0].isMe).toBe(true);
    });

    it('calculates metrics correctly', () => {
      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: 'user-123',
          userSpeakerLabel: 'SPEAKER_00',
        })
      );

      const myGroup = result.current.find((g) => g.isMe);
      expect(myGroup?.metrics.totalTalkTime).toBe(120);
      expect(myGroup?.metrics.totalWords).toBe(200);
      expect(myGroup?.metrics.avgPercentage).toBe(60);
    });
  });

  describe('Multiple Speakers Same Identity', () => {
    it('combines multiple speakers with the same custom name', () => {
      const speakerRecords: SpeakerRecord[] = [
        {
          id: 'rec-1',
          speaker_label: 'SPEAKER_00',
          assigned_user_id: null,
          custom_speaker_name: 'John Doe',
          talk_time_seconds: 120,
          talk_time_percentage: 60,
          word_count: 200,
        },
        {
          id: 'rec-2',
          speaker_label: 'SPEAKER_01',
          assigned_user_id: null,
          custom_speaker_name: 'John Doe', // Same custom name
          talk_time_seconds: 80,
          talk_time_percentage: 40,
          word_count: 150,
        },
      ];

      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: 'user-999', // Different user
          userSpeakerLabel: null,
        })
      );

      // Should have only 1 group since both speakers have the same custom name
      expect(result.current).toHaveLength(1);
      expect(result.current[0].identity).toBe('John Doe');
      expect(result.current[0].displayName).toBe('John Doe');
      expect(result.current[0].records).toHaveLength(2);
      // Metrics should be combined
      expect(result.current[0].metrics.totalTalkTime).toBe(200); // 120 + 80
      expect(result.current[0].metrics.totalWords).toBe(350); // 200 + 150
    });

    it('combines speakers when userSpeakerLabel matches one speaker', () => {
      const speakerRecords: SpeakerRecord[] = [
        {
          id: 'rec-1',
          speaker_label: 'SPEAKER_00',
          assigned_user_id: 'user-123',
          custom_speaker_name: null,
          talk_time_seconds: 120,
          talk_time_percentage: 60,
          word_count: 200,
        },
        {
          id: 'rec-2',
          speaker_label: 'SPEAKER_01',
          assigned_user_id: 'user-456', // Different assigned_user_id
          custom_speaker_name: null,
          talk_time_seconds: 80,
          talk_time_percentage: 40,
          word_count: 150,
        },
      ];

      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: 'user-123',
          userSpeakerLabel: 'SPEAKER_00', // Only SPEAKER_00 is "me"
        })
      );

      // Should have 2 groups - one for "me" and one for the other speaker
      expect(result.current).toHaveLength(2);

      const myGroup = result.current.find((g) => g.isMe);
      expect(myGroup).toBeDefined();
      expect(myGroup?.records).toHaveLength(1);
      expect(myGroup?.identity).toBe('You');
    });

    it('keeps speakers separate when neither is current user', () => {
      const speakerRecords: SpeakerRecord[] = [
        {
          id: 'rec-1',
          speaker_label: 'SPEAKER_00',
          assigned_user_id: 'user-123',
          custom_speaker_name: null,
          talk_time_seconds: 120,
          talk_time_percentage: 60,
          word_count: 200,
        },
        {
          id: 'rec-2',
          speaker_label: 'SPEAKER_01',
          assigned_user_id: 'user-456', // Different user
          custom_speaker_name: null,
          talk_time_seconds: 80,
          talk_time_percentage: 40,
          word_count: 150,
        },
      ];

      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: 'user-999', // Neither speaker is assigned to this user
          userSpeakerLabel: null,
        })
      );

      // Should have 2 groups since speakers have different identities
      expect(result.current).toHaveLength(2);
    });

    it('groups speakers by userSpeakerLabel match even without custom names', () => {
      // When the current user (via userSpeakerLabel) is identified as one speaker
      const speakerRecords: SpeakerRecord[] = [
        {
          id: 'rec-1',
          speaker_label: 'SPEAKER_00',
          assigned_user_id: null,
          custom_speaker_name: null,
          talk_time_seconds: 120,
          talk_time_percentage: 60,
          word_count: 200,
        },
        {
          id: 'rec-2',
          speaker_label: 'SPEAKER_01',
          assigned_user_id: null,
          custom_speaker_name: null,
          talk_time_seconds: 80,
          talk_time_percentage: 40,
          word_count: 150,
        },
      ];

      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: 'user-123',
          userSpeakerLabel: 'SPEAKER_00', // Only SPEAKER_00 is "me"
        })
      );

      // Should have 2 groups - "You" for SPEAKER_00, humanized label for SPEAKER_01
      expect(result.current).toHaveLength(2);

      const myGroup = result.current.find((g) => g.isMe);
      expect(myGroup).toBeDefined();
      expect(myGroup?.identity).toBe('You');
      expect(myGroup?.records).toHaveLength(1);
      expect(myGroup?.records[0].speaker_label).toBe('SPEAKER_00');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty speaker records', () => {
      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords: [],
          currentUserId: 'user-123',
          userSpeakerLabel: null,
        })
      );

      expect(result.current).toHaveLength(0);
    });

    it('handles null currentUserId', () => {
      const speakerRecords: SpeakerRecord[] = [
        {
          id: 'rec-1',
          speaker_label: 'SPEAKER_00',
          assigned_user_id: 'user-123',
          custom_speaker_name: null,
          talk_time_seconds: 120,
          talk_time_percentage: 60,
          word_count: 200,
        },
      ];

      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: null,
          userSpeakerLabel: null,
        })
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].isMe).toBe(false);
    });

    it('handles undefined currentUserId', () => {
      const speakerRecords: SpeakerRecord[] = [
        {
          id: 'rec-1',
          speaker_label: 'SPEAKER_00',
          assigned_user_id: 'user-123',
          custom_speaker_name: null,
          talk_time_seconds: 120,
          talk_time_percentage: 60,
          word_count: 200,
        },
      ];

      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: undefined,
          userSpeakerLabel: null,
        })
      );

      expect(result.current).toHaveLength(1);
      expect(result.current[0].isMe).toBe(false);
    });

    it('handles zero metrics', () => {
      const speakerRecords: SpeakerRecord[] = [
        {
          id: 'rec-1',
          speaker_label: 'SPEAKER_00',
          assigned_user_id: null,
          custom_speaker_name: null,
          talk_time_seconds: 0,
          talk_time_percentage: 0,
          word_count: 0,
        },
      ];

      const { result } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: null,
          userSpeakerLabel: null,
        })
      );

      expect(result.current[0].metrics.totalTalkTime).toBe(0);
      expect(result.current[0].metrics.totalWords).toBe(0);
      expect(result.current[0].metrics.avgPercentage).toBe(0);
    });
  });

  describe('Memoization', () => {
    it('returns same reference when inputs unchanged', () => {
      const speakerRecords: SpeakerRecord[] = [
        {
          id: 'rec-1',
          speaker_label: 'SPEAKER_00',
          assigned_user_id: 'user-123',
          custom_speaker_name: null,
          talk_time_seconds: 120,
          talk_time_percentage: 60,
          word_count: 200,
        },
      ];

      const { result, rerender } = renderHook(() =>
        useSpeakerIdentityGrouping({
          speakerRecords,
          currentUserId: 'user-123',
          userSpeakerLabel: 'SPEAKER_00',
        })
      );

      const firstResult = result.current;
      rerender();
      expect(result.current).toBe(firstResult);
    });

    it('recalculates when speakerRecords change', () => {
      const speakerRecords1: SpeakerRecord[] = [
        {
          id: 'rec-1',
          speaker_label: 'SPEAKER_00',
          assigned_user_id: 'user-123',
          custom_speaker_name: null,
          talk_time_seconds: 120,
          talk_time_percentage: 60,
          word_count: 200,
        },
      ];

      const speakerRecords2: SpeakerRecord[] = [
        {
          id: 'rec-2',
          speaker_label: 'SPEAKER_01',
          assigned_user_id: 'user-456',
          custom_speaker_name: null,
          talk_time_seconds: 90,
          talk_time_percentage: 45,
          word_count: 150,
        },
      ];

      const { result, rerender } = renderHook(
        ({ records }) =>
          useSpeakerIdentityGrouping({
            speakerRecords: records,
            currentUserId: 'user-123',
            userSpeakerLabel: 'SPEAKER_00',
          }),
        { initialProps: { records: speakerRecords1 } }
      );

      const firstResult = result.current;
      rerender({ records: speakerRecords2 });
      expect(result.current).not.toBe(firstResult);
    });
  });
});
