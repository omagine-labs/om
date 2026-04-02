/**
 * Stripe constants for the desktop app
 *
 * Note: The desktop app doesn't need actual Stripe price IDs since all
 * Stripe operations go through the web app API. These are only used
 * for display purposes in the pricing UI.
 */

/**
 * Stripe price IDs for subscription plans
 * These are placeholder values since actual Stripe operations
 * are handled by the web app API
 */
export const STRIPE_PRICE_IDS = {
  monthly: 'price_monthly',
  annual: 'price_annual',
} as const;

/**
 * Internal team coupon ID (placeholder)
 */
export const INTERNAL_COUPON_ID = 'internal_team';

/**
 * Trial period in days
 */
export const TRIAL_PERIOD_DAYS = 14;
