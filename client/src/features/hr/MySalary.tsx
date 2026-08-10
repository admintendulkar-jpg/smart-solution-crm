import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Printer } from 'lucide-react';
import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { formatINR, formatMonthLabel } from '@/lib/format';
import type { PayrollRecord } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { Modal } from '@/ui/Modal';

export function MySalary() {
  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.hrMeSalary,
    queryFn: () => api.get<{ records: PayrollRecord[] }>('/hr/me/salary'),
  });

  const [selected, setSelected] = useState<PayrollRecord | null>(null);
  const records = data?.records ?? [];

  return (
    <>
      <PageHeader title="My Salary" subtitle="Published payslips are shown here. HR publishes them after the month closes." />

      <Card>
        <CardHeader title="Payslips" subtitle={`${records.length} published`} />
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState error={isError} />
        ) : records.length === 0 ? (
          <EmptyState icon={<FileText size={20} />} title="No payslips yet" description="Your salary slips will appear here once HR publishes them." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th>Designation</Th>
                <Th>Gross</Th>
                <Th>Net pay</Th>
                <Th>Status</Th>
                <Th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <Td className="cell-strong">{formatMonthLabel(r.month)}</Td>
                  <Td className="cell-muted">{r.designation ?? '—'}</Td>
                  <Td>{formatINR(r.gross)}</Td>
                  <Td style={{ fontWeight: 600 }}>{formatINR(r.net)}</Td>
                  <Td><span className="status-tag" style={{ color: 'var(--color-success-text)' }}><span className="dot" style={{ background: 'var(--color-success)' }} />Published</span></Td>
                  <Td>
                    <Button size="sm" variant="secondary" icon={<FileText size={13} />} onClick={() => setSelected(r)}>View</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Payslip"
        subtitle={selected ? `${selected.name} · ${formatMonthLabel(selected.month)}` : undefined}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
            <Button icon={<Printer size={14} />} onClick={() => window.print()}>Print / Save as PDF</Button>
          </>
        }
      >
        {selected && (
          <div className="print-area" style={{ padding: '4px 2px' }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Smart Solution</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Salary Statement · {formatMonthLabel(selected.month)}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Employee</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right' }}>{selected.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Designation</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right' }}>{selected.designation ?? '—'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Department</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right' }}>{selected.department ?? '—'}</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Bank</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right' }}>{selected.bank_name ?? '—'} {selected.bank_account ? `· A/c ${selected.bank_account}` : ''}</div>
              <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>IFSC</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right' }}>{selected.bank_ifsc ?? '—'}</div>
            </div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              {[
                { label: 'Basic', value: selected.basic },
                { label: 'HRA', value: selected.hra },
                { label: 'Allowances', value: selected.allowances },
                { label: 'Gross salary', value: selected.gross, strong: true },
                { label: 'Deductions', value: -selected.deductions },
                { label: 'Provident Fund', value: -selected.pf },
                { label: 'Income Tax', value: -selected.tax },
                { label: 'Net payable', value: selected.net, strong: true },
              ].map((row) => (
                <div key={row.label} className="kv-row" style={{ padding: '11px 14px', background: row.strong ? 'var(--color-primary-bg)' : undefined }}>
                  <div className="kv-key" style={{ fontWeight: row.strong ? 700 : undefined, fontSize: 13 }}>{row.label}</div>
                  <div className="kv-value" style={{ fontWeight: row.strong ? 700 : undefined, fontSize: 13 }}>
                    {row.value < 0 ? `− ${formatINR(Math.abs(row.value))}` : formatINR(row.value)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 12 }}>Generated {new Date(selected.generated_at).toLocaleString('en-IN')}. This is a system-generated statement.</div>
          </div>
        )}
      </Modal>
    </>
  );
}
