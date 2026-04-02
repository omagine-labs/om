/**
 * @jest-environment node
 *
 * API Route Tests: /api/game/delete
 */

import { DELETE } from '@/app/api/game/delete/route';
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
  storage: {
    from: jest.fn(),
  },
};

describe('DELETE /api/game/delete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createServerSupabaseClient as jest.Mock).mockResolvedValue(
      mockServerSupabase
    );
    (createServiceRoleClient as jest.Mock).mockReturnValue(mockServiceSupabase);
  });

  describe('Request Validation', () => {
    it('should return 400 if gameId is missing', async () => {
      const request = new NextRequest('http://localhost/api/game/delete', {
        method: 'DELETE',
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Missing gameId parameter');
    });
  });

  describe('Authentication', () => {
    it('should return 401 if user is not authenticated', async () => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
      });

      const request = new NextRequest(
        'http://localhost/api/game/delete?gameId=game-123',
        { method: 'DELETE' }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Authentication required');
    });
  });

  describe('Game Lookup', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
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
        'http://localhost/api/game/delete?gameId=nonexistent',
        { method: 'DELETE' }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Game not found');
    });

    it('should return 500 if game fetch fails with other error', async () => {
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
        'http://localhost/api/game/delete?gameId=game-123',
        { method: 'DELETE' }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Failed to fetch game');
    });
  });

  describe('Authorization', () => {
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
                audio_storage_path: null,
                video_storage_path: null,
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/delete?gameId=game-123',
        { method: 'DELETE' }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Not authorized to delete this game');
    });
  });

  describe('Successful Deletion', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
    });

    it('should delete game without storage files', async () => {
      const mockDelete = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      // First call for select, second call for delete
      mockServiceSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'game-123',
                  user_id: 'user-123',
                  audio_storage_path: null,
                  video_storage_path: null,
                },
                error: null,
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          delete: mockDelete,
        });

      const request = new NextRequest(
        'http://localhost/api/game/delete?gameId=game-123',
        { method: 'DELETE' }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Game deleted successfully');
    });

    it('should delete storage files along with game', async () => {
      const mockRemove = jest.fn().mockResolvedValue({ error: null });
      const mockDelete = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      mockServiceSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'game-123',
                  user_id: 'user-123',
                  audio_storage_path: 'audio/game-123.webm',
                  video_storage_path: 'video/game-123.webm',
                },
                error: null,
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          delete: mockDelete,
        });

      mockServiceSupabase.storage.from.mockReturnValue({
        remove: mockRemove,
      });

      const request = new NextRequest(
        'http://localhost/api/game/delete?gameId=game-123',
        { method: 'DELETE' }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockServiceSupabase.storage.from).toHaveBeenCalledWith(
        'recordings'
      );
      expect(mockRemove).toHaveBeenCalledWith([
        'audio/game-123.webm',
        'video/game-123.webm',
      ]);
    });

    it('should continue deletion even if storage deletion fails', async () => {
      const mockRemove = jest
        .fn()
        .mockResolvedValue({ error: { message: 'Storage error' } });
      const mockDelete = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      });

      mockServiceSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'game-123',
                  user_id: 'user-123',
                  audio_storage_path: 'audio/game-123.webm',
                  video_storage_path: null,
                },
                error: null,
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          delete: mockDelete,
        });

      mockServiceSupabase.storage.from.mockReturnValue({
        remove: mockRemove,
      });

      const request = new NextRequest(
        'http://localhost/api/game/delete?gameId=game-123',
        { method: 'DELETE' }
      );

      const response = await DELETE(request);
      const data = await response.json();

      // Should still succeed even though storage deletion failed
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Game deleted successfully');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
    });

    it('should return 500 if database delete fails', async () => {
      const mockDelete = jest.fn().mockReturnValue({
        eq: jest
          .fn()
          .mockResolvedValue({ error: { message: 'Delete failed' } }),
      });

      mockServiceSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: {
                  id: 'game-123',
                  user_id: 'user-123',
                  audio_storage_path: null,
                  video_storage_path: null,
                },
                error: null,
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          delete: mockDelete,
        });

      const request = new NextRequest(
        'http://localhost/api/game/delete?gameId=game-123',
        { method: 'DELETE' }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Failed to delete game');
    });

    it('should return 500 if auth check throws', async () => {
      mockServerSupabase.auth.getUser.mockRejectedValue(
        new Error('Auth error')
      );

      const request = new NextRequest(
        'http://localhost/api/game/delete?gameId=game-123',
        { method: 'DELETE' }
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.message).toBe('An unexpected error occurred');
    });
  });
});
