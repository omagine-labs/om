-- Backfill meeting_type for existing PowerPoint Karaoke games
-- These were identified by title pattern before we added the meeting_type enum value

UPDATE public.meetings
SET meeting_type = 'powerpoint_karaoke'
WHERE title LIKE 'PowerPoint Karaoke%'
  AND (meeting_type IS NULL OR meeting_type = 'unknown');

-- Log how many were updated (visible in migration output)
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM public.meetings
  WHERE meeting_type = 'powerpoint_karaoke';
  
  RAISE NOTICE 'PowerPoint Karaoke meetings with meeting_type set: %', updated_count;
END $$;
