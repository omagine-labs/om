/**
 * useIntercomIdentify Hook Tests
 *
 * These tests ensure Intercom is only initialized for authenticated users
 * and prevents duplicate anonymous contacts from being created.
 *
 * Critical for preventing duplicate Intercom contacts and ensuring
 * secure JWT-based identity verification.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useIntercomIdentify } from '@/hooks/useIntercomIdentify';
import { createClient } from '@/lib/supabase';
import { intercom } from '@/lib/intercom';

// Mock Supabase client
jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
}));

// Mock Intercom library
jest.mock('@/lib/intercom', () => ({
  intercom: {
    init: jest.fn(),
    bootWithJWT: jest.fn(),
  },
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('useIntercomIdentify Hook', () => {
  let mockSupabase: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Supabase client
    mockSupabase = {
      auth: {
        getUser: jest.fn(),
      },
    };
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authenticated user identification', () => {
    /**
     * CRITICAL TEST: Authenticated User Flow
     * When user is authenticated, should initialize Intercom and boot with JWT
     */
    it('should initialize Intercom and boot with JWT for authenticated users', async () => {
      // Mock authenticated user
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
          },
        },
      });

      // Mock successful JWT fetch
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          token: 'jwt-token-123',
        }),
      });

      renderHook(() => useIntercomIdentify());

      await waitFor(() => {
        expect(intercom.init).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/intercom/jwt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      });

      await waitFor(() => {
        expect(intercom.bootWithJWT).toHaveBeenCalledWith('jwt-token-123');
      });
    });
  });

  describe('Unauthenticated user handling', () => {
    /**
     * CRITICAL TEST: Prevent Duplicate Anonymous Contacts
     * When user is NOT authenticated, should NOT initialize Intercom
     * This prevents creating duplicate anonymous contacts
     */
    it('should NOT initialize Intercom when user is not authenticated', async () => {
      // Mock unauthenticated user (null)
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: null,
        },
      });

      renderHook(() => useIntercomIdentify());

      await waitFor(() => {
        expect(mockSupabase.auth.getUser).toHaveBeenCalled();
      });

      // Wait to ensure no Intercom calls are made
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(intercom.init).not.toHaveBeenCalled();
      expect(intercom.bootWithJWT).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('JWT fetch error handling', () => {
    /**
     * REGRESSION TEST: Failed JWT Fetch
     * When JWT fetch fails, should not crash and should log error
     */
    it('should handle JWT fetch failure gracefully', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
          },
        },
      });

      // Mock failed JWT fetch (HTTP error)
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      renderHook(() => useIntercomIdentify());

      await waitFor(() => {
        expect(intercom.init).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Intercom] Failed to fetch JWT token:',
          'Internal Server Error'
        );
      });

      // Should NOT boot Intercom without valid JWT
      expect(intercom.bootWithJWT).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    /**
     * REGRESSION TEST: Invalid JWT Response
     * When JWT response is invalid (missing token), should not boot Intercom
     */
    it('should handle invalid JWT response (missing token)', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
          },
        },
      });

      // Mock JWT fetch with invalid response (success: false)
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: false,
          token: null,
        }),
      });

      renderHook(() => useIntercomIdentify());

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Intercom] Invalid JWT response:',
          { success: false, token: null }
        );
      });

      // Should NOT boot Intercom without valid JWT
      expect(intercom.bootWithJWT).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    /**
     * REGRESSION TEST: Network Error
     * When fetch throws network error, should handle gracefully
     */
    it('should handle network errors during JWT fetch', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
          },
        },
      });

      // Mock network error
      const networkError = new Error('Network request failed');
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      renderHook(() => useIntercomIdentify());

      await waitFor(() => {
        expect(intercom.init).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Intercom] Error fetching JWT token:',
          networkError
        );
      });

      // Should NOT boot Intercom when fetch fails
      expect(intercom.bootWithJWT).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Idempotency and duplicate prevention', () => {
    /**
     * CRITICAL TEST: Single Initialization
     * Hook should only run once per mount (useEffect with empty deps)
     * Verifies that Intercom.init() and bootWithJWT() are only called once
     */
    it('should only initialize Intercom once per hook mount', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
          },
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          token: 'jwt-token-123',
        }),
      });

      const { rerender } = renderHook(() => useIntercomIdentify());

      await waitFor(() => {
        expect(intercom.init).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(intercom.bootWithJWT).toHaveBeenCalledTimes(1);
      });

      // Rerender the hook (simulates React re-renders)
      rerender();

      // Wait to ensure no additional calls
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should still only be called once (useEffect has empty deps)
      expect(intercom.init).toHaveBeenCalledTimes(1);
      expect(intercom.bootWithJWT).toHaveBeenCalledTimes(1);
    });

    /**
     * INTEGRATION TEST: Verify bootWithJWT Idempotency
     * Even if bootWithJWT is called multiple times, the intercom.ts implementation
     * should prevent duplicate boots (tested in intercom.ts unit tests)
     *
     * This test verifies that the hook only calls bootWithJWT once,
     * so the idempotency in intercom.ts acts as a safety net
     */
    it('should rely on bootWithJWT idempotency as safety mechanism', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
          },
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          token: 'jwt-token-123',
        }),
      });

      renderHook(() => useIntercomIdentify());

      await waitFor(() => {
        expect(intercom.bootWithJWT).toHaveBeenCalledTimes(1);
      });

      // The hook itself prevents duplicate calls via useEffect empty deps
      // intercom.bootWithJWT idempotency (checked in intercom.ts tests) is a safety net
      expect(intercom.bootWithJWT).toHaveBeenCalledWith('jwt-token-123');
    });
  });

  describe('User authentication state changes', () => {
    /**
     * NOTE: Auth State Changes
     * In practice, when a user logs in/out, AuthLayoutClient component unmounts/remounts
     * causing the hook to re-run. This is the intended behavior.
     *
     * When user logs out, intercom.shutdown() is called (tested separately)
     * When user logs back in, hook runs fresh and identifies new user
     */
    it('should handle fresh mount after user authentication', async () => {
      // Simulate user logging in (fresh mount of AuthLayoutClient)
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-456',
            email: 'newuser@example.com',
          },
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          token: 'jwt-token-456',
        }),
      });

      renderHook(() => useIntercomIdentify());

      await waitFor(() => {
        expect(intercom.init).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(intercom.bootWithJWT).toHaveBeenCalledWith('jwt-token-456');
      });
    });
  });
});
