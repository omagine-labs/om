/**
 * Integration tests for Paywall Page
 * Tests page-level behavior including user authentication display,
 * logout flow, and desktop app integration
 */

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { useRouter, useSearchParams } from 'next/navigation';
import PaywallPage from '@/app/paywall/page';
import * as authModule from '@/lib/auth';
import * as supabaseModule from '@/lib/supabase';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock auth module
jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(),
  signOut: jest.fn(),
}));

// Mock Supabase
jest.mock('@/lib/supabase', () => ({
  createClient: jest.fn(),
}));

// Mock pricing components
jest.mock('@/components/pricing/PricingCard', () => ({
  __esModule: true,
  default: ({ plan, onSelect, loading }: any) => (
    <div data-testid={`pricing-card-${plan.id}`}>
      <button
        onClick={() => onSelect(plan.id)}
        disabled={loading}
        data-testid={`select-plan-${plan.id}`}
      >
        Select {plan.name}
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

describe('Paywall Page - Integration Tests', () => {
  let mockRouter: any;
  let mockSearchParams: any;
  let mockSupabaseClient: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    // Spy on console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock router
    mockRouter = {
      push: jest.fn(),
      refresh: jest.fn(),
    };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    // Mock search params
    mockSearchParams = {
      get: jest.fn(),
    };
    (useSearchParams as jest.Mock).mockReturnValue(mockSearchParams);

    // Mock Supabase client
    mockSupabaseClient = {
      auth: {
        getUser: jest.fn(),
        signOut: jest.fn(),
      },
    };
    (supabaseModule.createClient as jest.Mock).mockReturnValue(
      mockSupabaseClient
    );

    // Default: successful user fetch
    (authModule.getCurrentUser as jest.Mock).mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      created_at: '2024-01-01T00:00:00Z',
    });

    // Default: successful sign out
    (authModule.signOut as jest.Mock).mockResolvedValue({ error: null });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('Desktop App User Flow', () => {
    it('should allow desktop app user to logout and preserve source parameter', async () => {
      // Mock desktop app source
      mockSearchParams.get.mockImplementation((key: string) =>
        key === 'source' ? 'desktop' : null
      );

      render(<PaywallPage />);

      // Wait for page to load and user to be fetched
      await waitFor(() => {
        expect(authModule.getCurrentUser).toHaveBeenCalled();
      });

      // Wait for user email to appear
      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      // Find and click logout button
      const logoutButton = screen.getByText(/Not you\? Log out/);
      expect(logoutButton).toBeInTheDocument();

      fireEvent.click(logoutButton);

      // Verify logout was called
      await waitFor(() => {
        expect(authModule.signOut).toHaveBeenCalled();
      });

      // Verify redirect includes desktop source
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/login?source=desktop');
        expect(mockRouter.refresh).toHaveBeenCalled();
      });
    });

    it('should handle desktop app user with authentication errors', async () => {
      // Mock desktop app source
      mockSearchParams.get.mockImplementation((key: string) =>
        key === 'source' ? 'desktop' : null
      );

      // Mock authentication error
      (authModule.getCurrentUser as jest.Mock).mockRejectedValue(
        new Error('Session expired')
      );

      render(<PaywallPage />);

      // Wait for user fetch attempt
      await waitFor(() => {
        expect(authModule.getCurrentUser).toHaveBeenCalled();
      });

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to fetch user:',
        expect.any(Error)
      );

      // Verify page still renders (graceful degradation)
      expect(screen.getByText(/Choose Your Plan/)).toBeInTheDocument();

      // Verify footer is not displayed (no logout button)
      expect(screen.queryByText(/Not you/)).not.toBeInTheDocument();
    });
  });

  describe('Regular Web User Flow', () => {
    it('should allow web user to logout without desktop parameter', async () => {
      // Mock no source parameter (regular web user)
      mockSearchParams.get.mockReturnValue(null);

      render(<PaywallPage />);

      // Wait for user to be fetched
      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      // Click logout
      const logoutButton = screen.getByText(/Not you\? Log out/);
      fireEvent.click(logoutButton);

      // Verify standard redirect (no source parameter)
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/login');
      });
    });

    it('should handle logout errors gracefully for web users', async () => {
      mockSearchParams.get.mockReturnValue(null);

      // Mock logout error
      const logoutError = { message: 'Network error' };
      (authModule.signOut as jest.Mock).mockResolvedValue({
        error: logoutError,
      });

      render(<PaywallPage />);

      // Wait for user to load
      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      // Click logout
      const logoutButton = screen.getByText(/Not you\? Log out/);
      fireEvent.click(logoutButton);

      // Verify error is displayed
      await waitFor(() => {
        expect(
          screen.getByText(/Logout failed: Network error/)
        ).toBeInTheDocument();
      });

      // Verify user was NOT redirected
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });

  describe('Authentication State Management', () => {
    it('should handle authenticated user with valid session', async () => {
      const mockUser = {
        id: 'user-abc',
        email: 'authenticated@example.com',
        created_at: '2024-01-01T00:00:00Z',
      };

      (authModule.getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      render(<PaywallPage />);

      // Wait for user data to be displayed
      await waitFor(() => {
        expect(
          screen.getByText(/authenticated@example.com/)
        ).toBeInTheDocument();
      });

      // Verify footer is rendered
      expect(screen.getByText(/Logged in as/)).toBeInTheDocument();
      expect(screen.getByText(/Not you\? Log out/)).toBeInTheDocument();
    });

    it('should handle unauthenticated user gracefully', async () => {
      (authModule.getCurrentUser as jest.Mock).mockResolvedValue(null);

      render(<PaywallPage />);

      // Wait for user fetch to complete
      await waitFor(() => {
        expect(authModule.getCurrentUser).toHaveBeenCalled();
      });

      // Verify footer is not displayed
      expect(screen.queryByText(/Logged in as/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Not you/)).not.toBeInTheDocument();

      // Verify page still renders correctly
      expect(screen.getByText(/Choose Your Plan/)).toBeInTheDocument();
    });

    it('should clear session on logout', async () => {
      render(<PaywallPage />);

      // Wait for user to load
      await waitFor(() => {
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      // Trigger logout
      const logoutButton = screen.getByText(/Not you\? Log out/);
      fireEvent.click(logoutButton);

      // Verify signOut was called (which clears session)
      await waitFor(() => {
        expect(authModule.signOut).toHaveBeenCalled();
      });

      // Verify redirect and refresh
      expect(mockRouter.push).toHaveBeenCalled();
      expect(mockRouter.refresh).toHaveBeenCalled();
    });
  });

  describe('User Experience and UI Integration', () => {
    it('should display pricing cards and user info together', async () => {
      render(<PaywallPage />);

      // Wait for all content to load
      await waitFor(() => {
        expect(screen.getByText(/Choose Your Plan/)).toBeInTheDocument();
        expect(screen.getByText(/test@example.com/)).toBeInTheDocument();
      });

      // Verify pricing cards are present
      expect(screen.getByTestId('pricing-card-monthly')).toBeInTheDocument();
      expect(screen.getByTestId('pricing-card-annual')).toBeInTheDocument();

      // Verify footer is at the bottom
      const footer = screen.getByText(/Logged in as/).closest('footer');
      expect(footer).toBeInTheDocument();
    });

    it('should not show footer during initial load', () => {
      // Mock delayed user fetch
      (authModule.getCurrentUser as jest.Mock).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<PaywallPage />);

      // Verify pricing content is visible
      expect(screen.getByText(/Choose Your Plan/)).toBeInTheDocument();

      // Verify footer is not yet visible
      expect(screen.queryByText(/Logged in as/)).not.toBeInTheDocument();
    });

    it('should maintain page functionality when footer fails to load', async () => {
      // Mock user fetch error
      (authModule.getCurrentUser as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      render(<PaywallPage />);

      // Wait for error to be handled
      await waitFor(() => {
        expect(authModule.getCurrentUser).toHaveBeenCalled();
      });

      // Verify main page content is still functional
      expect(screen.getByText(/Choose Your Plan/)).toBeInTheDocument();
      expect(screen.getByTestId('pricing-card-monthly')).toBeInTheDocument();
      expect(screen.getByTestId('pricing-card-annual')).toBeInTheDocument();

      // Verify footer is gracefully hidden
      expect(screen.queryByText(/Not you/)).not.toBeInTheDocument();
    });
  });
});
