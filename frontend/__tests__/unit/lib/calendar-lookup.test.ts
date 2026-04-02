/**
 * Calendar Lookup Service Tests
 *
 * Unit tests for the calendar lookup functionality that enriches
 * meeting records with calendar metadata (attendees, meeting links, etc.)
 */

import {
  findCalendarEventMetadata,
  enrichMeetingWithCalendarData,
} from '@/lib/calendar-lookup';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(),
};

describe('Calendar Lookup Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('findCalendarEventMetadata', () => {
    const userId = 'user-123';
    const startTime = '2024-11-21T10:00:00Z';
    const endTime = '2024-11-21T11:00:00Z';

    it('should return null when no OAuth tokens exist', async () => {
      // Mock no tokens found
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn()
                .mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      });

      const result = await findCalendarEventMetadata(
        mockSupabase as any,
        userId,
        startTime,
        endTime
      );

      expect(result).toBeNull();
    });

    it('should query Google Calendar when token exists', async () => {
      // Mock Google token exists and is valid
      const mockGoogleToken = {
        access_token: 'google-token-123',
        refresh_token: 'google-refresh-123',
        expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        provider: 'google',
      };

      let callCount = 0;
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockImplementation(() => {
                callCount++;
                // First call is Google, second is Microsoft
                if (callCount === 1) {
                  return Promise.resolve({
                    data: mockGoogleToken,
                    error: null,
                  });
                }
                return Promise.resolve({ data: null, error: null });
              }),
            }),
          }),
        }),
      });

      // Mock Google Calendar API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                summary: 'Team Meeting',
                description: 'Weekly sync',
                attendees: [
                  {
                    email: 'alice@example.com',
                    displayName: 'Alice',
                    responseStatus: 'accepted',
                  },
                  {
                    email: 'bob@example.com',
                    displayName: 'Bob',
                    responseStatus: 'tentative',
                  },
                ],
                conferenceData: {
                  entryPoints: [
                    {
                      entryPointType: 'video',
                      uri: 'https://meet.google.com/abc-123',
                    },
                  ],
                },
              },
            ],
          }),
      });

      const result = await findCalendarEventMetadata(
        mockSupabase as any,
        userId,
        startTime,
        endTime
      );

      expect(result).not.toBeNull();
      expect(result?.attendees).toHaveLength(2);
      expect(result?.attendees?.[0].email).toBe('alice@example.com');
      expect(result?.meetingLink).toBe('https://meet.google.com/abc-123');
      expect(result?.description).toBe('Weekly sync');

      // Verify Google Calendar API was called
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('googleapis.com/calendar/v3'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer google-token-123' },
        })
      );
    });

    it('should query Microsoft Calendar when Google returns no results', async () => {
      // Mock Google token exists but no events
      const mockGoogleToken = {
        access_token: 'google-token-123',
        refresh_token: 'google-refresh-123',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        provider: 'google',
      };

      const mockMicrosoftToken = {
        access_token: 'microsoft-token-123',
        refresh_token: 'microsoft-refresh-123',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        provider: 'microsoft',
      };

      let callCount = 0;
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                  return Promise.resolve({
                    data: mockGoogleToken,
                    error: null,
                  });
                }
                if (callCount === 2) {
                  return Promise.resolve({
                    data: mockMicrosoftToken,
                    error: null,
                  });
                }
                return Promise.resolve({ data: null, error: null });
              }),
            }),
          }),
        }),
      });

      // Mock Google returns no events
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ items: [] }),
      });

      // Mock Microsoft returns event
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            value: [
              {
                subject: 'Project Review',
                bodyPreview: 'Quarterly review meeting',
                attendees: [
                  {
                    emailAddress: {
                      address: 'carol@example.com',
                      name: 'Carol',
                    },
                    status: { response: 'accepted' },
                  },
                ],
                onlineMeeting: {
                  joinUrl: 'https://teams.microsoft.com/meet/xyz',
                },
              },
            ],
          }),
      });

      const result = await findCalendarEventMetadata(
        mockSupabase as any,
        userId,
        startTime,
        endTime
      );

      expect(result).not.toBeNull();
      expect(result?.attendees).toHaveLength(1);
      expect(result?.attendees?.[0].email).toBe('carol@example.com');
      expect(result?.meetingLink).toBe('https://teams.microsoft.com/meet/xyz');

      // Verify both APIs were called
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle Google Calendar API errors gracefully', async () => {
      const mockGoogleToken = {
        access_token: 'google-token-123',
        refresh_token: 'google-refresh-123',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        provider: 'google',
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn()
                .mockResolvedValue({ data: mockGoogleToken, error: null }),
            }),
          }),
        }),
      });

      // Mock API error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await findCalendarEventMetadata(
        mockSupabase as any,
        userId,
        startTime,
        endTime
      );

      expect(result).toBeNull();
    });
  });

  describe('enrichMeetingWithCalendarData', () => {
    const meetingId = 'meeting-123';
    const userId = 'user-123';
    const startTime = '2024-11-21T10:00:00Z';
    const endTime = '2024-11-21T11:00:00Z';

    it('should update meeting with calendar metadata when fields are null', async () => {
      // Mock token lookup
      const mockGoogleToken = {
        access_token: 'google-token-123',
        refresh_token: 'google-refresh-123',
        expires_at: new Date(Date.now() + 3600000).toISOString(),
        provider: 'google',
      };

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { attendees: null, meeting_link: null, description: null },
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'oauth_tokens') {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                  maybeSingle: jest
                    .fn()
                    .mockResolvedValue({ data: mockGoogleToken, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'meetings') {
          return { update: mockUpdate, select: mockSelect };
        }
        return {};
      });

      // Mock calendar API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            items: [
              {
                summary: 'Team Meeting',
                description: 'Weekly sync',
                attendees: [
                  { email: 'alice@example.com', displayName: 'Alice' },
                ],
                hangoutLink: 'https://meet.google.com/abc-123',
              },
            ],
          }),
      });

      await enrichMeetingWithCalendarData(
        mockSupabase as any,
        meetingId,
        userId,
        startTime,
        endTime
      );

      // Verify update was called with correct data
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          meeting_link: 'https://meet.google.com/abc-123',
          description: 'Weekly sync',
        })
      );
    });

    it('should not update meeting when no calendar metadata found', async () => {
      // Mock no tokens
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn()
                .mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
        update: jest.fn(),
      });

      await enrichMeetingWithCalendarData(
        mockSupabase as any,
        meetingId,
        userId,
        startTime,
        endTime
      );

      // Verify update was NOT called
      expect(mockSupabase.from('meetings').update).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully without throwing', async () => {
      // Mock error during token lookup
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              maybeSingle: jest
                .fn()
                .mockRejectedValue(new Error('Database error')),
            }),
          }),
        }),
      });

      // Should not throw
      await expect(
        enrichMeetingWithCalendarData(
          mockSupabase as any,
          meetingId,
          userId,
          startTime,
          endTime
        )
      ).resolves.not.toThrow();
    });
  });
});
