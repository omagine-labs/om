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
 * OPTIONS /api/subscriptions/cancel
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return handleCorsPrelight();
}

/**
 * POST /api/subscriptions/cancel
 *
 * Cancel subscription at the end of the current billing period
 * User retains access until period end
 *
 * Rate Limit: 5 requests per 10 minutes
 *
 * Returns:
 * - 200: Subscription canceled successfully
 * - 401: User not authenticated
 * - 404: No subscription found
 * - 409: Subscription already canceled
 * - 429: Rate limit exceeded
 * - 500: Internal server error
 */
async function handleCancelSubscription(request: NextRequest) {
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
    const { data: subscription, error: dbError } = (await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single()) as {
      data: {
        id: string;
        status: string;
        cancel_at_period_end: boolean;
        stripe_subscription_id: string;
        current_period_end: string;
      } | null;
      error: any;
    };

    if (dbError || !subscription) {
      console.error('[Cancel] Subscription not found:', dbError);
      throw new SubscriptionNotFoundError();
    }

    // Validate subscription is active
    if (!['trialing', 'active'].includes(subscription.status)) {
      throw new ForbiddenOperationError(
        'Subscription is not active. Cannot cancel.'
      );
    }

    // Check if already scheduled for cancellation
    if (subscription.cancel_at_period_end) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Subscription is already scheduled for cancellation',
            code: 'ALREADY_CANCELED',
          },
        },
        { status: 409, headers: corsHeaders }
      );
    }

    // Validate Stripe subscription ID exists
    if (!subscription.stripe_subscription_id) {
      throw new Error('Subscription missing Stripe subscription ID');
    }

    // Cancel subscription in Stripe (at period end)
    const stripe = getStripeClient();
    const stripeSubscriptionId = subscription.stripe_subscription_id; // Extract for TypeScript

    try {
      // First, check if subscription is managed by a schedule
      const stripeSubscription = await withRetry(() =>
        stripe.subscriptions.retrieve(stripeSubscriptionId)
      );

      let updatedSubscription: any;

      if (stripeSubscription.schedule) {
        // Subscription has a schedule - check if it's already canceled
        const scheduleId = stripeSubscription.schedule as string;
        console.log(`[Cancel] Checking schedule status: ${scheduleId}`);

        try {
          const schedule = await withRetry(() =>
            stripe.subscriptionSchedules.retrieve(scheduleId)
          );

          console.log(`[Cancel] Schedule status: ${schedule.status}`);

          // Only cancel if schedule is not already canceled
          if (schedule.status !== 'canceled') {
            console.log(`[Cancel] Canceling schedule: ${scheduleId}`);
            await withRetry(() =>
              stripe.subscriptionSchedules.cancel(scheduleId, {
                idempotencyKey: generateIdempotencyKey(
                  user.id,
                  'cancel-schedule'
                ),
              })
            );
          } else {
            console.log(`[Cancel] Schedule already canceled, skipping`);
          }
        } catch (scheduleError: any) {
          console.error(
            `[Cancel] Error handling schedule: ${scheduleError.message}`
          );
          // Continue with subscription cancellation even if schedule handling fails
        }

        // Update the subscription to cancel at period end
        updatedSubscription = await withRetry(() =>
          stripe.subscriptions.update(
            stripeSubscriptionId,
            {
              cancel_at_period_end: true,
            },
            {
              idempotencyKey: generateIdempotencyKey(
                user.id,
                'cancel-subscription'
              ),
            }
          )
        );
      } else {
        // No schedule - cancel subscription directly
        updatedSubscription = await withRetry(() =>
          stripe.subscriptions.update(
            stripeSubscriptionId,
            {
              cancel_at_period_end: true,
            },
            {
              idempotencyKey: generateIdempotencyKey(
                user.id,
                'cancel-subscription'
              ),
            }
          )
        );
      }

      updatedSubscription = updatedSubscription as any;

      // Get period end from subscription item (not top-level subscription)
      const subscriptionItem = updatedSubscription.items?.data[0] as any;
      const periodEnd = subscriptionItem?.current_period_end;

      // Update database
      console.log('[Cancel] Updating subscription in database:', {
        subscriptionId: subscription.id,
        userId: user.id,
      });

      const { data: updateData, error: updateError } = await supabase
        .from('subscriptions')
        .update({
          cancel_at_period_end: true,
          canceled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id)
        .select();

      console.log('[Cancel] Database update result:', {
        success: !updateError,
        rowsAffected: updateData?.length || 0,
        error: updateError,
      });

      if (updateError) {
        console.error(
          'Failed to update subscription in database:',
          updateError
        );
        throw new Error('Failed to update subscription in database');
      }

      if (!updateData || updateData.length === 0) {
        console.error('[Cancel] No rows updated - possible RLS issue');
        throw new Error(
          'Failed to update subscription - no rows affected (check RLS policies)'
        );
      }

      return NextResponse.json(
        {
          success: true,
          subscription: {
            id: updatedSubscription.id,
            cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
            canceledAt: new Date().toISOString(),
            accessUntil: periodEnd
              ? new Date(periodEnd * 1000).toISOString()
              : subscription.current_period_end,
          },
        },
        { status: 200, headers: corsHeaders }
      );
    } catch (error: any) {
      console.error('Stripe subscription cancellation error:', error);
      throw new StripeAPIError(
        error.message || 'Failed to cancel subscription',
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
export const POST = withValidation(handleCancelSubscription, {
  rateLimit: {
    maxRequests: 5,
    windowMs: 10 * 60 * 1000, // 10 minutes
  },
});
