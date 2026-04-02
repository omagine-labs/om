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

/**
 * Hook to fetch and manage subscription status
 */
export function useSubscription(): UseSubscriptionReturn {
  const [subscription, setSubscription] =
    useState<SubscriptionResponse['subscription']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await subscriptionApi.getCurrent();
      setSubscription(data.subscription);
    } catch (err) {
      console.error('Failed to fetch subscription:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscription();
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
