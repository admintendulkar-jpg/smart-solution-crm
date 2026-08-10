import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  LogIn,
  LogOut,
  Plus,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/auth/auth';
import { api, errorMessage } from '@/lib/api';
import { HR_DOC_TYPES, QUERY_KEYS } from '@/lib/constants';
import { formatDateKey, formatHours, formatTime, todayLocalKey } from '@/lib/format';
import type { MyDashboardData } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { StatusTag } from '@/ui/StatusTag';
import { useToast } from '@/ui/Toast';

function StatCard({ label, value, sub, icon, color }: { label: string; value: React.ReactNode; sub?: string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color ?? 'var(--color-primary)' }}>
      <div className="stat-label">
        <span className="stat-icon" style={{ background: `color-mix(in srgb, ${color ?? 'var(--color-primary)'} 13%, white)`, color }}>
          {icon}
        </span>
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function MyBoard() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.hrMe,
    queryFn: () => api.get<MyDashboardData>('/hr/me/dashboard'),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrMe });

  const checkin = useMutation({
    mutationFn: () => api.post('/hr/me/attendance/checkin'),
    onSuccess: () => { refresh(); toast.success('Checked in. Have a productive day!'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const checkout = useMutation({
    mutationFn: () => api.post('/hr/me/attendance/checkout'),
    onSuccess: () => { refresh(); toast.success('Checked out. See you tomorrow!'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState error={isError} />;

  const totalRemaining = data.balances.reduce((sum, b) => sum + b.remaining_days, 0);
  const totalLeave = data.balances.reduce((sum, b) => sum + b.total_days, 0);
  const verifiedDocs = data.docs.filter((d) => d.status === 'Verified').length;
  const docMap = new Map(data.docs.map((d) => [d.doc_type, d.status]));
  const today = data.today;

  return (
    <>
      <PageHeader
        title={`Hi, ${user?.name.split(' ')[0] ?? 'there'} 👋`}
        subtitle={`${formatDateKey(todayLocalKey())} · Welcome to your employee dashboard.`}
        actions={
          <Link to="/my/leave">
            <Button icon={<Plus size={14} />}>Apply leave</Button>
          </Link>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <StatCard label="Leave balance" value={`${totalRemaining} day${totalRemaining === 1 ? '' : 's'}`} sub={`of ${totalLeave} days this year`} icon={<CalendarDays size={14} />} color="var(--color-primary)" />
        <StatCard label="Pending leaves" value={data.pendingLeaves} sub={data.pendingLeaves > 0 ? 'Awaiting HR approval' : 'All clear'} icon={<CalendarClock size={14} />} color="var(--color-warning)" />
        <StatCard label="Documents verified" value={`${verifiedDocs}/${HR_DOC_TYPES.length}`} sub={verifiedDocs === HR_DOC_TYPES.length ? 'All done' : 'Upload remaining docs'} icon={<ClipboardCheck size={14} />} color="var(--color-success)" />
        <StatCard label="Today" value={today?.status ?? (today?.check_in ? 'Present' : 'Not checked in')} sub={today?.check_in ? `In ${formatTime(today.check_in)}${today.check_out ? ` · Out ${formatTime(today.check_out)}` : ''}` : 'Tap check-in to start'} icon={<Clock size={14} />} color={today?.status === 'Leave' ? 'var(--color-info)' : 'var(--color-grey)'} />
      </div>

      <div className="content-grid content-grid-2" style={{ marginTop: 22 }}>
        <Card>
          <CardHeader title="Attendance today" subtitle="Your daily check-in / check-out" />
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Check-in</div>
                <div style={{ fontWeight: 600, fontSize: 16, marginTop: 2 }}>{formatTime(today?.check_in)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Check-out</div>
                <div style={{ fontWeight: 600, fontSize: 16, marginTop: 2 }}>{formatTime(today?.check_out)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Hours</div>
                <div style={{ fontWeight: 600, fontSize: 16, marginTop: 2 }}>{formatHours(today?.total_hours)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Status</div>
                <div style={{ marginTop: 2 }}>{today ? <StatusTag status={today.status} /> : <StatusTag status="Absent" />}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {!today?.check_in ? (
                <Button icon={<LogIn size={14} />} loading={checkin.isPending} onClick={() => checkin.mutate()}>Check in</Button>
              ) : !today.check_out ? (
                <Button variant="secondary" icon={<LogOut size={14} />} loading={checkout.isPending} onClick={() => checkout.mutate()}>Check out</Button>
              ) : (
                <span className="alert alert-success" style={{ flex: 1 }}>You have completed your shift for today.</span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Document checklist" subtitle="Required for your file" actions={<Link to="/my/documents" style={{ fontSize: 12.5 }}>Manage</Link>} />
          <div>
            {HR_DOC_TYPES.map((type) => {
              const status = docMap.get(type) ?? 'Not uploaded';
              return (
                <div key={type} className="list-item">
                  <span style={{ color: status === 'Verified' ? 'var(--color-success)' : status === 'Rejected' ? 'var(--color-danger)' : 'var(--color-grey)' }}>
                    {status === 'Verified' ? <CheckCircle2 size={16} /> : status === 'Rejected' ? <XCircle size={16} /> : <FileText size={16} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{type}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{type === 'Other' ? 'Any additional document' : 'Personal document'}</div>
                  </div>
                  <StatusTag status={status === 'Not uploaded' ? 'Pending' : status} showLabel={status !== 'Not uploaded'} />
                  {status === 'Not uploaded' && <span className="badge" style={{ background: '#f2f4f7', color: '#5c6675' }}>Missing</span>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="content-grid content-grid-even" style={{ marginTop: 18 }}>
        <Card>
          <CardHeader title="Leave balance" subtitle="Remaining days for this year" actions={<Link to="/my/leave" style={{ fontSize: 12.5 }}>History</Link>} />
          {data.balances.length === 0 ? (
            <EmptyState icon={<CalendarDays size={20} />} title="No leave balance" description="Ask your HR to set up your leave profile." />
          ) : (
            <div style={{ padding: '8px 18px 16px' }}>
              {data.balances.map((b) => {
                const pct = b.total_days > 0 ? Math.round((b.used_days / b.total_days) * 100) : 0;
                return (
                  <div key={b.leave_type_id} style={{ padding: '10px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{b.name}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{b.remaining_days}</span> / {b.total_days} left
                      </span>
                    </div>
                    <div className="progress" style={{ height: 7 }}>
                      <div style={{ width: `${Math.min(pct, 100)}%`, background: pct >= 80 ? 'var(--color-danger)' : 'var(--gradient-primary)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Quick actions" subtitle="Common employee tasks" />
          <div style={{ padding: '6px 18px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Link to="/my/leave" style={{ textDecoration: 'none' }}>
              <Button block variant="secondary" icon={<CalendarDays size={14} />}>Apply leave</Button>
            </Link>
            <Link to="/my/documents" style={{ textDecoration: 'none' }}>
              <Button block variant="secondary" icon={<FileText size={14} />}>Upload document</Button>
            </Link>
            <Link to="/my/attendance" style={{ textDecoration: 'none' }}>
              <Button block variant="secondary" icon={<Clock size={14} />}>My attendance</Button>
            </Link>
            <Link to="/my/salary" style={{ textDecoration: 'none' }}>
              <Button block variant="secondary" icon={<FileText size={14} />}>Payslips</Button>
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
