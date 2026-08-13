import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Inbox,
  PhoneCall,
  Phone,
  CheckCircle2,
  CalendarClock,
  AlarmClock,
  ArrowUpRight,
  IndianRupee,
  AlertTriangle,
  Hourglass,
  Layers,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useAuth } from '@/auth/auth';
import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { formatINR, timeAgo, formatDateTime } from '@/lib/format';
import type { DashboardTotals, Lead, LeadStats, RepPerformance } from '@/lib/types';
import { Card, CardHeader, CardBody } from '@/ui/Card';
import { Spinner } from '@/ui/Spinner';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { StatusTag } from '@/ui/StatusTag';
import { Table, Th, Td } from '@/ui/Table';
import { PageHeader } from '@/ui/PageHeader';

function AnimatedNumber({ value, delay = 0, format }: { value: number; delay?: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    let raf: number;
    let startTime: number | null = null;
    const duration = 600;

    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    const timeout = window.setTimeout(() => {
      started.current = true;
      raf = requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [value, delay]);

  return <>{format ? format(display) : display}</>;
}

function StatCard({ label, value, sub, icon, color = 'var(--color-primary)', to }: { label: string; value: React.ReactNode; sub?: string; icon: React.ReactNode; color?: string; to?: string }) {
  const card = (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <div className="stat-label">
        <span
          className="stat-icon"
          style={{
            background: `color-mix(in srgb, ${color} 13%, white)`,
            color,
          }}
        >
          {icon}
        </span>
        {label}
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
  if (to) {
    return (
      <Link to={to} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        {card}
      </Link>
    );
  }
  return card;
}

function AnimatedStatCard({ label, value, sub, icon, color, delay, to }: { label: string; value: number; sub?: string; icon: React.ReactNode; color?: string; delay?: number; to?: string }) {
  return <StatCard label={label} value={<AnimatedNumber value={value} delay={delay ?? 0} />} sub={sub} icon={icon} color={color} to={to} />;
}

function SalesDashboard() {
  const { data: stats, isError: statsError } = useQuery({
    queryKey: QUERY_KEYS.leadStats,
    queryFn: () => api.get<LeadStats>('/leads/stats'),
  });

  const { data: overdue } = useQuery({
    queryKey: QUERY_KEYS.myLeads('Overdue', ''),
    queryFn: () => api.get<{ leads: Lead[] }>('/leads/mine?status=Overdue'),
  });

  const { data: today } = useQuery({
    queryKey: QUERY_KEYS.myLeads('All', ''),
    queryFn: () => api.get<{ leads: Lead[] }>('/leads/mine'),
  });

  if (statsError) return <ErrorState error={statsError} />;
  if (!stats) return <Spinner />;

  const overdueLeads = overdue?.leads ?? [];
  const todayFollowUps = today?.leads.filter((l) => l.status === 'Follow-up') ?? [];
  const conversionRate = stats.calledToday > 0 ? Math.round((stats.connectedToday / stats.calledToday) * 100) : 0;
  const conversionRateAll = stats.assignedTotal > 0 ? Math.round((stats.convertedTotal / (stats.assignedTotal + stats.convertedTotal)) * 100) : 0;

  return (
    <>
      <PageHeader title="Good day!" subtitle="Here is your work queue for today." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <AnimatedStatCard label="Assigned leads" value={stats.assignedTotal} sub={`${stats.todayAssigned} new today`} icon={<Inbox size={14} />} delay={0} />
        <AnimatedStatCard label="Calls made today" value={stats.calledToday} sub={`${conversionRate}% connected`} icon={<PhoneCall size={14} />} color="var(--color-info)" delay={60} />
        <AnimatedStatCard label="Connected today" value={stats.connectedToday} sub={`${stats.convertedToday} converted`} icon={<Phone size={14} />} color="var(--color-success)" delay={120} />
        <AnimatedStatCard label="Conversions" value={stats.convertedTotal} sub={`${conversionRateAll}% of all assigned`} icon={<CheckCircle2 size={14} />} color="var(--color-success)" delay={180} />
        <AnimatedStatCard
          label="Follow-ups due"
          value={stats.followUpsDueToday + stats.followUpsDueLater}
          sub={`${stats.followUpsDueToday} overdue now`}
          icon={<CalendarClock size={14} />}
          color={stats.followUpsDueToday > 0 ? 'var(--color-danger)' : 'var(--color-warning)'}
          delay={240}
        />
      </div>

      <div className="content-grid content-grid-2" style={{ marginTop: 22 }}>
        <Card>
          <CardHeader title="Overdue follow-ups" subtitle="Call these first — they are waiting" actions={overdueLeads.length > 0 ? <Link to="/leads?status=Overdue" style={{ fontSize: 12.5 }}>View all</Link> : undefined} />
          {overdueLeads.length === 0 ? (
            <EmptyState icon={<AlarmClock size={20} />} title="Nothing overdue" description="No follow-ups have slipped past their scheduled time. Nice work." />
          ) : (
            <div>
              {overdueLeads.map((lead) => (
                <Link key={lead.id} to={`/leads/${lead.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="list-item" style={{ cursor: 'pointer' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-orange)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{lead.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{lead.phone} · {lead.service}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--color-danger-text)' }}>Due {timeAgo(lead.follow_up_at)}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>scheduled {formatDateTime(lead.follow_up_at)}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Upcoming follow-ups" subtitle="Scheduled for later today" />
          {todayFollowUps.length === 0 ? (
            <EmptyState icon={<CalendarClock size={20} />} title="Nothing scheduled" description="Schedule a follow-up while logging a call." />
          ) : (
            <div>
              {todayFollowUps.map((lead) => (
                <Link key={lead.id} to={`/leads/${lead.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="list-item" style={{ cursor: 'pointer' }}>
                    <StatusTag status={lead.is_overdue ? 'Overdue' : 'Follow-up'} showLabel={false} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{lead.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{lead.phone} · {lead.source}</div>
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--color-warning-text)', whiteSpace: 'nowrap' }}>{formatDateTime(lead.follow_up_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

const PIPELINE_COLORS: Record<string, string> = {
  New: 'var(--color-grey)',
  Attempting: 'var(--color-info)',
  'Follow-up': 'var(--color-warning)',
  'Not Interested': 'var(--color-danger)',
  Converted: 'var(--color-success)',
};

function AdminDashboard() {
  const { data, isError } = useQuery({
    queryKey: QUERY_KEYS.dashboard,
    queryFn: () =>
      api.get<{
        totals: DashboardTotals;
        reps: RepPerformance[];
        pipeline: Record<string, number>;
      }>('/admin/dashboard'),
  });

  if (isError) return <ErrorState error={isError} />;
  if (!data) return <Spinner />;

  const { totals, reps, pipeline } = data;
  const pipelineOrder = ['New', 'Attempting', 'Follow-up', 'Not Interested', 'Converted'];
  const totalOpen = pipelineOrder.reduce((sum, s) => sum + (pipeline[s] ?? 0), 0);

  const chartData = pipelineOrder.map((status) => ({
    name: status === 'Not Interested' ? 'No Interest' : status,
    count: pipeline[status] ?? 0,
    status,
  }));

  return (
    <>
      <PageHeader title="Overview" subtitle="Company-wide view across all branches." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
        <AnimatedStatCard label="Open leads" value={totals.openLeads} sub={`${totals.unassigned} awaiting split`} icon={<Layers size={14} />} delay={0} to="/leads" />
        <AnimatedStatCard label="New today" value={totals.leadsToday} sub="Imported & synced" icon={<ArrowUpRight size={14} />} color="var(--color-info)" delay={60} to="/leads" />
        <AnimatedStatCard
          label="Overdue follow-ups"
          value={totals.overdueFollowUps}
          sub="Needs immediate attention"
          icon={<AlarmClock size={14} />}
          color={totals.overdueFollowUps > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
          delay={120}
          to="/leads?status=Follow-up"
        />
        <AnimatedStatCard
          label="Duplicate leads"
          value={totals.pendingDuplicates}
          sub="Awaiting review"
          icon={<AlertTriangle size={14} />}
          color={totals.pendingDuplicates > 0 ? 'var(--color-warning)' : 'var(--color-success)'}
          delay={180}
          to="/duplicates"
        />
        <AnimatedStatCard label="Clients in progress" value={totals.clientsInProgress} sub={`${totals.clientsTotal} total clients`} icon={<Hourglass size={14} />} color="var(--color-info)" delay={240} to="/clients?status=In Progress" />
        <StatCard label="Revenue confirmed" value={<AnimatedNumber value={totals.revenueConfirmed} delay={300} format={formatINR} />} sub={`${totals.convertedToday} conversions today`} icon={<IndianRupee size={14} />} color="var(--color-success)" />
      </div>

      <div className="content-grid content-grid-2" style={{ marginTop: 22 }}>
        <Card>
          <CardHeader title="Sales team performance" subtitle="All time, across branches" />
          <Table>
            <thead>
              <tr>
                <Th>Rep</Th>
                <Th>Branch</Th>
                <Th>Assigned</Th>
                <Th>Calls</Th>
                <Th>Converted</Th>
                <Th>Conv. rate</Th>
              </tr>
            </thead>
            <tbody>
              {reps.map((rep) => {
                const denominator = rep.assigned + rep.converted;
                const rate = denominator > 0 ? Math.round((rep.converted / denominator) * 100) : 0;
                return (
                  <tr key={rep.id}>
                    <Td className="cell-strong">
                      <Link to={`/leads?rep=${rep.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>{rep.name}</Link>
                    </Td>
                    <Td className="cell-muted">{rep.branch}</Td>
                    <Td>{rep.assigned}</Td>
                    <Td>{rep.calls}</Td>
                    <Td><span style={{ color: 'var(--color-success-text)', fontWeight: 600 }}>{rep.converted}</span></Td>
                    <Td>{rate}%</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card>
            <CardHeader title="Lead pipeline" subtitle={`${totalOpen} open leads in motion`} />
            <CardBody>
              <div style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }} barCategoryGap="28%">
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
                      contentStyle={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        fontSize: 12.5,
                        boxShadow: 'var(--shadow-lg)',
                      }}
                      formatter={(value) => [value, 'Leads']}
                    />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell key={entry.status} fill={PIPELINE_COLORS[entry.status]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pipeline breakdown" subtitle="Open leads in each stage" />
            <CardBody>
              {pipelineOrder.map((status) => {
                const count = pipeline[status] ?? 0;
                const pct = totalOpen > 0 ? (count / totalOpen) * 100 : 0;
                return (
                  <Link key={status} to={`/leads?status=${encodeURIComponent(status)}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                    <div style={{ marginBottom: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 5 }}>
                        <StatusTag status={status} />
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>{count}</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--color-grey-bg)', borderRadius: 4, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            borderRadius: 4,
                            background: PIPELINE_COLORS[status],
                            transition: 'width 300ms ease',
                          }}
                        />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;

  if (user.role === 'sales') return <SalesDashboard />;
  if (user.role === 'super_admin' || user.role === 'admin') return <AdminDashboard />;

  return (
    <>
      <PageHeader title="Welcome" subtitle={`You are signed in as ${user.name}.`} />
      <Card>
        <CardBody>
          <EmptyState
            icon={<CheckCircle2 size={20} />}
            title={user.role === 'hr' ? 'HR module arrives in Phase 3' : 'Service workspace arrives in Phase 2'}
            description={
              user.role === 'hr'
                ? 'Staff records, attendance and payroll are being built next. Your access is fully isolated from client and payment data.'
                : 'Client handover, delivery tracking and SLA dashboards are being built next. Until then you can browse clients read-only.'
            }
          />
        </CardBody>
      </Card>
    </>
  );
}
