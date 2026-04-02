-- Update RLS policies to allow reading claimed uploads
-- This enables showing "Meeting Already Claimed" message to anonymous users

-- Update anonymous_uploads policy
-- Drop both old and new policies to make migration idempotent
DROP POLICY IF EXISTS "Public read for unclaimed anonymous uploads" ON anonymous_uploads;
DROP POLICY IF EXISTS "Public read for all anonymous uploads" ON anonymous_uploads;

-- Allow anonymous users to read ALL anonymous uploads (claimed or not)
-- This is safe because:
-- 1. They can only SELECT, not UPDATE/DELETE
-- 2. Page logic shows appropriate message based on claim status
-- 3. No sensitive data exposed (just email and claim status)
CREATE POLICY "Public read for all anonymous uploads"
ON anonymous_uploads FOR SELECT TO anon
USING (true);

-- Update meetings policy
-- Drop both old and new policies to make migration idempotent
DROP POLICY IF EXISTS "Public read for unclaimed anonymous meetings" ON meetings;
DROP POLICY IF EXISTS "Public read for anonymous meetings" ON meetings;

-- Allow anonymous users to read ALL meetings from anonymous uploads (claimed or not)
CREATE POLICY "Public read for anonymous meetings"
ON meetings FOR SELECT TO anon
USING (
  id IN (
    SELECT meeting_id FROM anonymous_uploads
  )
);
