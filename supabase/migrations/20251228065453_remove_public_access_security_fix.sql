-- Security Fix: Remove overly permissive public access to meetings and analysis
-- This migration addresses a critical security vulnerability where unauthenticated
-- users could access all anonymous meeting data via the REST API.

BEGIN;

-- ============================================================================
-- Step 1: Drop overly permissive policies
-- ============================================================================

-- Drop the policy that allows public access to ALL anonymous uploads
DROP POLICY IF EXISTS "Public read for all anonymous uploads" ON anonymous_uploads;
DROP POLICY IF EXISTS "Public read for anonymous uploads" ON anonymous_uploads;

-- Drop the policy that allows public access to ALL anonymous meetings
DROP POLICY IF EXISTS "Public read for anonymous meetings" ON meetings;
DROP POLICY IF EXISTS "Public read for unclaimed anonymous meetings" ON meetings;

-- Drop the policy that allows public read of meeting_analysis for anonymous meetings
DROP POLICY IF EXISTS "Public read for unclaimed meeting analysis" ON meeting_analysis;

-- Drop the policy that allows anonymous speaker assignment
DROP POLICY IF EXISTS "Anonymous users can assign speakers to guest" ON meeting_analysis;

-- ============================================================================
-- Step 2: Add secure access token to anonymous_uploads
-- ============================================================================

-- Add access_token column for secure sharing of anonymous meeting results
ALTER TABLE anonymous_uploads
ADD COLUMN IF NOT EXISTS access_token uuid DEFAULT gen_random_uuid();

-- Create index for efficient token lookups
CREATE INDEX IF NOT EXISTS idx_anonymous_uploads_access_token
ON anonymous_uploads(access_token);

-- ============================================================================
-- Step 3: Create secure access policies using access tokens
-- ============================================================================

-- Allow public read of anonymous_uploads ONLY with valid access token
-- This enables checking claim status when user has the secret link
CREATE POLICY "Public read anonymous uploads with valid token"
ON anonymous_uploads FOR SELECT TO anon
USING (
  access_token::text = coalesce(
    current_setting('request.headers', true)::json->>'x-access-token',
    ''
  )
);

-- Allow public read of meetings ONLY with valid access token
CREATE POLICY "Public read meetings with valid token"
ON meetings FOR SELECT TO anon
USING (
  id IN (
    SELECT meeting_id FROM anonymous_uploads
    WHERE access_token::text = coalesce(
      current_setting('request.headers', true)::json->>'x-access-token',
      ''
    )
    AND claimed_by_user_id IS NULL  -- Only unclaimed meetings
  )
);

-- Allow public read of meeting_analysis ONLY with valid access token
CREATE POLICY "Public read meeting analysis with valid token"
ON meeting_analysis FOR SELECT TO anon
USING (
  meeting_id IN (
    SELECT meeting_id FROM anonymous_uploads
    WHERE access_token::text = coalesce(
      current_setting('request.headers', true)::json->>'x-access-token',
      ''
    )
    AND claimed_by_user_id IS NULL  -- Only unclaimed meetings
  )
);

-- Allow public UPDATE of meeting_analysis for speaker assignment with valid token
CREATE POLICY "Public update meeting analysis with valid token"
ON meeting_analysis FOR UPDATE TO anon
USING (
  meeting_id IN (
    SELECT meeting_id FROM anonymous_uploads
    WHERE access_token::text = coalesce(
      current_setting('request.headers', true)::json->>'x-access-token',
      ''
    )
    AND claimed_by_user_id IS NULL
  )
)
WITH CHECK (
  -- Can ONLY set assigned_user_id to GUEST_USER_ID (security constraint)
  assigned_user_id = '00000000-0000-0000-0000-000000000001'
  OR assigned_user_id IS NULL  -- Also allow unsetting
);

-- Allow public read of transcripts ONLY with valid access token
DROP POLICY IF EXISTS "Public can view transcripts for unclaimed anonymous meetings" ON transcripts;
CREATE POLICY "Public read transcripts with valid token"
ON transcripts FOR SELECT TO anon
USING (
  meeting_id IN (
    SELECT meeting_id FROM anonymous_uploads
    WHERE access_token::text = coalesce(
      current_setting('request.headers', true)::json->>'x-access-token',
      ''
    )
    AND claimed_by_user_id IS NULL  -- Only unclaimed meetings
  )
);

-- ============================================================================
-- Step 4: Comments for documentation
-- ============================================================================

COMMENT ON COLUMN anonymous_uploads.access_token IS
'Secret token for secure public access. Must be included in x-access-token header to view meeting results.';

COMMENT ON POLICY "Public read anonymous uploads with valid token" ON anonymous_uploads IS
'Allows public read only when valid access_token is provided in x-access-token header.';

COMMENT ON POLICY "Public read meetings with valid token" ON meetings IS
'Allows public read of unclaimed anonymous meetings only with valid access_token.';

COMMENT ON POLICY "Public read meeting analysis with valid token" ON meeting_analysis IS
'Allows public read of analysis for unclaimed anonymous meetings only with valid access_token.';

COMMENT ON POLICY "Public update meeting analysis with valid token" ON meeting_analysis IS
'Allows public update of speaker assignment for unclaimed anonymous meetings only with valid access_token.';

COMMIT;
