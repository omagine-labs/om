/**
 * Integration tests for Next.js middleware
 * Tests authentication, route protection, and subscription paywall enforcement
 */

import { NextResponse } from 'next/server';
import { middleware } from '@/middleware';
import { OM_USER_ACCESS, GAME_ONLY_ACCESS } from '@/lib/constants/app-access';

// Mock Supabase SSR
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}));

// Mock config
jest.mock('@/lib/config', () => ({
  getSupabaseUrl: jest.fn(() => 'http://localhost:54321'),
  getSupabaseAnonKey: jest.fn(() => 'test-anon-key'),
}));

// Mock domain module with manual control
let mockIsGameDomain = false;
jest.mock('@/lib/domain', () => ({
  isGameDomain: jest.fn(() => mockIsGameDomain),
  GAME_DOMAINS: ['blindsli.de', 'www.blindsli.de'],
}));

import { createServerClient } from '@supabase/ssr';
import { isGameDomain } from '@/lib/domain';

// Create mock request type that matches what middleware expects
interface MockNextRequest {
  nextUrl: {
    pathname: string;
    searchParams: URLSearchParams;
    clone: () => MockNextURL;
  };
  cookies: {
    getAll: () => Array<{ name: string; value: string }>;
    set: (name: string, value: string) => void;
  };
  headers: Headers;
}

interface MockNextURL {
  pathname: string;
  searchParams: URLSearchParams;
}

describe('Middleware', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default Supabase mock
    mockSupabase = {
      auth: {
        getUser: jest.fn(),
      },
      from: jest.fn(),
    };

    (createServerClient as jest.Mock).mockImplementation(() => mockSupabase);
  });

  // Helper to create mock NextRequest
  function createMockRequest(
    pathname: string,
    cookies: Record<string, string> = {},
    host: string = 'localhost:3000'
  ): MockNextRequest {
    const cookieArray = Object.entries(cookies).map(([name, value]) => ({
      name,
      value,
    }));
    const url = new URL(`http://${host}${pathname}`);

    // Create proper Headers instance
    const headers = new Headers();
    headers.set('host', host);

    return {
      nextUrl: {
        pathname,
        searchParams: url.searchParams,
        clone: () => {
          const clonedUrl = new URL(`http://${host}${pathname}`);
          return clonedUrl as any;
        },
      },
      cookies: {
        getAll: () => cookieArray,
        set: jest.fn(),
      },
      headers,
    };
  }

  describe('Public routes (unauthenticated access)', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });
    });

    it('should allow access to landing page', async () => {
      const request = createMockRequest('/');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should allow access to login page', async () => {
      const request = createMockRequest('/login');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should allow access to signup page', async () => {
      const request = createMockRequest('/signup');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should allow access to privacy page', async () => {
      const request = createMockRequest('/privacy');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should allow access to terms page', async () => {
      const request = createMockRequest('/terms');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should allow access to API routes', async () => {
      const request = createMockRequest('/api/subscriptions/current');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should allow access to auth callback routes', async () => {
      const request = createMockRequest('/auth/callback');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('Protected routes (require authentication)', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });
    });

    it('should redirect to /login when accessing /dashboard without auth', async () => {
      const request = createMockRequest('/dashboard');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/login'
      );
    });

    it('should redirect to /login when accessing /settings without auth', async () => {
      const request = createMockRequest('/settings');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/login'
      );
    });

    it('should redirect to /signup when accessing /paywall without auth', async () => {
      const request = createMockRequest('/paywall');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/signup'
      );
    });
  });

  describe('Authenticated users without subscription', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'test-user-id',
                has_active_subscription: false,
                app_access: OM_USER_ACCESS,
              },
              error: null,
            }),
          }),
        }),
      });
    });

    it('should redirect to /paywall when accessing /dashboard', async () => {
      const request = createMockRequest('/dashboard');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/paywall'
      );
    });

    it('should redirect to /paywall when accessing /settings', async () => {
      const request = createMockRequest('/settings');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/paywall'
      );
    });

    it('should allow access to /paywall', async () => {
      const request = createMockRequest('/paywall');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should redirect to /paywall when accessing /login', async () => {
      const request = createMockRequest('/login');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/paywall'
      );
    });

    it('should redirect to /paywall when accessing /signup', async () => {
      const request = createMockRequest('/signup');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/paywall'
      );
    });
  });

  describe('Authenticated users with active subscription', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'test-user-id',
                has_active_subscription: true,
                app_access: OM_USER_ACCESS,
              },
              error: null,
            }),
          }),
        }),
      });
    });

    it('should allow access to /dashboard', async () => {
      const request = createMockRequest('/dashboard');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should allow access to /settings', async () => {
      const request = createMockRequest('/settings');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should redirect to /dashboard when accessing /login', async () => {
      const request = createMockRequest('/login');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/dashboard'
      );
    });

    it('should redirect to /dashboard when accessing /signup', async () => {
      const request = createMockRequest('/signup');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/dashboard'
      );
    });
  });

  describe('Session refresh', () => {
    it('should refresh session for authenticated users', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'test-user-id', email: 'test@example.com' },
        },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'test-user-id',
                has_active_subscription: true,
                app_access: OM_USER_ACCESS,
              },
              error: null,
            }),
          }),
        }),
      });

      const request = createMockRequest('/dashboard', {
        'sb-access-token': 'test-token',
        'sb-refresh-token': 'test-refresh',
      });

      const response = await middleware(request);

      // Verify Supabase getUser was called (session refresh)
      expect(mockSupabase.auth.getUser).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });
  });

  describe('Game-only users', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'game-user-id', email: 'game@example.com' },
        },
        error: null,
      });

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: {
                id: 'game-user-id',
                has_active_subscription: false,
                app_access: GAME_ONLY_ACCESS,
              },
              error: null,
            }),
          }),
        }),
      });
    });

    it('should redirect game-only users to /game when accessing /dashboard', async () => {
      const request = createMockRequest('/dashboard');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/game'
      );
    });

    it('should redirect game-only users to /game when accessing /login', async () => {
      const request = createMockRequest('/login');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/game'
      );
    });

    it('should allow game-only users to access /paywall for Om signup', async () => {
      const request = createMockRequest('/paywall');

      const response = await middleware(request);

      // Game-only users can access paywall to sign up for Om
      expect(response.status).toBe(200);
    });

    it('should redirect game-only users to /game/history when accessing /game/login', async () => {
      const request = createMockRequest('/game/login');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/game/history'
      );
    });

    it('should allow game-only users to access /game', async () => {
      const request = createMockRequest('/game');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should allow game-only users to access /game/history', async () => {
      const request = createMockRequest('/game/history');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });
  });

  describe('Game domain routing (blindsli.de)', () => {
    beforeEach(() => {
      // Enable game domain behavior
      mockIsGameDomain = true;
      (isGameDomain as jest.Mock).mockImplementation(() => true);

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });
    });

    afterEach(() => {
      // Reset to default behavior
      mockIsGameDomain = false;
      (isGameDomain as jest.Mock).mockImplementation(() => false);
    });

    it('should redirect root path to /game on game domain', async () => {
      const request = createMockRequest('/', {}, 'blindsli.de');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://blindsli.de/game');
    });

    it('should redirect /login to /game/login on game domain', async () => {
      const request = createMockRequest('/login', {}, 'blindsli.de');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://blindsli.de/game/login'
      );
    });

    it('should redirect /signup to /game/signup on game domain', async () => {
      const request = createMockRequest('/signup', {}, 'blindsli.de');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://blindsli.de/game/signup'
      );
    });

    it('should redirect /dashboard to /game on game domain', async () => {
      const request = createMockRequest('/dashboard', {}, 'blindsli.de');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://blindsli.de/game');
    });

    it('should redirect /settings to /game on game domain', async () => {
      const request = createMockRequest('/settings', {}, 'blindsli.de');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://blindsli.de/game');
    });

    it('should redirect /paywall to /game on game domain', async () => {
      const request = createMockRequest('/paywall', {}, 'blindsli.de');

      const response = await middleware(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://blindsli.de/game');
    });

    it('should allow access to /game on game domain', async () => {
      const request = createMockRequest('/game', {}, 'blindsli.de');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should allow access to /game/login on game domain (unauthenticated)', async () => {
      const request = createMockRequest('/game/login', {}, 'blindsli.de');

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });

    it('should allow access to /game/results on game domain', async () => {
      const request = createMockRequest(
        '/game/results/test-id',
        {},
        'blindsli.de'
      );

      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    });
  });
});
