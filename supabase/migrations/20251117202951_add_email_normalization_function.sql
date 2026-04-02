-- Email normalization function to prevent duplicate accounts
-- Converts email to lowercase, removes +suffix, and removes dots for Gmail

CREATE OR REPLACE FUNCTION normalize_email(email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  local_part text;
  domain_part text;
  base_local text;
BEGIN
  -- Trim and lowercase the email
  email := lower(trim(email));

  -- Split email into local and domain parts
  local_part := split_part(email, '@', 1);
  domain_part := split_part(email, '@', 2);

  -- Validate email has both parts
  IF local_part = '' OR domain_part = '' THEN
    RAISE EXCEPTION 'Invalid email format: %', email;
  END IF;

  -- Remove +suffix (e.g., user+test@gmail.com → user@gmail.com)
  base_local := split_part(local_part, '+', 1);

  -- Remove dots for Gmail/Googlemail (user.name@gmail.com → username@gmail.com)
  IF domain_part IN ('gmail.com', 'googlemail.com') THEN
    base_local := replace(base_local, '.', '');
  END IF;

  RETURN base_local || '@' || domain_part;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION normalize_email IS 'Normalizes email addresses to prevent duplicate accounts by removing +suffix and dots for Gmail';

-- Test the function with some examples
DO $$
BEGIN
  -- Test basic normalization
  ASSERT normalize_email('User@Example.com') = 'user@example.com', 'Basic lowercase failed';

  -- Test +suffix removal
  ASSERT normalize_email('user+tag@example.com') = 'user@example.com', '+suffix removal failed';

  -- Test Gmail dot removal
  ASSERT normalize_email('user.name@gmail.com') = 'username@gmail.com', 'Gmail dot removal failed';

  -- Test combined (the ultimate test!)
  ASSERT normalize_email('User.Name+Tag@Gmail.COM') = 'username@gmail.com', 'Combined normalization failed';

  RAISE NOTICE 'Email normalization function tests passed!';
END;
$$;
