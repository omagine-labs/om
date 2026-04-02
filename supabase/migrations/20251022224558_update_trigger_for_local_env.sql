-- Update trigger_process_meeting() function to use local Supabase instance
-- Changes from production (YOUR_SUPABASE_PROJECT_ID) to local (localhost:54321)

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
    -- Local Supabase configuration
    supabase_url := 'http://host.docker.internal:54321';
    anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

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
