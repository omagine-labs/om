/**
 * Unit tests for useSubscription hook
 * Tests subscription fetching, state management, and derived calculations
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useSubscription } from '@/hooks/useSubscription';
import { createMockSubscription } from '../../utils/mock-subscription';
import type { SubscriptionResponse } from '@/lib/api/subscriptions';

// Mock fetch globally
global.fetch = jest.fn();

describe('useSubscription hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Initial fetch on mount', () => {
    it('should start with loading state', () => {
      (global.fetch as jest.Mock).mockImplementation(
        () =>
          new Promise(() => {
            /* Never resolves */
          })
      );

      const { result } = renderHook(() => useSubscription());

      expect(result.current.loading).toBe(true);
      expect(result.current.subscription).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should fetch subscription data on mount', async () => {
      const mockSubscription = createMockSubscription({
        status: 'active',
      });

      const mockResponse: SubscriptionResponse = {
        subscription: mockSubscription,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.subscription).toEqual(mockSubscription);
      expect(result.current.error).toBeNull();
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/subscriptions/current',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should set error state when fetch fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: {
            message: 'Subscription not found',
            code: 'SUBSCRIPTION_NOT_FOUND',
          },
        }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.subscription).toBeNull();
      expect(result.current.error).toBe('Subscription not found');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error')
      );

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.subscription).toBeNull();
      expect(result.current.error).toBe('Network error');
    });

    it('should handle null subscription (no subscription)', async () => {
      const mockResponse: SubscriptionResponse = {
        subscription: null,
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.subscription).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.hasActiveSubscription).toBe(false);
    });
  });

  describe('Derived properties', () => {
    it('should calculate hasActiveSubscription for active status', async () => {
      const mockSubscription = createMockSubscription({
        status: 'active',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasActiveSubscription).toBe(true);
    });

    it('should calculate hasActiveSubscription for trialing status', async () => {
      const mockSubscription = createMockSubscription({
        status: 'trialing',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasActiveSubscription).toBe(true);
    });

    it('should calculate hasActiveSubscription as false for canceled status', async () => {
      const mockSubscription = createMockSubscription({
        status: 'canceled',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.hasActiveSubscription).toBe(false);
    });

    it('should calculate isTrialing correctly', async () => {
      const mockSubscription = createMockSubscription({
        status: 'trialing',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isTrialing).toBe(true);
    });

    it('should calculate isCanceled when cancelAtPeriodEnd is true', async () => {
      const mockSubscription = createMockSubscription({
        status: 'active',
        cancelAtPeriodEnd: true,
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isCanceled).toBe(true);
    });

    it('should calculate isCanceled when status is canceled', async () => {
      const mockSubscription = createMockSubscription({
        status: 'canceled',
        cancelAtPeriodEnd: false,
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isCanceled).toBe(true);
    });

    it('should calculate daysLeftInTrial correctly', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10); // 10 days from now

      const mockSubscription = createMockSubscription({
        status: 'trialing',
        trialEnd: futureDate.toISOString(),
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.daysLeftInTrial).toBeGreaterThanOrEqual(9);
      expect(result.current.daysLeftInTrial).toBeLessThanOrEqual(10);
    });

    it('should return null for daysLeftInTrial when not trialing', async () => {
      const mockSubscription = createMockSubscription({
        status: 'active',
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.daysLeftInTrial).toBeNull();
    });

    it('should return null for daysLeftInTrial when trialEnd is missing', async () => {
      const mockSubscription = createMockSubscription({
        status: 'trialing',
        trialEnd: null,
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.daysLeftInTrial).toBeNull();
    });

    it('should return 0 for daysLeftInTrial when trial ended recently (within 24h)', async () => {
      // Create a trial that ended 12 hours ago
      // Math.ceil(-12/24) = Math.ceil(-0.5) = 0
      const recentPast = new Date();
      recentPast.setHours(recentPast.getHours() - 12);

      const mockSubscription = createMockSubscription({
        status: 'trialing',
        trialEnd: recentPast.toISOString(),
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should return 0 (not null) to show "Your trial ends today" message
      // This gives a grace period for users to see the message on the day trial ended
      expect(result.current.daysLeftInTrial).toBe(0);
    });

    it('should return null for daysLeftInTrial when trial has already ended (prevents negative days)', async () => {
      // Create a trial that ended 3 days ago
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 3);

      const mockSubscription = createMockSubscription({
        status: 'trialing',
        trialEnd: pastDate.toISOString(),
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Should return null instead of a negative number
      expect(result.current.daysLeftInTrial).toBeNull();
    });

    it('should calculate isFreeAccount correctly for free account', async () => {
      const mockSubscription = createMockSubscription({
        status: 'active',
        discount: {
          couponId: 'internal_free',
          percentOff: 100,
          amountOff: null,
          currency: null,
          duration: 'forever',
          durationInMonths: null,
          validUntil: null,
        },
        upcomingInvoice: {
          amountDue: 0,
          currency: 'usd',
          periodStart: new Date().toISOString(),
          periodEnd: new Date().toISOString(),
          subscriptionAmount: 0,
        },
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isFreeAccount).toBe(true);
    });

    it('should calculate isFreeAccount correctly for paying customer', async () => {
      const mockSubscription = createMockSubscription({
        status: 'active',
        discount: null,
        upcomingInvoice: {
          amountDue: 2999,
          currency: 'usd',
          periodStart: new Date().toISOString(),
          periodEnd: new Date().toISOString(),
          subscriptionAmount: 2999,
        },
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isFreeAccount).toBe(false);
    });

    it('should return false for isFreeAccount when subscription is null', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: null }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isFreeAccount).toBe(false);
    });
  });

  describe('Refresh functionality', () => {
    it('should refetch subscription data when refresh is called', async () => {
      const initialSubscription = createMockSubscription({
        status: 'trialing',
      });

      const updatedSubscription = createMockSubscription({
        status: 'active',
      });

      // First call on mount
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: initialSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.subscription?.status).toBe('trialing');

      // Second call via refresh
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: updatedSubscription }),
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.subscription?.status).toBe('active');
      });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should set loading state during refresh', async () => {
      const mockSubscription = createMockSubscription({
        status: 'active',
      });

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Trigger refresh
      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Verify refresh was called
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle errors during refresh', async () => {
      const mockSubscription = createMockSubscription({
        status: 'active',
      });

      // First call succeeds
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ subscription: mockSubscription }),
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();

      // Refresh fails
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: {
            message: 'Failed to refresh',
            code: 'REFRESH_ERROR',
          },
        }),
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to refresh');
      });

      expect(result.current.subscription).toBeNull();
    });
  });
});
