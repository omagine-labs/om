import Stripe from 'stripe';
import 'server-only';

// Re-export constants for server-side convenience
export {
  STRIPE_PRICE_IDS,
  INTERNAL_COUPON_ID,
  TRIAL_PERIOD_DAYS,
} from './stripe-constants';

/**
 * Get the server-side Stripe client instance
 * IMPORTANT: This should only be used in server-side code (API routes, server components)
 *
 * @throws {Error} If STRIPE_SECRET_KEY is not configured
 * @returns {Stripe} Configured Stripe client
 */
export function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is not configured. Please add it to your environment variables.'
    );
  }

  // Use the latest API version compatible with the SDK
  return new Stripe(secretKey, {
    apiVersion: '2025-10-29.clover',
    typescript: true,
  });
}
