-- Baseline Schema Migration
-- Created: 2025-10-15
-- This migration represents the complete current state of the database
-- All previous migrations have been consolidated into this single file

-- ============================================================================
-- Step 1: Create Custom Types
-- ============================================================================

CREATE TYPE public.job_status AS ENUM ('uploading', 'pending', 'processing', 'completed', 'failed');

-- ============================================================================
-- Step 2: Create Tables
-- ============================================================================

-- Users table
CREATE TABLE public.users (
    id uuid PRIMARY KEY,
    email text NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    full_name text,
    avatar_url text,
    username text UNIQUE CHECK (username ~* '^[a-zA-Z0-9_-]{3,30}$'),
    first_login_completed boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.users IS 'Application users tied to Supabase Auth';
COMMENT ON COLUMN public.users.first_login_completed IS 'Tracks whether user has completed initial setup tutorial after first login';
COMMENT ON COLUMN public.users.username IS 'Unique username for user authentication (alphanumeric, hyphens, underscores, 3-30 characters)';

-- Processing Jobs table
CREATE TABLE public.processing_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id),
    storage_path text,
    original_filename text,
    status public.job_status NOT NULL DEFAULT 'pending',
    processing_error text,
    python_job_id text,
    file_size_mb numeric CHECK (file_size_mb > 0),
    duration_seconds integer CHECK (duration_seconds > 0),
    delete_after timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.processing_jobs IS 'Video/audio processing jobs';
COMMENT ON COLUMN public.processing_jobs.storage_path IS 'Supabase Storage path: recordings/{user_id}/{year}/{month}/{job_id}.mp4';

-- Meeting Analysis table
CREATE TABLE public.meeting_analysis (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL UNIQUE REFERENCES public.processing_jobs(id),
    user_id uuid NOT NULL REFERENCES public.users(id),
    summary text,
    transcript jsonb,
    speaker_stats jsonb,
    communication_metrics jsonb,
    behavioral_insights jsonb,
    created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.meeting_analysis IS 'AI-generated meeting analysis and insights';
COMMENT ON COLUMN public.meeting_analysis.communication_metrics IS '13 communication metrics including company values alignment';
COMMENT ON COLUMN public.meeting_analysis.behavioral_insights IS 'Face detection, eye tracking, prosody analysis results';

-- ============================================================================
-- Step 3: Create Indexes
-- ============================================================================

-- Users indexes
CREATE INDEX idx_users_email ON public.users(email);

-- Processing Jobs indexes
CREATE INDEX idx_processing_jobs_user_id ON public.processing_jobs(user_id);
CREATE INDEX idx_processing_jobs_status ON public.processing_jobs(status);
CREATE INDEX idx_processing_jobs_created_at ON public.processing_jobs(created_at DESC);

-- Meeting Analysis indexes
CREATE INDEX idx_meeting_analysis_job_id ON public.meeting_analysis(job_id);
CREATE INDEX idx_meeting_analysis_user_id ON public.meeting_analysis(user_id);

-- ============================================================================
-- Step 4: Create Functions
-- ============================================================================

-- Function to auto-update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Function to handle new user creation from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, email, first_login_completed)
  VALUES (NEW.id, NEW.email, false);
  RETURN NEW;
END;
$$;

-- Function to trigger processing workflow
CREATE OR REPLACE FUNCTION public.trigger_process_meeting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  request_id bigint;
BEGIN
  -- Only trigger for newly inserted pending jobs
  IF NEW.status = 'pending' THEN
    -- Make async HTTP POST request to Edge Function
    SELECT net.http_post(
      url := 'https://YOUR_SUPABASE_PROJECT_ID.supabase.co/functions/v1/process-meeting',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_PRODUCTION_ANON_KEY'
      ),
      body := jsonb_build_object('jobId', NEW.id::text)
    ) INTO request_id;

    -- Log the request for debugging
    RAISE LOG 'Triggered process-meeting Edge Function for job % with request_id %', NEW.id, request_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- Step 5: Create Triggers
-- ============================================================================

-- Trigger to update updated_at on users table
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to update updated_at on processing_jobs table
CREATE TRIGGER update_processing_jobs_updated_at
    BEFORE UPDATE ON public.processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to create user record when auth user is created
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Trigger to start processing workflow when job is created
CREATE TRIGGER on_processing_job_created
    AFTER INSERT ON public.processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_process_meeting();

-- ============================================================================
-- Step 6: Enable Row Level Security
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_analysis ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Step 7: Create RLS Policies
-- ============================================================================

-- Users policies
CREATE POLICY "Users can view all users" ON public.users
    FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.users
    FOR UPDATE USING (id = auth.uid());

-- Processing Jobs policies
CREATE POLICY "Users can view their own jobs" ON public.processing_jobs
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own jobs" ON public.processing_jobs
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own jobs" ON public.processing_jobs
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own jobs" ON public.processing_jobs
    FOR DELETE USING (user_id = auth.uid());

-- Meeting Analysis policies
CREATE POLICY "Users can view their own analysis" ON public.meeting_analysis
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create their own analysis" ON public.meeting_analysis
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own analysis" ON public.meeting_analysis
    FOR DELETE USING (user_id = auth.uid());

-- ============================================================================
-- Step 8: Storage Bucket Configuration
-- ============================================================================

-- Create recordings bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recordings',
  'recordings',
  false,
  52428800, -- 50MB limit
  ARRAY['audio/*', 'video/*']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['audio/*', 'video/*'];

-- ============================================================================
-- Step 9: Storage RLS Policies
-- ============================================================================

-- Users can upload files to their own directory
-- Path format: recordings/{user_id}/{year}/{month}/{job_id}.{ext}
CREATE POLICY "Users can upload to their own directory"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read their own files
CREATE POLICY "Users can read their own files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update their own files (for metadata updates)
CREATE POLICY "Users can update their own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own files
CREATE POLICY "Users can delete their own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================================
-- Step 10: Grant Permissions
-- ============================================================================

GRANT ALL ON storage.objects TO authenticated;
GRANT ALL ON storage.buckets TO authenticated;
