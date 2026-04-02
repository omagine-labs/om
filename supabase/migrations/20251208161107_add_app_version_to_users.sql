-- Add app_version field to users table to track desktop app version
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS app_version TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN public.users.app_version IS 'The version of the desktop app the user is currently running (e.g., "0.6.0"). Updated on sign-in or app startup.';

-- Create index for querying users by app version (useful for monitoring adoption)
CREATE INDEX IF NOT EXISTS idx_users_app_version ON public.users(app_version);
