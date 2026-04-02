import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import {
  checkRateLimit,
  getRateLimitHeaders,
} from '@/app/api/_middleware/rate-limit';
import { corsHeaders, handleCorsPrelight } from '@/app/api/_middleware/cors';
import { getStripeClient } from '@/lib/stripe';
import { getPriceIdForPlan } from '@/lib/stripe-helpers';
import {
  UnauthorizedError,
  InvalidPlanError,
  SubscriptionNotFoundError,
  formatErrorResponse,
} from '@/lib/errors';
import type { Database } from '@/supabase/database.types';
import { withRetry } from '@/lib/stripe-retry';

type PlanType = Database['public']['Enums']['plan_type'];

/**
 * OPTIONS /api/subscriptions/preview-change
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return handleCorsPrelight();
}

interface PreviewChangeRequest {
  newPlanType: PlanType;
}

/**
 * POST /api/subscriptions/preview-change
 *
 * Preview what would happen if the user changed to a new plan
 * Shows proration amount and next renewal without actually changing the subscription
 *
 * Rate Limit: 30 requests per 5 minutes
 *
 * Request Body:
 * - newPlanType: 'monthly' | 'annual'
 *
 * Returns:
 * - 200: Preview details including proration
 * - 400: Invalid plan type or same as current
 * - 401: User not authenticated
 * - 404: No active subscription found
 * - 429: Rate limit exceeded
 * - 500: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user (supports both cookie-based and Bearer token auth)
    const supabase = await createAuthenticatedSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new UnauthorizedError();
    }

    // Check rate limit (30 requests per 5 minutes)
    const rateLimitResponse = checkRateLimit({
      key: user.id,
      maxRequests: 30,
      windowMs: 5 * 60 * 1000,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Parse request body
    let body: PreviewChangeRequest;
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

    // Validate Stripe subscription ID and customer ID exist
    if (!subscription.stripe_subscription_id) {
      throw new Error('Subscription missing Stripe subscription ID');
    }
    if (!subscription.stripe_customer_id) {
      throw new Error('Subscription missing Stripe customer ID');
    }

    // Preview the change using Stripe
    const stripe = getStripeClient();
    const stripeSubscriptionId = subscription.stripe_subscription_id; // Extract for TypeScript
    const stripeCustomerId = subscription.stripe_customer_id; // Extract for TypeScript

    try {
      // Get current subscription from Stripe
      const stripeSubscription = await withRetry(() =>
        stripe.subscriptions.retrieve(stripeSubscriptionId)
      );

      const subscriptionItemId = stripeSubscription.items.data[0]?.id;
      const currentPriceId = stripeSubscription.items.data[0]?.price?.id;

      if (!subscriptionItemId) {
        throw new Error('Subscription item not found');
      }

      // Check if user is reverting a scheduled plan change
      // (e.g., was annual, scheduled downgrade to monthly, now going back to annual)
      const isRevertingScheduledChange =
        stripeSubscription.schedule && currentPriceId === newPriceId;

      // Determine if this is a downgrade (annual to monthly)
      const isDowngrade =
        subscription.plan_type === 'annual' && newPlanType === 'monthly';

      // Get period end from subscription item (not top-level subscription)
      const subscriptionItem = stripeSubscription.items.data[0] as any;
      let periodEnd: number;

      if (stripeSubscription.schedule) {
        // Subscription is managed by a schedule - fetch schedule to get period end
        const schedule = await withRetry(() =>
          stripe.subscriptionSchedules.retrieve(
            stripeSubscription.schedule as string
          )
        );
        // Use the end of the current phase
        periodEnd =
          schedule.current_phase?.end_date || schedule.phases[0]?.end_date;
      } else if (subscriptionItem?.current_period_end) {
        // Get period end from subscription item
        periodEnd = subscriptionItem.current_period_end;
      } else {
        throw new Error('Could not determine subscription period end');
      }

      let prorationAmount = 0;
      let subscriptionAmount = 0;

      if (isRevertingScheduledChange) {
        // User is reverting a scheduled plan change
        // They're already on (and paid for) this plan, just need to cancel the schedule
        // No charge - they're already paid up until period end
        prorationAmount = 0;

        // Get the current price (which is already the plan they're on)
        const price = await withRetry(() => stripe.prices.retrieve(newPriceId));
        subscriptionAmount = price.unit_amount || 0;

        // Use period end from the current subscription
        if (stripeSubscription.schedule) {
          const schedule = await withRetry(() =>
            stripe.subscriptionSchedules.retrieve(
              stripeSubscription.schedule as string
            )
          );
          periodEnd =
            schedule.current_phase?.end_date || schedule.phases[0]?.end_date;
        } else if (subscriptionItem?.current_period_end) {
          periodEnd = subscriptionItem.current_period_end;
        } else {
          throw new Error('Could not determine subscription period end');
        }
      } else if (isDowngrade) {
        // For downgrades, we use subscription schedules - no immediate charge
        // The user continues on their annual plan until period end, then switches to monthly
        prorationAmount = 0; // No immediate charge

        // Get the new monthly price
        const price = await withRetry(() => stripe.prices.retrieve(newPriceId));
        subscriptionAmount = price.unit_amount || 0;

        // periodEnd is already set to current_period_end above
      } else {
        // For upgrades, calculate proration with immediate charge
        const subscriptionDetails: any = {
          items: [
            {
              id: subscriptionItemId,
              price: newPriceId,
            },
          ],
          proration_behavior: 'create_prorations',
          proration_date: Math.floor(Date.now() / 1000),
        };

        // Preview upcoming invoice with the new price
        const upcomingInvoice = await withRetry(() =>
          stripe.invoices.createPreview({
            customer: stripeCustomerId,
            subscription: stripeSubscriptionId,
            subscription_details: subscriptionDetails,
          })
        );

        // Calculate the immediate charge (proration) from invoice lines
        // Stripe includes BOTH the immediate proration AND the next renewal in the preview
        // We only want the proration lines (credit + charge for remaining time)
        prorationAmount = 0;
        for (const line of upcomingInvoice.lines?.data || []) {
          const lineData = line as any;

          // Proration lines have descriptions like "Unused time" or "Remaining time"
          // The full annual charge has description like "1 × Om - Annual"
          const isProration =
            lineData.description?.includes('Unused time') ||
            lineData.description?.includes('Remaining time');

          if (isProration) {
            prorationAmount += lineData.amount;
          }
        }

        // ALWAYS fetch the actual plan price from the price object
        // This is what they'll pay at NEXT renewal (full annual or monthly price)
        const price = await withRetry(() => stripe.prices.retrieve(newPriceId));
        subscriptionAmount = price.unit_amount || 0;

        periodEnd = upcomingInvoice.period_end;
      }

      return NextResponse.json(
        {
          success: true,
          preview: {
            newPlanType,
            prorationAmount,
            subscriptionAmount,
            totalDueNow: prorationAmount,
            currency: 'usd',
            periodEnd: new Date(periodEnd * 1000).toISOString(),
          },
        },
        {
          status: 200,
          headers: {
            ...corsHeaders,
            ...getRateLimitHeaders({
              key: user.id,
              maxRequests: 30,
              windowMs: 5 * 60 * 1000,
            }),
          },
        }
      );
    } catch (error: any) {
      console.error('Stripe preview error:', error);
      throw new Error(error.message || 'Failed to preview plan change');
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
