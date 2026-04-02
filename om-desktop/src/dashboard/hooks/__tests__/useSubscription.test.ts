/**
 * Unit tests for useSubscription hook (desktop app)
 * Tests subscription fetching, state management, and derived calculations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSubscription } from '../useSubscription';

// Mock the subscription API
vi.mock('@/lib/api/subscriptions', () => ({
  subscriptionApi: {
    getCurrent: vi.fn(),
    getCurrentWithDetails: vi.fn(),
  },
}));

import { subscriptionApi } from '@/lib/api/subscriptions';

// Helper to create mock subscription
function createMockSubscription(overrides = {}) {
  const now = new Date();
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + 30);

  return {
    id: 'test-subscription-id',
    user_id: 'test-user-id',
    stripe_subscription_id: 'sub_test123',
    stripe_customer_id: 'cus_test123',
    planType: 'monthly' as const,
    status: 'active' as const,
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: futureDate.toISOString(),
    cancelAtPeriodEnd: false,
    trialStart: null,
    trialEnd: null,
    canceledAt: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    discount: null,
    upcomingInvoice: {
      amountDue: 2999,
      currency: 'usd',
      periodStart: now.toISOString(),
      periodEnd: futureDate.toISOString(),
      subscriptionAmount: 2999,
    },
    ...overrides,
  };
}

describe('useSubscription hook (desktop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial fetch on mount', () => {
    it('should start with loading state', () => {
      vi.mocked(subscriptionApi.getCurrent).mockImplementation(
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

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.subscription).toEqual(mockSubscription);
      expect(result.current.error).toBeNull();
      expect(subscriptionApi.getCurrent).toHaveBeenCalled();
    });

    it('should use getCurrentWithDetails when withDetails=true', async () => {
      const mockSubscription = createMockSubscription({
        status: 'active',
      });

      vi.mocked(subscriptionApi.getCurrentWithDetails).mockResolvedValueOnce({
        subscription: mockSubscription,
      });

      const { result } = renderHook(() =>
        useSubscription({ withDetails: true })
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.subscription).toEqual(mockSubscription);
      expect(subscriptionApi.getCurrentWithDetails).toHaveBeenCalled();
      expect(subscriptionApi.getCurrent).not.toHaveBeenCalled();
    });

    it('should handle authentication errors silently (expected error)', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      vi.mocked(subscriptionApi.getCurrent).mockRejectedValueOnce(
        new Error('Not authenticated')
      );

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.subscription).toBeNull();
      expect(result.current.error).toBeNull(); // Should not set error for auth errors
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should set error state for unexpected errors', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      vi.mocked(subscriptionApi.getCurrent).mockRejectedValueOnce(
        new Error('Database error')
      );

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.subscription).toBeNull();
      expect(result.current.error).toBe('Database error');
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should handle null subscription (no subscription)', async () => {
      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: null,
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

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
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

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
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

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
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

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
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

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
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

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isCanceled).toBe(true);
    });

    it('should calculate daysLeftInTrial correctly', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const mockSubscription = createMockSubscription({
        status: 'trialing',
        trialEnd: futureDate.toISOString(),
      });

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
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

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
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

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.daysLeftInTrial).toBeNull();
    });

    it('should return 0 for daysLeftInTrial when trial ended recently (within 24h)', async () => {
      const recentPast = new Date();
      recentPast.setHours(recentPast.getHours() - 12);

      const mockSubscription = createMockSubscription({
        status: 'trialing',
        trialEnd: recentPast.toISOString(),
      });

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.daysLeftInTrial).toBe(0);
    });

    it('should return null for daysLeftInTrial when trial has already ended (prevents negative days)', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 3);

      const mockSubscription = createMockSubscription({
        status: 'trialing',
        trialEnd: pastDate.toISOString(),
      });

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

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

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
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

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isFreeAccount).toBe(false);
    });

    it('should return false for isFreeAccount when subscription is null', async () => {
      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: null,
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
      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: initialSubscription,
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.subscription?.status).toBe('trialing');

      // Second call via refresh
      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: updatedSubscription,
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.subscription?.status).toBe('active');
      });

      expect(subscriptionApi.getCurrent).toHaveBeenCalledTimes(2);
    });

    it('should set loading state during refresh', async () => {
      const mockSubscription = createMockSubscription({
        status: 'active',
      });

      vi.mocked(subscriptionApi.getCurrent).mockResolvedValue({
        subscription: mockSubscription,
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(subscriptionApi.getCurrent).toHaveBeenCalledTimes(2);
    });

    it('should handle errors during refresh', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const mockSubscription = createMockSubscription({
        status: 'active',
      });

      // First call succeeds
      vi.mocked(subscriptionApi.getCurrent).mockResolvedValueOnce({
        subscription: mockSubscription,
      });

      const { result } = renderHook(() => useSubscription());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeNull();

      // Refresh fails
      vi.mocked(subscriptionApi.getCurrent).mockRejectedValueOnce(
        new Error('Failed to refresh')
      );

      await act(async () => {
        await result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to refresh');
      });

      expect(result.current.subscription).toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });
});
