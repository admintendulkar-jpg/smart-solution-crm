import { useState } from 'react';
import { FileDown } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { CLIENT_STATUSES, LEAD_STATUSES } from '@/lib/constants';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Fields';
import { Card, CardHeader } from '@/ui/Card';
import { useToast } from '@/ui/Toast';

async function downloadCsv(path: string): Promise<void> {
  const response = await fetch(`/api${path}`, { credentials: 'include' });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? 'Export failed');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? 'export.csv';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportPage() {
  const toast = useToast();
  const [busy, setBusy] = useState<'leads' | 'clients' | null>(null);
  const [leadStatus, setLeadStatus] = useState('');
  const [leadBranch, setLeadBranch] = useState('');
  const [clientStatus, setClientStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const buildQuery = (extra: string[]): string => {
    const parts = extra.filter(Boolean);
    if (from) parts.push(`from=${encodeURIComponent(from)}`);
    if (to) parts.push(`to=${encodeURIComponent(to)}`);
    return parts.length ? `?${parts.join('&')}` : '';
  };

  const runExport = async (kind: 'leads' | 'clients') => {
    setBusy(kind);
    try {
      const path =
        kind === 'leads'
          ? `/admin/export/leads${buildQuery([leadStatus ? `status=${encodeURIComponent(leadStatus)}` : '', leadBranch ? `branch=${encodeURIComponent(leadBranch)}` : ''])}`
          : `/admin/export/clients${buildQuery([clientStatus ? `status=${encodeURIComponent(clientStatus)}` : ''])}`;
      await downloadCsv(path);
      toast.success(`${kind === 'leads' ? 'Leads' : 'Clients'} exported successfully.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Export data</h1>
          <div className="page-subtitle">Download leads and clients as CSV for offline reporting.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
        <Card>
          <CardHeader title="Export leads" subtitle="All leads with filters applied" />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Status">
                <Select value={leadStatus} onChange={(e) => setLeadStatus(e.target.value)}>
                  <option value="">All statuses</option>
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Branch">
                <Select value={leadBranch} onChange={(e) => setLeadBranch(e.target.value)}>
                  <option value="">All branches</option>
                  <option>Coimbatore</option>
                  <option>Bangalore</option>
                  <option>Dharmapuri</option>
                </Select>
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Created from">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </Field>
              <Field label="Created to">
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            </div>
            <Button icon={<FileDown size={14} />} loading={busy === 'leads'} onClick={() => runExport('leads')}>
              Export leads CSV
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Export clients" subtitle="Client records with payment summary" />
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Status">
              <Select value={clientStatus} onChange={(e) => setClientStatus(e.target.value)}>
                <option value="">All statuses</option>
                {CLIENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
            <Button icon={<FileDown size={14} />} loading={busy === 'clients'} onClick={() => runExport('clients')}>
              Export clients CSV
            </Button>
            <div className="alert alert-info">
              <FileDown size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Client export includes total amount, confirmed payments collected and the sales / service rep names.</span>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
