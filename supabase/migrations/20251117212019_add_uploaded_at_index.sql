-- Add index on uploaded_at for efficient monthly cap queries
-- This index is used when counting uploads in the current month
CREATE INDEX IF NOT EXISTS idx_anonymous_uploads_uploaded_at
ON anonymous_uploads(uploaded_at);

-- Add comment explaining the index
COMMENT ON INDEX idx_anonymous_uploads_uploaded_at IS 'Used for efficient monthly cap queries filtering by uploaded_at date';
