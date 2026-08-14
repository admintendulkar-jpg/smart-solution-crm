-- Migration 007: Allow null lead_id and client_id in call_logs for Callyzer external calls
ALTER TABLE call_logs ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE call_logs ALTER COLUMN client_id DROP NOT NULL;
