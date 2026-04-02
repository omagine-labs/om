import { NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/lib/supabase-server';
import {
  checkRateLimit,
  getRateLimitHeaders,
} from '@/app/api/_middleware/rate-limit';
import { corsHeaders, handleCorsPrelight } from '@/app/api/_middleware/cors';
import {
  UnauthorizedError,
  SubscriptionNotFoundError,
  formatErrorResponse,
} from '@/lib/errors';
import { getStripeClient } from '@/lib/stripe';
import { withRetry } from '@/lib/stripe-retry';

/**
 * OPTIONS /api/subscriptions/current
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return handleCorsPrelight();
}

/**
 * GET /api/subscriptions/current
 *
 * Get the current user's subscription details
 *
 * Rate Limit: 30 requests per 5 minutes
 *
 * Returns:
 * - 200: Subscription details
 * - 401: User not authenticated
 * - 404: No subscription found
 * - 429: Rate limit exceeded
 * - 500: Internal server error
 */
export async function GET() {
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

    // Check rate limit (30 requests per 5 minutes)
    const rateLimitResponse = checkRateLimit({
      key: user.id,
      maxRequests: 30,
      windowMs: 5 * 60 * 1000,
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    // Fetch Om subscriptions from database (may have multiple due to bugs creating duplicate customers)
    // Filter by product_type='om' to exclude BlindSlide subscriptions
    // Order by updated_at to get most recent first
    const { data: subscriptions, error: dbError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('product_type', 'om')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (dbError) {
      console.error('Database error fetching subscription:', dbError);
      throw new Error('Failed to fetch subscription');
    }

    // If no subscriptions found
    if (!subscriptions || subscriptions.length === 0) {
      throw new SubscriptionNotFoundError();
    }

    // Use the most recently updated subscription
    const subscription = subscriptions[0];

    // Fetch full subscription details from Stripe (including discount info)
    const stripe = getStripeClient();
    let discountInfo = null;
    let upcomingInvoice = null;

    // Only fetch from Stripe if we have a valid subscription ID
    if (
      subscription.stripe_subscription_id &&
      subscription.stripe_customer_id
    ) {
      const stripeSubscriptionId = subscription.stripe_subscription_id; // Extract for TypeScript
      const stripeCustomerId = subscription.stripe_customer_id; // Extract for TypeScript

      try {
        // Retrieve subscription with expanded discounts array
        const stripeSubscription = await withRetry(() =>
          stripe.subscriptions.retrieve(stripeSubscriptionId, {
            expand: ['discounts', 'customer'],
          })
        );

        // Extract discount information if present
        const discountsArray = (stripeSubscription as any).discounts;
        if (discountsArray && discountsArray.length > 0) {
          const discount = discountsArray[0];

          if (typeof discount === 'object' && discount.source?.coupon) {
            // Fetch full coupon details
            const couponId = discount.source.coupon;
            try {
              const coupon = await withRetry(() =>
                stripe.coupons.retrieve(couponId)
              );
              discountInfo = {
                couponId: coupon.id,
                percentOff: coupon.percent_off || null,
                amountOff: coupon.amount_off || null,
                currency: coupon.currency || null,
                duration: coupon.duration,
                durationInMonths: coupon.duration_in_months || null,
                validUntil: discount.end
                  ? new Date(discount.end * 1000).toISOString()
                  : null,
              };
            } catch (couponErr: any) {
              console.error('Error fetching coupon:', couponErr);
            }
          }
        }

        // Fetch upcoming invoice to show what they'll be charged next
        try {
          const upcoming = await withRetry(() =>
            stripe.invoices.createPreview({
              customer: stripeCustomerId,
              subscription: stripeSubscriptionId,
            })
          );

          // Parse line items to separate proration charges from subscription charges
          let prorationAmount = 0;
          let subscriptionAmount = 0;
          let hasProrationItems = false;

          if (upcoming.lines && upcoming.lines.data) {
            for (const line of upcoming.lines.data) {
              const lineData = line as any;

              // Detect proration items by description (Stripe doesn't always set proration flag)
              const isProration =
                lineData.description?.includes('Unused time') ||
                lineData.description?.includes('Remaining time') ||
                lineData.proration === true;

              if (isProration) {
                // This is a proration charge (immediate upgrade/downgrade)
                prorationAmount += lineData.amount;
                hasProrationItems = true;
              } else {
                // This is a regular subscription charge (next renewal)
                subscriptionAmount += lineData.amount;
              }
            }
          }

          // If we detected proration items, calculate the next renewal from subscription price
          // (because the preview invoice doesn't include the renewal after the proration)
          if (
            hasProrationItems &&
            subscriptionAmount === 0 &&
            subscription.stripe_price_id
          ) {
            const stripePriceId = subscription.stripe_price_id; // Extract for TypeScript
            // Get the subscription price from our database/Stripe
            const subscriptionPrice = await withRetry(() =>
              stripe.prices.retrieve(stripePriceId)
            );
            subscriptionAmount = subscriptionPrice.unit_amount || 0;
          }

          upcomingInvoice = {
            amountDue: upcoming.amount_due,
            currency: upcoming.currency,
            periodStart: new Date(upcoming.period_start * 1000).toISOString(),
            periodEnd: new Date(upcoming.period_end * 1000).toISOString(),
            prorationAmount: prorationAmount > 0 ? prorationAmount : undefined,
            subscriptionAmount:
              subscriptionAmount > 0 ? subscriptionAmount : undefined,
          };
        } catch (invoiceError: any) {
          // Upcoming invoice might not be available (e.g., during trial)
          console.error(
            'Error fetching upcoming invoice:',
            invoiceError.message
          );
        }
      } catch (stripeError) {
        console.error(
          'Error fetching Stripe subscription details:',
          stripeError
        );
        // Continue without discount info if Stripe fetch fails
      }
    }

    // Return subscription with rate limit headers and CORS headers
    return NextResponse.json(
      {
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          planType: subscription.plan_type,
          stripeCustomerId: subscription.stripe_customer_id,
          stripeSubscriptionId: subscription.stripe_subscription_id,
          stripePriceId: subscription.stripe_price_id,
          trialStart: subscription.trial_start,
          trialEnd: subscription.trial_end,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at,
          createdAt: subscription.created_at,
          updatedAt: subscription.updated_at,
          discount: discountInfo,
          upcomingInvoice: upcomingInvoice,
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
