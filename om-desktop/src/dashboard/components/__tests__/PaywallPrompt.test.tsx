/**
 * PaywallPrompt Component Tests
 *
 * Tests the paywall UI shown to authenticated users without active subscriptions.
 * Verifies browser opening and window refresh functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaywallPrompt } from '../PaywallPrompt';

// Mock getWebAppUrl
vi.mock('@/lib/config', () => ({
  getWebAppUrl: vi.fn(() => 'http://localhost:3000'),
}));

describe('PaywallPrompt', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock window.location.reload
    delete (window as any).location;
    window.location = { reload: vi.fn() } as any;
  });

  it('should render paywall message and buttons', () => {
    render(<PaywallPrompt />);

    // Check for main heading
    expect(screen.getByText('Subscription Required')).toBeTruthy();

    // Check for description
    expect(
      screen.getByText(/To access your meeting insights and analytics/i)
    ).toBeTruthy();

    // Check for buttons
    expect(screen.getByText('View Plans & Subscribe')).toBeTruthy();
    expect(screen.getByText('Already Subscribed? Refresh')).toBeTruthy();

    // Check for helper text
    expect(
      screen.getByText(
        /After subscribing, click refresh to access the dashboard/i
      )
    ).toBeTruthy();
  });

  it('should open browser when clicking "View Plans & Subscribe"', () => {
    const mockOpenExternal = vi.fn();
    global.window.electronAPI = {
      openExternal: mockOpenExternal,
    } as any;

    render(<PaywallPrompt />);

    const viewPlansButton = screen.getByText('View Plans & Subscribe');
    fireEvent.click(viewPlansButton);

    expect(mockOpenExternal).toHaveBeenCalledTimes(1);
    expect(mockOpenExternal).toHaveBeenCalledWith(
      'http://localhost:3000/paywall?source=desktop'
    );
  });

  it('should use window.open fallback when electronAPI not available', () => {
    const mockWindowOpen = vi.fn();
    global.window.electronAPI = undefined as any;
    global.window.open = mockWindowOpen;

    render(<PaywallPrompt />);

    const viewPlansButton = screen.getByText('View Plans & Subscribe');
    fireEvent.click(viewPlansButton);

    expect(mockWindowOpen).toHaveBeenCalledTimes(1);
    expect(mockWindowOpen).toHaveBeenCalledWith(
      'http://localhost:3000/paywall?source=desktop',
      '_blank'
    );
  });

  it('should reload window when refresh finds subscription', async () => {
    const mockGetCurrentUser = vi.fn().mockResolvedValue({ id: 'user-123' });
    const mockCheckSubscription = vi.fn().mockResolvedValue(true);

    global.window.electronAPI = {
      auth: {
        getUser: mockGetCurrentUser,
      },
      checkSubscription: mockCheckSubscription,
    } as any;

    render(<PaywallPrompt />);

    const refreshButton = screen.getByText('Already Subscribed? Refresh');
    fireEvent.click(refreshButton);

    // Wait for async operations
    await vi.waitFor(() => {
      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });
  });

  it('should show alert when refresh finds no subscription', async () => {
    const mockGetCurrentUser = vi.fn().mockResolvedValue({ id: 'user-123' });
    const mockCheckSubscription = vi.fn().mockResolvedValue(false);
    const mockAlert = vi.fn();
    global.window.alert = mockAlert;

    global.window.electronAPI = {
      auth: {
        getUser: mockGetCurrentUser,
      },
      checkSubscription: mockCheckSubscription,
    } as any;

    render(<PaywallPrompt />);

    const refreshButton = screen.getByText('Already Subscribed? Refresh');
    fireEvent.click(refreshButton);

    // Wait for async operations
    await vi.waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith(
        'No active subscription found. Please subscribe first.'
      );
    });

    expect(window.location.reload).not.toHaveBeenCalled();
  });

  it('should show loading state when refreshing', () => {
    const mockGetCurrentUser = vi.fn().mockResolvedValue({ id: 'user-123' });
    const mockCheckSubscription = vi.fn().mockResolvedValue(true);

    global.window.electronAPI = {
      auth: {
        getUser: mockGetCurrentUser,
      },
      checkSubscription: mockCheckSubscription,
    } as any;

    render(<PaywallPrompt />);

    const refreshButton = screen.getByText('Already Subscribed? Refresh');
    fireEvent.click(refreshButton);

    // Button should show "Refreshing..." text immediately
    expect(screen.getByText('Refreshing...')).toBeTruthy();
  });

  it('should disable refresh button while refreshing', () => {
    const mockGetCurrentUser = vi.fn().mockResolvedValue({ id: 'user-123' });
    const mockCheckSubscription = vi.fn().mockResolvedValue(true);

    global.window.electronAPI = {
      auth: {
        getUser: mockGetCurrentUser,
      },
      checkSubscription: mockCheckSubscription,
    } as any;

    render(<PaywallPrompt />);

    const refreshButton = screen.getByText(
      'Already Subscribed? Refresh'
    ) as HTMLButtonElement;
    fireEvent.click(refreshButton);

    // Button should be disabled
    expect(refreshButton.disabled).toBe(true);
  });

  it('should have proper styling classes for accessibility', () => {
    const { container } = render(<PaywallPrompt />);

    // Check for main container styling
    const mainContainer = container.querySelector(
      '.min-h-screen.flex.items-center.justify-center'
    );
    expect(mainContainer).toBeTruthy();

    // Check for content card styling
    const card = container.querySelector('.bg-white.rounded-xl.shadow-lg');
    expect(card).toBeTruthy();
  });

  it('should render buttons with proper accessibility attributes', () => {
    render(<PaywallPrompt />);

    const viewPlansButton = screen.getByText('View Plans & Subscribe');
    const refreshButton = screen.getByText('Already Subscribed? Refresh');

    // Both should be buttons
    expect(viewPlansButton.tagName).toBe('BUTTON');
    expect(refreshButton.tagName).toBe('BUTTON');

    // Check button classes for styling
    expect(viewPlansButton.className).toContain('bg-blue-600');
    expect(refreshButton.className).toContain('border-gray-300');
  });
});
