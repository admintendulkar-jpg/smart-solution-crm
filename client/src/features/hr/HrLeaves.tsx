import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Check, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { formatDateKey, formatDateTime } from '@/lib/format';
import type { LeaveRequest } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Button } from '@/ui/Button';
import { Field, Textarea } from '@/ui/Fields';
import { Modal } from '@/ui/Modal';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { StatusTag } from '@/ui/StatusTag';
import { useToast } from '@/ui/Toast';

const FILTERS = ['Pending', 'Approved', 'Rejected', 'All'] as const;

export function HrLeaves() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('Pending');
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const [action, setAction] = useState<'approve' | 'reject'>('approve');
  const [note, setNote] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.hrLeaves(filter),
    queryFn: () => api.get<{ leaves: LeaveRequest[] }>(`/hr/leaves${filter !== 'All' ? `?status=${filter}` : ''}`),
  });

  const leaves = data?.leaves ?? [];

  const review = useMutation({
    mutationFn: () => api.patch(`/hr/leaves/${reviewTarget!.id}`, { action, note: note || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrLeaves('') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrDashboard });
      toast.success(action === 'approve' ? 'Leave approved. Balance updated.' : 'Request rejected.');
      setReviewTarget(null);
      setNote('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function openReview(l: LeaveRequest, a: 'approve' | 'reject') {
    setReviewTarget(l);
    setAction(a);
    setNote('');
  }

  return (
    <>
      <PageHeader title="Leave Requests" subtitle="Review and approve leave applications" />

      <Card>
        <CardHeader
          title="All requests"
          subtitle={filter === 'Pending' ? `${leaves.length} waiting for review` : `${leaves.length} request(s)`}
          actions={
            <div style={{ display: 'flex', gap: 6 }}>
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className="btn btn-sm"
                  style={{
                    background: filter === f ? 'var(--gradient-primary)' : 'transparent',
                    color: filter === f ? '#fff' : 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          }
        />
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState error={isError} />
        ) : leaves.length === 0 ? (
          <EmptyState icon={<CalendarClock size={20} />} title="Nothing here" description="No leave requests match this filter." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Type</Th>
                <Th>Dates</Th>
                <Th>Days</Th>
                <Th>Reason</Th>
                <Th>Status</Th>
                <Th>Applied</Th>
                <Th style={{ width: 130 }} />
              </tr>
            </thead>
            <tbody>
              {leaves.map((l) => (
                <tr key={l.id}>
                  <Td>
                    <div className="cell-strong">{l.employee_name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{l.role}</div>
                  </Td>
                  <Td className="cell-muted">{l.leave_type_name}</Td>
                  <Td>{formatDateKey(l.from_date)} → {formatDateKey(l.to_date)}</Td>
                  <Td>{l.days}</Td>
                  <Td className="cell-muted" style={{ maxWidth: 180 }}>{l.reason ?? '—'}</Td>
                  <Td>
                    <StatusTag status={l.status} />
                    {l.reviewer_note && <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{l.reviewer_note}</div>}
                  </Td>
                  <Td className="cell-muted">{formatDateTime(l.created_at)}</Td>
                  <Td>
                    {l.status === 'Pending' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" icon={<Check size={13} />} onClick={() => openReview(l, 'approve')}>Approve</Button>
                        <Button size="sm" variant="secondary" icon={<X size={13} />} onClick={() => openReview(l, 'reject')}>Reject</Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title={action === 'approve' ? 'Approve leave' : 'Reject leave'}
        subtitle={reviewTarget ? `${reviewTarget.employee_name} · ${reviewTarget.leave_type_name} (${formatDateKey(reviewTarget.from_date)} → ${formatDateKey(reviewTarget.to_date)}, ${reviewTarget.days}d)` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button
              variant={action === 'approve' ? 'primary' : 'danger-solid'}
              loading={review.isPending}
              onClick={() => review.mutate()}
            >
              {action === 'approve' ? 'Approve & deduct balance' : 'Reject request'}
            </Button>
          </>
        }
      >
        <Field label="Note (sent to employee)" hint={action === 'approve' ? 'Approving deducts the leave days from their balance.' : undefined}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Optional note…" />
        </Field>
      </Modal>
    </>
  );
}
