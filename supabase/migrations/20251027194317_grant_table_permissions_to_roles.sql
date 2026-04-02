-- Grant table permissions to Supabase roles
-- This is required for RLS policies to work correctly
-- The authenticated, anon, and service_role roles need table-level permissions
-- before RLS policies can filter rows

-- Users table
GRANT ALL ON TABLE public.users TO authenticated, anon, service_role;

-- Processing jobs table
GRANT ALL ON TABLE public.processing_jobs TO authenticated, anon, service_role;

-- Meeting analysis table
GRANT ALL ON TABLE public.meeting_analysis TO authenticated, anon, service_role;

-- Meetings table
GRANT ALL ON TABLE public.meetings TO authenticated, anon, service_role;

-- OAuth tokens table
GRANT ALL ON TABLE public.oauth_tokens TO authenticated, anon, service_role;
