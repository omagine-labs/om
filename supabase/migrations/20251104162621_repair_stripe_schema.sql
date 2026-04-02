-- Migration: Repair Stripe Schema
-- Description: Re-adds Stripe subscription tables that were accidentally removed by remote_schema migration.
--              This migration is idempotent - safe to run even if some objects already exist.
-- Date: 2025-11-04

BEGIN;

-- ============================================================================
-- STEP 1: Create Enum Types (IF NOT EXISTS)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE public.subscription_status AS ENUM (
        'trialing',
        'active',
        'canceled',
        'past_due',
        'incomplete',
        'incomplete_expired',
        'unpaid'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE public.subscription_status IS 'Stripe subscription status values. Maps directly to Stripe API subscription.status field.';

DO $$ BEGIN
    CREATE TYPE public.plan_type AS ENUM (
        'monthly',
        'annual',
        'internal_free'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE public.plan_type IS 'Subscription plan types. Monthly and annual map to Stripe prices, internal_free is for admin accounts.';

-- ============================================================================
-- STEP 2: Create subscriptions Table (IF NOT EXISTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    stripe_customer_id text,
    stripe_subscription_id text UNIQUE,
    stripe_price_id text,
    status public.subscription_status NOT NULL,
    plan_type public.plan_type NOT NULL,
    trial_start timestamptz,
    trial_end timestamptz,
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    canceled_at timestamptz,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.subscriptions IS 'Stores Stripe subscription data for each user. Tracks subscription lifecycle, billing periods, and trial status. Updated via webhook handler.';
COMMENT ON COLUMN public.subscriptions.user_id IS 'Foreign key to users table. One user can have one active subscription at a time.';
COMMENT ON COLUMN public.subscriptions.stripe_customer_id IS 'Stripe customer ID. Used for Stripe API calls to manage customer subscriptions.';
COMMENT ON COLUMN public.subscriptions.stripe_subscription_id IS 'Stripe subscription ID. Used by webhooks to look up and update subscription records. Must be unique.';
COMMENT ON COLUMN public.subscriptions.stripe_price_id IS 'Stripe price ID for the current plan (e.g., price_monthly or price_annual).';
COMMENT ON COLUMN public.subscriptions.status IS 'Current subscription status. Maps to Stripe subscription.status field.';
COMMENT ON COLUMN public.subscriptions.plan_type IS 'Plan type: monthly, annual, or internal_free.';
COMMENT ON COLUMN public.subscriptions.trial_start IS 'Start of 14-day trial period.';
COMMENT ON COLUMN public.subscriptions.trial_end IS 'End of 14-day trial period.';
COMMENT ON COLUMN public.subscriptions.current_period_start IS 'Start of current billing period.';
COMMENT ON COLUMN public.subscriptions.current_period_end IS 'End of current billing period (next payment due date).';
COMMENT ON COLUMN public.subscriptions.cancel_at_period_end IS 'If true, subscription will cancel at period end (user requested cancellation).';
COMMENT ON COLUMN public.subscriptions.canceled_at IS 'Timestamp when subscription was canceled. Used for analytics and customer support.';

-- ============================================================================
-- STEP 3: Create payment_history Table (IF NOT EXISTS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payment_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    stripe_payment_intent_id text,
    stripe_invoice_id text,
    amount integer NOT NULL,
    currency text DEFAULT 'usd' NOT NULL,
    status text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.payment_history IS 'Immutable audit log of all payment attempts and outcomes. Written by webhook handler only. Users can view but not modify their payment history.';
COMMENT ON COLUMN public.payment_history.user_id IS 'Foreign key to users table. Used for quick user payment history queries.';
COMMENT ON COLUMN public.payment_history.subscription_id IS 'Foreign key to subscriptions table. Nullable to support one-time payments or refunds not tied to a subscription.';
COMMENT ON COLUMN public.payment_history.stripe_payment_intent_id IS 'Stripe payment intent ID. Used for webhook deduplication and Stripe API lookups.';
COMMENT ON COLUMN public.payment_history.stripe_invoice_id IS 'Stripe invoice ID. Links payment to specific invoice in Stripe.';
COMMENT ON COLUMN public.payment_history.amount IS 'Payment amount in cents to avoid floating-point precision issues. E.g., 999 = $9.99 USD.';
COMMENT ON COLUMN public.payment_history.currency IS 'ISO 4217 currency code (e.g., usd, eur, gbp).';
COMMENT ON COLUMN public.payment_history.status IS 'Payment status from Stripe: succeeded, failed, pending, refunded, etc.';

-- ============================================================================
-- STEP 4: Add columns to users table (IF NOT EXISTS)
-- ============================================================================

DO $$ BEGIN
    ALTER TABLE public.users ADD COLUMN has_active_subscription boolean DEFAULT false NOT NULL;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.users ADD COLUMN subscription_status text;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.users ADD COLUMN trial_used boolean DEFAULT false NOT NULL;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

COMMENT ON COLUMN public.users.has_active_subscription IS 'Quick flag for authorization checks. True if user has active or trialing subscription. Kept in sync by webhook handler.';
COMMENT ON COLUMN public.users.subscription_status IS 'Denormalized current subscription status for fast queries without JOIN. Text type allows flexibility for new Stripe statuses.';
COMMENT ON COLUMN public.users.trial_used IS 'Prevents multiple trial redemptions. Set to true when user starts their first trial.';

-- ============================================================================
-- STEP 5: Create Indexes (IF NOT EXISTS)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_payment_history_user_id ON public.payment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_subscription_id ON public.payment_history(subscription_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_stripe_payment_intent_id ON public.payment_history(stripe_payment_intent_id);

-- ============================================================================
-- STEP 6: Enable RLS
-- ============================================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 7: Create RLS Policies (DROP IF EXISTS, then CREATE)
-- ============================================================================

DROP POLICY IF EXISTS "users_view_own_subscription" ON public.subscriptions;
CREATE POLICY "users_view_own_subscription"
    ON public.subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_subscription" ON public.subscriptions;
CREATE POLICY "users_update_own_subscription"
    ON public.subscriptions
    FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_subscription" ON public.subscriptions;
CREATE POLICY "users_delete_own_subscription"
    ON public.subscriptions
    FOR DELETE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_view_own_payment_history" ON public.payment_history;
CREATE POLICY "users_view_own_payment_history"
    ON public.payment_history
    FOR SELECT
    USING (auth.uid() = user_id);

-- ============================================================================
-- STEP 8: Create Trigger (DROP IF EXISTS, then CREATE)
-- ============================================================================

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
