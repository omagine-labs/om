import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { getStripeClient } from '@/lib/stripe';
import { createServiceRoleClient } from '@/lib/supabase-server';
import { mapStripeStatusToDbStatus } from '@/lib/stripe-helpers';
import { WebhookSignatureError } from '@/lib/errors';
import type { Database } from '@/supabase/database.types';
import { RevenueEvents } from '@/types/analytics';
import { updateIntercomUser } from '@/lib/intercom-api';
import { calculateTrialDaysRemaining } from '@/lib/trial-utils';
import type { IntercomUserAttributes } from '@/types/intercom';

type SubscriptionStatus = Database['public']['Enums']['subscription_status'];
type PlanType = Database['public']['Enums']['plan_type'];

/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook handler for all subscription lifecycle events
 *
 * Handles 11 Stripe event types:
 * - checkout.session.completed
 * - customer.subscription.created/updated/deleted/trial_will_end
 * - invoice.payment_succeeded/failed
 * - payment_intent.succeeded/payment_failed
 * - customer.created/updated/deleted
 *
 * Security: Verifies webhook signature to ensure requests are from Stripe
 * Idempotency: Checks existing records to prevent duplicate database writes
 *
 * Returns:
 * - 200: Event processed successfully
 * - 400: Invalid signature or request
 * - 500: Internal server error (Stripe will retry)
 */
export async function POST(request: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'Webhook secret not configured' },
      { status: 500 }
    );
  }

  try {
    // Get raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      throw new WebhookSignatureError();
    }

    // Verify webhook signature using Stripe SDK's secure verification
    // The constructEvent method uses timing-safe comparison (HMAC-based) to prevent timing attacks
    // This is the official Stripe-recommended method for webhook signature verification
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error: any) {
      console.error('Webhook signature verification failed:', error.message);
      throw new WebhookSignatureError();
    }

    // Log event for debugging
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[Stripe Webhook] Received event: ${event.type} (${event.id})`
      );
    }

    // Route to appropriate handler
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event);
        break;

      case 'customer.created':
        await handleCustomerCreated(event);
        break;

      case 'customer.updated':
        await handleCustomerUpdated(event);
        break;

      case 'customer.deleted':
        await handleCustomerDeleted(event);
        break;

      default:
        if (process.env.NODE_ENV !== 'test') {
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }
    }

    // Return 200 to acknowledge receipt
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('[Stripe Webhook] Error processing webhook:', error);

    if (error instanceof WebhookSignatureError) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Return 500 so Stripe retries
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle checkout.session.completed event
 * Creates subscription record in database after successful checkout
 */
async function handleCheckoutSessionCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const supabase = createServiceRoleClient();

  const userId = session.metadata?.user_id;
  const planType = session.metadata?.plan_type as PlanType;
  const productType =
    (session.metadata?.product_type as 'om' | 'blindslide') || 'om';

  if (!userId || !planType) {
    console.error('[checkout.session.completed] Missing metadata:', {
      userId,
      planType,
    });
    return;
  }

  // Get subscription ID from session
  const subscriptionId =
    typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id;

  if (!subscriptionId) {
    console.error('[checkout.session.completed] No subscription ID in session');
    return;
  }

  // Fetch full subscription details from Stripe
  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Create or update subscription in database
  await upsertSubscription(subscription, userId, planType, productType);

  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[checkout.session.completed] Subscription created for user ${userId}`
    );
  }
}

/**
 * Handle customer.subscription.created event
 * Syncs new subscription to database
 */
async function handleSubscriptionCreated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = subscription.metadata?.user_id;
  const planType = subscription.metadata?.plan_type as PlanType;
  const productType =
    (subscription.metadata?.product_type as 'om' | 'blindslide') || 'om';

  if (!userId || !planType) {
    console.error('[customer.subscription.created] Missing metadata');
    return;
  }

  await upsertSubscription(subscription, userId, planType, productType);

  // Track subscription_created event
  try {
    const priceItem = subscription.items?.data?.[0];
    const interval = priceItem?.price?.recurring?.interval || 'monthly';
    const amountCents = priceItem?.price?.unit_amount || 0;

    await logAnalyticsEvent(userId, RevenueEvents.SUBSCRIPTION_CREATED, {
      subscription_id: subscription.id,
      plan_id: planType,
      interval: interval === 'year' ? 'yearly' : 'monthly',
      amount_cents: amountCents,
    });
  } catch (error) {
    console.error('[Analytics] Failed to track subscription_created:', error);
    // Don't throw - analytics failures shouldn't block webhook processing
  }

  // Update Intercom with subscription state
  await updateIntercomSubscriptionAttributes(userId, subscription);

  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[customer.subscription.created] Subscription synced for user ${userId}`
    );
  }
}

/**
 * Handle customer.subscription.updated event
 * Updates subscription status, dates, and plan changes
 */
async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = subscription.metadata?.user_id;
  const planType = subscription.metadata?.plan_type as PlanType;
  const productType =
    (subscription.metadata?.product_type as 'om' | 'blindslide') || 'om';

  if (!userId || !planType) {
    console.error('[customer.subscription.updated] Missing metadata');
    return;
  }

  // Get previous subscription state to detect plan changes
  const supabase = createServiceRoleClient();
  const { data: previousSubscription } = await supabase
    .from('subscriptions')
    .select('plan_type')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  // Update subscription
  await upsertSubscription(subscription, userId, planType, productType);

  // Track upgrade/downgrade if plan changed
  if (previousSubscription && previousSubscription.plan_type !== planType) {
    const previousPlan = previousSubscription.plan_type;
    const newPlan = planType;

    // Define plan hierarchy for upgrade/downgrade detection
    const planHierarchy: Record<PlanType, number> = {
      internal_free: 0,
      monthly: 1,
      annual: 2,
    };

    const isUpgrade =
      planHierarchy[newPlan] > planHierarchy[previousPlan as PlanType];

    const eventName = isUpgrade
      ? RevenueEvents.SUBSCRIPTION_UPGRADED
      : RevenueEvents.SUBSCRIPTION_DOWNGRADED;

    await logAnalyticsEvent(userId, eventName, {
      subscription_id: subscription.id,
      from_plan: previousPlan,
      to_plan: newPlan,
    });

    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[customer.subscription.updated] Plan ${isUpgrade ? 'upgraded' : 'downgraded'}: ${previousPlan} → ${newPlan}`
      );
    }
  }

  // Update Intercom with latest subscription state
  await updateIntercomSubscriptionAttributes(userId, subscription);

  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[customer.subscription.updated] Subscription updated for user ${userId}`
    );
  }
}

/**
 * Handle customer.subscription.deleted event
 * Marks subscription as canceled and updates user flags
 */
async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const supabase = createServiceRoleClient();

  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({
      status: 'canceled' as SubscriptionStatus,
      cancel_at_period_end: false,
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  if (updateError) {
    console.error(
      '[customer.subscription.deleted] Failed to update subscription:',
      updateError
    );
  }

  // Update user flags
  const userId = subscription.metadata?.user_id;
  const planType = subscription.metadata?.plan_type;
  if (userId) {
    await updateUserSubscriptionFlags(userId, false, 'canceled');

    // Track subscription_canceled event
    await logAnalyticsEvent(userId, RevenueEvents.SUBSCRIPTION_CANCELED, {
      subscription_id: subscription.id,
      plan_id: planType || 'unknown',
      reason: subscription.cancellation_details?.reason || undefined,
    });

    // Clear Intercom subscription and trial attributes
    await updateIntercomUser(userId, {
      plan: 'free',
      is_trialing: false,
      trial_end_date: null,
      trial_days_remaining: null,
      trial_ending_soon: false,
    });
  }

  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[customer.subscription.deleted] Subscription canceled: ${subscription.id}`
    );
  }
}

/**
 * Handle customer.subscription.trial_will_end event
 * Sends email notification to user (3 days before trial ends)
 */
async function handleTrialWillEnd(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const userId = subscription.metadata?.user_id;

  if (!userId) {
    console.error(
      '[customer.subscription.trial_will_end] Missing user_id in metadata'
    );
    return;
  }

  // Get user details from database
  const supabase = createServiceRoleClient();
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('email, full_name')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    console.error(
      '[customer.subscription.trial_will_end] User not found:',
      userId,
      userError
    );
    return;
  }

  // Calculate days remaining and convert trial end to ISO string
  const daysRemaining = calculateTrialDaysRemaining(subscription.trial_end);
  const trialEndDate = new Date((subscription.trial_end || 0) * 1000);

  // Get price information from subscription items
  const priceData = subscription.items?.data?.[0]?.price;
  const priceAmount = priceData?.unit_amount
    ? (priceData.unit_amount / 100).toFixed(2)
    : 'N/A';
  const currency = priceData?.currency?.toUpperCase() || 'USD';

  // Log trial ending event data
  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[customer.subscription.trial_will_end] Trial ending soon for user ${userId}`,
      {
        userId,
        userEmail: user.email,
        userName: user.full_name,
        daysRemaining,
        trialEndDate: trialEndDate.toISOString(),
        planPrice: `${currency} ${priceAmount}`,
        subscriptionId: subscription.id,
      }
    );
  }

  // Update Intercom user attributes to trigger trial ending email sequence
  // Intercom Series will check these attributes and send email 2-3 days before trial ends
  try {
    await updateIntercomUser(userId, {
      trial_ending_soon: true,
      trial_end_date: trialEndDate.toISOString(),
      trial_days_remaining: daysRemaining,
      plan_price: `${currency} ${priceAmount}`,
      plan_currency: currency,
    });

    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[customer.subscription.trial_will_end] Intercom user attributes updated for trial ending email`
      );
    }
  } catch (error) {
    console.error(
      '[customer.subscription.trial_will_end] Failed to update Intercom:',
      error
    );
    // Don't throw - Intercom failures shouldn't block webhook processing
  }
}

/**
 * Handle invoice.payment_succeeded event
 * Records successful payment in payment_history
 */
async function handleInvoicePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as any;
  const supabase = createServiceRoleClient();

  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!subscriptionId) {
    if (process.env.NODE_ENV !== 'test') {
      console.log('[invoice.payment_succeeded] No subscription ID, skipping');
    }
    return;
  }

  // Get subscription from database to get user_id
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id, user_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!subscription) {
    console.error(
      '[invoice.payment_succeeded] Subscription not found:',
      subscriptionId
    );
    return;
  }

  // Check if payment already recorded (idempotency)
  const { data: existing } = await supabase
    .from('payment_history')
    .select('id')
    .eq('stripe_invoice_id', invoice.id)
    .single();

  if (existing) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(
        '[invoice.payment_succeeded] Payment already recorded, skipping'
      );
    }
    return;
  }

  // Insert payment history record
  const { error: insertError } = await supabase.from('payment_history').insert({
    user_id: subscription.user_id,
    subscription_id: subscription.id,
    stripe_payment_intent_id: invoice.payment_intent as string,
    stripe_invoice_id: invoice.id,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    status: 'succeeded',
    // created_at is auto-populated by the database
  });

  if (insertError) {
    console.error(
      '[invoice.payment_succeeded] Failed to insert payment history:',
      insertError
    );
  }

  // Update subscription status to active if it was past_due
  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({
      status: 'active' as SubscriptionStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscription.id)
    .eq('status', 'past_due');

  if (!updateError) {
    await updateUserSubscriptionFlags(subscription.user_id, true, 'active');
  }

  // Track payment_succeeded event
  await logAnalyticsEvent(
    subscription.user_id,
    RevenueEvents.PAYMENT_SUCCEEDED,
    {
      payment_id: invoice.payment_intent as string,
      amount_cents: invoice.amount_paid,
    }
  );

  if (process.env.NODE_ENV !== 'test') {
    console.log(`[invoice.payment_succeeded] Payment recorded: ${invoice.id}`);
  }
}

/**
 * Handle invoice.payment_failed event
 * Records failed payment and updates subscription status
 */
async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const invoice = event.data.object as any;
  const supabase = createServiceRoleClient();

  const subscriptionId =
    typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id;

  if (!subscriptionId) {
    if (process.env.NODE_ENV !== 'test') {
      console.log('[invoice.payment_failed] No subscription ID, skipping');
    }
    return;
  }

  // Get subscription from database
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('id, user_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!subscription) {
    console.error(
      '[invoice.payment_failed] Subscription not found:',
      subscriptionId
    );
    return;
  }

  // Check if payment already recorded (idempotency)
  const { data: existing } = await supabase
    .from('payment_history')
    .select('id')
    .eq('stripe_invoice_id', invoice.id)
    .single();

  if (!existing) {
    // Insert payment history record
    await supabase.from('payment_history').insert({
      user_id: subscription.user_id,
      subscription_id: subscription.id,
      stripe_payment_intent_id: invoice.payment_intent as string,
      stripe_invoice_id: invoice.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
      // created_at is auto-populated by the database
    });
  }

  // Update subscription status to past_due
  await supabase
    .from('subscriptions')
    .update({
      status: 'past_due' as SubscriptionStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscription.id);

  await updateUserSubscriptionFlags(subscription.user_id, false, 'past_due');

  // Track payment_failed event
  const errorMessage =
    invoice.last_payment_error?.message || 'Payment failed - reason unknown';
  await logAnalyticsEvent(subscription.user_id, RevenueEvents.PAYMENT_FAILED, {
    payment_id: invoice.payment_intent as string,
    error: errorMessage,
  });

  if (process.env.NODE_ENV !== 'test') {
    console.log(`[invoice.payment_failed] Payment failed: ${invoice.id}`);
  }
}

/**
 * Handle payment_intent.succeeded event
 * Lower-level payment event (may be redundant with invoice events)
 */
async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[payment_intent.succeeded] Payment intent succeeded: ${paymentIntent.id}`
    );
  }
  // Most processing handled by invoice.payment_succeeded
}

/**
 * Handle payment_intent.payment_failed event
 * Lower-level payment failure event
 */
async function handlePaymentIntentFailed(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  if (process.env.NODE_ENV !== 'test') {
    console.log(
      `[payment_intent.payment_failed] Payment intent failed: ${paymentIntent.id}`
    );
  }
  // Most processing handled by invoice.payment_failed
}

/**
 * Handle customer.created event
 * Log customer creation (subscription creation will handle database updates)
 */
async function handleCustomerCreated(event: Stripe.Event) {
  const customer = event.data.object as Stripe.Customer;
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[customer.created] Customer created: ${customer.id}`);
  }
}

/**
 * Handle customer.updated event
 * Sync customer email updates if needed
 */
async function handleCustomerUpdated(event: Stripe.Event) {
  const customer = event.data.object as Stripe.Customer;
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[customer.updated] Customer updated: ${customer.id}`);
  }
  // Email updates handled by Supabase Auth
}

/**
 * Handle customer.deleted event
 * Log customer deletion (account deletion endpoint handles database cleanup)
 */
async function handleCustomerDeleted(event: Stripe.Event) {
  const customer = event.data.object as Stripe.Customer;
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[customer.deleted] Customer deleted: ${customer.id}`);
  }
}

/**
 * Helper: Upsert subscription to database
 * Idempotent operation - creates or updates based on stripe_subscription_id
 */
async function upsertSubscription(
  subscription: Stripe.Subscription,
  userId: string,
  planType: PlanType,
  productType: 'om' | 'blindslide' = 'om'
) {
  const supabase = createServiceRoleClient();
  const sub = subscription as any;

  const status = mapStripeStatusToDbStatus(sub.status);
  const priceId = sub.items.data[0]?.price.id;

  // Extract discount info from Stripe subscription
  const discountData = extractDiscountInfo(sub);

  const subscriptionData = {
    user_id: userId,
    stripe_customer_id: sub.customer as string,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    status,
    plan_type: planType,
    product_type: productType,
    trial_start: sub.trial_start
      ? new Date(sub.trial_start * 1000).toISOString()
      : null,
    trial_end: sub.trial_end
      ? new Date(sub.trial_end * 1000).toISOString()
      : null,
    current_period_start: sub.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString()
      : null,
    current_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: sub.canceled_at
      ? new Date(sub.canceled_at * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
    // Discount fields
    ...discountData,
  };

  // Check if subscription exists
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('stripe_subscription_id', sub.id)
    .single();

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from('subscriptions')
      .update(subscriptionData)
      .eq('id', existing.id);

    if (error) {
      console.error('Failed to update subscription:', error);
      throw error;
    }
  } else {
    // Insert new
    const { error } = await supabase.from('subscriptions').insert({
      ...subscriptionData,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Failed to insert subscription:', error);
      throw error;
    }
  }

  // Update user flags
  const hasActive = ['trialing', 'active'].includes(status);
  await updateUserSubscriptionFlags(userId, hasActive, status);

  // Mark trial as used if subscription has trial
  if (sub.trial_end) {
    await supabase.from('users').update({ trial_used: true }).eq('id', userId);
  }
}

/**
 * Helper: Update user subscription flags
 */
async function updateUserSubscriptionFlags(
  userId: string,
  hasActive: boolean,
  status: SubscriptionStatus
) {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from('users')
    .update({
      has_active_subscription: hasActive,
      subscription_status: status,
    })
    .eq('id', userId);

  if (error) {
    console.error('Failed to update user flags:', error);
  }
}

/**
 * Helper: Update Intercom with subscription and trial attributes
 * Ensures Intercom has real-time subscription state for email targeting
 */
async function updateIntercomSubscriptionAttributes(
  userId: string,
  subscription: Stripe.Subscription
) {
  try {
    const isTrialing = subscription.status === 'trialing';
    const isActive = subscription.status === 'active';

    // Calculate trial days remaining if in trial
    const trialDaysRemaining = isTrialing
      ? calculateTrialDaysRemaining(subscription.trial_end)
      : null;

    const attributes: IntercomUserAttributes = {
      plan: isActive ? 'pro' : 'free',
      is_trialing: isTrialing,
      trial_end_date: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      trial_days_remaining: trialDaysRemaining,
    };

    // Clear trial_ending_soon flag if user converted from trial to active
    // This prevents "trial ending" emails from being sent to paying customers
    if (isActive && !isTrialing) {
      attributes.trial_ending_soon = false;
    }

    await updateIntercomUser(userId, attributes);

    if (process.env.NODE_ENV !== 'test') {
      console.log(
        `[Intercom] Updated subscription attributes for user ${userId}:`,
        { status: subscription.status, isTrialing, isActive }
      );
    }
  } catch (error) {
    console.error(
      '[Intercom] Failed to update subscription attributes:',
      error
    );
    // Don't throw - Intercom failures shouldn't block webhook processing
  }
}

/**
 * Helper: Log analytics event server-side to user_event_log
 * Used for tracking revenue events from Stripe webhooks
 */
async function logAnalyticsEvent(
  userId: string,
  eventName: string,
  properties: Record<string, any> | null = null
) {
  const supabase = createServiceRoleClient();

  const { error } = await supabase.from('user_event_log').insert({
    user_id: userId,
    event_name: eventName,
    payload: properties,
  });

  if (error) {
    console.error('[Analytics] Failed to log event to database:', error);
    // Don't throw - analytics logging is supplementary
  }
}

/**
 * Helper: Extract discount info from Stripe subscription
 * Returns discount fields to be stored in the database
 */
function extractDiscountInfo(subscription: any): {
  discount_percent_off: number | null;
  discount_amount_off: number | null;
  discount_duration: string | null;
  discount_duration_months: number | null;
  discount_end: string | null;
  stripe_coupon_id: string | null;
} {
  // Stripe subscription can have a discount object with coupon details
  const discount = subscription.discount;

  if (!discount || !discount.coupon) {
    return {
      discount_percent_off: null,
      discount_amount_off: null,
      discount_duration: null,
      discount_duration_months: null,
      discount_end: null,
      stripe_coupon_id: null,
    };
  }

  const coupon = discount.coupon;

  return {
    discount_percent_off: coupon.percent_off ?? null,
    discount_amount_off: coupon.amount_off ?? null,
    discount_duration: coupon.duration ?? null,
    discount_duration_months: coupon.duration_in_months ?? null,
    discount_end: discount.end
      ? new Date(discount.end * 1000).toISOString()
      : null,
    stripe_coupon_id: coupon.id ?? null,
  };
}
