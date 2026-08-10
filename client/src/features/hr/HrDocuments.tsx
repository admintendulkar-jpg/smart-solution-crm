import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileText, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { HR_DOC_TYPES, QUERY_KEYS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import type { EmployeeDocument } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Button } from '@/ui/Button';
import { Field, Select, Textarea } from '@/ui/Fields';
import { Modal } from '@/ui/Modal';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { StatusTag } from '@/ui/StatusTag';
import { useToast } from '@/ui/Toast';

const FILTERS = ['Pending', 'Verified', 'Rejected', 'All'] as const;

export function HrDocuments() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('Pending');
  const [type, setType] = useState('');
  const [rejectTarget, setRejectTarget] = useState<EmployeeDocument | null>(null);
  const [reason, setReason] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.hrDocuments(filter, type),
    queryFn: () => api.get<{ documents: EmployeeDocument[] }>(`/hr/documents?status=${filter !== 'All' ? filter : ''}&type=${type}`),
  });

  const documents = data?.documents ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrDocuments('', '') });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrDashboard });
  };

  const verify = useMutation({
    mutationFn: (doc: EmployeeDocument) => api.patch(`/hr/documents/${doc.id}`, { action: 'verify' }),
    onSuccess: () => { invalidate(); toast.success('Document verified.'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reject = useMutation({
    mutationFn: () => api.patch(`/hr/documents/${rejectTarget!.id}`, { action: 'reject', reason }),
    onSuccess: () => {
      invalidate();
      toast.success('Document rejected. Employee has been notified.');
      setRejectTarget(null);
      setReason('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <PageHeader title="Documents" subtitle="Verify employee documents" />

      <Card>
        <CardHeader
          title="All documents"
          subtitle={filter === 'Pending' ? `${documents.length} waiting for verification` : `${documents.length} document(s)`}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 140 }}>
                <option value="">All types</option>
                {HR_DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
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
            </div>
          }
        />
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState error={isError} />
        ) : documents.length === 0 ? (
          <EmptyState icon={<FileText size={20} />} title="No documents" description="Nothing matches this filter." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Type</Th>
                <Th>File</Th>
                <Th>Uploaded</Th>
                <Th>Status</Th>
                <Th>Detail</Th>
                <Th style={{ width: 140 }} />
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <Td className="cell-strong">{d.employee_name}</Td>
                  <Td className="cell-muted">{d.doc_type}</Td>
                  <Td>
                    <a href={`/api/documents/file/${d.file_path}`} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>
                      {d.original_name ?? d.file_path}
                    </a>
                  </Td>
                  <Td className="cell-muted">{formatDateTime(d.uploaded_at)}</Td>
                  <Td><StatusTag status={d.status} /></Td>
                  <Td className="cell-muted">
                    {d.status === 'Verified'
                      ? `Verified by ${d.verified_by_name ?? 'HR'}`
                      : d.status === 'Rejected'
                        ? d.rejection_reason ?? '—'
                        : '—'}
                  </Td>
                  <Td>
                    {d.status !== 'Verified' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" icon={<Check size={13} />} loading={verify.isPending && verify.variables?.id === d.id} onClick={() => verify.mutate(d)}>Verify</Button>
                        <Button size="sm" variant="secondary" icon={<X size={13} />} onClick={() => setRejectTarget(d)}>Reject</Button>
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
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject document"
        subtitle={rejectTarget ? `${rejectTarget.employee_name} · ${rejectTarget.doc_type}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
            <Button variant="danger-solid" loading={reject.isPending} disabled={!reason.trim()} onClick={() => reject.mutate()}>
              Reject & notify
            </Button>
          </>
        }
      >
        <Field label="Reason (sent to employee)" hint="The employee will be asked to re-upload a valid copy.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Image is blurry / not a valid document" />
        </Field>
      </Modal>
    </>
  );
}
