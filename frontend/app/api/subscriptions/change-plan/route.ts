import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import {
  checkRateLimit,
  getRateLimitHeaders,
} from '@/app/api/_middleware/rate-limit';
import { corsHeaders, handleCorsPrelight } from '@/app/api/_middleware/cors';
import { getStripeClient } from '@/lib/stripe';
import {
  getPriceIdForPlan,
  generateIdempotencyKey,
} from '@/lib/stripe-helpers';
import {
  UnauthorizedError,
  InvalidPlanError,
  SubscriptionNotFoundError,
  StripeAPIError,
  formatErrorResponse,
} from '@/lib/errors';
import type { Database } from '@/supabase/database.types';
import { withRetry } from '@/lib/stripe-retry';

type PlanType = Database['public']['Enums']['plan_type'];

/**
 * OPTIONS /api/subscriptions/change-plan
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return handleCorsPrelight();
}

interface ChangePlanRequest {
  newPlanType: PlanType;
}

/**
 * PATCH /api/subscriptions/change-plan
 *
 * Change subscription plan between monthly and annual
 * Stripe automatically handles proration (charges or credits the difference)
 *
 * Rate Limit: 5 requests per 10 minutes
 *
 * Request Body:
 * - newPlanType: 'monthly' | 'annual'
 *
 * Returns:
 * - 200: Plan changed successfully
 * - 400: Invalid plan type or same as current
 * - 401: User not authenticated
 * - 404: No active subscription found
 * - 429: Rate limit exceeded
 * - 500: Internal server error
 */
async function handleChangePlan(request: NextRequest) {
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

    // Check rate limit (5 requests per 10 minutes)
    const rateLimitResponse = checkRateLimit({
      key: user.id,
      maxRequests: 5,
      windowMs: 10 * 60 * 1000,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Parse request body
    let body: ChangePlanRequest;
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
        { status: 400, headers: corsHeaders }
      );
    }

    const { newPlanType } = body;

    // Validate required fields
    if (!newPlanType) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Missing required field: newPlanType',
            code: 'MISSING_FIELDS',
          },
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate plan type
    if (newPlanType !== 'monthly' && newPlanType !== 'annual') {
      throw new InvalidPlanError(newPlanType);
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

    // Validate subscription is active
    if (!['trialing', 'active'].includes(subscription.status)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: 'Subscription is not active. Cannot change plan.',
            code: 'SUBSCRIPTION_NOT_ACTIVE',
          },
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if new plan is different from current
    if (subscription.plan_type === newPlanType) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: `Subscription is already on ${newPlanType} plan`,
            code: 'SAME_PLAN',
          },
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get new price ID
    const newPriceId = getPriceIdForPlan(newPlanType);

    // Validate Stripe subscription ID and price ID exist
    if (!subscription.stripe_subscription_id) {
      throw new Error('Subscription missing Stripe subscription ID');
    }
    if (!subscription.stripe_price_id) {
      throw new Error('Subscription missing Stripe price ID');
    }

    // Update Stripe subscription
    const stripe = getStripeClient();
    const stripeSubscriptionId = subscription.stripe_subscription_id; // Extract for TypeScript

    try {
      // Get subscription item ID (first item in subscription)
      const stripeSubscription = await withRetry(() =>
        stripe.subscriptions.retrieve(stripeSubscriptionId)
      );

      const subscriptionItemId = stripeSubscription.items.data[0]?.id;

      if (!subscriptionItemId) {
        throw new Error('Subscription item not found');
      }

      // Determine if this is a downgrade (annual to monthly)
      const isDowngrade =
        subscription.plan_type === 'annual' && newPlanType === 'monthly';

      // Check if subscription is in trial
      const isTrialing =
        stripeSubscription.status === 'trialing' &&
        stripeSubscription.trial_end;

      let updatedSubscription: any;

      if (isTrialing) {
        // TRIAL SUBSCRIPTIONS: Change immediately with no proration
        // Works for both upgrades and downgrades - no charge during trial
        const updateParams: any = {
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          proration_behavior: 'none', // No proration during trial
          trial_end: stripeSubscription.trial_end, // Preserve trial period
          metadata: {
            user_id: user.id,
            plan_type: newPlanType,
          },
        };

        updatedSubscription = await withRetry(() =>
          stripe.subscriptions.update(stripeSubscriptionId, updateParams, {
            idempotencyKey: generateIdempotencyKey(
              user.id,
              'change-plan-trial',
              newPlanType
            ),
          })
        );
      } else if (isDowngrade) {
        // For downgrades, use subscription schedule to change at period end
        // This preserves the current billing cycle until it naturally ends

        let scheduleId: string;

        // Check if subscription already has a schedule
        if (stripeSubscription.schedule) {
          // Use existing schedule
          scheduleId = stripeSubscription.schedule as string;
        } else {
          // Create a new subscription schedule from the existing subscription
          const schedule = await withRetry(() =>
            stripe.subscriptionSchedules.create(
              {
                from_subscription: stripeSubscriptionId,
              },
              {
                idempotencyKey: generateIdempotencyKey(
                  user.id,
                  'schedule-downgrade',
                  newPlanType
                ),
              }
            )
          );
          scheduleId = schedule.id;
        }

        // Fetch the schedule to get current phase details
        const currentSchedule = await withRetry(() =>
          stripe.subscriptionSchedules.retrieve(scheduleId)
        );

        // Update the schedule to add a phase for the new monthly plan at period end
        const updatedSchedule = await withRetry(() =>
          stripe.subscriptionSchedules.update(scheduleId, {
            phases: [
              {
                // Phase 1: Keep current annual plan until period end
                items: [
                  {
                    price: subscription.stripe_price_id!, // Validated above
                    quantity: 1,
                  },
                ],
                start_date: currentSchedule.phases[0].start_date,
                end_date: currentSchedule.phases[0].end_date,
              },
              {
                // Phase 2: Start monthly plan at period end (continues indefinitely)
                items: [
                  {
                    price: newPriceId,
                    quantity: 1,
                  },
                ],
              },
            ],
            end_behavior: 'release', // Release subscription after schedule completes
          })
        );

        // Get the subscription object from the schedule
        updatedSubscription = await withRetry(() =>
          stripe.subscriptions.retrieve(stripeSubscriptionId)
        );
      } else {
        // ACTIVE SUBSCRIPTION UPGRADES: Apply immediately with proration (immediate charge)

        // If subscription has a schedule, release it first
        if (stripeSubscription.schedule) {
          await withRetry(() =>
            stripe.subscriptionSchedules.release(
              stripeSubscription.schedule as string
            )
          );
        }

        const updateParams: any = {
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          proration_behavior: 'create_prorations',
          proration_date: Math.floor(Date.now() / 1000),
          metadata: {
            user_id: user.id,
            plan_type: newPlanType,
          },
        };

        updatedSubscription = await withRetry(() =>
          stripe.subscriptions.update(stripeSubscriptionId, updateParams, {
            idempotencyKey: generateIdempotencyKey(
              user.id,
              'change-plan',
              newPlanType
            ),
          })
        );
      }

      // Update database
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          plan_type: newPlanType,
          stripe_price_id: newPriceId,
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
            planType: newPlanType,
            currentPeriodStart: updatedSubscription.current_period_start
              ? new Date(
                  updatedSubscription.current_period_start * 1000
                ).toISOString()
              : null,
            currentPeriodEnd: updatedSubscription.current_period_end
              ? new Date(
                  updatedSubscription.current_period_end * 1000
                ).toISOString()
              : null,
          },
        },
        {
          status: 200,
          headers: {
            ...corsHeaders,
            ...getRateLimitHeaders({
              key: user.id,
              maxRequests: 5,
              windowMs: 10 * 60 * 1000,
            }),
          },
        }
      );
    } catch (error: any) {
      console.error('Stripe plan change error:', error);
      throw new StripeAPIError(
        error.message || 'Failed to change plan',
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

// Export PATCH handler with manual rate limiting
export async function PATCH(request: NextRequest) {
  return handleChangePlan(request);
}
