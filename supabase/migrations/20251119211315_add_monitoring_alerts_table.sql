-- Add monitoring_alerts table for alert deduplication and audit trail
-- This table prevents alert fatigue by tracking when alerts were last sent

-- Create monitoring_alerts table
CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL, -- e.g., 'capacity_warning', 'rate_limit_spike', 'fraud_spike'
  alert_details JSONB, -- Store specific details about the alert
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for efficient deduplication queries
CREATE INDEX IF NOT EXISTS idx_monitoring_alerts_type_sent_at
  ON monitoring_alerts (alert_type, sent_at DESC);

-- Add comment explaining the table's purpose
COMMENT ON TABLE monitoring_alerts IS 'Tracks sent alerts for deduplication and audit trail. Prevents alert fatigue by allowing queries like "has this alert type been sent in the last N hours?"';

COMMENT ON COLUMN monitoring_alerts.alert_type IS 'Type of alert (e.g., capacity_warning, rate_limit_spike, fraud_spike). Used for deduplication.';
COMMENT ON COLUMN monitoring_alerts.alert_details IS 'JSON details about the alert for audit trail (e.g., threshold values, counts, emails)';
COMMENT ON COLUMN monitoring_alerts.sent_at IS 'When the alert was successfully sent to the team';

-- Enable RLS (restrict access to service role only)
ALTER TABLE monitoring_alerts ENABLE ROW LEVEL SECURITY;

-- No policies needed - this table is only accessed by Edge Functions with service role key
-- Normal users should never see or modify alert records
