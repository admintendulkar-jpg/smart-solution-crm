import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Mail, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { QUERY_KEYS, ROLE_LABELS } from '@/lib/constants';
import { formatDateInputValue, formatDateTime, formatINR, formatMonthLabel } from '@/lib/format';
import type { EmployeeDocument, LeaveBalanceRow, LeaveRequest, PayrollRecord } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Avatar } from '@/ui/Avatar';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { StatusTag } from '@/ui/StatusTag';

interface EmployeeDetailResponse {
  employee: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    branch: string;
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
  };
  balances: LeaveBalanceRow[];
  leaves: LeaveRequest[];
  documents: EmployeeDocument[];
  payroll: PayrollRecord[];
}

export function HrEmployeeDetail() {
  const { id } = useParams();
  const employeeId = Number(id);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.hrEmployee(employeeId),
    queryFn: () => api.get<EmployeeDetailResponse>(`/hr/employees/${employeeId}`),
    enabled: Number.isFinite(employeeId) && employeeId > 0,
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState error={isError} />;

  const { employee: e, balances, leaves, documents, payroll } = data;
  const joined = e.joining_date ? new Date(`${e.joining_date}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <>
      <PageHeader
        title={e.name}
        subtitle={`${ROLE_LABELS[e.role as keyof typeof ROLE_LABELS]} · ${e.branch}`}
        actions={
          <Link to="/hr/employees">
            <button className="btn btn-secondary btn-md"><ArrowLeft size={14} /> Back to employees</button>
          </Link>
        }
      />

      <div className="content-grid content-grid-aside">
        <Card>
          <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <Avatar name={e.name} size="lg" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{e.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{e.designation ?? 'No designation'}{e.department ? ` · ${e.department}` : ''}</div>
            </div>
            <span className={`badge ${e.active === 1 ? 'status-tag' : ''}`} style={e.active === 1 ? { color: 'var(--color-success-text)', background: 'var(--color-success-bg)' } : { background: '#f2f4f7', color: '#5c6675' }}>
              {e.active === 1 ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div style={{ padding: '0 18px 18px' }}>
            <div className="kv-row">
              <span className="kv-key">Phone</span>
              <span className="kv-value"><Phone size={12} /> {e.phone}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Email</span>
              <span className="kv-value"><Mail size={12} /> {e.email ?? '—'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Joined</span>
              <span className="kv-value">{joined}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Salary grade</span>
              <span className="kv-value">{e.salary_grade ?? '—'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Bank</span>
              <span className="kv-value" style={{ maxWidth: 200 }}>{e.bank_name ?? '—'} {e.bank_account ? `· ${e.bank_account}` : ''}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">IFSC</span>
              <span className="kv-value">{e.bank_ifsc ?? '—'}</span>
            </div>
            <div className="kv-row">
              <span className="kv-key">Emergency</span>
              <span className="kv-value">{e.emergency_contact ?? '—'}{e.emergency_phone ? ` (${e.emergency_phone})` : ''}</span>
            </div>
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card>
            <CardHeader title="Leave balance" subtitle="Current year" />
            <div style={{ padding: '8px 18px 16px' }}>
              {balances.length === 0 ? (
                <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--color-text-muted)' }}>No leave balance set up.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  {balances.map((b) => {
                    const pct = b.total_days > 0 ? Math.round((b.used_days / b.total_days) * 100) : 0;
                    return (
                      <div key={b.leave_type_id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{b.name}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, margin: '4px 0' }}>{b.remaining_days} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-muted)' }}>/ {b.total_days}</span></div>
                        <div className="progress" style={{ height: 5 }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 80 ? 'var(--color-danger)' : 'var(--gradient-primary)' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Leave history" subtitle="Last 50 requests" />
            {leaves.length === 0 ? (
              <EmptyState icon={<FileText size={20} />} title="No leaves" description="This employee has not applied for leave." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th>Dates</Th>
                    <Th>Days</Th>
                    <Th>Status</Th>
                    <Th>Reviewer note</Th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((l) => (
                    <tr key={l.id}>
                      <Td className="cell-strong">{l.leave_type_name}</Td>
                      <Td className="cell-muted">{formatDateInputValue(l.from_date)} → {formatDateInputValue(l.to_date)}</Td>
                      <Td>{l.days}</Td>
                      <Td><StatusTag status={l.status} /></Td>
                      <Td className="cell-muted">{l.reviewer_note ?? '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Documents" subtitle="Uploaded by the employee" />
            {documents.length === 0 ? (
              <EmptyState icon={<FileText size={20} />} title="No documents" description="This employee has not uploaded any documents." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th>File</Th>
                    <Th>Uploaded</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((d) => (
                    <tr key={d.id}>
                      <Td className="cell-strong">{d.doc_type}</Td>
                      <Td><a href={`/api/documents/file/${d.file_path}`} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>{d.original_name ?? d.file_path}</a></Td>
                      <Td className="cell-muted">{formatDateTime(d.uploaded_at)}</Td>
                      <Td><StatusTag status={d.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card>
            <CardHeader title="Payslips" subtitle="Generated and published" />
            {payroll.length === 0 ? (
              <EmptyState icon={<FileText size={20} />} title="No payslips" description="Generate a payslip from the payroll page." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Month</Th>
                    <Th>Gross</Th>
                    <Th>Net</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.map((p) => (
                    <tr key={p.id}>
                      <Td className="cell-strong">{formatMonthLabel(p.month)}</Td>
                      <Td>{formatINR(p.gross)}</Td>
                      <Td style={{ fontWeight: 600 }}>{formatINR(p.net)}</Td>
                      <Td><StatusTag status={p.status} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
