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

interface CheckoutSessionRequest {
  planType: PlanType;
  successUrl: string;
  cancelUrl: string;
  skipTrial?: boolean;
}

/**
 * POST /api/subscriptions/checkout-session
 *
 * Create a Stripe Checkout Session for subscription purchase
 *
 * Rate Limit: 10 requests per 5 minutes
 *
 * Request Body:
 * - planType: 'monthly' | 'annual'
 * - successUrl: URL to redirect on success
 * - cancelUrl: URL to redirect on cancel
 * - skipTrial: Optional boolean to skip trial period even if eligible
 *
 * Returns:
 * - 201: Checkout session created with ID and URL
 * - 400: Invalid request body or plan type
 * - 401: User not authenticated
 * - 409: User already has active subscription
 * - 429: Rate limit exceeded
 * - 500: Internal server error
 */
async function handleCheckoutSession(request: NextRequest) {
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
    let body: CheckoutSessionRequest;
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

    const { planType, successUrl, cancelUrl, skipTrial } = body;

    // Validate required fields
    if (!planType || !successUrl || !cancelUrl) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Missing required fields: planType, successUrl, cancelUrl',
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
    const isEligibleForTrial = await isUserEligibleForTrial(user.id);

    // Create Stripe Checkout Session
    const stripe = getStripeClient();

    try {
      const sessionConfig: any = {
        customer: customerId,
        mode: 'subscription' as const,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        billing_address_collection: 'auto' as const,
        metadata: {
          user_id: user.id,
          plan_type: planType,
        },
        subscription_data: {
          metadata: {
            user_id: user.id,
            plan_type: planType,
          },
        },
      };

      // Add trial if eligible and not explicitly skipped
      if (isEligibleForTrial && !skipTrial) {
        sessionConfig.subscription_data.trial_period_days = TRIAL_PERIOD_DAYS;
      }

      // Always allow promotion codes in Stripe Checkout
      sessionConfig.allow_promotion_codes = true;
      // Only require payment method if amount due > $0 (enables free promo codes)
      sessionConfig.payment_method_collection = 'if_required';

      const session = await withRetry(() =>
        stripe.checkout.sessions.create(sessionConfig, {
          idempotencyKey: generateIdempotencyKey(
            user.id,
            'checkout-session',
            planType
          ),
        })
      );

      return NextResponse.json(
        {
          success: true,
          sessionId: session.id,
          url: session.url,
          trialEligible: isEligibleForTrial,
        },
        { status: 201 }
      );
    } catch (error: any) {
      console.error('Stripe checkout session creation error:', error);
      throw new StripeAPIError(
        error.message || 'Failed to create checkout session',
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
export const POST = withValidation(handleCheckoutSession, {
  rateLimit: {
    maxRequests: 10,
    windowMs: 5 * 60 * 1000, // 5 minutes
  },
});
