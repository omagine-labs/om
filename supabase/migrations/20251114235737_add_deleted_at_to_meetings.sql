-- Add deleted_at column to meetings table for soft delete functionality
-- This allows calendar-synced meetings to be "deleted" without being removed from the database,
-- preventing them from being re-synced from the calendar provider.

-- Add deleted_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'meetings'
    AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE public.meetings
    ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

-- Create partial index for deleted meetings (only indexes non-null values for performance)
CREATE INDEX IF NOT EXISTS idx_meetings_deleted_at
ON public.meetings(deleted_at)
WHERE deleted_at IS NOT NULL;

-- Add column comment
COMMENT ON COLUMN public.meetings.deleted_at IS
'Timestamp when meeting was soft-deleted. NULL means meeting is active. Only used for calendar-synced meetings (calendar_provider IS NOT NULL) to prevent re-sync. Manual meetings are hard-deleted instead.';
