import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignInPrompt } from '../SignInPrompt';

describe('SignInPrompt', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should render welcome message and sign-in button', () => {
    render(<SignInPrompt />);

    // Use getBy* which throws if not found - this verifies elements are in the document
    expect(screen.getByText('Welcome to Om')).toBeTruthy();
    expect(
      screen.getByText(/Sign in to access your meeting insights/i)
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });

  it('should call openExternal with correct URL when sign-in button clicked', () => {
    const mockOpenExternal = vi.fn();
    global.window.electronAPI = {
      openExternal: mockOpenExternal,
    } as any;

    render(<SignInPrompt />);

    const signInButton = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(signInButton);

    expect(mockOpenExternal).toHaveBeenCalledTimes(1);
    expect(mockOpenExternal).toHaveBeenCalledWith(
      expect.stringContaining('/login?source=desktop')
    );
  });

  it('should use window.open fallback when electronAPI not available', () => {
    const mockWindowOpen = vi.fn();
    global.window.electronAPI = undefined as any;
    global.window.open = mockWindowOpen;

    render(<SignInPrompt />);

    const signInButton = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(signInButton);

    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    expect(mockWindowOpen).toHaveBeenCalledWith(
      expect.stringContaining('/login?source=desktop'),
      '_blank'
    );
  });
});
