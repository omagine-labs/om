'use client';

import { useState, useEffect } from 'react';
import { subscriptionApi } from '@/lib/api/subscriptions';
import type { SubscriptionResponse } from '@/lib/api/subscriptions';
import { isFreeAccount as checkIsFreeAccount } from '@/lib/subscription-utils';

export interface UseSubscriptionReturn {
  subscription: SubscriptionResponse['subscription'];
  loading: boolean;
  error: string | null;
  hasActiveSubscription: boolean;
  isTrialing: boolean;
  isCanceled: boolean;
  isFreeAccount: boolean;
  daysLeftInTrial: number | null;
  refresh: () => Promise<void>;
}

export interface UseSubscriptionOptions {
  /** If true, fetch full details including Stripe discount/invoice info from web app API */
  withDetails?: boolean;
}

/**
 * Hook to fetch and manage subscription status
 * @param options.withDetails - If true, fetches full Stripe details (discount, upcoming invoice)
 */
export function useSubscription(
  options: UseSubscriptionOptions = {}
): UseSubscriptionReturn {
  const { withDetails = false } = options;
  const [subscription, setSubscription] =
    useState<SubscriptionResponse['subscription']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      setError(null);
      // Use direct Supabase query for basic data, or web app API for full Stripe details
      const data = withDetails
        ? await subscriptionApi.getCurrentWithDetails()
        : await subscriptionApi.getCurrent();
      setSubscription(data.subscription);
    } catch (err) {
      // Only log and set error for unexpected errors
      // "Not authenticated" is expected when user hasn't signed in yet
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      if (errorMessage !== 'Not authenticated') {
        console.error('Failed to fetch subscription:', err);
        setError(errorMessage);
      }
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate derived properties
  const hasActiveSubscription =
    subscription?.status === 'active' || subscription?.status === 'trialing';

  const isTrialing = subscription?.status === 'trialing';

  const isCanceled =
    subscription?.cancelAtPeriodEnd === true ||
    subscription?.status === 'canceled';

  const daysLeftInTrial =
    isTrialing && subscription?.trialEnd
      ? (() => {
          const days = Math.ceil(
            (new Date(subscription.trialEnd).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          );
          // Return null if trial has already ended (prevents showing negative days)
          // Use || 0 to convert -0 to 0 (JavaScript quirk)
          return days >= 0 ? days || 0 : null;
        })()
      : null;

  const isFreeAccount = subscription ? checkIsFreeAccount(subscription) : false;

  return {
    subscription,
    loading,
    error,
    hasActiveSubscription,
    isTrialing,
    isCanceled,
    isFreeAccount,
    daysLeftInTrial,
    refresh: fetchSubscription,
  };
}
