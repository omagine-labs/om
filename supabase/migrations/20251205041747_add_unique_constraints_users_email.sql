-- Migration: Add Unique Constraint on users.email
-- Description: Prevent duplicate user accounts with the same email address
--
-- Context:
-- - auth.users has a partial unique constraint (only for non-SSO users)
-- - public.users should enforce uniqueness for all users
-- - This prevents data integrity issues and duplicate Stripe customers
--
-- If this migration fails with "duplicate key value", it means you have
-- existing duplicate emails that need to be cleaned up first.
--
-- To find duplicates in production:
-- SELECT email, array_agg(id) as user_ids, COUNT(*)
-- FROM users
-- GROUP BY email
-- HAVING COUNT(*) > 1;

-- ============================================================================
-- STEP 1: Check for existing duplicates (informational only)
-- ============================================================================

DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO duplicate_count
    FROM (
        SELECT email, COUNT(*) as cnt
        FROM public.users
        WHERE email IS NOT NULL
        GROUP BY email
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_count > 0 THEN
        RAISE WARNING 'Found % duplicate email addresses in users table. Run the query in the migration header to identify them.', duplicate_count;
    ELSE
        RAISE NOTICE 'No duplicate email addresses found. Safe to add unique constraint.';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Add UNIQUE constraint on users.email
-- ============================================================================

-- Drop the constraint if it exists (idempotent)
DO $$ BEGIN
    ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_key;
EXCEPTION
    WHEN undefined_object THEN null;
END $$;

-- Add UNIQUE constraint on email
-- This will fail if duplicates exist, which is intentional
ALTER TABLE public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

COMMENT ON CONSTRAINT users_email_key ON public.users IS
    'Ensures each email address is associated with only one user account. Prevents duplicate accounts and Stripe customer creation issues.';

-- ============================================================================
-- STEP 3: Add advisory lock helper function for Stripe customer creation
-- ============================================================================

-- Create a function to get an advisory lock for user-scoped operations
-- This prevents race conditions when creating Stripe customers
CREATE OR REPLACE FUNCTION public.acquire_user_lock(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Use pg_advisory_xact_lock for transaction-scoped lock
    -- Hash the UUID to get a bigint for the lock key
    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));
    RETURN true;
END;
$$;

COMMENT ON FUNCTION public.acquire_user_lock IS
    'Acquires a transaction-scoped advisory lock for a user. Used to prevent race conditions when creating Stripe customers. Lock is automatically released at transaction end.';

-- ============================================================================
-- ROLLBACK
-- ============================================================================

-- To rollback this migration:
--
-- 1. Remove unique constraint:
--    ALTER TABLE public.users DROP CONSTRAINT users_email_key;
--
-- 2. Remove advisory lock function:
--    DROP FUNCTION IF EXISTS public.acquire_user_lock(UUID);
