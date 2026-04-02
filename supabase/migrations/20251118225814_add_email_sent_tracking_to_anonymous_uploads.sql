-- Add email tracking to prevent duplicate email sends
-- Ensures idempotent email delivery for anonymous uploads

ALTER TABLE anonymous_uploads
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS email_status TEXT CHECK (email_status IN ('pending', 'sent', 'failed'));

-- Set default status for existing rows
UPDATE anonymous_uploads
SET email_status = 'pending'
WHERE email_status IS NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_anonymous_uploads_email_status
ON anonymous_uploads(meeting_id, email_status);

COMMENT ON COLUMN anonymous_uploads.email_sent_at IS 'Timestamp when completion email was sent';
COMMENT ON COLUMN anonymous_uploads.email_status IS 'Email delivery status: pending, sent, failed';
