/**
 * App Component Integration Tests
 *
 * Tests AppLayout component with focus on:
 * - Sidebar visibility based on subscription status
 * - Session restoration timing
 * - OAuth sign-in flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn(),
  },
};

const mockCreateClient = vi.fn(() => mockSupabase);

// Track if session was restored before queries
let sessionRestoredAt: number | null = null;
let subscriptionQueryAt: number | null = null;

const mockEnsureSessionRestored = vi.fn(async () => {
  // Simulate real IPC timing (50ms delay)
  await new Promise((resolve) => setTimeout(resolve, 50));
  sessionRestoredAt = Date.now();
  console.log(
    '[Mock] ensureSessionRestored called, set timestamp:',
    sessionRestoredAt
  );
});

// Mock Supabase client using alias (same as component imports)
vi.mock('@/lib/supabase', () => ({
  createClient: mockCreateClient,
  ensureSessionRestored: mockEnsureSessionRestored,
}));

// Mock API client
vi.mock('../lib/api-client', () => ({
  authApi: {
    getSession: vi.fn().mockResolvedValue(null),
    getCurrentUser: vi.fn().mockResolvedValue(null),
  },
  userApi: {
    getUserFullName: vi.fn().mockResolvedValue({ success: true, data: null }),
  },
  dashboardApi: {},
}));

// Mock hooks
vi.mock('../hooks/useSignupSourceTracking', () => ({
  useSignupSourceTracking: vi.fn(),
}));

// Mock analytics
vi.mock('../lib/analytics', () => ({
  trackEvent: vi.fn(),
  EngagementEvents: {
    DASHBOARD_VIEWED: 'dashboard_viewed',
  },
}));

// Mock Intercom
vi.mock('../lib/intercom', () => ({
  intercom: {
    init: vi.fn(),
    bootWithJWT: vi.fn(),
    shutdown: vi.fn(),
  },
}));

// Mock PostHog
vi.mock('../lib/posthog', () => ({
  analytics: {
    identify: vi.fn(),
    reset: vi.fn(),
  },
}));

// Mock config
vi.mock('../lib/config', () => ({
  getWebAppUrl: vi.fn().mockReturnValue('http://localhost:3000'),
}));

// Import after mocks
const App = (await import('../App')).default;

describe('App Integration Tests', () => {
  beforeEach(() => {
    // Reset timing trackers FIRST
    sessionRestoredAt = null;
    subscriptionQueryAt = null;

    // Clear mock history but restore implementations
    mockEnsureSessionRestored.mockClear();
    mockCreateClient.mockClear();
    mockCreateClient.mockReturnValue(mockSupabase);

    // Mock window.electronAPI with default implementations
    global.window.electronAPI = {
      auth: {
        getUser: vi.fn().mockResolvedValue(null),
      },
      checkSubscription: vi.fn().mockResolvedValue(false),
    } as any;
  });

  describe('Sidebar Visibility', () => {
    it('should show sidebar when user has active subscription', async () => {
      // Mock authenticated user
      global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {
          full_name: 'Test User',
        },
      });

      // Mock active subscription (AppLayout uses window.electronAPI.checkSubscription)
      global.window.electronAPI.checkSubscription = vi
        .fn()
        .mockResolvedValue(true);

      // Also mock Supabase queries for Dashboard component
      const subscriptionMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            status: 'active',
            current_period_end: new Date(Date.now() + 86400000).toISOString(),
          },
          error: null,
        }),
        in: vi.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(subscriptionMock);

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <App />
        </MemoryRouter>
      );

      // Wait for sidebar to appear (check for user email first)
      await waitFor(
        () => {
          expect(screen.getByText('test@example.com')).toBeTruthy();
        },
        { timeout: 3000 }
      );

      // Sidebar should have navigation links (sidebar shows "Home" for dashboard)
      expect(screen.getByText('Home')).toBeTruthy();
      expect(screen.getByText('Meetings')).toBeTruthy();
    });

    it('should NOT show sidebar when user has no subscription', async () => {
      // Mock authenticated user
      global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        user_metadata: {
          full_name: 'Test User',
        },
      });

      // Mock no subscription
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <App />
        </MemoryRouter>
      );

      // Wait for paywall to appear
      await waitFor(
        () => {
          expect(screen.getByText('Subscription Required')).toBeTruthy();
        },
        { timeout: 3000 }
      );

      // Sidebar should NOT be visible (no Home/Meetings links)
      expect(screen.queryByText('Home')).toBeFalsy();
      expect(screen.queryByText('Meetings')).toBeFalsy();
    });

    it('should NOT show sidebar when user is not authenticated', async () => {
      // Mock unauthenticated state
      global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue(null);

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <App />
        </MemoryRouter>
      );

      // Wait for sign-in prompt
      await waitFor(
        () => {
          expect(screen.getByText('Welcome to Om')).toBeTruthy();
        },
        { timeout: 3000 }
      );

      // Sidebar should NOT be visible
      expect(screen.queryByText('Home')).toBeFalsy();
      expect(screen.queryByText('Meetings')).toBeFalsy();
    });
  });

  describe('Session Restoration', () => {
    it('should use IPC checkSubscription to prevent token race conditions', async () => {
      // This regression test verifies that subscription checks go through the main process
      // IPC handler, which always has fresh tokens, preventing race conditions after sleep/wake

      global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const checkSubscriptionMock = vi.fn().mockResolvedValue(true);
      global.window.electronAPI.checkSubscription = checkSubscriptionMock;

      const subscriptionMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            status: 'active',
            current_period_end: new Date(Date.now() + 86400000).toISOString(),
          },
          error: null,
        }),
        in: vi.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(subscriptionMock);

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <App />
        </MemoryRouter>
      );

      // Wait for component to finish loading
      await waitFor(
        () => {
          expect(screen.queryByText('Subscription Required')).toBeFalsy();
        },
        { timeout: 3000 }
      );

      // Verify IPC checkSubscription was called (main process has fresh tokens)
      expect(checkSubscriptionMock).toHaveBeenCalled();
    });
  });

  describe('OAuth Sign-In Flow', () => {
    it('should show sidebar after OAuth completes and window regains focus', async () => {
      // REALISTIC SCENARIO:
      // 1. App starts, no user yet (getUser returns null)
      // 2. User clicks "Sign In", completes OAuth in browser
      // 3. Window regains focus
      // 4. AppLayout should re-check auth and show sidebar

      // Initially: No user (app just started)
      const getUserMock = vi.fn().mockResolvedValue(null);
      global.window.electronAPI.auth.getUser = getUserMock;

      global.window.electronAPI.checkSubscription = vi
        .fn()
        .mockResolvedValue(false);

      // Mock Dashboard subscription queries (initially no subscription)
      const subscriptionMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
        in: vi.fn().mockReturnThis(),
      };
      mockSupabase.from.mockReturnValue(subscriptionMock);

      // Render app - initially unauthenticated
      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <App />
        </MemoryRouter>
      );

      // Should show sign-in prompt initially
      await waitFor(
        () => {
          expect(screen.getByText('Welcome to Om')).toBeTruthy();
        },
        { timeout: 3000 }
      );

      // Sidebar should NOT show
      expect(screen.queryByText('Home')).toBeFalsy();
      expect(screen.queryByText('Meetings')).toBeFalsy();

      // === SIMULATE OAUTH COMPLETION ===
      // User completed OAuth in browser, session now exists
      getUserMock.mockResolvedValue({
        id: 'user-123',
        email: 'oauth@example.com',
        user_metadata: {
          full_name: 'OAuth User',
        },
      });

      global.window.electronAPI.checkSubscription = vi
        .fn()
        .mockResolvedValue(true);

      // Update subscription mock to return active subscription
      subscriptionMock.maybeSingle.mockResolvedValue({
        data: {
          status: 'trialing',
          current_period_end: null,
        },
        error: null,
      });

      // === SIMULATE WINDOW REGAINING FOCUS ===
      // This is what happens when user comes back from browser after OAuth
      window.dispatchEvent(new Event('focus'));

      // EXPECTED BEHAVIOR: Sidebar should now appear
      // This test will FAIL until we restore AppLayout's focus handler
      await waitFor(
        () => {
          expect(screen.getByText('oauth@example.com')).toBeTruthy();
          expect(screen.getByText('Home')).toBeTruthy();
          expect(screen.getByText('Meetings')).toBeTruthy();
        },
        { timeout: 3000 }
      );

      // Should NOT show sign-in prompt anymore
      expect(screen.queryByText('Welcome to Om')).toBeFalsy();
    });

    it('should show sidebar after successful OAuth sign-in with active subscription', async () => {
      // Simulate OAuth redirect: user comes back after signing in
      global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'oauth@example.com',
        user_metadata: {
          full_name: 'OAuth User',
        },
      });

      // Simulate the checkSubscription IPC handler with the FIX
      // After the fix, it sets the session on the main process Supabase client
      // Then queries subscription status successfully
      global.window.electronAPI.checkSubscription = vi
        .fn()
        .mockImplementation(async () => {
          // Simulate: session is set on main process Supabase client (the fix!)
          // Now query should return subscription data
          const mockMainProcessSupabase = {
            from: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({
                data: {
                  status: 'trialing',
                  current_period_end: null,
                },
                error: null,
              }),
            }),
          };

          const { data, error } = await mockMainProcessSupabase
            .from('subscriptions')
            .select('status')
            .eq('user_id', 'user-123')
            .single();

          if (error) {
            console.log('[Test] Subscription query failed:', error);
            return false;
          }

          const activeStatuses = ['active', 'trialing'];
          return data && activeStatuses.includes(data.status); // Will return TRUE
        });

      // Mock subscription data for Dashboard component queries (these work fine)
      const subscriptionMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            status: 'trialing',
            current_period_end: null,
          },
          error: null,
        }),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            status: 'trialing',
            current_period_end: null,
          },
          error: null,
        }),
        in: vi.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(subscriptionMock);

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <App />
        </MemoryRouter>
      );

      // BEHAVIOR TEST: Sidebar should show with user info and navigation
      await waitFor(
        () => {
          // Check for user email in sidebar
          expect(screen.getByText('oauth@example.com')).toBeTruthy();
          // Check for navigation links in sidebar
          expect(screen.getByText('Home')).toBeTruthy();
          expect(screen.getByText('Meetings')).toBeTruthy();
        },
        { timeout: 3000 }
      );

      // Should NOT show paywall
      expect(screen.queryByText('Subscription Required')).toBeFalsy();
    });

    it('should show paywall (not sidebar) after OAuth if user has no subscription', async () => {
      // User authenticated via OAuth but no subscription
      global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
        id: 'user-456',
        email: 'newuser@example.com',
      });

      // No subscription found
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });

      render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <App />
        </MemoryRouter>
      );

      // Should show paywall
      await waitFor(
        () => {
          expect(screen.getByText('Subscription Required')).toBeTruthy();
        },
        { timeout: 3000 }
      );

      // Sidebar should NOT be visible
      expect(screen.queryByText('Home')).toBeFalsy();
      expect(screen.queryByText('Meetings')).toBeFalsy();

      // User email should NOT be in sidebar (sidebar hidden)
      expect(screen.queryByText('newuser@example.com')).toBeFalsy();
    });
  });
});
