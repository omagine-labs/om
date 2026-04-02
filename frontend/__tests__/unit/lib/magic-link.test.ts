/**
 * Magic Link Generation Tests
 *
 * Tests the client-side magic link generation helper that calls
 * the Supabase Edge Function to generate magic links for desktop auth.
 */

import { generateMagicLink } from '@/lib/magic-link';
import * as supabaseModule from '@/lib/supabase';

// Mock Supabase
jest.mock('@/lib/supabase');

describe('magic-link.ts', () => {
  let mockSupabaseClient: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Spy on console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Setup Supabase mock
    mockSupabaseClient = {
      auth: {
        getSession: jest.fn(),
      },
      functions: {
        invoke: jest.fn(),
      },
    };

    (supabaseModule.createClient as jest.Mock).mockReturnValue(
      mockSupabaseClient
    );
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('generateMagicLink', () => {
    it('should successfully generate a magic link when user is authenticated', async () => {
      // Mock valid session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'valid-access-token',
            user: { id: 'user-123', email: 'test@example.com' },
          },
        },
        error: null,
      });

      // Mock successful Edge Function response
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: true,
          hashedToken: 'hashed-token-abc123',
          email: 'test@example.com',
        },
        error: null,
      });

      const result = await generateMagicLink();

      expect(result).toEqual({
        hashedToken: 'hashed-token-abc123',
        email: 'test@example.com',
      });

      // Verify Edge Function was called with correct parameters
      expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
        'generate-magic-link',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid-access-token',
          },
        }
      );
    });

    it('should throw error when user is not authenticated', async () => {
      // Mock no session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(generateMagicLink()).rejects.toThrow('Not authenticated');

      // Edge Function should not be called
      expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled();
    });

    it('should throw error when session retrieval fails', async () => {
      // Mock session error
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Session error' },
      });

      await expect(generateMagicLink()).rejects.toThrow('Not authenticated');

      // Edge Function should not be called
      expect(mockSupabaseClient.functions.invoke).not.toHaveBeenCalled();
    });

    it('should throw error when Edge Function call fails', async () => {
      // Mock valid session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'valid-access-token',
            user: { id: 'user-123', email: 'test@example.com' },
          },
        },
        error: null,
      });

      // Mock Edge Function error
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Function invocation failed' },
      });

      await expect(generateMagicLink()).rejects.toThrow(
        'Failed to generate magic link'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[MagicLink] Error calling Edge Function:',
        { message: 'Function invocation failed' }
      );
    });

    it('should throw error when Edge Function returns invalid response (no success)', async () => {
      // Mock valid session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'valid-access-token',
            user: { id: 'user-123', email: 'test@example.com' },
          },
        },
        error: null,
      });

      // Mock invalid Edge Function response
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: false,
          error: 'Rate limit exceeded',
        },
        error: null,
      });

      await expect(generateMagicLink()).rejects.toThrow(
        'Invalid magic link response'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[MagicLink] Invalid response:',
        expect.objectContaining({ success: false })
      );
    });

    it('should throw error when Edge Function returns incomplete data', async () => {
      // Mock valid session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'valid-access-token',
            user: { id: 'user-123', email: 'test@example.com' },
          },
        },
        error: null,
      });

      // Mock incomplete Edge Function response (missing email)
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: true,
          hashedToken: 'hashed-token-abc123',
          // email is missing
        },
        error: null,
      });

      await expect(generateMagicLink()).rejects.toThrow(
        'Invalid magic link response'
      );
    });

    it('should handle rate limiting errors', async () => {
      // Mock valid session
      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: 'valid-access-token',
            user: { id: 'user-123', email: 'test@example.com' },
          },
        },
        error: null,
      });

      // Mock rate limit response from Edge Function
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: false,
          error: 'Too many requests. Please try again later.',
        },
        error: null,
      });

      await expect(generateMagicLink()).rejects.toThrow(
        'Invalid magic link response'
      );
    });

    it('should use correct authorization header format', async () => {
      const testToken = 'test-bearer-token-xyz';

      mockSupabaseClient.auth.getSession.mockResolvedValue({
        data: {
          session: {
            access_token: testToken,
            user: { id: 'user-123', email: 'test@example.com' },
          },
        },
        error: null,
      });

      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: true,
          hashedToken: 'token',
          email: 'test@example.com',
        },
        error: null,
      });

      await generateMagicLink();

      expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
        'generate-magic-link',
        expect.objectContaining({
          headers: {
            Authorization: `Bearer ${testToken}`,
          },
        })
      );
    });
  });
});
