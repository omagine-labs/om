import type { PricingPlan } from '@/lib/pricing';
import { formatPrice } from '@/lib/pricing';

interface PricingCardProps {
  plan: PricingPlan;
  onSelect: (planId: 'monthly' | 'annual') => void;
  loading?: boolean;
  ctaText?: string;
  planId: 'monthly' | 'annual'; // Explicit plan ID for selection
}

export default function PricingCard({
  plan,
  planId,
  onSelect,
  loading = false,
  ctaText,
}: PricingCardProps) {
  const isAnnual = plan.interval === 'year';

  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 bg-white p-8 shadow-lg transition-all hover:shadow-xl ${
        plan.popular
          ? 'border-orange-300 ring-4 ring-orange-200 hover:translate-y-[-2px] transition-all duration-300'
          : 'border-slate-200 hover:translate-y-[-2px] transition-all duration-300'
      }`}
    >
      {/* Popular Badge */}
      {plan.popular && (
        <div className="absolute -top-4 uppercase left-1/2 -translate-x-1/2 rounded-full bg-orange-400 px-4 py-1 text-sm font-semibold text-white">
          Most Popular
        </div>
      )}

      {/* Plan Name & Description */}
      <div className="mb-6">
        <h3 className="text-5xl font-display font-semibold tracking-tighter text-gray-800">
          {plan.name}
        </h3>
        <p
          className={`mt-1 text-base ${plan.savings ? 'font-semibold text-green-600' : 'text-gray-600'}`}
        >
          {plan.description}
        </p>
      </div>

      {/* Pricing - fixed height with centered content */}
      <div className="h-40 flex flex-col items-center justify-center mb-6">
        <div className="flex items-baseline">
          <span className="text-7xl font-normal tracking-tighter text-teal-800">
            {formatPrice(plan)}
          </span>
          <span className="ml-2 text-gray-600">/month</span>
        </div>
        {isAnnual && plan.annualPrice ? (
          <p className="mt-1.5 text-base text-gray-500">
            ${plan.annualPrice} billed annually
          </p>
        ) : (
          <p className="mt-2 text-sm text-transparent">placeholder</p>
        )}
      </div>

      {/* Trial Badge */}
      <div className="mb-6 rounded-lg bg-lime-100 px-4 py-3 text-center">
        <p className="text-base font-medium text-teal-800">
          {plan.trialDays}-day free trial included
        </p>
        <p className="mt-0.5 text-xs text-slate-800/70">
          Card required • Cancel anytime
        </p>
      </div>

      {/* CTA Button */}
      <button
        onClick={() => onSelect(planId)}
        disabled={loading}
        className={`w-full rounded-lg px-6 py-3 text-base font-medium transition-colors ${
          plan.popular
            ? 'bg-orange-500/90 text-white hover:bg-orange-600/90 active:bg-orange-700/90 disabled:bg-orange-200'
            : 'bg-gray-200 text-slate-800 hover:bg-gray-300 active:bg-gray-400/70 disabled:bg-gray-100'
        }`}
      >
        {loading ? 'Processing...' : ctaText || 'Start Free Trial'}
      </button>
    </div>
  );
}
