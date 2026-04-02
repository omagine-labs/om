/**
 * MagicLinkHandler Component Tests
 *
 * Tests the MagicLinkHandler component that processes magic link tokens
 * from URL hash fragments for desktop app authentication.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MagicLinkHandler } from '@/components/MagicLinkHandler';
import { useRouter } from 'next/navigation';
import * as supabaseModule from '@/lib/supabase';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock Supabase
jest.mock('@/lib/supabase');

describe('MagicLinkHandler', () => {
  let mockSupabaseClient: any;
  let mockRouter: any;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  const originalWindowLocationHash = window.location.hash;

  beforeEach(() => {
    jest.clearAllMocks();

    // Spy on console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock router
    mockRouter = {
      push: jest.fn(),
      refresh: jest.fn(),
    };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    // Setup Supabase mock
    mockSupabaseClient = {
      auth: {
        verifyOtp: jest.fn(),
      },
    };
    (supabaseModule.createClient as jest.Mock).mockReturnValue(
      mockSupabaseClient
    );
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    // Reset window location hash
    window.location.hash = '';
  });

  it('should render without crashing', () => {
    const { container } = render(<MagicLinkHandler />);
    expect(container).toBeTruthy();
  });

  it('should return null (no visible UI)', () => {
    const { container } = render(<MagicLinkHandler />);
    expect(container.firstChild).toBeNull();
  });

  it('should do nothing when hash is empty', async () => {
    window.location.hash = '';

    render(<MagicLinkHandler />);

    await waitFor(() => {
      expect(mockSupabaseClient.auth.verifyOtp).not.toHaveBeenCalled();
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  it('should do nothing when hash does not contain magic_link_token', async () => {
    window.location.hash = '#some_other_param=value';

    render(<MagicLinkHandler />);

    await waitFor(() => {
      expect(mockSupabaseClient.auth.verifyOtp).not.toHaveBeenCalled();
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  it('should do nothing when magic_link_token is present but email is missing', async () => {
    window.location.hash = '#magic_link_token=abc123';

    render(<MagicLinkHandler />);

    await waitFor(() => {
      expect(mockSupabaseClient.auth.verifyOtp).not.toHaveBeenCalled();
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  it('should verify OTP and redirect on successful magic link verification', async () => {
    const testToken = 'test-hashed-token-123';
    const testEmail = 'test@example.com';
    window.location.hash = `#magic_link_token=${testToken}&email=${testEmail}`;

    // Mock successful verification
    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: 'new-access-token',
          user: { id: 'user-123', email: testEmail },
        },
      },
      error: null,
    });

    render(<MagicLinkHandler />);

    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[MagicLinkHandler] Processing magic link for:',
        testEmail
      );
    });

    await waitFor(() => {
      expect(mockSupabaseClient.auth.verifyOtp).toHaveBeenCalledWith({
        token_hash: testToken,
        type: 'magiclink',
      });
    });

    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[MagicLinkHandler] Magic link verified, session created'
      );
    });

    await waitFor(() => {
      expect(window.location.hash).toBe('');
      expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('should handle verification error and clear hash', async () => {
    const testToken = 'invalid-token';
    const testEmail = 'test@example.com';
    window.location.hash = `#magic_link_token=${testToken}&email=${testEmail}`;

    // Mock verification error
    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid or expired token' },
    });

    render(<MagicLinkHandler />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[MagicLinkHandler] Error verifying magic link:',
        expect.objectContaining({ message: 'Invalid or expired token' })
      );
    });

    await waitFor(() => {
      expect(window.location.hash).toBe('');
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  it('should handle case where session is not created despite no error', async () => {
    const testToken = 'test-token';
    const testEmail = 'test@example.com';
    window.location.hash = `#magic_link_token=${testToken}&email=${testEmail}`;

    // Mock verification with no session
    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    render(<MagicLinkHandler />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[MagicLinkHandler] No session created'
      );
    });

    await waitFor(() => {
      expect(window.location.hash).toBe('');
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  it('should handle unexpected errors during processing', async () => {
    const testToken = 'test-token';
    const testEmail = 'test@example.com';
    window.location.hash = `#magic_link_token=${testToken}&email=${testEmail}`;

    // Mock unexpected error
    mockSupabaseClient.auth.verifyOtp.mockRejectedValue(
      new Error('Network failure')
    );

    render(<MagicLinkHandler />);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[MagicLinkHandler] Unexpected error:',
        expect.any(Error)
      );
    });

    await waitFor(() => {
      expect(window.location.hash).toBe('');
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  it('should decode URL-encoded email parameter', async () => {
    const testToken = 'test-token';
    const encodedEmail = encodeURIComponent('test+user@example.com');
    window.location.hash = `#magic_link_token=${testToken}&email=${encodedEmail}`;

    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: 'token',
          user: { id: 'user-123', email: 'test+user@example.com' },
        },
      },
      error: null,
    });

    render(<MagicLinkHandler />);

    await waitFor(() => {
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[MagicLinkHandler] Processing magic link for:',
        'test+user@example.com'
      );
    });
  });

  it('should only run once on mount', async () => {
    const testToken = 'test-token';
    const testEmail = 'test@example.com';
    window.location.hash = `#magic_link_token=${testToken}&email=${testEmail}`;

    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: 'token',
          user: { id: 'user-123', email: testEmail },
        },
      },
      error: null,
    });

    const { rerender } = render(<MagicLinkHandler />);

    await waitFor(() => {
      expect(mockSupabaseClient.auth.verifyOtp).toHaveBeenCalledTimes(1);
    });

    // Rerender should not trigger another call
    rerender(<MagicLinkHandler />);

    await waitFor(() => {
      expect(mockSupabaseClient.auth.verifyOtp).toHaveBeenCalledTimes(1);
    });
  });

  it('should not call router.refresh after push to avoid race condition', async () => {
    const testToken = 'test-token';
    const testEmail = 'test@example.com';
    window.location.hash = `#magic_link_token=${testToken}&email=${testEmail}`;

    mockSupabaseClient.auth.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: 'token',
          user: { id: 'user-123', email: testEmail },
        },
      },
      error: null,
    });

    render(<MagicLinkHandler />);

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
    });

    // router.refresh should NOT be called
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
