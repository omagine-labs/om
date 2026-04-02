-- Increase recordings bucket file size limit from 50MB to 500MB
-- This fixes local development where game recordings (~63MB at 2.5Mbps for 203 seconds)
-- exceed the 50MB limit set in the baseline migration
UPDATE storage.buckets
SET file_size_limit = 524288000  -- 500MB in bytes
WHERE id = 'recordings';
