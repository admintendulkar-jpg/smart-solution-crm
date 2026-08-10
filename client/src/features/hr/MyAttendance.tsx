import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Clock, LogIn, LogOut } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { formatDateKey, formatHours, formatMonthLabel, formatTime } from '@/lib/format';
import type { AttendanceRow } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Button } from '@/ui/Button';
import { Input } from '@/ui/Fields';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { StatusTag } from '@/ui/StatusTag';
import { useToast } from '@/ui/Toast';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function MyAttendance() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.hrMeAttendance(month),
    queryFn: () => api.get<{ month: string; rows: AttendanceRow[]; summary: { present: number; half_day: number; on_leave: number } }>(`/hr/me/attendance?month=${month}`),
  });

  const { data: meData } = useQuery({
    queryKey: QUERY_KEYS.hrMe,
    queryFn: () => api.get<{ today: AttendanceRow | null }>('/hr/me/dashboard'),
  });

  const refreshMe = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrMe });
  const today = meData?.today ?? null;

  const checkin = useMutation({
    mutationFn: () => api.post('/hr/me/attendance/checkin'),
    onSuccess: () => { refreshMe(); toast.success('Checked in.'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const checkout = useMutation({
    mutationFn: () => api.post('/hr/me/attendance/checkout'),
    onSuccess: () => { refreshMe(); toast.success('Checked out.'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const rows = data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="My Attendance"
        subtitle={data ? `${formatMonthLabel(data.month)} · ${data.summary.present + data.summary.half_day + data.summary.on_leave} working day(s) logged` : undefined}
        actions={
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 160 }} />
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
        <div className="stat-card" style={{ borderLeftColor: 'var(--color-success)' }}>
          <div className="stat-label"><span className="stat-icon" style={{ background: 'color-mix(in srgb, var(--color-success) 13%, white)', color: 'var(--color-success)' }}><CalendarCheck size={14} /></span>Present days</div>
          <div className="stat-value">{data?.summary.present ?? 0}</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: 'var(--color-warning)' }}>
          <div className="stat-label"><span className="stat-icon" style={{ background: 'color-mix(in srgb, var(--color-warning) 13%, white)', color: 'var(--color-warning)' }}><Clock size={14} /></span>Half days</div>
          <div className="stat-value">{data?.summary.half_day ?? 0}</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: 'var(--color-info)' }}>
          <div className="stat-label"><span className="stat-icon" style={{ background: 'color-mix(in srgb, var(--color-info) 13%, white)', color: 'var(--color-info)' }}><CalendarCheck size={14} /></span>On leave</div>
          <div className="stat-value">{data?.summary.on_leave ?? 0}</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: 'var(--color-primary)' }}>
          <div className="stat-label"><span className="stat-icon" style={{ background: 'color-mix(in srgb, var(--color-primary) 13%, white)', color: 'var(--color-primary)' }}><Clock size={14} /></span>Today</div>
          <div className="stat-value">{today?.check_in ? formatTime(today.check_in) : '—'}</div>
          <div className="stat-sub">{today?.check_out ? `Out ${formatTime(today.check_out)} · ${formatHours(today.total_hours)}` : 'Not checked out yet'}</div>
        </div>
      </div>

      <Card style={{ marginTop: 18 }}>
        <CardHeader
          title="Today's attendance"
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              {!today?.check_in ? (
                <Button size="sm" icon={<LogIn size={13} />} loading={checkin.isPending} onClick={() => checkin.mutate()}>Check in</Button>
              ) : !today.check_out ? (
                <Button size="sm" variant="secondary" icon={<LogOut size={13} />} loading={checkout.isPending} onClick={() => checkout.mutate()}>Check out</Button>
              ) : (
                <StatusTag status={today.status} />
              )}
            </div>
          }
        />
        <div style={{ padding: '14px 18px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Date</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{todayKey()}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Check-in</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{formatTime(today?.check_in)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Check-out</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{formatTime(today?.check_out)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Hours</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{formatHours(today?.total_hours)}</div>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 18 }}>
        <Card>
          <CardHeader title="Monthly log" subtitle={rows.length > 0 ? `${rows.length} entries` : undefined} />
          {isLoading ? (
            <Spinner />
          ) : isError ? (
            <ErrorState error={isError} />
          ) : rows.length === 0 ? (
            <EmptyState icon={<CalendarCheck size={20} />} title="No attendance logged" description="Entries appear here after you check in." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Check-in</Th>
                  <Th>Check-out</Th>
                  <Th>Hours</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date}>
                    <Td className="cell-strong">{formatDateKey(r.date)}</Td>
                    <Td>{formatTime(r.check_in)}</Td>
                    <Td>{formatTime(r.check_out)}</Td>
                    <Td>{formatHours(r.total_hours)}</Td>
                    <Td><StatusTag status={r.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
