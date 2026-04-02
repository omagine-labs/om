-- Fix ambiguous column reference in claim_anonymous_meetings function
-- Issue: UPDATE statements need table aliases to avoid ambiguous column references

CREATE OR REPLACE FUNCTION claim_anonymous_meetings(
  p_user_id uuid,
  p_email text,
  p_selected_speaker text DEFAULT NULL
)
RETURNS TABLE (
  meeting_id uuid,
  meeting_title text,
  speaker_assigned boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_normalized_email text;
BEGIN
  -- Normalize the email for matching
  v_normalized_email := normalize_email(p_email);

  -- Update meetings ownership from anonymous to authenticated user
  -- Only claim meetings that haven't been claimed yet
  UPDATE meetings m
  SET user_id = p_user_id
  FROM anonymous_uploads au
  WHERE m.id = au.meeting_id
    AND au.normalized_email = v_normalized_email
    AND au.claimed_by_user_id IS NULL;

  -- Mark anonymous uploads as claimed
  UPDATE anonymous_uploads
  SET
    claimed_by_user_id = p_user_id,
    claimed_at = now()
  WHERE normalized_email = v_normalized_email
    AND claimed_by_user_id IS NULL;

  -- Transfer speaker assignments from GUEST_USER_ID to real user
  -- Two modes:
  --   1. If p_selected_speaker is provided: Transfer only that specific speaker
  --   2. If p_selected_speaker is NULL: Transfer ALL GUEST_USER_ID assignments

  IF p_selected_speaker IS NOT NULL THEN
    -- Mode 1: Transfer only the selected speaker
    -- FIX: Added table alias 'ma' to avoid ambiguous column reference
    UPDATE meeting_analysis ma
    SET assigned_user_id = p_user_id
    WHERE ma.meeting_id IN (
      SELECT au.meeting_id
      FROM anonymous_uploads au
      WHERE au.normalized_email = v_normalized_email
        AND au.claimed_by_user_id = p_user_id  -- Only meetings we just claimed
    )
    AND ma.speaker_label = p_selected_speaker
    AND ma.assigned_user_id = '00000000-0000-0000-0000-000000000001';
  ELSE
    -- Mode 2: Transfer all GUEST_USER_ID assignments
    -- FIX: Added table alias 'ma' to avoid ambiguous column reference
    UPDATE meeting_analysis ma
    SET assigned_user_id = p_user_id
    WHERE ma.meeting_id IN (
      SELECT au.meeting_id
      FROM anonymous_uploads au
      WHERE au.normalized_email = v_normalized_email
        AND au.claimed_by_user_id = p_user_id  -- Only meetings we just claimed
    )
    AND ma.assigned_user_id = '00000000-0000-0000-0000-000000000001';
  END IF;

  -- Return claimed meetings with speaker assignment status
  RETURN QUERY
  SELECT
    m.id as meeting_id,
    m.title as meeting_title,
    EXISTS(
      SELECT 1 FROM meeting_analysis ma
      WHERE ma.meeting_id = m.id
      AND ma.assigned_user_id = p_user_id
    ) as speaker_assigned
  FROM meetings m
  INNER JOIN anonymous_uploads au ON au.meeting_id = m.id
  WHERE au.normalized_email = v_normalized_email
    AND au.claimed_by_user_id = p_user_id
  ORDER BY m.created_at DESC;
END;
$$;

COMMENT ON FUNCTION claim_anonymous_meetings IS
'Transfers ownership of anonymous meeting uploads to authenticated users.
Matches by normalized email, updates meeting ownership, marks uploads as claimed,
and transfers speaker assignments from GUEST_USER_ID to the real user.';
