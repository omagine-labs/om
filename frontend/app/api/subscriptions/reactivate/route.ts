import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import { withValidation } from '@/app/api/_middleware/validation';
import { corsHeaders, handleCorsPrelight } from '@/app/api/_middleware/cors';
import { getStripeClient } from '@/lib/stripe';
import { generateIdempotencyKey } from '@/lib/stripe-helpers';
import {
  UnauthorizedError,
  SubscriptionNotFoundError,
  ForbiddenOperationError,
  StripeAPIError,
  formatErrorResponse,
} from '@/lib/errors';
import { withRetry } from '@/lib/stripe-retry';

/**
 * OPTIONS /api/subscriptions/reactivate
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return handleCorsPrelight();
}

/**
 * POST /api/subscriptions/reactivate
 *
 * Reactivate a canceled subscription (before period ends)
 * Clears the cancel_at_period_end flag
 *
 * Rate Limit: 5 requests per 10 minutes
 *
 * Returns:
 * - 200: Subscription reactivated successfully
 * - 401: User not authenticated
 * - 404: No subscription found
 * - 409: Subscription not scheduled for cancellation or already ended
 * - 429: Rate limit exceeded
 * - 500: Internal server error
 */
async function handleReactivateSubscription(request: NextRequest) {
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

    // Get current subscription from database
    const { data: subscription, error: dbError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (dbError || !subscription) {
      throw new SubscriptionNotFoundError();
    }

    // Check if subscription is scheduled for cancellation
    if (!subscription.cancel_at_period_end) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Subscription is not scheduled for cancellation',
            code: 'NOT_CANCELED',
          },
        },
        { status: 409, headers: corsHeaders }
      );
    }

    // Validate required fields
    if (
      !subscription.stripe_subscription_id ||
      !subscription.current_period_end
    ) {
      throw new Error('Subscription data incomplete');
    }

    // Check if subscription has already ended
    const periodEnd = new Date(subscription.current_period_end);
    if (periodEnd < new Date()) {
      throw new ForbiddenOperationError(
        'Subscription period has already ended. Cannot reactivate.'
      );
    }

    // Reactivate subscription in Stripe
    const stripe = getStripeClient();
    const stripeSubscriptionId = subscription.stripe_subscription_id; // Extract for TypeScript

    try {
      const updatedSubscription = (await withRetry(() =>
        stripe.subscriptions.update(
          stripeSubscriptionId,
          {
            cancel_at_period_end: false,
          },
          {
            idempotencyKey: generateIdempotencyKey(
              user.id,
              'reactivate-subscription'
            ),
          }
        )
      )) as any;

      // Get period end from subscription item (not top-level subscription)
      const subscriptionItem = updatedSubscription.items?.data[0] as any;
      const periodEnd = subscriptionItem?.current_period_end;

      // Update database
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: false,
          canceled_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);

      if (updateError) {
        console.error(
          'Failed to update subscription in database:',
          updateError
        );
        throw new Error('Failed to update subscription in database');
      }

      return NextResponse.json(
        {
          success: true,
          subscription: {
            id: updatedSubscription.id,
            status: updatedSubscription.status,
            cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
            currentPeriodEnd: periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : subscription.current_period_end,
          },
        },
        { status: 200, headers: corsHeaders }
      );
    } catch (error: any) {
      console.error('Stripe subscription reactivation error:', error);
      throw new StripeAPIError(
        error.message || 'Failed to reactivate subscription',
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
      { status: errorResponse.statusCode, headers: corsHeaders }
    );
  }
}

// Export with validation middleware
export const POST = withValidation(handleReactivateSubscription, {
  rateLimit: {
    maxRequests: 5,
    windowMs: 10 * 60 * 1000, // 10 minutes
  },
});
