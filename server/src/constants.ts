export const ROLES = ['super_admin', 'admin', 'sales', 'service', 'hr'] as const;
export type Role = (typeof ROLES)[number];

export const BRANCHES = ['Coimbatore', 'Bangalore', 'Dharmapuri'] as const;
export type Branch = (typeof BRANCHES)[number];

export const LEAD_STATUSES = [
  'New',
  'Attempting',
  'Follow-up',
  'Not Interested',
  'Converted',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CLIENT_STATUSES = ['Open', 'In Progress', 'Delivered', 'Closed'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CALL_OUTCOMES = [
  'Connected',
  'Not Answered',
  'Call Back Later',
  'Not Interested',
  'Converted',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const LEAD_SOURCES = [
  'Meta Ads',
  'Google Ads',
  'Purchased Data',
  'Referral',
  'Walk-in',
  'Website',
] as const;

export const SERVICES = ['ATS Resume', 'Job Support', 'Support Call', 'Website Making'] as const;

export const PAYMENT_METHODS = ['Gateway', 'UPI', 'Card', 'Bank Transfer', 'Manual'] as const;

export const PAYMENT_STATUSES = ['Paid', 'Pending', 'Partial'] as const;

export const GUARANTEE_STATUSES = [
  'Guarantee Active',
  'Guarantee Fulfilled',
  'Refund Requested',
  'Refund Processed',
] as const;

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  sales: 'Sales',
  service: 'Service Team',
  hr: 'HR',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  super_admin: 'Owner. Full visibility, lead import and split rules.',
  admin: 'Manages staff and reports. Cannot change owner settings.',
  sales: 'Own assigned leads, calls, follow-ups and conversion.',
  service: 'Client delivery only, after payment confirmation.',
  hr: 'Staff records, attendance and payroll only.',
};

export const BRANCH_LABELS: Record<string, string> = {
  Coimbatore: 'Coimbatore',
  Bangalore: 'Bangalore',
  Dharmapuri: 'Dharmapuri',
};

export const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string }> = {
  New: { dot: '#9aa5b1', text: '#52606d', bg: '#f3f4f6' },
  Attempting: { dot: '#146ebe', text: '#146eb4', bg: '#eaf3fb' },
  'Follow-up': { dot: '#f5a623', text: '#9a6b00', bg: '#fdf6e3' },
  'Not Interested': { dot: '#d92d20', text: '#b42318', bg: '#fef0ef' },
  Converted: { dot: '#12b76a', text: '#067647', bg: '#e9f9f1' },
  'In Progress': { dot: '#146eb4', text: '#146eb4', bg: '#eaf3fb' },
  Open: { dot: '#12b76a', text: '#067647', bg: '#e9f9f1' },
  Delivered: { dot: '#12b76a', text: '#067647', bg: '#e9f9f1' },
  Closed: { dot: '#475467', text: '#344054', bg: '#eaecf0' },
  Overdue: { dot: '#f04438', text: '#b42318', bg: '#fef0ef' },
};

export const SETTINGS_KEYS = {
  dailyLeadQuota: 'daily_lead_quota',
  leadSplitEnabled: 'lead_split_enabled',
  defaultBranch: 'default_branch',
  slaBusinessDays: 'sla_business_days',
} as const;
