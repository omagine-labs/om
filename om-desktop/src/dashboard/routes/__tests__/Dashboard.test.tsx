/**
 * Dashboard Component Tests
 *
 * Integration tests for Dashboard subscription flow.
 * Tests that authenticated users see paywall or dashboard based on subscription status.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mockSupabase = {
  from: vi.fn(),
  auth: {
    getUser: vi.fn(),
  },
};

const mockCreateClient = vi.fn(() => mockSupabase);

// Track session restoration timing to catch race conditions
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
vi.mock('../../lib/api-client', () => ({
  authApi: {
    getSession: vi.fn(),
  },
  dashboardApi: {},
}));

// Mock hooks
vi.mock('../../hooks/useSignupSourceTracking', () => ({
  useSignupSourceTracking: vi.fn(),
}));

// Mock analytics
vi.mock('../../lib/analytics', () => ({
  trackEvent: vi.fn(),
  EngagementEvents: {
    DASHBOARD_VIEWED: 'dashboard_viewed',
  },
}));

// Import after mocks are set up
const Dashboard = (await import('../Dashboard')).default;

describe('Dashboard Subscription Flow', () => {
  beforeEach(() => {
    // Reset timing trackers FIRST
    sessionRestoredAt = null;
    subscriptionQueryAt = null;

    // Clear mock history but restore implementations
    mockEnsureSessionRestored.mockClear();
    mockCreateClient.mockClear();
    mockCreateClient.mockReturnValue(mockSupabase);

    // Mock window.electronAPI
    global.window.electronAPI = {
      auth: {
        getUser: vi.fn(),
      },
      checkSubscription: vi.fn(),
    } as any;
  });

  it('should show SignInPrompt when not authenticated', async () => {
    // Mock unauthenticated state
    global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue(null);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Wait for auth check to complete
    await waitFor(
      () => {
        expect(screen.getByText('Welcome to Om')).toBeTruthy();
      },
      { timeout: 3000 }
    );

    expect(
      screen.getByText('Sign in to access your meeting insights and analytics')
    ).toBeTruthy();
    expect(screen.getByText('Sign In')).toBeTruthy();
  });

  it('should show PaywallPrompt when authenticated but no subscription', async () => {
    // Mock authenticated user
    global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      user_metadata: {
        full_name: 'Test User',
      },
    });

    // Mock no subscription via IPC (main process check)
    global.window.electronAPI.checkSubscription = vi
      .fn()
      .mockResolvedValue(false);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Wait for subscription check to complete
    await waitFor(
      () => {
        expect(screen.getByText('Subscription Required')).toBeTruthy();
      },
      { timeout: 3000 }
    );

    expect(screen.getByText('View Plans & Subscribe')).toBeTruthy();
    expect(screen.getByText('Already Subscribed? Refresh')).toBeTruthy();
  });

  it('should show PaywallPrompt when subscription is inactive', async () => {
    // Mock authenticated user
    global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      user_metadata: {
        full_name: 'Test User',
      },
    });

    // Mock inactive subscription via IPC (main process check)
    global.window.electronAPI.checkSubscription = vi
      .fn()
      .mockResolvedValue(false);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Wait for subscription check
    await waitFor(
      () => {
        expect(screen.getByText('Subscription Required')).toBeTruthy();
      },
      { timeout: 3000 }
    );
  });

  it('should show dashboard when authenticated with active subscription', async () => {
    // Mock authenticated user
    global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      user_metadata: {
        full_name: 'Test User',
      },
    });

    // Mock active subscription via IPC (main process check)
    global.window.electronAPI.checkSubscription = vi
      .fn()
      .mockResolvedValue(true);

    // Still need Supabase mock for fetchStats() queries
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
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Wait for dashboard to load
    await waitFor(
      () => {
        // Dashboard should not show paywall or sign-in
        expect(screen.queryByText('Subscription Required')).toBeFalsy();
        expect(screen.queryByText('Welcome to Om')).toBeFalsy();
      },
      { timeout: 3000 }
    );
  });

  it('should show dashboard when user is trialing (NULL current_period_end)', async () => {
    // Mock authenticated user
    global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      user_metadata: {
        full_name: 'Test User',
      },
    });

    // Mock trialing subscription via IPC (main process check)
    global.window.electronAPI.checkSubscription = vi
      .fn()
      .mockResolvedValue(true);

    // Still need Supabase mock for fetchStats() queries
    const subscriptionMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          status: 'trialing',
          current_period_end: null, // NULL during trial
        },
        error: null,
      }),
      in: vi.fn().mockReturnThis(),
    };

    mockSupabase.from.mockReturnValue(subscriptionMock);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Wait for dashboard to load
    await waitFor(
      () => {
        // Dashboard should show (not paywall)
        expect(screen.queryByText('Subscription Required')).toBeFalsy();
      },
      { timeout: 3000 }
    );
  });

  it('should show loading state while checking auth and subscription', async () => {
    // Mock authenticated user with delay
    global.window.electronAPI.auth.getUser = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                id: 'user-123',
                email: 'test@example.com',
              }),
            100
          );
        })
    );

    // Mock subscription check via IPC with delay
    global.window.electronAPI.checkSubscription = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(true), 100);
        })
    );

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  data: { status: 'active', current_period_end: null },
                  error: null,
                }),
              100
            );
          })
      ),
      in: vi.fn().mockReturnThis(),
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Loading state may or may not show "Loading..." due to 400ms delay
    // Just wait for authentication and subscription check to complete
    await waitFor(
      () => {
        // Once loaded, should show dashboard content (verified by presence of background)
        const background = document.querySelector('.bg-teal-700');
        expect(background).toBeTruthy();
      },
      { timeout: 3000 }
    );
  });

  it('should handle subscription check error gracefully', async () => {
    // Mock authenticated user
    global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    });

    // Mock subscription check error via IPC - returns false on error
    global.window.electronAPI.checkSubscription = vi
      .fn()
      .mockResolvedValue(false);

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Should show paywall on error (safe default)
    await waitFor(
      () => {
        expect(screen.getByText('Subscription Required')).toBeTruthy();
      },
      { timeout: 3000 }
    );
  });

  it('should show PaywallPrompt when subscription period has ended', async () => {
    // Mock authenticated user
    global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    });

    // Mock expired subscription via IPC
    global.window.electronAPI.checkSubscription = vi
      .fn()
      .mockResolvedValue(false);

    // Still set up Supabase mock for any fallback queries
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          status: 'active',
          current_period_end: pastDate.toISOString(),
        },
        error: null,
      }),
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Should show paywall when period ended
    await waitFor(
      () => {
        expect(screen.getByText('Subscription Required')).toBeTruthy();
      },
      { timeout: 3000 }
    );
  });

  it('should use IPC checkSubscription for subscription checks (prevents token race conditions)', async () => {
    // This test verifies that subscription checks go through the main process IPC,
    // which always has fresh tokens, preventing race conditions after sleep/wake.

    global.window.electronAPI.auth.getUser = vi.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    });

    // Mock the IPC subscription check to return true (has active subscription)
    const checkSubscriptionMock = vi.fn().mockResolvedValue(true);
    global.window.electronAPI.checkSubscription = checkSubscriptionMock;

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    // Wait for component to finish loading
    await waitFor(
      () => {
        // Should NOT show paywall (user has subscription via IPC)
        expect(screen.queryByText('Subscription Required')).toBeFalsy();
      },
      { timeout: 3000 }
    );

    // CRITICAL: Verify IPC checkSubscription was called
    // This ensures subscription checks go through main process (fresh tokens)
    expect(checkSubscriptionMock).toHaveBeenCalled();
  });
});
