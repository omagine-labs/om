-- Create anonymous-recordings storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anonymous-recordings',
  'anonymous-recordings',
  false, -- Not public, requires authentication
  524288000, -- 500MB limit (500 * 1024 * 1024)
  ARRAY[
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/x-matroska',
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/flac',
    'audio/ogg'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for anonymous-recordings bucket

-- Allow anonymous uploads (anon role can insert)
CREATE POLICY "Allow anonymous file uploads"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'anonymous-recordings');

-- Allow service role to read files (for processing)
CREATE POLICY "Service role can read anonymous recordings"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'anonymous-recordings');

-- Allow service role to delete files (for cleanup)
CREATE POLICY "Service role can delete anonymous recordings"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'anonymous-recordings');

-- Add is_system_guest column to public.users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_system_guest boolean DEFAULT false;

-- Create system guest user
-- NOTE: This user is created with a fixed UUID and cannot be logged into
-- It serves as the owner of all anonymous meetings until they are claimed

DO $$
DECLARE
  v_guest_user_id uuid := '00000000-0000-0000-0000-000000000001';
  v_instance_id uuid;
  v_random_password text;
BEGIN
  -- Get the instance ID from an existing user (we need this for the insert)
  SELECT instance_id INTO v_instance_id
  FROM auth.users
  LIMIT 1;

  -- Generate a cryptographically secure random password (user can never log in with this)
  v_random_password := encode(gen_random_bytes(32), 'base64');

  -- Insert system guest user into auth.users
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role,
    aud,
    confirmation_token
  ) VALUES (
    v_guest_user_id,
    COALESCE(v_instance_id, '00000000-0000-0000-0000-000000000000'),
    'guest@omaginelabs.com',
    crypt(v_random_password, gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"is_system_guest": true}'::jsonb,
    false,
    'authenticated',
    'authenticated',
    '' -- Empty confirmation token (email already confirmed)
  ) ON CONFLICT (id) DO NOTHING;

  -- Create user record for guest user in public.users
  INSERT INTO public.users (
    id,
    email,
    is_system_guest,
    created_at,
    updated_at
  ) VALUES (
    v_guest_user_id,
    'guest@omaginelabs.com',
    true,
    now(),
    now()
  ) ON CONFLICT (id) DO UPDATE SET
    is_system_guest = true;

  RAISE NOTICE 'System guest user created with ID: %', v_guest_user_id;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to create system guest user: %', SQLERRM;
  -- Don't fail the migration, just warn
END;
$$;

-- Add comment explaining the guest user
COMMENT ON COLUMN public.users.is_system_guest IS 'True for the special system guest user that owns anonymous meetings until they are claimed';
