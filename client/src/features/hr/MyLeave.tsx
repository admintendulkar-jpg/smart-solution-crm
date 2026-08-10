import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Paperclip, Plus, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { formatDateKey, formatDateTime } from '@/lib/format';
import type { LeaveBalanceRow, LeaveRequest } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Button } from '@/ui/Button';
import { Field, Input, Select, Textarea } from '@/ui/Fields';
import { Modal } from '@/ui/Modal';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { StatusTag } from '@/ui/StatusTag';
import { useToast } from '@/ui/Toast';
import { ConfirmDialog } from '@/ui/ConfirmDialog';

function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

function todayKey(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function MyLeave() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [applyOpen, setApplyOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);

  const [typeId, setTypeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.hrMeLeaves,
    queryFn: () => api.get<{ leaves: LeaveRequest[] }>('/hr/me/leaves'),
  });

  const { data: balanceData } = useQuery({
    queryKey: QUERY_KEYS.hrMeBalance,
    queryFn: () => api.get<{ balances: LeaveBalanceRow[] }>('/hr/me/leave-balance'),
  });

  const balances = balanceData?.balances ?? [];
  const selected = balances.find((b) => b.leave_type_id === Number(typeId));
  const days = useMemo(() => {
    if (!from || !to || to < from) return 0;
    return daySpan(from, to);
  }, [from, to]);

  const applyMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('leaveTypeId', typeId);
      fd.append('fromDate', from);
      fd.append('toDate', to);
      fd.append('reason', reason);
      if (file) fd.append('document', file);
      return api.upload('/hr/me/leaves', fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrMeLeaves });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrMeBalance });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrMe });
      toast.success('Leave request submitted for approval.');
      setApplyOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.del(`/hr/me/leaves/${cancelTarget!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrMeLeaves });
      toast.success('Request cancelled.');
      setCancelTarget(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function resetForm() {
    setTypeId('');
    setFrom('');
    setTo('');
    setReason('');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  const insufficient = selected ? days > selected.remaining_days : false;

  return (
    <>
      <PageHeader
        title="My Leave"
        subtitle="Apply for leave and track approvals"
        actions={<Button icon={<Plus size={14} />} onClick={() => setApplyOpen(true)}>Apply leave</Button>}
      />

      <Card>
        <CardHeader title="Leave history" subtitle={`${data?.leaves.length ?? 0} request(s)`} />
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState error={isError} />
        ) : !data || data.leaves.length === 0 ? (
          <EmptyState icon={<CalendarDays size={20} />} title="No leave requests" description="Apply for leave using the button above." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th>Days</Th>
                <Th>Reason</Th>
                <Th>Status</Th>
                <Th>Reviewed by</Th>
                <Th style={{ width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {data.leaves.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <div className="cell-strong">{l.leave_type_name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Applied {formatDateTime(l.created_at)}</div>
                  </Td>
                  <Td>{formatDateKey(l.from_date)} → {formatDateKey(l.to_date)}</Td>
                  <Td>{l.days}</Td>
                  <Td className="cell-muted">{l.reason ?? '—'}</Td>
                  <Td><StatusTag status={l.status} /></Td>
                  <Td className="cell-muted">
                    {l.reviewer_name ?? '—'}
                    {l.reviewer_note && <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{l.reviewer_note}</div>}
                  </Td>
                  <Td>
                    {l.status === 'Pending' && (
                      <Button size="sm" variant="ghost" onClick={() => setCancelTarget(l)}>Cancel</Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Apply for leave"
        subtitle="Balance is checked at the time of submission"
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplyOpen(false)}>Cancel</Button>
            <Button
              loading={applyMutation.isPending}
              disabled={!typeId || !from || !to || to < from || days <= 0 || insufficient || (selected?.requires_doc === 1 && !file)}
              onClick={() => applyMutation.mutate()}
            >
              Submit request
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Leave type">
            <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Select a leave type</option>
              {balances.map((b) => (
                <option key={b.leave_type_id} value={b.leave_type_id}>
                  {b.name} ({b.remaining_days} days left)
                </option>
              ))}
            </Select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="From">
              <Input type="date" value={from} min={todayKey()} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} min={from || todayKey()} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Field label="Reason" hint={days > 0 ? `${days} day(s) will be deducted from your balance.` : undefined}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do you need this leave?" rows={3} />
          </Field>
          {selected?.requires_doc === 1 && (
            <Field label="Supporting document" hint="Required for this leave type (doctor note / report).">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <Button variant="secondary" size="sm" icon={<Paperclip size={14} />} onClick={() => fileRef.current?.click()}>
                  {file ? 'Change file' : 'Attach file'}
                </Button>
                {file && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                    {file.name}
                    <button type="button" className="icon-btn" onClick={() => setFile(null)} aria-label="Remove file">
                      <X size={13} />
                    </button>
                  </span>
                )}
              </div>
            </Field>
          )}
          {insufficient && (
            <div className="alert alert-danger" style={{ fontSize: 12.5 }}>
              This request needs {days} days, but you only have {selected?.remaining_days} left for {selected?.name}.
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancel leave request"
        message="This will cancel your pending leave request. This cannot be undone."
        confirmLabel="Cancel request"
        danger
        loading={cancelMutation.isPending}
      />
    </>
  );
}
