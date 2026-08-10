import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileText, Paperclip, Upload, XCircle } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { HR_DOC_TYPES, QUERY_KEYS } from '@/lib/constants';
import { formatDateKey, formatDateTime, formatTime } from '@/lib/format';
import type { EmployeeDocument } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { StatusTag } from '@/ui/StatusTag';
import { useToast } from '@/ui/Toast';

export function MyDocuments() {
  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.hrMeDocs,
    queryFn: () => api.get<{ documents: EmployeeDocument[] }>('/hr/me/documents'),
  });

  const documents = data?.documents ?? [];
  const latest = new Map<string, EmployeeDocument>();
  for (const doc of documents) {
    if (!latest.has(doc.doc_type) || doc.id > latest.get(doc.doc_type)!.id) {
      latest.set(doc.doc_type, doc);
    }
  }

  return (
    <>
      <PageHeader title="My Documents" subtitle="Upload your documents for HR verification" />
      <Card>
        <CardHeader title="Document checklist" subtitle="Upload each document once. Re-uploading replaces the previous file." />
        <div style={{ padding: '8px 18px 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {HR_DOC_TYPES.map((type) => (
            <DocCard key={type} type={type} doc={latest.get(type) ?? null} />
          ))}
        </div>
      </Card>

      <div style={{ marginTop: 18 }}>
        <Card>
          <CardHeader title="All uploads" subtitle={`${documents.length} file(s)`} />
          {isLoading ? (
            <Spinner />
          ) : isError ? (
            <ErrorState error={isError} />
          ) : documents.length === 0 ? (
            <EmptyState icon={<FileText size={20} />} title="Nothing uploaded yet" description="Upload your first document from the checklist above." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Document</Th>
                  <Th>File</Th>
                  <Th>Uploaded</Th>
                  <Th>Status</Th>
                  <Th>Reviewed by</Th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <Td className="cell-strong">{d.doc_type}</Td>
                    <Td>
                      <a href={`/api/documents/file/${d.file_path}`} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>
                        {d.original_name ?? d.file_path}
                      </a>
                    </Td>
                    <Td className="cell-muted">{formatDateTime(d.uploaded_at)}</Td>
                    <Td><StatusTag status={d.status} /></Td>
                    <Td className="cell-muted">
                      {d.status === 'Verified' ? `${d.verified_by_name ?? 'HR'} · ${formatDateKey(d.verified_at?.slice(0, 10))}` : d.status === 'Rejected' ? d.rejection_reason ?? '—' : 'Pending'}
                    </Td>
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

function DocCard({ type, doc }: { type: string; doc: EmployeeDocument | null }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.upload(`/hr/me/documents/${type}`, fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrMeDocs });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrMe });
      toast.success(`${type} uploaded. Waiting for HR verification.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => setUploading(false),
  });

  const status = doc?.status ?? 'None';

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 14, background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: status === 'Verified' ? 'var(--color-success)' : status === 'Rejected' ? 'var(--color-danger)' : 'var(--color-grey)' }}>
          {status === 'Verified' ? <CheckCircle2 size={17} /> : status === 'Rejected' ? <XCircle size={17} /> : <FileText size={17} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{type}</div>
          {doc && (
            <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {doc.original_name ?? ''} · {formatTime(doc.uploaded_at)}
            </div>
          )}
        </div>
        {doc ? <StatusTag status={doc.status} /> : <span className="badge" style={{ background: '#f2f4f7', color: '#5c6675' }}>Missing</span>}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) {
            setUploading(true);
            upload.mutate(f);
          }
          e.target.value = '';
        }}
      />
      <Button
        size="sm"
        variant={status === 'Rejected' || status === 'None' ? 'primary' : 'secondary'}
        icon={status === 'Rejected' ? <Upload size={13} /> : <Paperclip size={13} />}
        loading={uploading}
        onClick={() => fileRef.current?.click()}
      >
        {status === 'Rejected' ? 'Re-upload' : status === 'Verified' ? 'Replace' : 'Upload'}
      </Button>
      {status === 'Rejected' && doc?.rejection_reason && (
        <div className="alert alert-danger" style={{ fontSize: 12, padding: '8px 10px' }}>{doc.rejection_reason}</div>
      )}
    </div>
  );
}
