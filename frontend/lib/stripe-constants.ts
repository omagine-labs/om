/**
 * Stripe constants that can be used in both client and server code
 * These are safe to use in client components
 */

/**
 * Get Stripe price IDs from environment variables
 * Supports both test and production modes
 *
 * Environment variables:
 * - NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID: Monthly plan price ID
 * - NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID: Annual plan price ID
 *
 * @throws {Error} If required environment variables are not set
 */
function getStripePriceIds() {
  const monthlyPriceId = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID;
  const annualPriceId = process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID;

  if (!monthlyPriceId || !annualPriceId) {
    throw new Error(
      'Missing required Stripe price IDs. Please set NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID and NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID in your environment variables.'
    );
  }

  return {
    monthly: monthlyPriceId,
    annual: annualPriceId,
  } as const;
}

/**
 * Stripe price IDs for subscription plans
 * Automatically uses test or production IDs based on environment
 */
export const STRIPE_PRICE_IDS = getStripePriceIds();

/**
 * Get internal team coupon ID from environment variables
 * This coupon provides 100% off forever for internal team members
 * Must be created in both test and production Stripe accounts
 *
 * Environment variable:
 * - NEXT_PUBLIC_STRIPE_INTERNAL_COUPON_ID: Coupon ID for internal team
 *
 * @throws {Error} If NEXT_PUBLIC_STRIPE_INTERNAL_COUPON_ID is not set
 */
function getInternalCouponId() {
  const couponId = process.env.NEXT_PUBLIC_STRIPE_INTERNAL_COUPON_ID;

  if (!couponId) {
    throw new Error(
      'Missing required Stripe coupon ID. Please set NEXT_PUBLIC_STRIPE_INTERNAL_COUPON_ID in your environment variables.'
    );
  }

  return couponId;
}

/**
 * Internal team coupon ID (100% off forever)
 * Automatically uses test or production coupon based on environment
 */
export const INTERNAL_COUPON_ID = getInternalCouponId();

/**
 * Trial period in days (for Om subscriptions)
 */
export const TRIAL_PERIOD_DAYS = 14;

