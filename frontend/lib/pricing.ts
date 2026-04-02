import { STRIPE_PRICE_IDS, TRIAL_PERIOD_DAYS } from './stripe-constants';

/**
 * Plan type matching database enum
 */
export type PlanType = 'monthly' | 'annual' | 'internal_free';

/**
 * Pricing configuration for subscription plans
 */
export interface PricingPlan {
  id: PlanType;
  name: string;
  description: string;
  price: number; // Monthly price (or monthly equivalent for annual)
  annualPrice?: number; // Total annual price (only for annual plan)
  interval: 'month' | 'year';
  intervalLabel: string;
  priceId: string;
  popular?: boolean;
  savings?: string;
  features: string[];
  trialDays: number;
}

/**
 * Available subscription plans
 */
export const PRICING_PLANS: Record<'monthly' | 'annual', PricingPlan> = {
  monthly: {
    id: 'monthly',
    name: 'Monthly',
    description: 'Flexible month-to-month billing',
    price: 20,
    interval: 'month',
    intervalLabel: 'per month',
    priceId: STRIPE_PRICE_IDS.monthly,
    features: [
      'Unlimited meeting uploads',
      'AI-powered transcription',
      'Speaker diarization',
      'Communication insights',
      'Behavioral analysis',
      '13 communication metrics',
      'Company values alignment',
      'Unlimited storage',
      'Priority support',
    ],
    trialDays: TRIAL_PERIOD_DAYS,
  },
  annual: {
    id: 'annual',
    name: 'Annual',
    description: 'Best value - save $60/year',
    price: 15,
    annualPrice: 180,
    interval: 'year',
    intervalLabel: 'per month, billed annually',
    priceId: STRIPE_PRICE_IDS.annual,
    popular: true,
    savings: 'Save $60/year',
    features: [
      'Unlimited meeting uploads',
      'AI-powered transcription',
      'Speaker diarization',
      'Communication insights',
      'Behavioral analysis',
      '13 communication metrics',
      'Company values alignment',
      'Unlimited storage',
      'Priority support',
      '2 months free',
    ],
    trialDays: TRIAL_PERIOD_DAYS,
  },
};

/**
 * Helper to get plan by ID
 */
export function getPlanById(planId: 'monthly' | 'annual'): PricingPlan {
  return PRICING_PLANS[planId];
}

/**
 * Get formatted price display
 */
export function formatPrice(plan: PricingPlan): string {
  return `$${plan.price}`;
}

/**
 * Get full price display with interval
 */
export function formatPriceWithInterval(plan: PricingPlan): string {
  return `$${plan.price}/${plan.interval === 'month' ? 'mo' : 'mo'}`;
}

/**
 * Get annual total price display
 */
export function formatAnnualTotal(plan: PricingPlan): string {
  if (plan.interval === 'year' && plan.annualPrice) {
    return `$${plan.annualPrice}/year`;
  }
  return `$${plan.price * 12}/year`;
}

/**
 * Pricing page copy and messaging
 */
export const PRICING_COPY = {
  heading: 'Choose Your Plan',
  subheading: 'Start your 14-day free trial. Card required, cancel anytime.',
  trialBadge: '14-day free trial',
  professionalDevelopment:
    'Many companies offer professional development budgets that can cover the cost of this subscription. Check with your HR or manager.',
  skipTrialLabel: 'Skip trial and pay immediately',
  couponLabel: 'Have a coupon code?',
  couponPlaceholder: 'Enter code',
  ctaPrimary: 'Start Free Trial',
  ctaSkipTrial: 'Subscribe Now',
  trialNotice:
    'Your card will be charged after the 14-day trial period ends. You can cancel anytime before then.',
};
