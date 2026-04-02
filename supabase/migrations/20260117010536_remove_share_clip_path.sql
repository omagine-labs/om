-- Remove share_clip_path column from meetings and games tables
-- This column is no longer used - share images are now generated dynamically via /api/game/share/image
--
-- CI-BYPASS: destructive-operations
-- Justification: Intentional cleanup of unused column. Share images are now generated
-- dynamically via /api/game/share/image instead of being stored as file paths.

ALTER TABLE public.meetings DROP COLUMN IF EXISTS share_clip_path;
ALTER TABLE public.games DROP COLUMN IF EXISTS share_clip_path;
