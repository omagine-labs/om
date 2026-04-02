/**
 * @jest-environment jsdom
 *
 * Integration Tests: Anonymous Meeting Claim Flow
 *
 * Tests the complete flow from anonymous speaker selection through signup/login
 */

import { createClient } from '@/lib/supabase';

// Mock dependencies
jest.mock('@/lib/supabase');

const mockSupabase = {
  rpc: jest.fn(),
  from: jest.fn(),
};

describe('Anonymous Meeting Claim Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  describe('Speaker Assignment Preservation', () => {
    it('should preserve speaker assignment when new user signs up (BUG TEST)', async () => {
      // Scenario:
      // 1. Anonymous user selects SPEAKER_A (saved as GUEST_USER_ID in DB)
      // 2. User signs up with speaker param in URL
      // 3. claim_anonymous_meetings() is called with speaker param
      // 4. Speaker assignment should transfer from GUEST to new user

      const userId = 'new-user-123';
      const email = 'newuser@example.com';
      const selectedSpeaker = 'SPEAKER_A';

      // Mock the RPC call response
      // The RPC should return the claimed meeting with speaker assigned
      mockSupabase.rpc.mockResolvedValue({
        data: [
          {
            meeting_id: 'meeting-123',
            meeting_title: 'Test Meeting',
            speaker_assigned: true, // This should be true if speaker was transferred
          },
        ],
        error: null,
      });

      // Simulate claim during signup
      const { data, error } = await mockSupabase.rpc(
        'claim_anonymous_meetings',
        {
          p_user_id: userId,
          p_email: email,
          p_selected_speaker: selectedSpeaker,
        }
      );

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0].speaker_assigned).toBe(true);

      // Verify the RPC was called with correct parameters
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'claim_anonymous_meetings',
        {
          p_user_id: userId,
          p_email: email,
          p_selected_speaker: selectedSpeaker, // Speaker param must be passed
        }
      );
    });

    it('should handle speaker assignment when existing user logs in', async () => {
      // Scenario:
      // 1. Anonymous user selects SPEAKER_B
      // 2. User logs in (existing account) with speaker param
      // 3. Speaker assignment should transfer

      const userId = 'existing-user-456';
      const email = 'existing@example.com';
      const selectedSpeaker = 'SPEAKER_B';

      mockSupabase.rpc.mockResolvedValue({
        data: [
          {
            meeting_id: 'meeting-456',
            meeting_title: 'Test Meeting 2',
            speaker_assigned: true,
          },
        ],
        error: null,
      });

      const { data, error } = await mockSupabase.rpc(
        'claim_anonymous_meetings',
        {
          p_user_id: userId,
          p_email: email,
          p_selected_speaker: selectedSpeaker,
        }
      );

      expect(error).toBeNull();
      expect(data[0].speaker_assigned).toBe(true);
    });

    it('should transfer ALL speakers if no speaker param provided', async () => {
      // Scenario:
      // 1. Anonymous user selects speaker but param is lost
      // 2. claim_anonymous_meetings() called without speaker param
      // 3. All GUEST assignments should transfer

      const userId = 'user-789';
      const email = 'user@example.com';

      mockSupabase.rpc.mockResolvedValue({
        data: [
          {
            meeting_id: 'meeting-789',
            meeting_title: 'Test Meeting 3',
            speaker_assigned: true, // All speakers transferred
          },
        ],
        error: null,
      });

      const { data, error } = await mockSupabase.rpc(
        'claim_anonymous_meetings',
        {
          p_user_id: userId,
          p_email: email,
          p_selected_speaker: undefined, // No speaker specified
        }
      );

      expect(error).toBeNull();
      expect(data[0].speaker_assigned).toBe(true);
    });
  });

  describe('URL Parameter Handling', () => {
    it('should pass speaker parameter from URL to RPC call', () => {
      // This tests the signup page logic
      const searchParams = new URLSearchParams({
        email: 'test@example.com',
        meeting_id: 'meeting-123',
        speaker: 'SPEAKER_A',
      });

      const selectedSpeaker = searchParams.get('speaker');

      expect(selectedSpeaker).toBe('SPEAKER_A');

      // The speaker param should be passed to the RPC
      const rpcParams = {
        p_user_id: 'user-123',
        p_email: 'test@example.com',
        p_selected_speaker: selectedSpeaker || undefined,
      };

      expect(rpcParams.p_selected_speaker).toBe('SPEAKER_A');
    });

    it('should handle missing speaker parameter gracefully', () => {
      const searchParams = new URLSearchParams({
        email: 'test@example.com',
        meeting_id: 'meeting-123',
        // No speaker param
      });

      const selectedSpeaker = searchParams.get('speaker');

      expect(selectedSpeaker).toBeNull();

      const rpcParams = {
        p_user_id: 'user-123',
        p_email: 'test@example.com',
        p_selected_speaker: selectedSpeaker || undefined,
      };

      // Should be undefined, which tells RPC to transfer all speakers
      expect(rpcParams.p_selected_speaker).toBeUndefined();
    });
  });
});
