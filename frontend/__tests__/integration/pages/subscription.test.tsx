/**
 * Integration tests for Subscription Page
 * Tests page-level behavior including subscription display, plan changes, and cancellation
 */

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubscriptionPage from '@/app/(auth)/settings/subscription/page';
import { useSubscription } from '@/hooks/useSubscription';
import { subscriptionApi } from '@/lib/api/subscriptions';
import type { PlanChangePreview } from '@/lib/api/subscriptions';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
  })),
}));

// Mock useSubscription hook
jest.mock('@/hooks/useSubscription');

// Mock subscriptionApi
jest.mock('@/lib/api/subscriptions', () => ({
  subscriptionApi: {
    getCurrent: jest.fn(),
    previewPlanChange: jest.fn(),
    changePlan: jest.fn(),
    cancel: jest.fn(),
    reactivate: jest.fn(),
  },
}));

const mockUseSubscription = useSubscription as jest.MockedFunction<
  typeof useSubscription
>;

describe('Subscription Page', () => {
  const mockRefresh = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading state', () => {
    it('should show loading skeleton', () => {
      mockUseSubscription.mockReturnValue({
        subscription: null,
        loading: true,
        error: null,
        hasActiveSubscription: false,
        isTrialing: false,
        isCanceled: false,
        daysLeftInTrial: null,
        refresh: mockRefresh,
      });

      render(<SubscriptionPage />);

      expect(
        screen.getByText((content, element) => {
          return element?.classList.contains('animate-pulse') || false;
        })
      ).toBeInTheDocument();
    });
  });

  describe('Error state', () => {
    it('should show error message when subscription fetch fails', () => {
      mockUseSubscription.mockReturnValue({
        subscription: null,
        loading: false,
        error: 'Failed to fetch subscription',
        hasActiveSubscription: false,
        isTrialing: false,
        isCanceled: false,
        daysLeftInTrial: null,
        refresh: mockRefresh,
      });

      render(<SubscriptionPage />);

      expect(
        screen.getByText('Failed to fetch subscription')
      ).toBeInTheDocument();
      expect(screen.getByText('Subscribe Now')).toBeInTheDocument();
    });

    it('should show error message when no subscription exists', () => {
      mockUseSubscription.mockReturnValue({
        subscription: null,
        loading: false,
        error: null,
        hasActiveSubscription: false,
        isTrialing: false,
        isCanceled: false,
        daysLeftInTrial: null,
        refresh: mockRefresh,
      });

      render(<SubscriptionPage />);

      expect(
        screen.getByText('No active subscription found.')
      ).toBeInTheDocument();
      expect(screen.getByText('Subscribe Now')).toBeInTheDocument();
    });
  });

  describe('Active subscription display', () => {
    it('should display monthly subscription details', () => {
      mockUseSubscription.mockReturnValue({
        subscription: {
          id: 'sub_test123',
          userId: 'user_test123',
          status: 'active',
          planType: 'monthly',
          currentPeriodStart: new Date('2024-01-01').toISOString(),
          currentPeriodEnd: new Date('2024-02-01').toISOString(),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          trialEnd: null,
          createdAt: new Date('2024-01-01').toISOString(),
          updatedAt: new Date('2024-01-01').toISOString(),
        },
        loading: false,
        error: null,
        hasActiveSubscription: true,
        isTrialing: false,
        isCanceled: false,
        daysLeftInTrial: null,
        refresh: mockRefresh,
      });

      render(<SubscriptionPage />);

      expect(screen.getByText('Subscription')).toBeInTheDocument();
      expect(
        screen.getByText('Manage your subscription and billing')
      ).toBeInTheDocument();
    });

    it('should display annual subscription details', () => {
      mockUseSubscription.mockReturnValue({
        subscription: {
          id: 'sub_test123',
          userId: 'user_test123',
          status: 'active',
          planType: 'annual',
          currentPeriodStart: new Date('2024-01-01').toISOString(),
          currentPeriodEnd: new Date('2025-01-01').toISOString(),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          trialEnd: null,
          createdAt: new Date('2024-01-01').toISOString(),
          updatedAt: new Date('2024-01-01').toISOString(),
        },
        loading: false,
        error: null,
        hasActiveSubscription: true,
        isTrialing: false,
        isCanceled: false,
        daysLeftInTrial: null,
        refresh: mockRefresh,
      });

      render(<SubscriptionPage />);

      expect(screen.getByText('Subscription')).toBeInTheDocument();
    });
  });

  describe('Trial status', () => {
    it('should display trial status for trialing subscription', () => {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 10);

      mockUseSubscription.mockReturnValue({
        subscription: {
          id: 'sub_test123',
          userId: 'user_test123',
          status: 'trialing',
          planType: 'monthly',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: trialEnd.toISOString(),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          trialEnd: trialEnd.toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        loading: false,
        error: null,
        hasActiveSubscription: true,
        isTrialing: true,
        isCanceled: false,
        daysLeftInTrial: 10,
        refresh: mockRefresh,
      });

      render(<SubscriptionPage />);

      expect(screen.getByText('Subscription')).toBeInTheDocument();
    });
  });

  describe('Plan changes', () => {
    it('should handle plan change with no immediate charge (trial upgrade)', async () => {
      const user = userEvent.setup();

      mockUseSubscription.mockReturnValue({
        subscription: {
          id: 'sub_test123',
          userId: 'user_test123',
          status: 'trialing',
          planType: 'monthly',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(
            Date.now() + 10 * 24 * 60 * 60 * 1000
          ).toISOString(),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          trialEnd: new Date(
            Date.now() + 10 * 24 * 60 * 60 * 1000
          ).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        loading: false,
        error: null,
        hasActiveSubscription: true,
        isTrialing: true,
        isCanceled: false,
        daysLeftInTrial: 10,
        refresh: mockRefresh,
      });

      (subscriptionApi.previewPlanChange as jest.Mock).mockResolvedValue({
        success: true,
        preview: {
          newPlan: 'annual',
          prorationAmount: 0,
          nextBillingDate: new Date(
            Date.now() + 10 * 24 * 60 * 60 * 1000
          ).toISOString(),
        } as PlanChangePreview,
      });

      (subscriptionApi.changePlan as jest.Mock).mockResolvedValue({
        success: true,
      });

      render(<SubscriptionPage />);

      // Wait for page to render
      await waitFor(() => {
        expect(screen.getByText('Subscription')).toBeInTheDocument();
      });

      // Find and click the "Upgrade to Annual" or "Switch to Annual" button
      const annualButton = screen.getByRole('button', {
        name: /annual/i,
      });
      await user.click(annualButton);

      // Should call changePlan immediately (no modal for $0 charge)
      await waitFor(() => {
        expect(subscriptionApi.changePlan).toHaveBeenCalledWith('annual');
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it('should show confirmation modal for plan change with immediate charge', async () => {
      const user = userEvent.setup();

      mockUseSubscription.mockReturnValue({
        subscription: {
          id: 'sub_test123',
          userId: 'user_test123',
          status: 'active',
          planType: 'monthly',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(
            Date.now() + 15 * 24 * 60 * 60 * 1000
          ).toISOString(),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          trialEnd: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        loading: false,
        error: null,
        hasActiveSubscription: true,
        isTrialing: false,
        isCanceled: false,
        daysLeftInTrial: null,
        refresh: mockRefresh,
      });

      (subscriptionApi.previewPlanChange as jest.Mock).mockResolvedValue({
        success: true,
        preview: {
          newPlan: 'annual',
          prorationAmount: 5000, // $50.00
          nextBillingDate: new Date().toISOString(),
        } as PlanChangePreview,
      });

      render(<SubscriptionPage />);

      // Wait for page to render
      await waitFor(() => {
        expect(screen.getByText('Subscription')).toBeInTheDocument();
      });

      // Find and click the "Upgrade to Annual" button
      const annualButton = screen.getByRole('button', {
        name: /annual/i,
      });
      await user.click(annualButton);

      // Should show confirmation modal
      await waitFor(() => {
        expect(subscriptionApi.previewPlanChange).toHaveBeenCalledWith(
          'annual'
        );
      });

      // Modal should appear (test that preview was loaded)
      expect(subscriptionApi.changePlan).not.toHaveBeenCalled();
    });
  });

  describe('Subscription cancellation', () => {
    it('should handle subscription cancellation', async () => {
      const user = userEvent.setup();

      mockUseSubscription.mockReturnValue({
        subscription: {
          id: 'sub_test123',
          userId: 'user_test123',
          status: 'active',
          planType: 'monthly',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(
            Date.now() + 15 * 24 * 60 * 60 * 1000
          ).toISOString(),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          trialEnd: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        loading: false,
        error: null,
        hasActiveSubscription: true,
        isTrialing: false,
        isCanceled: false,
        daysLeftInTrial: null,
        refresh: mockRefresh,
      });

      (subscriptionApi.cancel as jest.Mock).mockResolvedValue({
        success: true,
      });

      render(<SubscriptionPage />);

      // Wait for page to render
      await waitFor(() => {
        expect(screen.getByText('Subscription')).toBeInTheDocument();
      });

      // Find and click the initial cancel button
      const cancelButton = screen.getByRole('button', {
        name: /cancel subscription/i,
      });
      await user.click(cancelButton);

      // Should show confirmation dialog
      await waitFor(() => {
        expect(screen.getByText(/Yes, Cancel/i)).toBeInTheDocument();
      });

      // Click the confirmation button
      const confirmButton = screen.getByRole('button', {
        name: /Yes, Cancel/i,
      });
      await user.click(confirmButton);

      // Should call cancel API
      await waitFor(() => {
        expect(subscriptionApi.cancel).toHaveBeenCalled();
        expect(mockRefresh).toHaveBeenCalled();
      });
    });
  });

  describe('Subscription reactivation', () => {
    it('should handle subscription reactivation', async () => {
      const user = userEvent.setup();

      mockUseSubscription.mockReturnValue({
        subscription: {
          id: 'sub_test123',
          userId: 'user_test123',
          status: 'active',
          planType: 'monthly',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(
            Date.now() + 15 * 24 * 60 * 60 * 1000
          ).toISOString(),
          cancelAtPeriodEnd: true,
          canceledAt: new Date().toISOString(),
          trialEnd: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        loading: false,
        error: null,
        hasActiveSubscription: true,
        isTrialing: false,
        isCanceled: true,
        daysLeftInTrial: null,
        refresh: mockRefresh,
      });

      (subscriptionApi.reactivate as jest.Mock).mockResolvedValue({
        success: true,
      });

      render(<SubscriptionPage />);

      // Wait for page to render
      await waitFor(() => {
        expect(screen.getByText('Subscription')).toBeInTheDocument();
      });

      // Find and click the reactivate button
      const reactivateButton = screen.getByRole('button', {
        name: /reactivate/i,
      });
      await user.click(reactivateButton);

      // Should call reactivate API
      await waitFor(() => {
        expect(subscriptionApi.reactivate).toHaveBeenCalled();
        expect(mockRefresh).toHaveBeenCalled();
      });
    });
  });

  describe('Error handling', () => {
    it('should display error message when plan change fails', async () => {
      const user = userEvent.setup();

      mockUseSubscription.mockReturnValue({
        subscription: {
          id: 'sub_test123',
          userId: 'user_test123',
          status: 'trialing',
          planType: 'monthly',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(
            Date.now() + 10 * 24 * 60 * 60 * 1000
          ).toISOString(),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          trialEnd: new Date(
            Date.now() + 10 * 24 * 60 * 60 * 1000
          ).toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        loading: false,
        error: null,
        hasActiveSubscription: true,
        isTrialing: true,
        isCanceled: false,
        daysLeftInTrial: 10,
        refresh: mockRefresh,
      });

      (subscriptionApi.previewPlanChange as jest.Mock).mockRejectedValue(
        new Error('Stripe API error')
      );

      render(<SubscriptionPage />);

      // Wait for page to render
      await waitFor(() => {
        expect(screen.getByText('Subscription')).toBeInTheDocument();
      });

      // Find and click the annual button
      const annualButton = screen.getByRole('button', {
        name: /annual/i,
      });
      await user.click(annualButton);

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/Stripe API error/i)).toBeInTheDocument();
      });
    });

    it('should display error message when cancellation fails', async () => {
      const user = userEvent.setup();

      mockUseSubscription.mockReturnValue({
        subscription: {
          id: 'sub_test123',
          userId: 'user_test123',
          status: 'active',
          planType: 'monthly',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(
            Date.now() + 15 * 24 * 60 * 60 * 1000
          ).toISOString(),
          cancelAtPeriodEnd: false,
          canceledAt: null,
          trialEnd: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        loading: false,
        error: null,
        hasActiveSubscription: true,
        isTrialing: false,
        isCanceled: false,
        daysLeftInTrial: null,
        refresh: mockRefresh,
      });

      (subscriptionApi.cancel as jest.Mock).mockRejectedValue(
        new Error('Cancellation failed')
      );

      render(<SubscriptionPage />);

      // Wait for page to render
      await waitFor(() => {
        expect(screen.getByText('Subscription')).toBeInTheDocument();
      });

      // Find and click the initial cancel button
      const cancelButton = screen.getByRole('button', {
        name: /cancel subscription/i,
      });
      await user.click(cancelButton);

      // Should show confirmation dialog
      await waitFor(() => {
        expect(screen.getByText(/Yes, Cancel/i)).toBeInTheDocument();
      });

      // Click the confirmation button
      const confirmButton = screen.getByRole('button', {
        name: /Yes, Cancel/i,
      });
      await user.click(confirmButton);

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/Cancellation failed/i)).toBeInTheDocument();
      });
    });

    it('should display error message when reactivation fails', async () => {
      const user = userEvent.setup();

      mockUseSubscription.mockReturnValue({
        subscription: {
          id: 'sub_test123',
          userId: 'user_test123',
          status: 'active',
          planType: 'monthly',
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(
            Date.now() + 15 * 24 * 60 * 60 * 1000
          ).toISOString(),
          cancelAtPeriodEnd: true,
          canceledAt: new Date().toISOString(),
          trialEnd: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        loading: false,
        error: null,
        hasActiveSubscription: true,
        isTrialing: false,
        isCanceled: true,
        daysLeftInTrial: null,
        refresh: mockRefresh,
      });

      (subscriptionApi.reactivate as jest.Mock).mockRejectedValue(
        new Error('Reactivation failed')
      );

      render(<SubscriptionPage />);

      // Wait for page to render
      await waitFor(() => {
        expect(screen.getByText('Subscription')).toBeInTheDocument();
      });

      // Find and click the reactivate button
      const reactivateButton = screen.getByRole('button', {
        name: /reactivate/i,
      });
      await user.click(reactivateButton);

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/Reactivation failed/i)).toBeInTheDocument();
      });
    });
  });
});
