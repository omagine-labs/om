-- Ensure guest user exists (fix for failed creation in previous migration)
-- This migration is idempotent and safe to run multiple times

DO $$
DECLARE
  v_guest_user_id uuid := '00000000-0000-0000-0000-000000000001';
  v_instance_id uuid;
  v_random_password text;
  v_user_exists_in_auth boolean;
  v_user_exists_in_public boolean;
BEGIN
  -- Check if user already exists in auth.users
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = v_guest_user_id)
  INTO v_user_exists_in_auth;

  -- Check if user already exists in public.users
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = v_guest_user_id)
  INTO v_user_exists_in_public;

  -- If user exists in both tables, we're done
  IF v_user_exists_in_auth AND v_user_exists_in_public THEN
    RAISE NOTICE 'Guest user already exists in both auth.users and public.users';
    RETURN;
  END IF;

  -- Get instance_id from an existing user
  SELECT instance_id INTO v_instance_id
  FROM auth.users
  LIMIT 1;

  IF v_instance_id IS NULL THEN
    RAISE WARNING 'No existing users found to get instance_id from';
    v_instance_id := '00000000-0000-0000-0000-000000000000';
  END IF;

  -- Generate a cryptographically secure random password
  v_random_password := encode(gen_random_bytes(32), 'base64');

  -- Create user in auth.users if it doesn't exist
  IF NOT v_user_exists_in_auth THEN
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
      v_instance_id,
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
      ''
    ) ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'Created guest user in auth.users';
  ELSE
    RAISE NOTICE 'Guest user already exists in auth.users';
  END IF;

  -- Create user in public.users if it doesn't exist
  IF NOT v_user_exists_in_public THEN
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

    RAISE NOTICE 'Created guest user in public.users';
  ELSE
    RAISE NOTICE 'Guest user already exists in public.users';
  END IF;

  RAISE NOTICE 'Guest user setup complete with ID: %', v_guest_user_id;

EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't fail silently - re-raise it
  RAISE WARNING 'Error ensuring guest user exists: %', SQLERRM;
  RAISE;
END;
$$;

-- Verify the guest user was created
DO $$
DECLARE
  v_guest_user_id uuid := '00000000-0000-0000-0000-000000000001';
  v_exists_in_auth boolean;
  v_exists_in_public boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE id = v_guest_user_id)
  INTO v_exists_in_auth;

  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = v_guest_user_id)
  INTO v_exists_in_public;

  IF NOT v_exists_in_auth OR NOT v_exists_in_public THEN
    RAISE EXCEPTION 'Guest user verification failed - user does not exist in both tables';
  END IF;

  RAISE NOTICE 'Guest user verified successfully';
END;
$$;
