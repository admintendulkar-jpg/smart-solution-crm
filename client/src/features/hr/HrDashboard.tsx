import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarCheck, CalendarClock, ClipboardCheck, FileText, UserPlus, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { QUERY_KEYS, ROLE_LABELS } from '@/lib/constants';
import { formatDateKey } from '@/lib/format';
import type { HrDashboardData } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Avatar } from '@/ui/Avatar';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { StatusTag } from '@/ui/StatusTag';

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

export function HrDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.hrDashboard,
    queryFn: () => api.get<HrDashboardData>('/hr/dashboard'),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState error={isError} />;

  return (
    <>
      <PageHeader
        title="HR Overview"
        subtitle={`${formatDateKey(data.today)} · Attendance as of now`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/hr/employees"><button className="btn btn-secondary btn-md"><UserPlus size={14} /> Employees</button></Link>
            <Link to="/hr/leaves"><button className="btn btn-primary btn-md"><CalendarClock size={14} /> Leaves</button></Link>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <StatCard label="Team size" value={data.teamSize} sub="active staff" icon={<Users size={14} />} color="var(--color-primary)" />
        <StatCard label="Present today" value={data.checkedIn} sub={`${data.teamSize > 0 ? Math.round((data.checkedIn / data.teamSize) * 100) : 0}% attendance`} icon={<CalendarCheck size={14} />} color="var(--color-success)" />
        <StatCard label="On leave" value={data.onLeave} sub="approved leave today" icon={<CalendarClock size={14} />} color="var(--color-info)" />
        <StatCard label="Absent" value={data.absent} sub="no check-in recorded" icon={<Users size={14} />} color={data.absent > 0 ? 'var(--color-danger)' : 'var(--color-grey)'} />
        <StatCard label="Pending leaves" value={data.pendingLeaves} sub="awaiting review" icon={<CalendarClock size={14} />} color="var(--color-warning)" />
        <StatCard label="Docs to verify" value={data.pendingDocs} sub="pending verification" icon={<ClipboardCheck size={14} />} color="var(--color-accent)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 22, alignItems: 'start' }}>
        <Card>
          <CardHeader title="Recent joiners" subtitle="Latest to join the team" actions={<Link to="/hr/employees" style={{ fontSize: 12.5 }}>All employees</Link>} />
          {data.recentJoiners.length === 0 ? (
            <EmptyState icon={<Users size={20} />} title="No profiles yet" description="Set up employee profiles in the Employees section." />
          ) : (
            <div>
              {data.recentJoiners.map((j) => (
                <Link key={j.id} to={`/hr/employees/${j.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="list-item" style={{ cursor: 'pointer' }}>
                    <Avatar name={j.name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{j.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                        {j.designation ?? ROLE_LABELS[j.role as keyof typeof ROLE_LABELS]} · {j.branch}
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      Joined {formatDateKey(j.joining_date)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent leave requests" subtitle="Latest applications" actions={<Link to="/hr/leaves" style={{ fontSize: 12.5 }}>Review</Link>} />
          {data.recentLeaves.length === 0 ? (
            <EmptyState icon={<CalendarClock size={20} />} title="No leave requests" description="Leave applications will show up here." />
          ) : (
            <div>
              {data.recentLeaves.map((l) => (
                <div key={l.id} className="list-item">
                  <span className="stat-icon" style={{ background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
                    <FileText size={14} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{l.employee_name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                      {l.leave_type_name} · {formatDateKey(l.from_date)} → {formatDateKey(l.to_date)} ({l.days}d)
                    </div>
                  </div>
                  <StatusTag status={l.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
