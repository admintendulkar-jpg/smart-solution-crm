import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Download, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { formatDateKey, formatHours, formatTime } from '@/lib/format';
import type { AttendanceWithUser } from '@/lib/types';
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

function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function HrAttendance() {
  const toast = useToast();
  const [date, setDate] = useState(todayKey());
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.hrAttendance(date),
    queryFn: () => api.get<{ date: string; rows: AttendanceWithUser[] }>(`/hr/attendance?date=${date}`),
  });

  const rows = data?.rows ?? [];
  const present = rows.filter((r) => r.status === 'Present' || r.status === 'Half-day').length;
  const halfDay = rows.filter((r) => r.status === 'Half-day').length;
  const onLeave = rows.filter((r) => r.status === 'Leave').length;
  const absent = rows.filter((r) => r.status === 'Absent').length;

  async function exportCsv() {
    setExporting(true);
    try {
      const start = date.slice(0, 8) + '01';
      const res = await fetch(`/api/hr/attendance/export?from=${start}&to=${date}`, { credentials: 'include' });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        toast.error(payload?.error?.message ?? 'Export failed.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${start}-to-${date}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Attendance exported.');
    } catch {
      toast.error('Export failed. Try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={data ? `For ${formatDateKey(data.date)}` : undefined}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 160 }} />
            <Button variant="secondary" icon={<Download size={14} />} loading={exporting} onClick={exportCsv}>Export month CSV</Button>
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
        <div className="stat-card" style={{ borderLeftColor: 'var(--color-success)' }}>
          <div className="stat-label"><span className="stat-icon" style={{ background: 'color-mix(in srgb, var(--color-success) 13%, white)', color: 'var(--color-success)' }}><CalendarCheck size={14} /></span>Present</div>
          <div className="stat-value">{present}</div>
          <div className="stat-sub">{halfDay > 0 ? `${halfDay} half-day` : ''}</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: 'var(--color-info)' }}>
          <div className="stat-label"><span className="stat-icon" style={{ background: 'color-mix(in srgb, var(--color-info) 13%, white)', color: 'var(--color-info)' }}><CalendarCheck size={14} /></span>On leave</div>
          <div className="stat-value">{onLeave}</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: absent > 0 ? 'var(--color-danger)' : 'var(--color-grey)' }}>
          <div className="stat-label"><span className="stat-icon" style={{ background: 'color-mix(in srgb, var(--color-danger) 13%, white)', color: 'var(--color-danger)' }}><Users size={14} /></span>Absent</div>
          <div className="stat-value">{absent}</div>
          <div className="stat-sub">no check-in recorded</div>
        </div>
      </div>

      <Card style={{ marginTop: 18 }}>
        <CardHeader title="Team register" subtitle={`${rows.length} staff`} />
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState error={isError} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users size={20} />} title="No staff" description="No active staff to show." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Role</Th>
                <Th>Check-in</Th>
                <Th>Check-out</Th>
                <Th>Hours</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user.id}>
                  <Td className="cell-strong">{r.user.name}</Td>
                  <Td className="cell-muted">{r.user.role}</Td>
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
    </>
  );
}
