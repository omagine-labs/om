-- Create email_signups table for capturing email signups from the marketing site
CREATE TABLE IF NOT EXISTS email_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  signup_source TEXT DEFAULT 'skills-course',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS (no policies = blocks all anon key access, service role still works)
ALTER TABLE email_signups ENABLE ROW LEVEL SECURITY;

-- Add an index on signup_source for filtering
CREATE INDEX idx_email_signups_source ON email_signups (signup_source);

-- Add an index on created_at for ordering
CREATE INDEX idx_email_signups_created_at ON email_signups (created_at DESC);

-- Add an index on ip_address + created_at for rate limiting queries
CREATE INDEX idx_email_signups_ip_rate_limit ON email_signups (ip_address, created_at DESC);
