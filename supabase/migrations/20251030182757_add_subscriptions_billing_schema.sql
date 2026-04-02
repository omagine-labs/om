-- Migration: Add Subscriptions & Billing Schema
-- Description: Creates foundational database schema for Stripe-based subscriptions,
--              payment tracking, and trial management. Includes subscriptions and
--              payment_history tables with comprehensive RLS policies for user data isolation.
-- Date: 2025-10-30

BEGIN;

-- ============================================================================
-- STEP 1: Create Enum Types
-- ============================================================================

-- Subscription status enum (maps to Stripe subscription statuses)
CREATE TYPE public.subscription_status AS ENUM (
    'trialing',              -- Customer is in trial period
    'active',                -- Subscription is active and paid
    'canceled',              -- Subscription has been canceled
    'past_due',              -- Payment failed, retrying
    'incomplete',            -- Initial payment has not succeeded
    'incomplete_expired',    -- Initial payment failed after all retries
    'unpaid'                 -- Latest invoice is unpaid
);

COMMENT ON TYPE public.subscription_status IS 'Stripe subscription status values. Maps directly to Stripe API subscription.status field.';

-- Plan type enum
CREATE TYPE public.plan_type AS ENUM (
    'monthly',               -- Monthly billing cycle
    'annual',                -- Annual billing cycle
    'internal_free'          -- Internal/admin free plan
);

COMMENT ON TYPE public.plan_type IS 'Subscription plan types. Monthly and annual map to Stripe prices, internal_free is for admin accounts.';

-- ============================================================================
-- STEP 2: Create subscriptions Table
-- ============================================================================

CREATE TABLE public.subscriptions (
    -- Primary key
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key to users
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Stripe identifiers (for API calls and webhook lookups)
    stripe_customer_id text,
    stripe_subscription_id text UNIQUE,  -- Unique to prevent duplicate webhook processing
    stripe_price_id text,                 -- Current price ID (monthly or annual)

    -- Subscription state
    status public.subscription_status NOT NULL,
    plan_type public.plan_type NOT NULL,

    -- Trial period tracking
    trial_start timestamptz,
    trial_end timestamptz,

    -- Billing period tracking
    current_period_start timestamptz,
    current_period_end timestamptz,

    -- Cancellation tracking
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    canceled_at timestamptz,

    -- Timestamps
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- Add table comment
COMMENT ON TABLE public.subscriptions IS 'Stores Stripe subscription data for each user. Tracks subscription lifecycle, billing periods, and trial status. Updated via webhook handler.';

-- Add column comments
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
-- STEP 3: Create payment_history Table
-- ============================================================================

CREATE TABLE public.payment_history (
    -- Primary key
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign keys
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,

    -- Stripe identifiers
    stripe_payment_intent_id text,
    stripe_invoice_id text,

    -- Payment details
    amount integer NOT NULL,              -- Amount in cents (e.g., 999 = $9.99)
    currency text DEFAULT 'usd' NOT NULL,
    status text NOT NULL,                 -- 'succeeded', 'failed', 'pending', 'refunded', etc.

    -- Timestamp
    created_at timestamptz DEFAULT now() NOT NULL
);

-- Add table comment
COMMENT ON TABLE public.payment_history IS 'Immutable audit log of all payment attempts and outcomes. Written by webhook handler only. Users can view but not modify their payment history.';

-- Add column comments
COMMENT ON COLUMN public.payment_history.user_id IS 'Foreign key to users table. Used for quick user payment history queries.';
COMMENT ON COLUMN public.payment_history.subscription_id IS 'Foreign key to subscriptions table. Nullable to support one-time payments or refunds not tied to a subscription.';
COMMENT ON COLUMN public.payment_history.stripe_payment_intent_id IS 'Stripe payment intent ID. Used for webhook deduplication and Stripe API lookups.';
COMMENT ON COLUMN public.payment_history.stripe_invoice_id IS 'Stripe invoice ID. Links payment to specific invoice in Stripe.';
COMMENT ON COLUMN public.payment_history.amount IS 'Payment amount in cents to avoid floating-point precision issues. E.g., 999 = $9.99 USD.';
COMMENT ON COLUMN public.payment_history.currency IS 'ISO 4217 currency code (e.g., usd, eur, gbp).';
COMMENT ON COLUMN public.payment_history.status IS 'Payment status from Stripe: succeeded, failed, pending, refunded, etc.';

-- ============================================================================
-- STEP 4: Modify users Table
-- ============================================================================

-- Add subscription tracking columns to users table
ALTER TABLE public.users
    ADD COLUMN has_active_subscription boolean DEFAULT false NOT NULL,
    ADD COLUMN subscription_status text,
    ADD COLUMN trial_used boolean DEFAULT false NOT NULL;

-- Add column comments
COMMENT ON COLUMN public.users.has_active_subscription IS 'Quick flag for authorization checks. True if user has active or trialing subscription. Kept in sync by webhook handler.';
COMMENT ON COLUMN public.users.subscription_status IS 'Denormalized current subscription status for fast queries without JOIN. Text type allows flexibility for new Stripe statuses.';
COMMENT ON COLUMN public.users.trial_used IS 'Prevents multiple trial redemptions. Set to true when user starts their first trial.';

-- ============================================================================
-- STEP 5: Create Performance Indexes
-- ============================================================================

-- Indexes for subscriptions table
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- Indexes for payment_history table
CREATE INDEX idx_payment_history_user_id ON public.payment_history(user_id);
CREATE INDEX idx_payment_history_subscription_id ON public.payment_history(subscription_id);
CREATE INDEX idx_payment_history_stripe_payment_intent_id ON public.payment_history(stripe_payment_intent_id);

-- ============================================================================
-- STEP 6: Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 7: Create RLS Policies
-- ============================================================================

-- Subscriptions table policies (users can view, update, and delete their own subscriptions)
CREATE POLICY "users_view_own_subscription"
    ON public.subscriptions
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "users_update_own_subscription"
    ON public.subscriptions
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "users_delete_own_subscription"
    ON public.subscriptions
    FOR DELETE
    USING (auth.uid() = user_id);

-- Payment history table policies (users can only view their own payment history)
-- No INSERT/UPDATE/DELETE policies - only webhook handler (using service role) can write
CREATE POLICY "users_view_own_payment_history"
    ON public.payment_history
    FOR SELECT
    USING (auth.uid() = user_id);

-- ============================================================================
-- STEP 8: Create Triggers
-- ============================================================================

-- Trigger to automatically update updated_at timestamp on subscriptions table
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Note: update_updated_at_column() function already exists from baseline schema

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- This migration is additive only and safe to deploy. If rollback is needed,
-- create a new migration that reverses the changes in the following order:
--
-- 1. Remove trigger: update_subscriptions_updated_at
-- 2. Remove RLS policies on both tables
-- 3. Remove all 7 indexes
-- 4. Remove tables: payment_history, subscriptions (use CASCADE)
-- 5. Remove columns from users table: has_active_subscription, subscription_status, trial_used
-- 6. Remove enum types: subscription_status, plan_type
--
-- WARNING: Rollback will result in data loss for any subscriptions or payment
-- history created after this migration. Only use in emergency situations.
