-- Update off_record_periods column documentation to specify expected structure
-- This migration updates the column comment to document the data structure
-- sent by the desktop app for off-record period tracking.

COMMENT ON COLUMN public.meetings.off_record_periods IS
  'Array of off-record periods from desktop app. Structure: [{placeholderStart: number, placeholderEnd: number, actualDuration: number}]. placeholderStart/placeholderEnd are timestamps in the stitched audio where a 5-second placeholder represents the gap. actualDuration is the real time (in seconds) the user was off-record.';
