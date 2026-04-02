-- Fix RLS policy to allow updating speakers for meetings the user owns
-- Issue: Users couldn't assign speakers using "This is me" button for claimed meetings
-- Root cause: created_by is GUEST_USER_ID for anonymous uploads, not the real user
-- Solution: Add condition to allow updating analysis for owned meetings

DROP POLICY IF EXISTS "Users can update their own analysis" ON meeting_analysis;

CREATE POLICY "Users can update their own analysis" ON meeting_analysis
  FOR UPDATE
  USING (
    (created_by = auth.uid())
    OR (meeting_id IN (SELECT id FROM meetings WHERE user_id = auth.uid()))
  );
