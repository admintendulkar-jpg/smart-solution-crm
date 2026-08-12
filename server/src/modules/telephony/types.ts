export interface InitiateCallParams {
  leadId?: number;
  clientId?: number;
  customerPhone: string;
  agentUserId: number;
  agentPhone: string;
}

export interface ExotelConnectResponse {
  Call?: {
    Sid?: string;
    AccountSid?: string;
    Status?: string;
    From?: string;
    To?: string;
    PhoneNumber?: string;
    DateCreated?: string;
    Price?: string;
  };
  RestException?: {
    Status?: number;
    Message?: string;
    Code?: string;
  };
}

export interface ExotelWebhookPayload {
  CallSid?: string;
  CallType?: string;
  From?: string;
  To?: string;
  PhoneNumber?: string;
  Status?: string;
  StartTime?: string;
  EndTime?: string;
  Duration?: string;
  RecordingUrl?: string;
  CustomField?: string;
}

export interface CallLogRecord {
  id: number;
  lead_id: number | null;
  client_id: number | null;
  user_id: number;
  outcome: string;
  duration_sec: number;
  note: string | null;
  exotel_call_sid: string | null;
  provider: string;
  agent_phone: string | null;
  customer_phone: string | null;
  status: string | null;
  recording_url: string | null;
  created_at: string;
  user_name?: string;
}
