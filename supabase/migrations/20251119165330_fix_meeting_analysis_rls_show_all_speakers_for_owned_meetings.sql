-- Fix RLS policy to show all speakers for meetings the user owns
-- Issue: Unassigned speakers (NULL assigned_user_id) were being filtered out
-- Solution: Add condition to allow viewing all speakers for owned meetings

DROP POLICY IF EXISTS "Users can view own or assigned analyses" ON meeting_analysis;

CREATE POLICY "Users can view own or assigned analyses" ON meeting_analysis
  FOR SELECT
  USING (
    (created_by = auth.uid())
    OR (assigned_user_id = auth.uid())
    OR (meeting_id IN (SELECT id FROM meetings WHERE user_id = auth.uid()))
  );
