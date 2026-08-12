export type Role = 'super_admin' | 'admin' | 'sales' | 'service' | 'hr';

export type LeadStatus = 'New' | 'Attempting' | 'Follow-up' | 'Not Interested' | 'Converted';
export type LeadPriority = 'Hot' | 'Warm' | 'Normal' | 'Cold';
export type ClientStatus = 'Open' | 'In Progress' | 'Delivered' | 'Closed';
export type CallOutcome = 'Connected' | 'Not Answered' | 'Call Back Later' | 'Not Interested' | 'Converted';
export type Branch = 'Coimbatore' | 'Bangalore' | 'Dharmapuri';

export interface User {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  branch: Branch;
  active: number;
  role_label?: string;
  created_at: string;
}

export interface Lead {
  id: number;
  external_key: string | null;
  name: string;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  source: string;
  service: string;
  branch: string;
  status: string;
  assigned_to: number | null;
  assigned_name: string | null;
  follow_up_at: string | null;
  last_call_at: string | null;
  last_outcome: string | null;
  is_duplicate: number;
  duplicate_of: number | null;
  is_overdue: number;
  priority: string;
  created_at: string;
}

export interface LeadListResponse {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CallLog {
  id: number;
  lead_id: number | null;
  client_id?: number | null;
  user_id: number;
  user_name: string;
  outcome: string;
  duration_sec: number;
  note: string | null;
  provider?: string;
  status?: string | null;
  recording_url?: string | null;
  exotel_call_sid?: string | null;
  agent_phone?: string | null;
  customer_phone?: string | null;
  created_at: string;
}

export interface LeadNote {
  id: number;
  lead_id: number;
  user_id: number | null;
  user_name: string | null;
  body: string;
  created_at: string;
}

export interface LeadDetail {
  lead: Lead;
  calls: CallLog[];
  notes: LeadNote[];
  duplicateOf: { id: number; name: string; phone: string } | null;
  events: AuditEntry[];
}

export interface LeadStats {
  assignedTotal: number;
  todayAssigned: number;
  calledToday: number;
  connectedToday: number;
  convertedToday: number;
  convertedTotal: number;
  followUpsDueToday: number;
  followUpsDueLater: number;
}

export interface Client {
  id: number;
  lead_id: number | null;
  name: string;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  service: string;
  package_plan: string | null;
  amount: number;
  payment_status: string;
  source: string | null;
  sales_person_id: number | null;
  sales_person_name: string | null;
  status: string;
  guarantee_status: string;
  due_date: string | null;
  assigned_to: number | null;
  service_person_name: string | null;
  is_overdue: number;
  inquiry_date: string;
  address: string | null;
  alternate_phone: string | null;
  service_description: string | null;
  transaction_ref: string | null;
  created_at: string;
}

export interface Payment {
  id: number;
  client_id: number;
  amount: number;
  method: string;
  gateway_ref: string | null;
  status: string;
  proof_path: string | null;
  verified_by: number | null;
  verified_at: string | null;
  created_at: string;
}

export interface ClientNote {
  id: number;
  client_id: number;
  user_id: number | null;
  user_name: string | null;
  body: string;
  created_at: string;
}

export interface ClientDetail {
  client: Client;
  payments: Payment[];
  notes: ClientNote[];
}

export interface NotificationItem {  id: number;
  title: string;
  body: string | null;
  link: string | null;
  read: number;
  created_at: string;
}

export interface DashboardTotals {
  openLeads: number;
  leadsToday: number;
  overdueFollowUps: number;
  pendingDuplicates: number;
  unassigned: number;
  clientsTotal: number;
  clientsInProgress: number;
  revenueConfirmed: number;
  convertedToday: number;
}

export interface RepPerformance {
  id: number;
  name: string;
  branch: string;
  assigned: number;
  calls: number;
  converted: number;
}

export interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  duplicateDetails: { name: string; phone: string; matches: string }[];
}

export interface Batch {
  id: number;
  file_name: string;
  source: string;
  status: string;
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  uploaded_by_name: string | null;
  created_at: string;
}

export interface SplitPreview {
  reps: { id: number; name: string; load: number }[];
  pool: number;
  quota: number;
  enabled: boolean;
}

export interface AuditEntry {
  id: number;
  user_name: string | null;
  action: string;
  entity: string | null;
  entity_id: number | null;
  detail: string | null;
  created_at: string;
}

export interface EmployeeProfile {
  id: number;
  user_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  branch: Branch;
  active: number;
  designation: string | null;
  department: string | null;
  joining_date: string | null;
  salary_grade: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_ifsc: string | null;
  emergency_contact: string | null;
  emergency_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveBalanceRow {
  leave_type_id: number;
  name: string;
  is_paid: number;
  requires_doc: number;
  total_days: number;
  used_days: number;
  remaining_days: number;
}

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export type DocStatus = 'Pending' | 'Verified' | 'Rejected';

export interface LeaveRequest {
  id: number;
  user_id: number;
  leave_type_id: number;
  leave_type_name: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  reviewed_by: number | null;
  reviewed_at: string | null;
  reviewer_note: string | null;
  reviewer_name: string | null;
  employee_name?: string;
  role?: string;
  created_at: string;
}

export interface EmployeeDocument {
  id: number;
  user_id: number;
  doc_type: string;
  file_path: string;
  original_name: string | null;
  mime: string | null;
  size: number;
  status: DocStatus;
  verified_by: number | null;
  verified_at: string | null;
  rejection_reason: string | null;
  verified_by_name?: string;
  employee_name?: string;
  uploaded_at: string;
}

export interface AttendanceRow {
  id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  total_hours: number | null;
  status: string;
}

export interface AttendanceWithUser {
  user: { id: number; name: string; role: string; branch: string };
  check_in: string | null;
  check_out: string | null;
  total_hours: number | null;
  status: string;
}

export interface PayrollRecord {
  id: number;
  user_id: number;
  name?: string;
  role?: string;
  branch?: string;
  designation?: string | null;
  department?: string | null;
  month: string;
  basic: number;
  hra: number;
  allowances: number;
  deductions: number;
  pf: number;
  tax: number;
  gross: number;
  net: number;
  status: 'Draft' | 'Published';
  generated_by: number | null;
  generated_at: string;
  published_at: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_ifsc?: string | null;
}

export interface HrDashboardData {
  today: string;
  teamSize: number;
  checkedIn: number;
  onLeave: number;
  absent: number;
  pendingLeaves: number;
  pendingDocs: number;
  recentJoiners: {
    id: number;
    name: string;
    role: string;
    branch: string;
    designation: string | null;
    joining_date: string | null;
  }[];
  recentLeaves: LeaveRequest[];
}

export interface MyDashboardData {
  user: User;
  profile: EmployeeProfile | null;
  balances: LeaveBalanceRow[];
  docs: { doc_type: string; status: string }[];
  today: { check_in: string | null; check_out: string | null; total_hours: number | null; status: string } | null;
  pendingLeaves: number;
}
