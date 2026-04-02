-- Update trigger_process_meeting() function to use new Supabase project URL
-- Changes from old project (YOUR_OLD_SUPABASE_PROJECT_ID) to new project (YOUR_SUPABASE_PROJECT_ID)

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
    -- NEW Production Supabase configuration
    supabase_url := 'https://YOUR_SUPABASE_PROJECT_ID.supabase.co';
    anon_key := 'YOUR_PRODUCTION_ANON_KEY';

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
