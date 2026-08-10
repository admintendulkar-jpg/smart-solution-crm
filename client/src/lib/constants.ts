import type { Role } from './types';

export const ROLES: Role[] = ['super_admin', 'admin', 'sales', 'service', 'hr'];

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

export const SETTINGS_KEYS = {
  dailyLeadQuota: 'daily_lead_quota',
  leadSplitEnabled: 'lead_split_enabled',
  defaultBranch: 'default_branch',
  slaBusinessDays: 'sla_business_days',
};

export const BRANCHES = ['Coimbatore', 'Bangalore', 'Dharmapuri'];

export const LEAD_STATUSES = ['New', 'Attempting', 'Follow-up', 'Not Interested', 'Converted'];
export const LEAD_PRIORITIES = ['Hot', 'Warm', 'Normal', 'Cold'];
export const CLIENT_STATUSES = ['Open', 'In Progress', 'Delivered', 'Closed'];
export const CALL_OUTCOMES = ['Connected', 'Not Answered', 'Call Back Later', 'Not Interested', 'Converted'];
export const LEAD_SOURCES = ['Meta Ads', 'Google Ads', 'Purchased Data', 'Referral', 'Walk-in', 'Website'];
export const SERVICES = ['ATS Resume', 'Job Support', 'Support Call', 'Website Making'];
export const PACKAGES: Record<string, string[]> = {
  'ATS Resume': ['ATS Resume - Standard', 'ATS Resume - Premium', 'ATS Resume + LinkedIn'],
  'Job Support': ['Job Support - 1 Month', 'Job Support - 3 Months', 'Job Support - 6 Months'],
  'Support Call': ['Support Call - 5 Calls', 'Support Call - 10 Calls'],
  'Website Making': ['Landing Page', 'Business Website', 'E-commerce Website'],
};

export const GUARANTEE_STATUSES = [
  'Guarantee Active',
  'Guarantee Fulfilled',
  'Refund Requested',
  'Refund Processed',
];

export const HR_DOC_TYPES = ['Aadhar', 'PAN', 'Degree', 'Bank', 'Photo', 'Other'];
export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];
export const DOC_STATUSES = ['Pending', 'Verified', 'Rejected'];
export const PAYROLL_STATUSES = ['Draft', 'Published'];

export const STATUS_META: Record<string, { dot: string; label: string; bg: string }> = {
  New: { dot: '#98a2b3', label: '#5c6675', bg: '#f2f4f7' },
  Attempting: { dot: '#146eb4', label: '#146eb4', bg: '#e9f2f9' },
  'Follow-up': { dot: '#f5a623', label: '#8a6100', bg: '#fdf5e3' },
  'Not Interested': { dot: '#d92d20', label: '#b42318', bg: '#fef1f0' },
  Converted: { dot: '#12b76a', label: '#067647', bg: '#e8f8f0' },
  'In Progress': { dot: '#146eb4', label: '#146eb4', bg: '#e9f2f9' },
  Open: { dot: '#12b76a', label: '#067647', bg: '#e8f8f0' },
  Delivered: { dot: '#12b76a', label: '#067647', bg: '#e8f8f0' },
  Closed: { dot: '#475467', label: '#344054', bg: '#eaecf0' },
  Overdue: { dot: '#f04438', label: '#b42318', bg: '#fef0ee' },
  Pending: { dot: '#f5a623', label: '#8a6100', bg: '#fdf5e3' },
  Approved: { dot: '#12b76a', label: '#067647', bg: '#e8f8f0' },
  Verified: { dot: '#12b76a', label: '#067647', bg: '#e8f8f0' },
  Rejected: { dot: '#f04438', label: '#b42318', bg: '#fef0ee' },
  Cancelled: { dot: '#98a2b3', label: '#5c6675', bg: '#f2f4f7' },
  Present: { dot: '#12b76a', label: '#067647', bg: '#e8f8f0' },
  Absent: { dot: '#f04438', label: '#b42318', bg: '#fef0ee' },
  'Half-day': { dot: '#f5a623', label: '#8a6100', bg: '#fdf5e3' },
  Leave: { dot: '#146eb4', label: '#146eb4', bg: '#e9f2f9' },
  Draft: { dot: '#98a2b3', label: '#5c6675', bg: '#f2f4f7' },
  Published: { dot: '#12b76a', label: '#067647', bg: '#e8f8f0' },
};

export const OUTCOME_META: Record<string, { icon: string; color: string }> = {
  Connected: { icon: 'phone', color: '#12b76a' },
  'Not Answered': { icon: 'phone-missed', color: '#98a2b3' },
  'Call Back Later': { icon: 'calendar-clock', color: '#f5a623' },
  'Not Interested': { icon: 'x-circle', color: '#d92d20' },
  Converted: { icon: 'check-circle', color: '#067647' },
};

export const QUERY_KEYS = {
  me: ['me'] as const,
  myLeads: (filter: string, search: string) => ['leads', 'mine', filter, search] as const,
  leadStats: ['leads', 'stats'] as const,
  leadDetail: (id: number) => ['leads', 'detail', id] as const,
  allLeads: (params: string) => ['leads', 'all', params] as const,
  duplicateLeads: ['leads', 'duplicates'] as const,
  clients: (role: string) => ['clients', role] as const,
  clientDetail: (id: number) => ['clients', 'detail', id] as const,
  users: (params: string) => ['users', params] as const,
  notifications: ['notifications'] as const,
  dashboard: ['dashboard'] as const,
  settings: ['settings'] as const,
  splitPreview: ['split', 'preview'] as const,
  batches: ['batches'] as const,
  audit: (limit: number) => ['audit', limit] as const,
  sheetsStatus: ['sheets', 'status'] as const,
  hrMe: ['hr', 'me'] as const,
  hrMeLeaves: ['hr', 'me', 'leaves'] as const,
  hrMeBalance: ['hr', 'me', 'balance'] as const,
  hrMeDocs: ['hr', 'me', 'docs'] as const,
  hrMeAttendance: (month: string) => ['hr', 'me', 'attendance', month] as const,
  hrMeSalary: ['hr', 'me', 'salary'] as const,
  hrDashboard: ['hr', 'dashboard'] as const,
  hrEmployees: (params: string) => ['hr', 'employees', params] as const,
  hrEmployee: (id: number) => ['hr', 'employee', id] as const,
  hrLeaves: (status: string) => ['hr', 'leaves', status] as const,
  hrDocuments: (status: string, type: string) => ['hr', 'documents', status, type] as const,
  hrAttendance: (date: string) => ['hr', 'attendance', date] as const,
  hrPayroll: (month: string) => ['hr', 'payroll', month] as const,
};
