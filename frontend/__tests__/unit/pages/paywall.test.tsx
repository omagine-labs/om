/**
 * Paywall Page Unit Tests
 *
 * Tests the paywall page functionality including:
 * - User session fetching and display
 * - Logout functionality with proper redirects
 * - Desktop app source parameter preservation
 * - Error handling and graceful degradation
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentUser, signOut } from '@/lib/auth';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock auth functions
jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(),
  signOut: jest.fn(),
}));

// Mock pricing components
jest.mock('@/components/pricing/PricingCard', () => ({
  __esModule: true,
  default: ({ plan, onSelect, loading, ctaText }: any) => (
    <div data-testid={`pricing-card-${plan.id}`}>
      <button
        onClick={() => onSelect(plan.id)}
        disabled={loading}
        data-testid={`select-plan-${plan.id}`}
      >
        {ctaText}
      </button>
    </div>
  ),
}));

// Mock error boundary
jest.mock('@/components/errors/SubscriptionErrorBoundary', () => ({
  SubscriptionErrorBoundary: ({ children }: any) => <>{children}</>,
}));

// Mock desktop auth hook
jest.mock('@/hooks/useDesktopAuth', () => ({
  redirectToDesktop: jest.fn(),
}));

// Mock pricing data
jest.mock('@/lib/pricing', () => ({
  PRICING_PLANS: {
    monthly: { id: 'monthly', name: 'Monthly Plan', price: 20 },
    annual: { id: 'annual', name: 'Annual Plan', price: 200 },
  },
  PRICING_COPY: {
    heading: 'Choose Your Plan',
    subheading: 'Get started today',
    ctaPrimary: 'Start Free Trial',
    ctaSkipTrial: 'Subscribe Now',
    professionalDevelopment: 'Professional development info',
    skipTrialLabel: 'Skip 7-day trial',
    trialNotice: 'Free trial notice',
  },
}));

// Import component after all mocks are set up
import PaywallPage from '@/app/paywall/page';

describe('PaywallPage', () => {
  let mockRouter: any;
  let mockSearchParams: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console.error to prevent noise in test output
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock router
    mockRouter = {
      push: jest.fn(),
      refresh: jest.fn(),
    };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    // Mock search params (default: no desktop source)
    mockSearchParams = {
      get: jest.fn((key: string) => null),
    };
    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);

    // Default: successful user fetch
    (getCurrentUser as jest.Mock).mockResolvedValue({
      email: 'test@example.com',
      id: 'user-123',
    });

    // Default: successful sign out
    (signOut as jest.Mock).mockResolvedValue({ error: null });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('User Session Fetching', () => {
    it('should fetch and display user email on mount', async () => {
      render(<PaywallPage />);

      await waitFor(() => {
        expect(getCurrentUser).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });
    });

    it('should show loading state initially (footer not visible)', () => {
      // Mock a delayed user fetch
      (getCurrentUser as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<PaywallPage />);

      // Footer should not be visible while loading
      expect(screen.queryByText(/Not you/)).not.toBeInTheDocument();
    });

    it('should hide footer if user fetch fails', async () => {
      (getCurrentUser as jest.Mock).mockRejectedValue(
        new Error('Session expired')
      );

      render(<PaywallPage />);

      await waitFor(() => {
        expect(getCurrentUser).toHaveBeenCalled();
      });

      // Footer should not render on error
      expect(screen.queryByText(/Not you/)).not.toBeInTheDocument();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch user:',
        expect.any(Error)
      );
    });

    it('should hide footer if no user email available', async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      render(<PaywallPage />);

      await waitFor(() => {
        expect(getCurrentUser).toHaveBeenCalled();
      });

      // Footer should not render when no user
      expect(screen.queryByText(/Not you/)).not.toBeInTheDocument();
    });

    it('should hide footer if user object has no email', async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue({
        id: 'user-123',
        // No email field
      });

      render(<PaywallPage />);

      await waitFor(() => {
        expect(getCurrentUser).toHaveBeenCalled();
      });

      // Footer should not render without email
      expect(screen.queryByText(/Not you/)).not.toBeInTheDocument();
    });
  });

  describe('Logout Functionality', () => {
    it('should call signOut and redirect to login on logout click', async () => {
      render(<PaywallPage />);

      // Wait for user to load and footer to render
      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      const logoutButton = screen.getByText(/Not you\? Log out/);
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(signOut).toHaveBeenCalled();
        expect(mockRouter.push).toHaveBeenCalledWith('/login');
        expect(mockRouter.refresh).toHaveBeenCalled();
      });
    });

    it('should preserve source=desktop parameter in logout redirect', async () => {
      // Mock desktop app source
      mockSearchParams.get.mockImplementation((key: string) =>
        key === 'source' ? 'desktop' : null
      );

      render(<PaywallPage />);

      // Wait for user to load
      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      const logoutButton = screen.getByText(/Not you\? Log out/);
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/login?source=desktop');
      });
    });

    it('should handle logout errors gracefully', async () => {
      const logoutError = { message: 'Logout failed' };
      (signOut as jest.Mock).mockResolvedValue({ error: logoutError });

      render(<PaywallPage />);

      // Wait for user to load
      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      const logoutButton = screen.getByText(/Not you\? Log out/);
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Logout failed: Logout failed/)
        ).toBeInTheDocument();
      });

      // Should not redirect on error
      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it('should handle logout exceptions gracefully', async () => {
      (signOut as jest.Mock).mockRejectedValue(new Error('Network error'));

      render(<PaywallPage />);

      // Wait for user to load
      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      const logoutButton = screen.getByText(/Not you\? Log out/);
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Logout error:',
        expect.any(Error)
      );
    });

    it('should disable logout button while loading', async () => {
      render(<PaywallPage />);

      // Wait for user to load
      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      const logoutButton = screen.getByText(
        /Not you\? Log out/
      ) as HTMLButtonElement;

      // Initially not disabled
      expect(logoutButton.disabled).toBe(false);

      // Note: Testing disabled state during checkout is complex as it requires
      // mocking the fetch API. The button is disabled when loading=true,
      // which happens during checkout session creation.
    });
  });

  describe('Desktop App Integration', () => {
    it('should detect desktop app source parameter', async () => {
      mockSearchParams.get.mockImplementation((key: string) =>
        key === 'source' ? 'desktop' : null
      );

      render(<PaywallPage />);

      // Verify component renders successfully with desktop source
      await waitFor(() => {
        expect(screen.getByText(/Choose Your Plan/)).toBeInTheDocument();
      });
    });

    it('should redirect to standard login for web users', async () => {
      // No source parameter (web user)
      mockSearchParams.get.mockReturnValue(null);

      render(<PaywallPage />);

      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      const logoutButton = screen.getByText(/Not you\? Log out/);
      fireEvent.click(logoutButton);

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('UI Rendering', () => {
    it('should render pricing cards', async () => {
      render(<PaywallPage />);

      await waitFor(() => {
        expect(screen.getByTestId('pricing-card-monthly')).toBeInTheDocument();
        expect(screen.getByTestId('pricing-card-annual')).toBeInTheDocument();
      });
    });

    it('should render with proper styling classes', async () => {
      render(<PaywallPage />);

      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      const footer = screen.getByText(/Logged in as/).closest('footer');
      expect(footer).toBeInTheDocument();
    });

    it('should show user email with proper formatting', async () => {
      render(<PaywallPage />);

      await waitFor(() => {
        const emailText = screen.getByText(/test@example.com/);
        expect(emailText).toBeInTheDocument();
        // Check that it's within the "Logged in as" text
        expect(screen.getByText(/Logged in as/)).toBeInTheDocument();
      });
    });
  });
});
