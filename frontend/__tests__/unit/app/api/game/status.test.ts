/**
 * @jest-environment node
 *
 * API Route Tests: /api/game/status
 */

import { GET } from '@/app/api/game/status/route';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase-server';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/supabase-server');

const mockServerSupabase = {
  auth: {
    getUser: jest.fn(),
  },
};

const mockServiceSupabase = {
  from: jest.fn(),
};

describe('GET /api/game/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createServerSupabaseClient as jest.Mock).mockResolvedValue(
      mockServerSupabase
    );
    (createServiceRoleClient as jest.Mock).mockReturnValue(mockServiceSupabase);
  });

  describe('Request Validation', () => {
    it('should return 400 if gameId is missing', async () => {
      const request = new NextRequest('http://localhost/api/game/status');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Missing gameId parameter');
    });
  });

  describe('Anonymous User Authentication', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });
    });

    it('should return 401 if anonymous user has no X-Access-Token header', async () => {
      const request = new NextRequest(
        'http://localhost/api/game/status?gameId=game-123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.message).toBe(
        'X-Access-Token header required for anonymous users'
      );
    });

    it('should return 403 if access token is invalid', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-123',
                user_id: null,
                access_token: 'correct-token',
                status: 'processing',
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/status?gameId=game-123',
        {
          headers: {
            'X-Access-Token': 'wrong-token',
          },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Invalid access token');
    });

    it('should return status with valid access token', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-123',
                user_id: null,
                access_token: 'valid-token',
                status: 'completed',
                processing_error: null,
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/status?gameId=game-123',
        {
          headers: {
            'X-Access-Token': 'valid-token',
          },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe('completed');
      expect(data.error).toBeNull();
    });
  });

  describe('Authenticated User', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
    });

    it('should return 403 if user does not own the game', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-123',
                user_id: 'other-user-456',
                access_token: 'token',
                status: 'completed',
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/status?gameId=game-123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Not authorized to access this game');
    });

    it('should return status for authenticated owner without access token', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-123',
                user_id: 'user-123',
                access_token: 'token',
                status: 'processing',
                processing_error: null,
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/status?gameId=game-123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe('processing');
    });
  });

  describe('Game Status Handling', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });
    });

    it('should return 404 if game not found', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' },
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/status?gameId=nonexistent',
        {
          headers: {
            'X-Access-Token': 'token',
          },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Game not found');
    });

    it('should return processing error if present', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-123',
                user_id: null,
                access_token: 'valid-token',
                status: 'failed',
                processing_error: 'Transcription failed',
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/status?gameId=game-123',
        {
          headers: {
            'X-Access-Token': 'valid-token',
          },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe('failed');
      expect(data.error).toBe('Transcription failed');
    });
  });

  describe('Error Handling', () => {
    it('should return 500 if auth check throws', async () => {
      mockServerSupabase.auth.getUser.mockRejectedValue(
        new Error('Auth error')
      );

      const request = new NextRequest(
        'http://localhost/api/game/status?gameId=game-123',
        {
          headers: {
            'X-Access-Token': 'token',
          },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.message).toBe('An unexpected error occurred');
    });

    it('should return 500 if database query fails', async () => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Database connection failed' },
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/status?gameId=game-123',
        {
          headers: {
            'X-Access-Token': 'token',
          },
        }
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Failed to fetch game status');
    });
  });
});
