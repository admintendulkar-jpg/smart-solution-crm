-- Extend call_logs for Exotel Cloud Telephony integration
ALTER TABLE call_logs ADD COLUMN exotel_call_sid TEXT;
ALTER TABLE call_logs ADD COLUMN provider TEXT DEFAULT 'manual';
ALTER TABLE call_logs ADD COLUMN agent_phone TEXT;
ALTER TABLE call_logs ADD COLUMN customer_phone TEXT;
ALTER TABLE call_logs ADD COLUMN status TEXT;
ALTER TABLE call_logs ADD COLUMN recording_url TEXT;
ALTER TABLE call_logs ADD COLUMN client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_exotel_sid ON call_logs(exotel_call_sid);
CREATE INDEX IF NOT EXISTS idx_call_logs_client ON call_logs(client_id);
