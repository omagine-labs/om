/**
 * Server-side Magic Link Generation Tests
 *
 * Tests the server-side magic link generation helper used in API routes
 * and server components to call the Edge Function with an access token.
 */

import { generateMagicLinkServer } from '@/lib/magic-link-server';
import { createClient } from '@supabase/supabase-js';
import * as configModule from '@/lib/config';

// Mock Supabase client
jest.mock('@supabase/supabase-js');

// Mock config
jest.mock('@/lib/config');

describe('magic-link-server.ts', () => {
  let mockSupabaseClient: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Spy on console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock config
    (configModule.getSupabaseUrl as jest.Mock).mockReturnValue(
      'https://test.supabase.co'
    );
    (configModule.getSupabaseAnonKey as jest.Mock).mockReturnValue(
      'test-anon-key'
    );

    // Setup Supabase mock
    mockSupabaseClient = {
      functions: {
        invoke: jest.fn(),
      },
    };

    (createClient as jest.Mock).mockReturnValue(mockSupabaseClient);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('generateMagicLinkServer', () => {
    it('should successfully generate a magic link with valid access token', async () => {
      const accessToken = 'valid-server-token';

      // Mock successful Edge Function response
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: true,
          hashedToken: 'server-hashed-token-xyz',
          email: 'server@example.com',
        },
        error: null,
      });

      const result = await generateMagicLinkServer(accessToken);

      expect(result).toEqual({
        hashedToken: 'server-hashed-token-xyz',
        email: 'server@example.com',
      });

      // Verify Edge Function was called with correct parameters
      expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
        'generate-magic-link',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
    });

    it('should create Supabase client with correct configuration', async () => {
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: true,
          hashedToken: 'token',
          email: 'test@example.com',
        },
        error: null,
      });

      await generateMagicLinkServer('test-token');

      expect(createClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key'
      );
    });

    it('should throw error when Edge Function returns error', async () => {
      const accessToken = 'test-token';

      // Mock Edge Function error
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Unauthorized' },
      });

      await expect(generateMagicLinkServer(accessToken)).rejects.toThrow(
        'Failed to generate magic link'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[MagicLinkServer] Error calling Edge Function:',
        { message: 'Unauthorized' }
      );
    });

    it('should throw error when response is missing success field', async () => {
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          hashedToken: 'token',
          email: 'test@example.com',
          // success field is missing
        },
        error: null,
      });

      await expect(generateMagicLinkServer('test-token')).rejects.toThrow(
        'Invalid magic link response'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[MagicLinkServer] Invalid response:',
        expect.any(Object)
      );
    });

    it('should throw error when response is missing hashedToken', async () => {
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: true,
          email: 'test@example.com',
          // hashedToken is missing
        },
        error: null,
      });

      await expect(generateMagicLinkServer('test-token')).rejects.toThrow(
        'Invalid magic link response'
      );
    });

    it('should throw error when response is missing email', async () => {
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: true,
          hashedToken: 'token',
          // email is missing
        },
        error: null,
      });

      await expect(generateMagicLinkServer('test-token')).rejects.toThrow(
        'Invalid magic link response'
      );
    });

    it('should handle rate limiting from Edge Function', async () => {
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: false,
          error: 'Too many requests. Please try again later.',
        },
        error: null,
      });

      await expect(generateMagicLinkServer('test-token')).rejects.toThrow(
        'Invalid magic link response'
      );
    });

    it('should handle network errors gracefully', async () => {
      // Mock network error
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Network request failed', code: 'NETWORK_ERROR' },
      });

      await expect(generateMagicLinkServer('test-token')).rejects.toThrow(
        'Failed to generate magic link'
      );
    });

    it('should handle Edge Function timeout', async () => {
      // Mock timeout error
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: 'Function timeout', code: 'TIMEOUT' },
      });

      await expect(generateMagicLinkServer('test-token')).rejects.toThrow(
        'Failed to generate magic link'
      );
    });

    it('should use POST method for Edge Function invocation', async () => {
      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: true,
          hashedToken: 'token',
          email: 'test@example.com',
        },
        error: null,
      });

      await generateMagicLinkServer('test-token');

      expect(mockSupabaseClient.functions.invoke).toHaveBeenCalledWith(
        'generate-magic-link',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should format authorization header correctly', async () => {
      const testToken = 'my-special-token-123';

      mockSupabaseClient.functions.invoke.mockResolvedValue({
        data: {
          success: true,
          hashedToken: 'token',
          email: 'test@example.com',
        },
        error: null,
      });

      await generateMagicLinkServer(testToken);

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
