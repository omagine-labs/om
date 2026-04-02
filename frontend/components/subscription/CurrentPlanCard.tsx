import type { SubscriptionResponse } from '@/lib/api/subscriptions';
import { PRICING_PLANS, formatPriceWithInterval } from '@/lib/pricing';
import type { PlanType } from '@/lib/pricing';
import { SubscriptionBadge } from './SubscriptionBadge';
import {
  formatSubscriptionDate,
  isFreeAccount as checkIsFreeAccount,
} from '@/lib/subscription-utils';

interface CurrentPlanCardProps {
  subscription: NonNullable<SubscriptionResponse['subscription']>;
  isTrialing: boolean;
  isCanceled: boolean;
  daysLeftInTrial: number | null;
}

export function CurrentPlanCard({
  subscription,
  isTrialing,
  isCanceled,
  daysLeftInTrial,
}: CurrentPlanCardProps) {
  const currentPlan = subscription.planType as 'monthly' | 'annual' | undefined;
  const isFreeAccount = checkIsFreeAccount(subscription);

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 xl:p-8 xl:pt-7 mb-6 animate-fadeInUp">
      <div className="flex items-start justify-between">
        <div className="max-w-md w-full">
          <h2 className="font-display text-4xl font-semibold tracking-tighter text-teal-950 mb-5">
            Current Plan
          </h2>

          {/* Show "Free" if user will never be charged (100% discount or free account) */}
          {isFreeAccount ? (
            <div className="rounded-xl border-2 border-green-500 bg-green-50 p-5 mt-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-green-600">
                    {currentPlan ? PRICING_PLANS[currentPlan]?.name : 'Monthly'}{' '}
                    (100% off)
                  </h3>
                </div>
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  Current
                </span>
              </div>
            </div>
          ) : currentPlan ? (
            <div className="rounded-xl border-2 border-blue-500 bg-blue-50 p-5 mt-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {PRICING_PLANS[currentPlan]?.name}
                  </h3>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {formatPriceWithInterval(PRICING_PLANS[currentPlan])}
                  </p>
                  {PRICING_PLANS[currentPlan]?.savings && (
                    <p className="mt-1 text-sm text-green-600">
                      {PRICING_PLANS[currentPlan].savings}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                  Current
                </span>
              </div>

              {/* Discount Information */}
              {subscription.discount && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2">
                  <svg
                    className="h-5 w-5 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <div className="text-sm font-semibold text-green-900">
                    {subscription.discount.percentOff
                      ? `${subscription.discount.percentOff}% off`
                      : subscription.discount.amountOff
                        ? `$${(subscription.discount.amountOff / 100).toFixed(2)} off`
                        : 'Discount applied'}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* Next Charge Information */}
          {subscription.upcomingInvoice &&
            !isCanceled &&
            subscription.upcomingInvoice.amountDue > 0 && (
              <div className="mt-3">
                {/* Show subscription charge (next renewal) */}
                {subscription.upcomingInvoice.subscriptionAmount !==
                  undefined &&
                subscription.upcomingInvoice.subscriptionAmount > 0 ? (
                  <div>
                    <p className="text-sm text-slate-600">
                      {isTrialing ? 'After trial ends:' : 'Next renewal:'}
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      $
                      {(
                        subscription.upcomingInvoice.subscriptionAmount / 100
                      ).toFixed(2)}{' '}
                      on{' '}
                      {formatSubscriptionDate(
                        subscription.upcomingInvoice.periodEnd
                      )}
                    </p>
                  </div>
                ) : (
                  /* Fallback to total if no breakdown available */
                  <div>
                    <p className="text-sm text-slate-600">
                      {isTrialing ? 'After trial ends:' : 'Next renewal:'}
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      $
                      {(subscription.upcomingInvoice.amountDue / 100).toFixed(
                        2
                      )}{' '}
                      on{' '}
                      {formatSubscriptionDate(
                        subscription.upcomingInvoice.periodEnd
                      )}
                    </p>
                  </div>
                )}

                {/* Discount information */}
                {subscription.discount?.validUntil && (
                  <p className="text-sm text-slate-600 mt-2">
                    Discount expires:{' '}
                    {formatSubscriptionDate(subscription.discount.validUntil)}
                  </p>
                )}
                {subscription.discount?.duration === 'forever' && (
                  <p className="text-sm text-green-600 mt-2 font-medium">
                    Discount applies forever
                  </p>
                )}
              </div>
            )}

          {/* Show message for users with 100% discount (never charged) */}
          {isFreeAccount && !isCanceled && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800 font-medium">
                ✓ Your account is permanently free
              </p>
              <p className="text-xs text-green-700 mt-1">
                You will never be charged
              </p>
            </div>
          )}
        </div>
        <div>
          <SubscriptionBadge
            status={
              isTrialing ? 'trialing' : isCanceled ? 'canceled' : 'active'
            }
            daysLeftInTrial={daysLeftInTrial}
          />
        </div>
      </div>

      {/* Only show billing period for paying users */}
      {!isFreeAccount && (
        <div className="mt-6 pt-6 border-t-2 border-dashed border-slate-200 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-slate-600">
              {isTrialing ? 'Trial period' : 'Current period'}
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">
              {/* Use trial dates as fallback if billing period not set yet */}
              {isTrialing &&
              subscription.trialStart &&
              subscription.trialEnd ? (
                <>
                  {formatSubscriptionDate(subscription.trialStart)} -{' '}
                  {formatSubscriptionDate(subscription.trialEnd)}
                </>
              ) : subscription.currentPeriodStart &&
                subscription.currentPeriodEnd ? (
                <>
                  {formatSubscriptionDate(subscription.currentPeriodStart)} -{' '}
                  {formatSubscriptionDate(subscription.currentPeriodEnd)}
                </>
              ) : (
                'Not available'
              )}
            </p>
          </div>
          {subscription.trialEnd && isTrialing && (
            <div>
              <p className="text-sm text-slate-600">Trial ends</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {formatSubscriptionDate(subscription.trialEnd)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
