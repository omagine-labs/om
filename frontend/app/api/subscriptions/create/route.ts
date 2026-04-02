import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { withValidation } from '@/app/api/_middleware/validation';
import {
  getStripeClient,
  TRIAL_PERIOD_DAYS,
  INTERNAL_COUPON_ID,
} from '@/lib/stripe';
import {
  getOrCreateStripeCustomer,
  getPriceIdForPlan,
  isUserEligibleForTrial,
  hasActiveSubscription,
  generateIdempotencyKey,
  mapStripeStatusToDbStatus,
} from '@/lib/stripe-helpers';
import {
  UnauthorizedError,
  InvalidPlanError,
  DuplicateSubscriptionError,
  StripeAPIError,
  formatErrorResponse,
} from '@/lib/errors';
import type { Database } from '@/supabase/database.types';
import { withRetry } from '@/lib/stripe-retry';

type PlanType = Database['public']['Enums']['plan_type'];

interface CreateSubscriptionRequest {
  planType: PlanType;
  applyTrial?: boolean;
  couponCode?: string;
}

/**
 * POST /api/subscriptions/create
 *
 * Create a subscription directly via API (alternative to Checkout Session)
 * This method creates the subscription immediately without a hosted checkout page
 *
 * Rate Limit: 5 requests per 10 minutes
 *
 * Request Body:
 * - planType: 'monthly' | 'annual'
 * - applyTrial: Optional boolean to apply 14-day trial (default: true if eligible)
 * - couponCode: Optional coupon code (e.g., internal team coupon)
 *
 * Returns:
 * - 201: Subscription created successfully
 * - 400: Invalid request body or plan type
 * - 401: User not authenticated
 * - 409: User already has active subscription
 * - 429: Rate limit exceeded
 * - 500: Internal server error
 */
async function handleCreateSubscription(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createAuthenticatedSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new UnauthorizedError();
    }

    // Parse request body
    let body: CreateSubscriptionRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Invalid JSON in request body',
            code: 'INVALID_REQUEST',
          },
        },
        { status: 400 }
      );
    }

    const { planType, applyTrial = true, couponCode } = body;

    // Validate required fields
    if (!planType) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Missing required field: planType',
            code: 'MISSING_FIELDS',
          },
        },
        { status: 400 }
      );
    }

    // Validate plan type
    if (planType !== 'monthly' && planType !== 'annual') {
      throw new InvalidPlanError(planType);
    }

    // Check if user already has active subscription
    if (await hasActiveSubscription(user.id)) {
      throw new DuplicateSubscriptionError();
    }

    // Get price ID for plan
    const priceId = getPriceIdForPlan(planType);

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(user.id, user.email!);

    // Check trial eligibility
    const isEligibleForTrial =
      applyTrial && (await isUserEligibleForTrial(user.id));

    // Create Stripe subscription
    const stripe = getStripeClient();

    try {
      const subscriptionConfig: any = {
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete' as const,
        payment_settings: {
          save_default_payment_method: 'on_subscription' as const,
        },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          user_id: user.id,
          plan_type: planType,
        },
      };

      // Add trial if eligible
      if (isEligibleForTrial) {
        subscriptionConfig.trial_period_days = TRIAL_PERIOD_DAYS;
      }

      // Apply coupon code if provided
      if (couponCode) {
        if (couponCode === INTERNAL_COUPON_ID) {
          subscriptionConfig.coupon = couponCode;
          // With 100% off coupon, no payment needed
          delete subscriptionConfig.payment_behavior;
          delete subscriptionConfig.payment_settings;
        } else {
          subscriptionConfig.coupon = couponCode;
        }
      }

      const subscription = (await withRetry(() =>
        stripe.subscriptions.create(subscriptionConfig, {
          idempotencyKey: generateIdempotencyKey(
            user.id,
            'create-subscription',
            planType
          ),
        })
      )) as any;

      // Insert subscription into database
      const status = mapStripeStatusToDbStatus(subscription.status);
      const subscriptionData = {
        user_id: user.id,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        status,
        plan_type: planType,
        trial_start: subscription.trial_start
          ? new Date(subscription.trial_start * 1000).toISOString()
          : null,
        trial_end: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        current_period_start: new Date(
          subscription.current_period_start * 1000
        ).toISOString(),
        current_period_end: new Date(
          subscription.current_period_end * 1000
        ).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        canceled_at: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabase
        .from('subscriptions')
        .insert(subscriptionData);

      if (insertError) {
        console.error('Failed to insert subscription:', insertError);
        throw new Error('Failed to save subscription to database');
      }

      // Update user flags
      const hasActive = ['trialing', 'active'].includes(status);
      await supabase
        .from('users')
        .update({
          has_active_subscription: hasActive,
          subscription_status: status,
          trial_used: isEligibleForTrial ? true : undefined,
        })
        .eq('id', user.id);

      // Get client secret for payment confirmation if needed
      let clientSecret: string | undefined;
      if (subscription.latest_invoice) {
        const invoice: any = subscription.latest_invoice;
        if (invoice.payment_intent) {
          const paymentIntent: any = invoice.payment_intent;
          clientSecret = paymentIntent.client_secret;
        }
      }

      return NextResponse.json(
        {
          success: true,
          subscription: {
            id: subscription.id,
            status: subscription.status,
            planType,
            trialStart: subscriptionData.trial_start,
            trialEnd: subscriptionData.trial_end,
            currentPeriodEnd: subscriptionData.current_period_end,
            clientSecret, // For frontend to confirm payment if needed
          },
        },
        { status: 201 }
      );
    } catch (error: any) {
      console.error('Stripe subscription creation error:', error);
      throw new StripeAPIError(
        error.message || 'Failed to create subscription',
        error.code
      );
    }
  } catch (error) {
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      {
        success: errorResponse.success,
        error: errorResponse.error,
      },
      { status: errorResponse.statusCode }
    );
  }
}

// Export with validation middleware
export const POST = withValidation(handleCreateSubscription, {
  rateLimit: {
    maxRequests: 5,
    windowMs: 10 * 60 * 1000, // 10 minutes
  },
});
