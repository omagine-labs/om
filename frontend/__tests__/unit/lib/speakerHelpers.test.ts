/**
 * Unit tests for speaker helper functions
 *
 * These functions now use userSpeakerLabel (from meetings.user_speaker_label)
 * as the source of truth for determining which speaker is the current user.
 */

import {
  getSpeakerDisplayName,
  isSpeakerAssignedToMe,
  isSpeakerAssigned,
} from '@/lib/speakerHelpers';

describe('speakerHelpers', () => {
  const mockSpeakerRecords = [
    {
      speaker_label: 'SPEAKER_00',
      assigned_user_id: 'user-123',
      custom_speaker_name: null,
    },
    {
      speaker_label: 'SPEAKER_01',
      assigned_user_id: null,
      custom_speaker_name: 'John Doe',
    },
    {
      speaker_label: 'SPEAKER_02',
      assigned_user_id: 'user-456',
      custom_speaker_name: 'Jane Smith',
    },
    {
      speaker_label: 'SPEAKER_03',
      assigned_user_id: null,
      custom_speaker_name: null,
    },
  ];

  describe('getSpeakerDisplayName', () => {
    it('returns humanized speaker label when no record found', () => {
      expect(
        getSpeakerDisplayName('SPEAKER_99', mockSpeakerRecords, 'SPEAKER_00')
      ).toBe('SPEAKER 99');
    });

    it('returns current user name when speaker matches userSpeakerLabel', () => {
      // SPEAKER_00 is the current user (userSpeakerLabel = 'SPEAKER_00')
      expect(
        getSpeakerDisplayName('SPEAKER_00', mockSpeakerRecords, 'SPEAKER_00')
      ).toBe('You');
    });

    it('returns custom current user name when provided', () => {
      expect(
        getSpeakerDisplayName(
          'SPEAKER_00',
          mockSpeakerRecords,
          'SPEAKER_00',
          'Me'
        )
      ).toBe('Me');
    });

    it('returns custom name when set and not current user', () => {
      // SPEAKER_01 has custom name 'John Doe', and is not the current user
      expect(
        getSpeakerDisplayName('SPEAKER_01', mockSpeakerRecords, 'SPEAKER_00')
      ).toBe('John Doe');
    });

    it('returns "You" when speaker is current user even if custom name exists', () => {
      // SPEAKER_02 has custom name 'Jane Smith' but is the current user
      expect(
        getSpeakerDisplayName('SPEAKER_02', mockSpeakerRecords, 'SPEAKER_02')
      ).toBe('You');
    });

    it('returns custom name when speaker is not current user', () => {
      // SPEAKER_02 has custom name 'Jane Smith' and is not the current user
      expect(
        getSpeakerDisplayName('SPEAKER_02', mockSpeakerRecords, 'SPEAKER_00')
      ).toBe('Jane Smith');
    });

    it('returns humanized speaker label when not current user and no custom name', () => {
      expect(
        getSpeakerDisplayName('SPEAKER_03', mockSpeakerRecords, 'SPEAKER_00')
      ).toBe('SPEAKER 03');
    });

    it('handles null userSpeakerLabel', () => {
      expect(
        getSpeakerDisplayName('SPEAKER_00', mockSpeakerRecords, null)
      ).toBe('SPEAKER 00');
    });

    it('handles empty speaker records array', () => {
      expect(getSpeakerDisplayName('SPEAKER_00', [], 'SPEAKER_00')).toBe('You');
    });
  });

  describe('isSpeakerAssignedToMe', () => {
    it('returns true when speaker matches userSpeakerLabel', () => {
      expect(isSpeakerAssignedToMe('SPEAKER_00', 'SPEAKER_00')).toBe(true);
    });

    it('returns false when speaker does not match userSpeakerLabel', () => {
      expect(isSpeakerAssignedToMe('SPEAKER_00', 'SPEAKER_01')).toBe(false);
    });

    it('returns false when userSpeakerLabel is null', () => {
      expect(isSpeakerAssignedToMe('SPEAKER_00', null)).toBe(false);
    });

    it('returns false when userSpeakerLabel is undefined', () => {
      expect(
        isSpeakerAssignedToMe('SPEAKER_00', undefined as unknown as null)
      ).toBe(false);
    });
  });

  describe('isSpeakerAssigned', () => {
    it('returns true when speaker matches userSpeakerLabel', () => {
      expect(
        isSpeakerAssigned('SPEAKER_00', mockSpeakerRecords, 'SPEAKER_00')
      ).toBe(true);
    });

    it('returns true when speaker has custom name', () => {
      expect(isSpeakerAssigned('SPEAKER_01', mockSpeakerRecords, null)).toBe(
        true
      );
    });

    it('returns true when speaker has both userSpeakerLabel match and custom name', () => {
      expect(
        isSpeakerAssigned('SPEAKER_02', mockSpeakerRecords, 'SPEAKER_02')
      ).toBe(true);
    });

    it('returns false when speaker has no assignment and no custom name', () => {
      expect(isSpeakerAssigned('SPEAKER_03', mockSpeakerRecords, null)).toBe(
        false
      );
    });

    it('returns false when speaker not found and not userSpeakerLabel', () => {
      expect(isSpeakerAssigned('SPEAKER_99', mockSpeakerRecords, null)).toBe(
        false
      );
    });

    it('returns true when speaker not in records but matches userSpeakerLabel', () => {
      expect(
        isSpeakerAssigned('SPEAKER_99', mockSpeakerRecords, 'SPEAKER_99')
      ).toBe(true);
    });

    it('returns false when speaker records array is empty and no userSpeakerLabel match', () => {
      expect(isSpeakerAssigned('SPEAKER_00', [], null)).toBe(false);
    });

    it('returns true when speaker records array is empty but userSpeakerLabel matches', () => {
      expect(isSpeakerAssigned('SPEAKER_00', [], 'SPEAKER_00')).toBe(true);
    });
  });
});
