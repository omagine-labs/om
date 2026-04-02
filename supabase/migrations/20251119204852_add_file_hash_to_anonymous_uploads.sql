-- Add file_hash column to anonymous_uploads for duplicate detection
ALTER TABLE anonymous_uploads
ADD COLUMN file_hash text;

-- Create index for fast duplicate hash lookups
CREATE INDEX idx_anonymous_uploads_file_hash ON anonymous_uploads(file_hash)
WHERE file_hash IS NOT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN anonymous_uploads.file_hash IS 'SHA-256 hash of uploaded file content for duplicate detection and abuse prevention';
