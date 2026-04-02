/**
 * @jest-environment node
 *
 * API Route Tests: /api/game/complete
 */

import { POST } from '@/app/api/game/complete/route';
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase-server';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@/lib/supabase-server');

// Mock fetch for Python backend calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockServerSupabase = {
  auth: {
    getUser: jest.fn(),
  },
};

const mockServiceSupabase = {
  from: jest.fn(),
};

describe('POST /api/game/complete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createServerSupabaseClient as jest.Mock).mockResolvedValue(
      mockServerSupabase
    );
    (createServiceRoleClient as jest.Mock).mockReturnValue(mockServiceSupabase);
    mockFetch.mockResolvedValue({ ok: true });
  });

  describe('Request Validation', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });
    });

    it('should return 400 if gameId is missing', async () => {
      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          accessToken: 'token-123',
          audioStoragePath: 'audio/game.webm',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.message).toBe(
        'Missing required fields: gameId, accessToken, and audioStoragePath'
      );
    });

    it('should return 400 if accessToken is missing', async () => {
      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'game-123',
          audioStoragePath: 'audio/game.webm',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should return 400 if audioStoragePath is missing', async () => {
      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'game-123',
          accessToken: 'token-123',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Anonymous User Flow', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });
    });

    it('should create game with user_id null for anonymous users', async () => {
      const mockInsert = jest.fn().mockResolvedValue({ error: null });
      mockServiceSupabase.from.mockReturnValue({
        insert: mockInsert,
      });

      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'game-123',
          accessToken: 'token-123',
          audioStoragePath: 'audio/game.webm',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.isAnonymous).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'game-123',
          user_id: null,
          access_token: 'token-123',
          audio_storage_path: 'audio/game.webm',
          status: 'processing',
        })
      );
    });
  });

  describe('Authenticated User Flow', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
    });

    it('should create game with user_id for authenticated users', async () => {
      const mockInsert = jest.fn().mockResolvedValue({ error: null });
      mockServiceSupabase.from.mockReturnValue({
        insert: mockInsert,
      });

      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'game-123',
          accessToken: 'token-123',
          audioStoragePath: 'audio/game.webm',
          videoStoragePath: 'video/game.webm',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.isAnonymous).toBe(false);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'game-123',
          user_id: 'user-123',
          access_token: 'token-123',
          audio_storage_path: 'audio/game.webm',
          video_storage_path: 'video/game.webm',
          status: 'processing',
        })
      );
    });
  });

  describe('Game Record Creation', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
    });

    it('should calculate total recording size from audio and video', async () => {
      const mockInsert = jest.fn().mockResolvedValue({ error: null });
      mockServiceSupabase.from.mockReturnValue({
        insert: mockInsert,
      });

      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'game-123',
          accessToken: 'token-123',
          audioStoragePath: 'audio/game.webm',
          audioFileSizeMB: 2.5,
          videoFileSizeMB: 10.0,
        }),
      });

      await POST(request);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          recording_size_mb: 12.5,
        })
      );
    });

    it('should include slide IDs and topic date if provided', async () => {
      const mockInsert = jest.fn().mockResolvedValue({ error: null });
      mockServiceSupabase.from.mockReturnValue({
        insert: mockInsert,
      });

      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'game-123',
          accessToken: 'token-123',
          audioStoragePath: 'audio/game.webm',
          slideIds: ['slide-1', 'slide-2', 'slide-3'],
          topicDate: '2025-01-14',
        }),
      });

      await POST(request);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          slide_ids: ['slide-1', 'slide-2', 'slide-3'],
          topic_date: '2025-01-14',
        })
      );
    });

    it('should return 500 if game insert fails', async () => {
      const mockInsert = jest
        .fn()
        .mockResolvedValue({ error: { message: 'Insert failed' } });
      mockServiceSupabase.from.mockReturnValue({
        insert: mockInsert,
      });

      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'game-123',
          accessToken: 'token-123',
          audioStoragePath: 'audio/game.webm',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Failed to create game');
    });
  });

  describe('Python Backend Processing', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
      mockServiceSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
      });
    });

    it('should trigger Python backend processing after game creation', async () => {
      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'game-123',
          accessToken: 'token-123',
          audioStoragePath: 'audio/game.webm',
        }),
      });

      await POST(request);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/process/game'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ game_id: 'game-123' }),
        })
      );
    });

    it('should succeed even if Python backend call fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Backend error'),
      });

      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'game-123',
          accessToken: 'token-123',
          audioStoragePath: 'audio/game.webm',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Should still succeed - game is saved, processing can be retried
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should succeed even if Python backend throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'game-123',
          accessToken: 'token-123',
          audioStoragePath: 'audio/game.webm',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Should still succeed - game is saved, processing can be retried
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return 500 if auth check throws', async () => {
      mockServerSupabase.auth.getUser.mockRejectedValue(
        new Error('Auth error')
      );

      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: JSON.stringify({
          gameId: 'game-123',
          accessToken: 'token-123',
          audioStoragePath: 'audio/game.webm',
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.message).toBe('An unexpected error occurred');
    });

    it('should return 500 if request body is invalid JSON', async () => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      const request = new NextRequest('http://localhost/api/game/complete', {
        method: 'POST',
        body: 'not valid json',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
