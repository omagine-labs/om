-- Migration: Drop unused recording metadata columns from meetings table
-- Phase 2 of multi-segment cleanup - removes legacy columns after Edge Functions updated
-- CI-BYPASS: destructive-operations

BEGIN;

-- Drop legacy columns that are no longer used:
-- 1. recording_storage_path - replaced by audio_storage_path in M1 (all Edge Functions updated)
-- 2. recording_captured_at - not used anywhere in codebase

ALTER TABLE public.meetings
  DROP COLUMN IF EXISTS recording_storage_path,
  DROP COLUMN IF EXISTS recording_captured_at;

-- Note: Keeping these columns:
-- - recording_filename: Used for UI display in MeetingCard
-- - recording_available_until: Critical for recording-cleanup-cron
-- - recording_duration_seconds: Used by Python backend
-- - recording_size_mb: Used by admin-cleanup for storage calculations
-- - audio_storage_path: Current storage path for M1 architecture

COMMIT;
