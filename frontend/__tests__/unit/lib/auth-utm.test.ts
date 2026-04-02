/**
 * UTM Tracking Tests for Authentication Flow
 *
 * These tests ensure UTM parameters are correctly tracked during signup
 * to prevent attribution data loss. Critical for marketing analytics.
 */

import { signUp } from '@/lib/auth';
import * as supabaseModule from '@/lib/supabase';
import * as analyticsModule from '@/lib/analytics';

// Mock Supabase
jest.mock('@/lib/supabase');

// Mock analytics
jest.mock('@/lib/analytics');

describe('auth.ts - UTM Tracking', () => {
  let mockSupabaseClient: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Spy on console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    });

    // Setup Supabase mock
    mockSupabaseClient = {
      auth: {
        signUp: jest.fn(),
      },
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    };

    (supabaseModule.createClient as jest.Mock).mockReturnValue(
      mockSupabaseClient
    );

    // Mock analytics functions
    (analyticsModule.identifyUser as jest.Mock).mockImplementation(() => {});
    (analyticsModule.trackEvent as jest.Mock).mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('signUp() with UTM parameters', () => {
    /**
     * CRITICAL TEST: UTM Attribution Tracking
     * When user signs up with UTM params in localStorage,
     * both signup_completed AND signup_source events must be tracked
     */
    it('should track signup_source event when UTM data exists', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      });

      // Mock localStorage with UTM data
      (window.localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify({
          source: 'twitter',
          campaign: 'launch2024',
          medium: 'social',
        })
      );

      await signUp('test@example.com', 'password123');

      // Should track both events
      expect(analyticsModule.trackEvent).toHaveBeenCalledWith(
        'signup_completed',
        { method: 'email' }
      );

      expect(analyticsModule.trackEvent).toHaveBeenCalledWith('signup_source', {
        source: 'twitter',
        campaign: 'launch2024',
        medium: 'social',
      });

      // Should clean up localStorage
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('signup_utm');
    });

    /**
     * REGRESSION TEST: Partial UTM Data
     * Users may land with only utm_source, no campaign/medium
     * Must still track with undefined values for missing params
     */
    it('should track signup_source with only utm_source', async () => {
      const mockUser = {
        id: 'user-456',
        email: 'test2@example.com',
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      });

      (window.localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify({
          source: 'google',
        })
      );

      await signUp('test2@example.com', 'password123');

      expect(analyticsModule.trackEvent).toHaveBeenCalledWith('signup_source', {
        source: 'google',
        campaign: undefined,
        medium: undefined,
      });
    });

    /**
     * CRITICAL TEST: No UTM Data
     * When no UTM params, should NOT track signup_source
     * Prevents pollution of attribution data
     */
    it('should NOT track signup_source when no UTM data exists', async () => {
      const mockUser = {
        id: 'user-789',
        email: 'test3@example.com',
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      });

      // No UTM data
      (window.localStorage.getItem as jest.Mock).mockReturnValue(null);

      await signUp('test3@example.com', 'password123');

      // Should track signup_completed
      expect(analyticsModule.trackEvent).toHaveBeenCalledWith(
        'signup_completed',
        { method: 'email' }
      );

      // Should NOT track signup_source
      const calls = (analyticsModule.trackEvent as jest.Mock).mock.calls;
      expect(calls.some((call) => call[0] === 'signup_source')).toBe(false);
    });

    /**
     * REGRESSION TEST: Empty Source Value
     * If utm_source is empty string, should NOT track
     * Prevents bad data: { source: '', campaign: 'test' }
     */
    it('should NOT track signup_source when source is empty string', async () => {
      const mockUser = {
        id: 'user-empty',
        email: 'empty@example.com',
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      });

      (window.localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify({
          source: '',
          campaign: 'launch2024',
        })
      );

      await signUp('empty@example.com', 'password123');

      // Should still clean up localStorage
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('signup_utm');

      // Should NOT track signup_source with empty source
      const calls = (analyticsModule.trackEvent as jest.Mock).mock.calls;
      expect(calls.some((call) => call[0] === 'signup_source')).toBe(false);
    });

    /**
     * CRITICAL RESILIENCE TEST: Invalid JSON
     * If localStorage has corrupted data, signup should still work
     * Analytics failure must not break authentication
     */
    it('should handle invalid JSON in localStorage gracefully', async () => {
      const mockUser = {
        id: 'user-999',
        email: 'test-json@example.com',
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      });

      // Invalid JSON
      (window.localStorage.getItem as jest.Mock).mockReturnValue(
        'invalid json {{'
      );

      const result = await signUp('test-json@example.com', 'password123');

      // Signup should still succeed
      expect(result.error).toBeNull();
      expect(result.data?.user).toBeDefined();

      // Should log error but not throw
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    /**
     * CRITICAL RESILIENCE TEST: UTM Tracking Errors
     * If UTM tracking fails (bad JSON, trackEvent error in UTM block),
     * signup must still succeed. The try/catch wraps UTM tracking only.
     * Note: trackEvent itself has internal error handling and won't throw,
     * but this tests the extra safety layer in auth.ts
     */
    it('should handle UTM tracking errors gracefully', async () => {
      const mockUser = {
        id: 'user-error',
        email: 'error@example.com',
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      });

      // Make localStorage.getItem throw (simulates localStorage corruption)
      (window.localStorage.getItem as jest.Mock).mockImplementation(() => {
        throw new Error('localStorage is corrupted');
      });

      const result = await signUp('error@example.com', 'password123');

      // Signup should still succeed despite UTM tracking error
      expect(result.error).toBeNull();
      expect(result.data?.user).toBeDefined();

      // Should have logged error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Analytics] Failed to track signup source:',
        expect.any(Error)
      );
    });

    /**
     * TEST: User Identification
     * Verify user is identified with correct properties
     */
    it('should identify user with email and created_at', async () => {
      const mockUser = {
        id: 'user-identify',
        email: 'identify@example.com',
        created_at: '2024-01-01T00:00:00Z',
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      });

      (window.localStorage.getItem as jest.Mock).mockReturnValue(null);

      await signUp('identify@example.com', 'password123');

      expect(analyticsModule.identifyUser).toHaveBeenCalledWith(
        'user-identify',
        {
          email: 'identify@example.com',
          created_at: '2024-01-01T00:00:00Z',
        }
      );
    });

    /**
     * EDGE CASE: Signup Failure
     * If signup fails, should NOT track any analytics events
     */
    it('should NOT track events when signup fails', async () => {
      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: null,
        error: { message: 'Email already exists' },
      });

      (window.localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify({ source: 'twitter' })
      );

      const result = await signUp('existing@example.com', 'password123');

      expect(result.error).toBeDefined();

      // Should NOT track any events on failure
      expect(analyticsModule.trackEvent).not.toHaveBeenCalled();
      expect(analyticsModule.identifyUser).not.toHaveBeenCalled();
    });
  });

  describe('UTM data cleanup', () => {
    /**
     * CRITICAL TEST: localStorage Cleanup
     * After tracking (or determining no tracking needed),
     * must remove signup_utm to prevent re-tracking
     */
    it('should always remove signup_utm from localStorage', async () => {
      const mockUser = {
        id: 'user-cleanup',
        email: 'cleanup@example.com',
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      });

      (window.localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify({ source: 'facebook' })
      );

      await signUp('cleanup@example.com', 'password123');

      // Verify cleanup happened
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('signup_utm');
    });

    it('should clean up even when source is empty', async () => {
      const mockUser = {
        id: 'user-cleanup2',
        email: 'cleanup2@example.com',
        created_at: new Date().toISOString(),
      };

      mockSupabaseClient.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: null },
        error: null,
      });

      (window.localStorage.getItem as jest.Mock).mockReturnValue(
        JSON.stringify({ source: '', campaign: 'test' })
      );

      await signUp('cleanup2@example.com', 'password123');

      // Should still clean up even though we didn't track
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('signup_utm');
    });
  });
});
