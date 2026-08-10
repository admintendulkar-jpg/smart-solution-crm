import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileText, Plus, Send, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { formatINR, formatMonthLabel } from '@/lib/format';
import type { PayrollRecord } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Fields';
import { Modal } from '@/ui/Modal';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { StatusTag } from '@/ui/StatusTag';
import { useToast } from '@/ui/Toast';
import { ConfirmDialog } from '@/ui/ConfirmDialog';

interface EmployeeOption {
  id: number;
  name: string;
  role: string;
  department: string | null;
  designation: string | null;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface PayForm {
  userId: string;
  basic: string;
  hra: string;
  allowances: string;
  deductions: string;
  pf: string;
  tax: string;
}

const EMPTY_FORM: PayForm = { userId: '', basic: '', hra: '', allowances: '', deductions: '', pf: '', tax: '' };

export function HrPayroll() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [genOpen, setGenOpen] = useState(false);
  const [form, setForm] = useState<PayForm>(EMPTY_FORM);
  const [publishTarget, setPublishTarget] = useState<PayrollRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PayrollRecord | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.hrPayroll(month),
    queryFn: () => api.get<{ records: PayrollRecord[] }>(`/hr/payroll?month=${month}`),
  });

  const { data: empData } = useQuery({
    queryKey: QUERY_KEYS.hrEmployees('all'),
    queryFn: () => api.get<{ employees: EmployeeOption[] }>('/hr/employees?active=true'),
  });

  const records = data?.records ?? [];
  const employees = (empData?.employees ?? []).filter((e) => !records.some((r) => r.user_id === e.id && r.status === 'Published'));

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrPayroll(month) });
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrEmployees('') });
  };

  const generate = useMutation({
    mutationFn: () =>
      api.post('/hr/payroll', {
        userId: Number(form.userId),
        month,
        basic: Number(form.basic) || 0,
        hra: Number(form.hra) || 0,
        allowances: Number(form.allowances) || 0,
        deductions: Number(form.deductions) || 0,
        pf: Number(form.pf) || 0,
        tax: Number(form.tax) || 0,
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Draft payslip generated.');
      setGenOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const publish = useMutation({
    mutationFn: () => api.patch(`/hr/payroll/${publishTarget!.id}`, { action: 'publish' }),
    onSuccess: () => {
      invalidate();
      toast.success('Payslip published. Employee has been notified.');
      setPublishTarget(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/hr/payroll/${deleteTarget!.id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Draft payslip deleted.');
      setDeleteTarget(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const num = (v: string) => Number(v) || 0;
  const gross = num(form.basic) + num(form.hra) + num(form.allowances);
  const net = gross - num(form.deductions) - num(form.pf) - num(form.tax);

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle="Generate and publish payslips"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 160 }} />
            <Button icon={<Plus size={14} />} onClick={() => setGenOpen(true)}>Generate payslip</Button>
          </div>
        }
      />

      <Card>
        <CardHeader title={`Payslips · ${formatMonthLabel(month)}`} subtitle={`${records.length} record(s)`} />
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState error={isError} />
        ) : records.length === 0 ? (
          <EmptyState icon={<FileText size={20} />} title="No payslips for this month" description="Generate a draft payslip, then publish it to make it visible to the employee." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Designation</Th>
                <Th>Gross</Th>
                <Th>Net</Th>
                <Th>Status</Th>
                <Th style={{ width: 130 }} />
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link to={`/hr/employees/${r.user_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <span className="cell-strong">{r.name}</span>
                    </Link>
                  </Td>
                  <Td className="cell-muted">{r.designation ?? '—'}</Td>
                  <Td>{formatINR(r.gross)}</Td>
                  <Td style={{ fontWeight: 600 }}>{formatINR(r.net)}</Td>
                  <Td><StatusTag status={r.status} /></Td>
                  <Td>
                    {r.status === 'Draft' ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" icon={<Send size={13} />} loading={publish.isPending && publishTarget?.id === r.id} onClick={() => setPublishTarget(r)}>Publish</Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => setDeleteTarget(r)}>Delete</Button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Sent {r.published_at ? new Date(r.published_at).toLocaleDateString('en-IN') : ''}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title={`Generate payslip · ${formatMonthLabel(month)}`}
        subtitle="Drafts are only visible to HR until published"
        footer={
          <>
            <Button variant="secondary" onClick={() => setGenOpen(false)}>Cancel</Button>
            <Button loading={generate.isPending} disabled={!form.userId} onClick={() => generate.mutate()}>
              Save draft
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Employee">
            <Select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">Select employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} · {e.designation ?? e.role}</option>
              ))}
            </Select>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Field label="Basic"><Input type="number" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} placeholder="0" /></Field>
            <Field label="HRA"><Input type="number" value={form.hra} onChange={(e) => setForm({ ...form, hra: e.target.value })} placeholder="0" /></Field>
            <Field label="Allowances"><Input type="number" value={form.allowances} onChange={(e) => setForm({ ...form, allowances: e.target.value })} placeholder="0" /></Field>
            <Field label="Deductions"><Input type="number" value={form.deductions} onChange={(e) => setForm({ ...form, deductions: e.target.value })} placeholder="0" /></Field>
            <Field label="PF"><Input type="number" value={form.pf} onChange={(e) => setForm({ ...form, pf: e.target.value })} placeholder="0" /></Field>
            <Field label="Income tax"><Input type="number" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} placeholder="0" /></Field>
          </div>
          <div className="alert alert-info" style={{ fontSize: 12.5 }}>
            Gross <strong>{formatINR(gross)}</strong> · Net <strong>{formatINR(net)}</strong>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(publishTarget)}
        onClose={() => setPublishTarget(null)}
        onConfirm={() => publish.mutate()}
        title="Publish payslip"
        message={`${publishTarget?.name} will instantly see this payslip (net ${publishTarget ? formatINR(publishTarget.net) : ''}) in their My Salary page.`}
        confirmLabel="Publish"
        loading={publish.isPending}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove.mutate()}
        title="Delete draft payslip"
        message={`Delete the draft payslip for ${deleteTarget?.name} (${formatMonthLabel(deleteTarget?.month)}).`}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
      />
    </>
  );
}
