-- Create anonymous_uploads table for tracking anonymous meeting uploads
CREATE TABLE anonymous_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  normalized_email text NOT NULL,
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE,
  claimed_by_user_id uuid REFERENCES auth.users(id),
  claimed_at timestamptz,
  uploaded_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text,
  rate_limit_key text, -- hash of IP + email for rate limiting
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX idx_anonymous_uploads_normalized_email ON anonymous_uploads(normalized_email);
CREATE INDEX idx_anonymous_uploads_rate_limit ON anonymous_uploads(rate_limit_key, uploaded_at);
CREATE INDEX idx_anonymous_uploads_meeting_id ON anonymous_uploads(meeting_id);
CREATE INDEX idx_anonymous_uploads_claimed_by ON anonymous_uploads(claimed_by_user_id) WHERE claimed_by_user_id IS NOT NULL;

-- Add updated_at trigger
CREATE TRIGGER update_anonymous_uploads_updated_at
  BEFORE UPDATE ON anonymous_uploads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create beta_users table for whitelisting users for testing
CREATE TABLE beta_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  normalized_email text UNIQUE NOT NULL,
  allowed_uploads integer DEFAULT -1, -- -1 = unlimited, otherwise specific count
  uploads_used integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for beta user lookups
CREATE INDEX idx_beta_users_normalized_email ON beta_users(normalized_email);

-- Add updated_at trigger
CREATE TRIGGER update_beta_users_updated_at
  BEFORE UPDATE ON beta_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies for anonymous_uploads table
ALTER TABLE anonymous_uploads ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (anyone can upload)
CREATE POLICY "Allow anonymous uploads" ON anonymous_uploads
  FOR INSERT WITH CHECK (true);

-- Users can view their claimed uploads
CREATE POLICY "Users can view their claimed uploads" ON anonymous_uploads
  FOR SELECT USING (claimed_by_user_id = auth.uid());

-- Users can update (claim) uploads matching their email (handled via function, but allow for direct updates too)
CREATE POLICY "Users can claim their uploads" ON anonymous_uploads
  FOR UPDATE USING (claimed_by_user_id IS NULL);

-- Service role has full access
CREATE POLICY "Service role has full access to anonymous_uploads" ON anonymous_uploads
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Add RLS policies for beta_users table
ALTER TABLE beta_users ENABLE ROW LEVEL SECURITY;

-- Only service role can manage beta users
CREATE POLICY "Service role has full access to beta_users" ON beta_users
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Beta users can view their own record
CREATE POLICY "Beta users can view their own record" ON beta_users
  FOR SELECT USING (email = auth.jwt() ->> 'email');
