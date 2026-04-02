-- Migration: Add public RLS policies for anonymous meeting preview
-- Enables public access to unclaimed anonymous meetings and speaker assignment

-- ============================================================================
-- Public Read Access for Unclaimed Anonymous Meetings
-- ============================================================================

-- Allow public (anon) read access to meetings from anonymous uploads that haven't been claimed
CREATE POLICY "Public read for unclaimed anonymous meetings"
ON meetings FOR SELECT
TO anon
USING (
  id IN (
    SELECT meeting_id
    FROM anonymous_uploads
    WHERE claimed_by_user_id IS NULL
  )
);

-- Allow public (anon) read access to meeting_analysis for unclaimed meetings
CREATE POLICY "Public read for unclaimed meeting analysis"
ON meeting_analysis FOR SELECT
TO anon
USING (
  meeting_id IN (
    SELECT meeting_id
    FROM anonymous_uploads
    WHERE claimed_by_user_id IS NULL
  )
);

-- Allow public (anon) read access to anonymous_uploads (for checking claim status)
CREATE POLICY "Public read for anonymous uploads"
ON anonymous_uploads FOR SELECT
TO anon
USING (true);  -- Safe because no PII beyond email


-- ============================================================================
-- Speaker Assignment for Anonymous Users
-- ============================================================================

-- Allow anonymous users to assign speakers (update to GUEST_USER_ID only)
-- This enables "This is me" functionality on the public preview page
CREATE POLICY "Anonymous users can assign speakers to guest"
ON meeting_analysis FOR UPDATE
TO anon
USING (
  -- Can only update analysis for unclaimed anonymous meetings
  meeting_id IN (
    SELECT meeting_id
    FROM anonymous_uploads
    WHERE claimed_by_user_id IS NULL
  )
)
WITH CHECK (
  -- Can ONLY set assigned_user_id to GUEST_USER_ID (security constraint)
  assigned_user_id = '00000000-0000-0000-0000-000000000001'
  OR assigned_user_id IS NULL  -- Also allow unsetting
);


-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON POLICY "Public read for unclaimed anonymous meetings" ON meetings IS
'Allows anyone to view meetings from anonymous uploads that have not been claimed yet. Used for /analysis/[meetingId] preview page.';

COMMENT ON POLICY "Public read for unclaimed meeting analysis" ON meeting_analysis IS
'Allows anyone to view analysis data (metrics, tips, scores) for unclaimed anonymous meetings. Enables full preview before signup.';

COMMENT ON POLICY "Anonymous users can assign speakers to guest" ON meeting_analysis IS
'Allows anonymous users to assign themselves to speakers using GUEST_USER_ID. Assignments are transferred to real user ID on account creation.';
