-- CI-BYPASS: destructive-operations
-- Reason: Removing orphaned is_user column that was never queried by any application code
-- Impact: is_user column and idx_meeting_analysis_user index will be removed from meeting_analysis table
-- Justification: The is_user column was set by backend but never read. Backend now sets assigned_user_id directly.
--               Backfill ensures existing auto-identified meetings retain their assignment.

-- Migration: Backfill assigned_user_id for auto-identified meetings and remove is_user column
--
-- This migration:
-- 1. Backfills assigned_user_id for existing meetings where is_user=true
-- 2. Removes the orphaned is_user column and its unused index
--
-- Context: The is_user column was set by the backend but never queried.
-- The backend now sets assigned_user_id directly when auto-identifying users.

-- Step 1: Backfill assigned_user_id for existing meetings where is_user=true
-- Only backfill if confidence >= threshold (60% single mic, 85% shared mic)
UPDATE meeting_analysis ma
SET assigned_user_id = m.user_id
FROM meetings m
WHERE ma.meeting_id = m.id
  AND ma.is_user = true
  AND ma.assigned_user_id IS NULL
  AND m.user_speaker_confidence IS NOT NULL
  AND (
    -- Single mic: 60% threshold (shared_mic_detected = false or NULL)
    (COALESCE(m.shared_mic_detected, false) = false AND m.user_speaker_confidence >= 0.6)
    -- Shared mic: 85% threshold
    OR (m.shared_mic_detected = true AND m.user_speaker_confidence >= 0.85)
  );

-- Step 2: Drop the unused index on is_user
DROP INDEX IF EXISTS idx_meeting_analysis_user;

-- Step 3: Remove the orphaned is_user column
ALTER TABLE meeting_analysis DROP COLUMN IF EXISTS is_user;
