-- Update trigger to be environment-aware for local development
-- This migration makes the trigger work in both local and production environments
-- Date: 2025-10-15

CREATE OR REPLACE FUNCTION public.trigger_process_meeting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  request_id bigint;
  supabase_url text;
  anon_key text;
BEGIN
  -- Only trigger for newly inserted pending jobs
  IF NEW.status = 'pending' THEN
    -- Detect environment and set appropriate URL
    -- For local: use localhost
    -- For production: use the production URL
    supabase_url := current_setting('request.headers', true)::json->>'x-forwarded-host';

    -- Check if we're running locally (localhost or no header)
    IF supabase_url IS NULL OR supabase_url = '' OR supabase_url = 'localhost' THEN
      -- Local development
      -- Use host.docker.internal because the trigger runs inside Docker container
      supabase_url := 'http://host.docker.internal:54321';
      anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
    ELSE
      -- Production
      supabase_url := 'https://' || supabase_url;
      anon_key := 'YOUR_PRODUCTION_ANON_KEY';
    END IF;

    -- Make async HTTP POST request to Edge Function
    SELECT net.http_post(
      url := supabase_url || '/functions/v1/process-meeting',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object('jobId', NEW.id::text)
    ) INTO request_id;

    -- Log the request for debugging
    RAISE LOG 'Triggered process-meeting Edge Function at % for job % with request_id %', supabase_url, NEW.id, request_id;
  END IF;

  RETURN NEW;
END;
$$;
