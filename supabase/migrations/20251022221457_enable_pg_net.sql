-- Enable pg_net extension for HTTP requests from database triggers
-- This is required for the trigger_process_meeting() function to call Edge Functions

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant permissions to use pg_net
GRANT USAGE ON SCHEMA net TO postgres, anon, authenticated, service_role;
