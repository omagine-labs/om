/**
 * @jest-environment node
 *
 * API Route Tests: /api/game/results
 */

import { GET } from '@/app/api/game/results/route';
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

describe('GET /api/game/results', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createServerSupabaseClient as jest.Mock).mockResolvedValue(
      mockServerSupabase
    );
    (createServiceRoleClient as jest.Mock).mockReturnValue(mockServiceSupabase);
  });

  describe('Request Validation', () => {
    it('should return 400 if gameId is missing', async () => {
      const request = new NextRequest('http://localhost/api/game/results');

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
      // Mock game lookup for claim check
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-123',
                access_token: 'token-abc',
                user_id: 'user-123',
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/results?gameId=game-123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.message).toBe(
        'X-Access-Token header required for anonymous users'
      );
    });

    it('should return claimToken for anonymous games without token', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-123',
                access_token: 'token-abc',
                user_id: null,
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/results?gameId=game-123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.claimToken).toBe('token-abc');
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
                status: 'completed',
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/results?gameId=game-123',
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

    it('should return game data with valid access token', async () => {
      const analysisData = {
        clarity: {
          base: 5,
          bonuses: ['grammar'],
          penalties: [],
          hard_cap_applied: null,
          score: 8,
          explanation: 'Clear explanations.',
        },
        confidence: {
          base: 5,
          bonuses: ['steady_pace'],
          penalties: [],
          hard_cap_applied: null,
          score: 7,
          explanation: 'Confident delivery.',
        },
        signals: {
          ending_strength: 'high',
          unifying_frame_present: true,
          transitions_overall: 'medium',
          landed_points_overall: 'medium',
        },
        signal_feedback: [],
        biggest_fixes: {
          clarity: 'Keep up the good work.',
          confidence: 'Strong finish.',
        },
      };

      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-123',
                user_id: null,
                access_token: 'valid-token',
                status: 'completed',
                tips: analysisData,
                words_per_minute: 150,
                word_count: 500,
                recording_duration_seconds: 200,
                video_storage_path: 'path/to/video.webm',
              },
              error: null,
            }),
          }),
        }),
      });

      mockServiceSupabase.storage.from.mockReturnValue({
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed-url.example.com' },
          error: null,
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/results?gameId=game-123',
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
      expect(data.analysis.clarity.score).toBe(8);
      expect(data.analysis.confidence.score).toBe(7);
      expect(data.analysis.word_count).toBe(500);
      expect(data.analysis.words_per_minute).toBe(150);
      expect(data.analysis.duration_seconds).toBe(200);
      expect(data.videoUrl).toBe('https://signed-url.example.com');
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
        'http://localhost/api/game/results?gameId=game-123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Not authorized to access this game');
    });

    it('should return game data for authenticated owner without access token', async () => {
      const analysisData = {
        clarity: {
          base: 5,
          bonuses: ['grammar', 'explained_bridges'],
          penalties: [],
          hard_cap_applied: null,
          score: 9,
          explanation: 'Excellent clarity.',
        },
        confidence: {
          base: 5,
          bonuses: ['steady_pace', 'strong_ending'],
          penalties: [],
          hard_cap_applied: null,
          score: 8,
          explanation: 'Very confident.',
        },
        signals: {
          ending_strength: 'high',
          unifying_frame_present: true,
          transitions_overall: 'high',
          landed_points_overall: 'high',
        },
        signal_feedback: [],
        biggest_fixes: {
          clarity: 'Maintain your excellent performance.',
          confidence: 'Keep finishing strong.',
        },
      };

      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-123',
                user_id: 'user-123',
                access_token: 'token',
                status: 'completed',
                tips: analysisData,
                words_per_minute: 140,
                word_count: 450,
                recording_duration_seconds: 193,
                video_storage_path: null,
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/results?gameId=game-123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe('completed');
      expect(data.analysis.clarity.score).toBe(9);
      expect(data.videoUrl).toBeNull();
    });
  });

  describe('Analysis Format', () => {
    beforeEach(() => {
      mockServerSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'user@example.com' } },
      });
    });

    it('should return checklist-based analysis format', async () => {
      const analysisData = {
        clarity: {
          base: 5,
          bonuses: ['grammar', 'explained_bridges'],
          penalties: [],
          hard_cap_applied: null,
          score: 7,
          explanation: 'Good clarity with clear explanations.',
        },
        confidence: {
          base: 5,
          bonuses: ['steady_pace'],
          penalties: ['fourth_wall'],
          hard_cap_applied: null,
          score: 5,
          explanation: 'Mostly confident.',
        },
        signals: {
          ending_strength: 'medium',
          unifying_frame_present: true,
          transitions_overall: 'medium',
          landed_points_overall: 'medium',
        },
        signal_feedback: [],
        biggest_fixes: {
          clarity: 'Explain more connections.',
          confidence: 'Avoid breaking the fourth wall.',
        },
      };

      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-123',
                user_id: 'user-123',
                access_token: 'token',
                status: 'completed',
                tips: analysisData,
                words_per_minute: 150,
                word_count: 500,
                recording_duration_seconds: 200,
                video_storage_path: null,
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/results?gameId=game-123'
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.analysis.clarity.score).toBe(7);
      expect(data.analysis.confidence.score).toBe(5);
      expect(data.analysis.clarity.bonuses).toEqual([
        'grammar',
        'explained_bridges',
      ]);
      expect(data.analysis.confidence.penalties).toEqual(['fourth_wall']);
      expect(data.analysis.signals.ending_strength).toBe('medium');
      expect(data.analysis.biggest_fixes.clarity).toBe(
        'Explain more connections.'
      );
      // Check computed fields are included
      expect(data.analysis.word_count).toBe(500);
      expect(data.analysis.words_per_minute).toBe(150);
      expect(data.analysis.duration_seconds).toBe(200);
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
        'http://localhost/api/game/results?gameId=nonexistent',
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
      expect(data.notFound).toBe(true);
    });

    it('should return processing status for incomplete games', async () => {
      mockServiceSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-123',
                user_id: null,
                access_token: 'valid-token',
                status: 'processing',
                processing_error: null,
              },
              error: null,
            }),
          }),
        }),
      });

      const request = new NextRequest(
        'http://localhost/api/game/results?gameId=game-123',
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
      expect(data.status).toBe('processing');
      expect(data.analysis).toBeNull();
      expect(data.videoUrl).toBeNull();
    });
  });
});
