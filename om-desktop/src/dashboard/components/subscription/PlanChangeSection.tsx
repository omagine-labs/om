import type { SubscriptionResponse } from '@/lib/api/subscriptions';
import { PRICING_PLANS, formatPriceWithInterval } from '@/lib/pricing';
import { isFreeAccount as checkIsFreeAccount } from '@/lib/subscription-utils';

interface PlanChangeSectionProps {
  subscription: NonNullable<SubscriptionResponse['subscription']>;
  currentPlan: 'monthly' | 'annual';
  isCanceled: boolean;
  actionLoading: boolean;
  onChangePlan: (plan: 'monthly' | 'annual') => void;
}

export function PlanChangeSection({
  subscription,
  currentPlan,
  isCanceled,
  actionLoading,
  onChangePlan,
}: PlanChangeSectionProps) {
  const isFreeAccount = checkIsFreeAccount(subscription);

  // Hide for canceled subscriptions or free accounts
  if (isCanceled || isFreeAccount) {
    return null;
  }

  return (
    <div
      className="bg-white rounded-2xl shadow-lg p-6 xl:p-8 xl:pt-7 mb-6 animate-fadeInUp"
      style={{ animationDelay: '100ms' }}
    >
      <h2 className="font-display text-4xl font-semibold tracking-tighter text-teal-950 mb-5">
        Change Plan
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(['monthly', 'annual'] as const).map((planId) => {
          const plan = PRICING_PLANS[planId];
          const isCurrent = planId === currentPlan;
          return (
            <div
              key={planId}
              className={`rounded-xl border-2 p-5 transition-all ${
                isCurrent
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{plan.name}</h3>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {formatPriceWithInterval(plan)}
                  </p>
                  {plan.savings && (
                    <p className="mt-1 text-sm text-green-600">
                      {plan.savings}
                    </p>
                  )}
                </div>
                {isCurrent && (
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                    Current
                  </span>
                )}
              </div>
              {!isCurrent && (
                <button
                  onClick={() => onChangePlan(planId)}
                  disabled={actionLoading}
                  className="mt-4 w-full px-5 py-2.5 bg-slate-200 hover:bg-slate-300 active:bg-slate-400/70 text-slate-600 hover:text-slate-700 active:text-slate-800 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading
                    ? 'Processing...'
                    : planId === 'annual'
                      ? 'Upgrade to Annual'
                      : 'Downgrade to Monthly'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
