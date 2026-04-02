-- Migration: Add stripe_customer_id to users table
-- Description: Prevents duplicate Stripe customer creation by storing customer ID on users table
--              instead of only in subscriptions table (which doesn't exist before first purchase).
-- Date: 2025-11-05

BEGIN;

-- Add stripe_customer_id column to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;

COMMENT ON COLUMN public.users.stripe_customer_id IS 'Stripe customer ID. Created on first checkout session and reused for all future subscriptions. Unique to prevent duplicate customers.';

-- Backfill existing users: copy stripe_customer_id from subscriptions table
UPDATE public.users u
SET stripe_customer_id = s.stripe_customer_id
FROM public.subscriptions s
WHERE u.id = s.user_id
  AND u.stripe_customer_id IS NULL
  AND s.stripe_customer_id IS NOT NULL;

COMMIT;
