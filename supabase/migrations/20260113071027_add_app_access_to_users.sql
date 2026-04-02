-- Add app_access column to users table
-- This array tracks which apps/products a user has access to
-- Examples: ['blindslide'], ['om'], ['om', 'blindslide']

BEGIN;

-- Add the app_access column with a default of empty array
-- We'll backfill existing users separately
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS app_access text[] DEFAULT '{}';

-- Backfill existing users with full access (om + blindslide)
-- All existing users have Om accounts, and game is free for Om users
UPDATE public.users
SET app_access = ARRAY['om', 'blindslide']
WHERE app_access = '{}' OR app_access IS NULL;

-- Add an index for efficient array containment queries
-- This helps with middleware checks like: 'om' = ANY(app_access)
CREATE INDEX IF NOT EXISTS idx_users_app_access ON public.users USING GIN (app_access);

-- Add comment for documentation
COMMENT ON COLUMN public.users.app_access IS 'Array of apps/products user has access to. Values: om, blindslide. Empty means no access.';

COMMIT;
