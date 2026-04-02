'use client';

import Link from 'next/link';
import { useSubscription } from '@/hooks/useSubscription';
import { formatSubscriptionDate } from '@/lib/subscription-utils';

export default function SubscriptionBanner() {
  const {
    subscription,
    loading,
    isTrialing,
    isCanceled,
    isFreeAccount,
    daysLeftInTrial,
  } = useSubscription();

  // Don't show anything while loading
  if (loading) {
    return null;
  }

  // Don't show banner if no subscription (shouldn't happen due to middleware)
  if (!subscription) {
    return null;
  }

  // Don't show trial banner for free/lifetime users (even if they're in trial status)
  if (isFreeAccount) {
    return null;
  }

  // Show trial countdown if user is on trial
  if (isTrialing && daysLeftInTrial !== null && daysLeftInTrial <= 3) {
    return (
      <div className="mb-10 rounded-lg shadow-md border-blue-200 bg-slate-50 p-4 hover:shadow-lg hover:translate-y-[-1px] transition-all">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <svg
              className="h-8 w- text-teal-500 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="ml-3">
              <h3 className="text-sm font-bold text-teal-700 uppercase tracking-wide">
                {daysLeftInTrial === 0
                  ? 'Your trial ends today'
                  : daysLeftInTrial === 1
                    ? '1 day left in your free trial'
                    : `${daysLeftInTrial} days left in your free trial`}
              </h3>
              <p className="mt-[2px ] text-base text-slate-600">
                Your card will be charged after the trial period ends. You can
                cancel anytime before then.
              </p>
            </div>
          </div>
          <Link
            href="/settings/subscription"
            className="ml-3 flex-shrink-0 rounded-[6px] bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
          >
            Manage
          </Link>
        </div>
      </div>
    );
  }

  // Show cancellation notice if subscription is canceled
  if (isCanceled) {
    const periodEnd = subscription.currentPeriodEnd
      ? formatSubscriptionDate(subscription.currentPeriodEnd)
      : 'the end of your billing period';

    return (
      <div className="mb-6 rounded-lg border-2 border-yellow-200 bg-yellow-50 p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start">
            <svg
              className="h-6 w-6 text-yellow-600 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-900">
                Your subscription is canceled
              </h3>
              <p className="mt-1 text-sm text-yellow-800">
                You can continue using the service until {periodEnd}. Reactivate
                anytime before then to keep your access.
              </p>
            </div>
          </div>
          <Link
            href="/settings/subscription"
            className="ml-3 flex-shrink-0 rounded-lg bg-yellow-600 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-700"
          >
            Reactivate
          </Link>
        </div>
      </div>
    );
  }

  // Don't show anything for active paid subscriptions (clean UI)
  return null;
}
