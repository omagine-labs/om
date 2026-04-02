'use client';

import { useState, useEffect } from 'react';
import { subscriptionApi } from '@/lib/api/subscriptions';
import { useTestOverridesContext } from '@/contexts/TestOverridesContext';

export interface UseOmSubscriptionCheckReturn {
  hasOmSubscription: boolean;
  loading: boolean;
}

/**
 * Lightweight hook to check Om subscription status
 *
 * Unlike useSubscription, this hook:
 * - Returns false for unauthenticated users (no error)
 * - Only exposes hasOmSubscription boolean and loading state
 * - Designed for promo banner visibility checks
 *
 * In development mode, supports `?test_om=true/false` URL param to
 * override the hasOmSubscription value for testing promo banner visibility.
 */
export function useOmSubscriptionCheck(): UseOmSubscriptionCheckReturn {
  const [hasOmSubscription, setHasOmSubscription] = useState(false);
  const [loading, setLoading] = useState(true);
  const { testOm } = useTestOverridesContext();

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        const data = await subscriptionApi.getCurrent();
        // Active subscription means user has Om
        const isActive =
          data.subscription?.status === 'active' ||
          data.subscription?.status === 'trialing';
        setHasOmSubscription(isActive);
      } catch {
        // Unauthenticated users will get an error, treat as no subscription
        setHasOmSubscription(false);
      } finally {
        setLoading(false);
      }
    };

    checkSubscription();
  }, []);

  // Apply test override if present
  const effectiveHasOm = testOm !== undefined ? testOm : hasOmSubscription;

  return { hasOmSubscription: effectiveHasOm, loading };
}
