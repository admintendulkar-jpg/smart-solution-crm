import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FileSpreadsheet, RefreshCw, Database, CheckCircle2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import type { Batch, ImportResult } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader, CardBody } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Table, Th, Td } from '@/ui/Table';
import { Spinner } from '@/ui/Spinner';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { useToast } from '@/ui/Toast';

export function ImportPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');

  const { data: batches, isError: batchesError } = useQuery({
    queryKey: QUERY_KEYS.batches,
    queryFn: () => api.get<{ batches: Batch[] }>('/admin/sync/import/batches'),
  });

  const { data: sheetsStatus } = useQuery({
    queryKey: QUERY_KEYS.sheetsStatus,
    queryFn: () => api.get<{ configured: boolean; provider: string; sheetId: string | null; syncMinutes: number | null }>('/admin/sync/sheets/status'),
  });

  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/admin/sync/import/csv', { method: 'POST', body: formData, credentials: 'include' });
      const payload = (await response.json()) as ImportResult & { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? 'Import failed');
      return payload;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.batches });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(
        `Imported ${result.imported} leads, ${result.duplicates} duplicates flagged, ${result.errors} errors.`,
      );
      setFileName('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const syncNow = useMutation({
    mutationFn: () => api.post<ImportResult>('/admin/sync/sheets/run'),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.batches });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.splitPreview });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      toast.success(`Sheets sync complete: ${result.imported} new, ${result.duplicates} duplicates, leads auto-distributed to team.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    importCsv.mutate(file);
  }

  return (
    <>
      <PageHeader title="Lead Import" subtitle="Bring leads in from CSV or Google Sheets. Nothing is ever deleted — duplicates are flagged, never overwritten." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <Card>
          <CardHeader title="Upload CSV" subtitle="Columns: name, phone (required) — email, whatsapp, source, service (optional)" />
          <CardBody>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files?.[0]);
              }}
              style={{
                border: '1.5px dashed var(--color-border-strong)',
                borderRadius: 'var(--radius-md)',
                padding: '34px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 120ms ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--color-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--color-border-strong)')}
            >
              <div style={{ color: 'var(--color-primary)', marginBottom: 8 }}>
                <FileSpreadsheet size={26} style={{ margin: '0 auto' }} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{importCsv.isPending ? 'Importing…' : 'Drop a CSV here or click to browse'}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Phone numbers are deduplicated against the existing database.
              </div>
            </div>
            {fileName && (
              <div className="alert alert-success" style={{ marginTop: 12, fontSize: 12.5 }}>
                <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{fileName} — processed. See the summary below.</span>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Google Sheets Auto-Sync"
            subtitle="Optional automated intake from a master Google Sheet"
            actions={
              sheetsStatus?.configured ? (
                <Button variant="secondary" size="sm" icon={<RefreshCw size={13} />} loading={syncNow.isPending} onClick={() => syncNow.mutate()}>
                  Sync now
                </Button>
              ) : undefined
            }
          />
          <CardBody>
            {sheetsStatus?.configured ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="alert alert-success" style={{ fontSize: 12.5 }}>
                  <Database size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Connected to sheet <strong>{sheetsStatus.sheetId}</strong>. Auto-syncing every {sheetsStatus.syncMinutes} minutes.
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  New rows added to your Google Sheet are pulled into the CRM database automatically.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="alert alert-info" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                  <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-primary)' }} />
                  <span>
                    <strong>CSV Upload Active:</strong> You can upload leads directly using the CSV file box on the left anytime.
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--color-grey-bg)', borderRadius: 'var(--radius-sm)' }}>
                  💡 <strong>Google Sheets Live Sync (Optional):</strong> To automatically pull leads from a Google Sheet every few minutes, add <code>GOOGLE_SHEET_ID</code> and <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> in Render Environment Variables.
                </div>
              </div>
            )}
            <div style={{ marginTop: 16 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Recent batches</div>
              {importCsv.data && (
                <div className="alert alert-info" style={{ marginTop: 10, fontSize: 12.5 }}>
                  Last import: {importCsv.data.imported} new · {importCsv.data.duplicates} duplicates · {importCsv.data.errors} errors
                </div>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card style={{ marginTop: 18 }}>
        <CardHeader title="Import history" subtitle="Every batch, audited" />
        {!batches ? (
          batchesError ? <ErrorState error={batchesError} /> : <Spinner />
        ) : batches.batches.length === 0 ? (
          <EmptyState icon={<Upload size={20} />} title="No imports yet" description="Your first CSV import will appear here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Source</Th>
                <Th>Uploaded by</Th>
                <Th>Total</Th>
                <Th>Imported</Th>
                <Th>Duplicates</Th>
                <Th>Errors</Th>
                <Th>When</Th>
              </tr>
            </thead>
            <tbody>
              {batches.batches.map((batch) => (
                <tr key={batch.id}>
                  <Td className="cell-strong">{batch.file_name}</Td>
                  <Td className="cell-muted">{batch.source}</Td>
                  <Td className="cell-muted">{batch.uploaded_by_name ?? 'Scheduler'}</Td>
                  <Td>{batch.total}</Td>
                  <Td><span style={{ color: 'var(--color-success-text)', fontWeight: 600 }}>{batch.imported}</span></Td>
                  <Td style={{ color: batch.duplicates > 0 ? 'var(--color-warning-text)' : 'var(--color-text-muted)' }}>{batch.duplicates}</Td>
                  <Td style={{ color: batch.errors > 0 ? 'var(--color-danger-text)' : 'var(--color-text-muted)' }}>{batch.errors}</Td>
                  <Td className="cell-muted">{formatDateTime(batch.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
