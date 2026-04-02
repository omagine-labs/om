import { renderHook, waitFor } from '@testing-library/react';
import { useDesktopAuth, redirectToDesktop } from '@/hooks/useDesktopAuth';
import { createClient } from '@/lib/supabase';
import { trackEvent, AcquisitionEvents } from '@/lib/analytics';

jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/analytics', () => ({
  trackEvent: jest.fn(),
  AcquisitionEvents: {
    DESKTOP_AUTH: 'desktop_auth',
  },
}));

describe('useDesktopAuth', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock auth state change listener
    const mockUnsubscribe = jest.fn();
    const mockAuthStateChange = jest.fn((callback) => {
      // Immediately trigger the callback with SIGNED_IN event
      setTimeout(() => {
        callback('SIGNED_IN', {
          access_token: 'test_token',
          user: { id: 'test-user-id' },
        });
      }, 0);
      return {
        data: { subscription: { unsubscribe: mockUnsubscribe } },
      };
    });

    // Mock Supabase client
    mockSupabase = {
      auth: {
        setSession: jest.fn(),
        getUser: jest.fn(),
        getSession: jest.fn(),
        onAuthStateChange: mockAuthStateChange,
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(),
          })),
        })),
      })),
      functions: {
        invoke: jest.fn(),
      },
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    // Mock window.location (hash and href)
    delete (window as any).location;
    window.location = { href: '', hash: '' } as any;
  });

  describe('when not a desktop auth request', () => {
    it('should return initial state when no tokens provided', () => {
      window.location.hash = '';

      const { result } = renderHook(() => useDesktopAuth());

      expect(result.current).toEqual({
        isDesktopAuth: false,
        intent: null,
        loading: false,
        error: null,
        redirectedToDesktop: false,
      });
    });

    it('should return initial state when source is not desktop', () => {
      // Valid JWT format tokens but source is 'web' not 'desktop'
      window.location.hash =
        '#access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U&refresh_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U&source=web';

      const { result } = renderHook(() => useDesktopAuth());

      expect(result.current).toEqual({
        isDesktopAuth: false,
        intent: null,
        loading: false,
        error: null,
        redirectedToDesktop: false,
      });
    });
  });

  describe('when desktop auth request with invalid intent', () => {
    it('should reject invalid intent values', async () => {
      window.location.hash =
        '#access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U&refresh_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U&source=desktop&intent=malicious_intent';

      const { result } = renderHook(() => useDesktopAuth());

      await waitFor(() => {
        expect(result.current).toEqual({
          isDesktopAuth: true,
          intent: null,
          loading: false,
          error: 'Invalid request parameters',
          redirectedToDesktop: false,
        });
      });

      expect(mockSupabase.auth.setSession).not.toHaveBeenCalled();
    });

    it('should reject invalid token format', async () => {
      window.location.hash =
        '#access_token=not_a_jwt&refresh_token=also_not_a_jwt&source=desktop&intent=subscribe';

      const { result } = renderHook(() => useDesktopAuth());

      await waitFor(() => {
        expect(result.current).toEqual({
          isDesktopAuth: true,
          intent: null,
          loading: false,
          error: 'Invalid authentication tokens',
          redirectedToDesktop: false,
        });
      });

      expect(mockSupabase.auth.setSession).not.toHaveBeenCalled();
    });
  });

  describe('when desktop auth request succeeds', () => {
    beforeEach(() => {
      window.location.hash =
        '#access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U&refresh_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U&source=desktop&intent=subscribe';
    });

    it('should authenticate with tokens and track event', async () => {
      mockSupabase.auth.setSession.mockResolvedValue({ error: null });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
      });
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: null, // No subscription
            }),
          })),
        })),
      });

      const { result } = renderHook(() => useDesktopAuth());

      // Should start loading
      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });

      // Should authenticate with JWT tokens from hash
      await waitFor(() => {
        expect(mockSupabase.auth.setSession).toHaveBeenCalledWith({
          access_token:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
          refresh_token:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
        });
      });

      // Should track analytics event
      await waitFor(() => {
        expect(trackEvent).toHaveBeenCalledWith(
          AcquisitionEvents.DESKTOP_AUTH,
          {
            source: 'desktop',
            intent: 'subscribe',
          }
        );
      });

      // Should finish loading (page will handle redirect)
      await waitFor(() => {
        expect(result.current).toEqual({
          isDesktopAuth: true,
          intent: 'subscribe',
          loading: false,
          error: null,
          redirectedToDesktop: false,
        });
      });
    });

    it('should handle session error', async () => {
      mockSupabase.auth.setSession.mockResolvedValue({
        error: new Error('Invalid token'),
      });

      const { result } = renderHook(() => useDesktopAuth());

      await waitFor(() => {
        expect(result.current).toEqual({
          isDesktopAuth: true,
          intent: 'subscribe',
          loading: false,
          error: 'Invalid token',
          redirectedToDesktop: false,
        });
      });

      expect(trackEvent).not.toHaveBeenCalled();
    });

    it('should redirect to desktop app if user already has subscription', async () => {
      mockSupabase.auth.setSession.mockResolvedValue({ error: null });
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
      });
      mockSupabase.from.mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn().mockResolvedValue({
              data: { status: 'active' },
            }),
          })),
        })),
      });
      // Mock magic link generation
      mockSupabase.functions.invoke.mockResolvedValue({
        data: {
          success: true,
          hashedToken: 'test-magic-token-hash',
          email: 'test@example.com',
        },
        error: null,
      });

      const { result } = renderHook(() => useDesktopAuth());

      await waitFor(
        () => {
          expect(window.location.href).toContain('om://auth/magiclink?');
          expect(window.location.href).toContain('token=test-magic-token-hash');
          expect(window.location.href).toContain('email=test%40example.com');
        },
        { timeout: 3000 }
      );

      // Should finish with loading false, no error, and redirectedToDesktop true
      await waitFor(() => {
        expect(result.current).toEqual({
          isDesktopAuth: true,
          intent: null,
          loading: false,
          error: null,
          redirectedToDesktop: true,
        });
      });
    });
  });
});

describe('redirectToDesktop', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSupabase = {
      auth: {
        getSession: jest.fn(),
      },
      functions: {
        invoke: jest.fn(),
      },
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    // Mock window.location.href
    delete (window as any).location;
    window.location = { href: '' } as any;
  });

  it('should redirect with magic link', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test_access_token',
          refresh_token: 'test_refresh_token',
          expires_at: 1234567890,
        },
      },
    });
    mockSupabase.functions.invoke.mockResolvedValue({
      data: {
        success: true,
        hashedToken: 'test-magic-token',
        email: 'test@example.com',
      },
      error: null,
    });

    await redirectToDesktop();

    await waitFor(() => {
      expect(window.location.href).toContain('om://auth/magiclink?');
      expect(window.location.href).toContain('token=test-magic-token');
      expect(window.location.href).toContain('email=test%40example.com');
    });

    // Verify the edge function was called with correct auth header
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
      'generate-magic-link',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test_access_token',
        },
      }
    );
  });

  it('should handle missing session gracefully', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: null },
    });

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await redirectToDesktop();

    expect(window.location.href).toBe('');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[DesktopAuth] No session found for desktop redirect'
    );

    consoleSpy.mockRestore();
  });

  it('should handle magic link generation error gracefully', async () => {
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test_access_token',
          refresh_token: 'test_refresh_token',
          expires_at: 1234567890,
        },
      },
    });
    mockSupabase.functions.invoke.mockResolvedValue({
      data: null,
      error: new Error('Edge function error'),
    });

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await redirectToDesktop();

    expect(window.location.href).toBe('');
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
