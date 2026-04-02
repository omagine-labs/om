-- Smart trigger that automatically detects local vs production environment
-- No more manual migrations to switch environments!

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
  is_local boolean;
  db_host text;
BEGIN
  -- Only trigger for newly inserted pending jobs
  IF NEW.status = 'pending' THEN
    -- Detect environment by checking the database host
    -- Local Supabase runs on localhost, production uses Supabase's infrastructure
    SELECT inet_server_addr()::text INTO db_host;
    is_local := (db_host LIKE '127.%' OR db_host LIKE '172.%' OR db_host LIKE '192.168.%' OR db_host = '::1');

    IF is_local THEN
      -- LOCAL DEVELOPMENT
      supabase_url := 'http://host.docker.internal:54321';
      anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
      RAISE LOG '[LOCAL] Triggering process-meeting at % for job %', supabase_url, NEW.id;
    ELSE
      -- PRODUCTION
      supabase_url := 'https://YOUR_SUPABASE_PROJECT_ID.supabase.co';
      anon_key := 'YOUR_PRODUCTION_ANON_KEY';
      RAISE LOG '[PRODUCTION] Triggering process-meeting at % for job %', supabase_url, NEW.id;
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

    RAISE LOG 'Edge Function request_id: %', request_id;
  END IF;

  RETURN NEW;
END;
$$;
