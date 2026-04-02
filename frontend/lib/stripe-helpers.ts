import type { Database } from '@/supabase/database.types';
import { createServerSupabaseClient } from './supabase-server';
import { getStripeClient, STRIPE_PRICE_IDS, TRIAL_PERIOD_DAYS } from './stripe';
import type Stripe from 'stripe';
import { withRetry } from './stripe-retry';

type PlanType = Database['public']['Enums']['plan_type'];
type SubscriptionStatus = Database['public']['Enums']['subscription_status'];

/**
 * Get or create a Stripe customer for a user
 * This operation is idempotent - if customer exists, returns existing customer ID
 * Uses advisory locks to prevent race conditions during concurrent checkout sessions
 *
 * @param userId - Supabase user ID
 * @param email - User email address
 * @returns Stripe customer ID
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string
): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const stripe = getStripeClient();

  // Acquire advisory lock to prevent concurrent customer creation
  // Lock is automatically released at end of transaction
  const { error: lockError } = await supabase.rpc('acquire_user_lock', {
    p_user_id: userId,
  });

  if (lockError) {
    console.error('Failed to acquire user lock:', lockError);
    // Continue anyway - lock is a best-effort safety measure
  }

  // Try to check users table first (after migration 20251105055655)
  // Use type assertion to handle pre-migration deployments
  try {
    const { data: user }: any = await supabase
      .from('users')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (user?.stripe_customer_id) {
      return user.stripe_customer_id;
    }
  } catch (error) {
    // Column doesn't exist yet (pre-migration), fall through to subscriptions check
  }

  // Fallback: Check subscriptions table (backwards compatible)
  // Use limit(1) to handle users with multiple subscriptions
  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (subscriptions?.[0]?.stripe_customer_id) {
    // Update users table with this customer ID to avoid future lookups
    try {
      await supabase
        .from('users')
        .update({
          stripe_customer_id: subscriptions[0].stripe_customer_id,
        } as any)
        .eq('id', userId);
    } catch (error) {
      // Ignore errors - this is just an optimization
    }

    return subscriptions[0].stripe_customer_id;
  }

  console.log(
    `[getOrCreateStripeCustomer] Creating new Stripe customer for user ${userId}`
  );

  // Create new Stripe customer
  const customer = await withRetry(() =>
    stripe.customers.create({
      email,
      metadata: {
        user_id: userId,
      },
    })
  );

  console.log(`[getOrCreateStripeCustomer] Created customer: ${customer.id}`);

  // Store customer ID on users table to prevent duplicate creation (after migration 20251105055655)
  try {
    const { error: updateError } = await supabase
      .from('users')
      .update({ stripe_customer_id: customer.id } as any)
      .eq('id', userId);

    if (updateError) {
      console.error('Failed to update users.stripe_customer_id:', updateError);
    }
  } catch (error) {
    // Column doesn't exist yet (pre-migration), ignore
    console.log('stripe_customer_id column not yet available on users table');
  }

  return customer.id;
}

/**
 * Get Stripe price ID for a plan type
 *
 * @param planType - Plan type ('monthly' or 'annual')
 * @returns Stripe price ID
 * @throws {Error} If plan type is invalid or internal_free (not supported for checkout)
 */
export function getPriceIdForPlan(planType: PlanType): string {
  if (planType === 'internal_free') {
    throw new Error('internal_free plan does not have a Stripe price ID');
  }

  const priceId = STRIPE_PRICE_IDS[planType];

  if (!priceId) {
    throw new Error(`Invalid plan type: ${planType}`);
  }

  return priceId;
}

/**
 * Calculate trial end date (14 days from now)
 *
 * @returns Trial end date as ISO string
 */
export function calculateTrialEnd(): string {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + TRIAL_PERIOD_DAYS);
  return trialEnd.toISOString();
}

/**
 * Check if user is eligible for trial
 * User is only eligible if they haven't used their trial before
 *
 * @param userId - Supabase user ID
 * @returns true if user is eligible for trial
 */
export async function isUserEligibleForTrial(userId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  const { data: user } = await supabase
    .from('users')
    .select('trial_used')
    .eq('id', userId)
    .single();

  return !user?.trial_used;
}

/**
 * Generate idempotency key for Stripe API calls
 * This ensures duplicate requests don't create duplicate charges
 *
 * Format: {userId}-{operation}-{planType}-{timestamp}
 *
 * Each request gets a unique key based on timestamp to avoid collisions
 * when retrying operations multiple times in a single day.
 *
 * @param userId - Supabase user ID
 * @param operation - Operation name (e.g., 'create-subscription', 'change-plan')
 * @param planType - Plan type
 * @returns Idempotency key (max 255 chars)
 */
export function generateIdempotencyKey(
  userId: string,
  operation: string,
  planType?: PlanType
): string {
  const timestamp = Date.now(); // Unix timestamp in milliseconds
  const parts = [userId, operation, planType, timestamp].filter(Boolean);
  return parts.join('-');
}

/**
 * Convert Stripe subscription status to database subscription status
 *
 * @param stripeStatus - Stripe subscription status
 * @returns Database subscription status enum
 */
export function mapStripeStatusToDbStatus(
  stripeStatus: Stripe.Subscription.Status
): SubscriptionStatus {
  // Stripe statuses map directly to our database enum
  const statusMap: Record<Stripe.Subscription.Status, SubscriptionStatus> = {
    trialing: 'trialing',
    active: 'active',
    canceled: 'canceled',
    past_due: 'past_due',
    incomplete: 'incomplete',
    incomplete_expired: 'incomplete_expired',
    unpaid: 'unpaid',
    paused: 'active', // Treat paused as active
  };

  return statusMap[stripeStatus] || 'active';
}

/**
 * Check if subscription is active (user should have access)
 *
 * @param status - Subscription status
 * @returns true if subscription grants access
 */
export function isSubscriptionActive(status: SubscriptionStatus): boolean {
  return ['trialing', 'active'].includes(status);
}

/**
 * Get user's current subscription from database
 * If user has multiple subscriptions, returns the most recently updated one
 *
 * @param userId - Supabase user ID
 * @returns Subscription data or null if no subscription
 */
export async function getUserSubscription(userId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return null;
  }

  return data[0];
}

/**
 * Check if user has an active subscription
 *
 * @param userId - Supabase user ID
 * @returns true if user has active or trialing subscription
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const subscription = await getUserSubscription(userId);

  if (!subscription) {
    return false;
  }

  return isSubscriptionActive(subscription.status);
}

