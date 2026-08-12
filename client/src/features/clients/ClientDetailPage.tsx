import { Fragment, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CheckCircle2,
  FileImage,
  MessageSquarePlus,
  Phone,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/auth/auth';
import { api, errorMessage } from '@/lib/api';
import { CLIENT_STATUSES, GUARANTEE_STATUSES, QUERY_KEYS } from '@/lib/constants';
import { formatDateTime, formatINR } from '@/lib/format';
import type { ClientDetail } from '@/lib/types';
import { Button } from '@/ui/Button';
import { Field, Textarea } from '@/ui/Fields';
import { Dropdown, DropdownItem } from '@/ui/Dropdown';
import { StatusTag } from '@/ui/StatusTag';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Spinner } from '@/ui/Spinner';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { useToast } from '@/ui/Toast';
import { AddPaymentModal } from './AddPaymentModal';

function paymentBadgeStyle(status: string): { background: string; color: string } {
  switch (status) {
    case 'Paid':
      return { background: 'var(--color-success-bg)', color: 'var(--color-success-text)' };
    case 'Partial':
      return { background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' };
    default:
      return { background: 'var(--color-grey-bg)', color: 'var(--color-grey-text)' };
  }
}

const STATUS_STEPS = ['Open', 'In Progress', 'Delivered', 'Closed'];

function StatusSteps({ current }: { current: string }) {
  const idx = STATUS_STEPS.indexOf(current);
  if (idx === -1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
      {STATUS_STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <Fragment key={s}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11.5,
                  fontWeight: 700,
                  background: done ? 'var(--color-success)' : active ? 'var(--color-primary)' : '#eaecf0',
                  color: done || active ? '#fff' : 'var(--color-text-muted)',
                }}
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: active || done ? 600 : 400,
                  color: active ? 'var(--color-primary)' : done ? 'var(--color-success-text)' : 'var(--color-text-muted)',
                }}
              >
                {s}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div style={{ height: 2, flex: 1, background: i < idx ? 'var(--color-success)' : '#eaecf0' }} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const clientId = Number(id);
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [proofTarget, setProofTarget] = useState<number | null>(null);
  const [noteBody, setNoteBody] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.clientDetail(clientId),
    queryFn: () => api.get<ClientDetail>(`/clients/${clientId}`),
    enabled: Number.isFinite(clientId) && clientId > 0,
  });

  const addNote = useMutation({
    mutationFn: () => api.post(`/clients/${clientId}/notes`, { body: noteBody }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clientDetail(clientId) });
      setNoteBody('');
      toast.success('Note added.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const updateStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/clients/${clientId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clientDetail(clientId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clients('all') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clients('mine') });
      toast.success('Client status updated.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const updateGuarantee = useMutation({
    mutationFn: (guarantee_status: string) => api.patch(`/clients/${clientId}/guarantee`, { guarantee_status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clientDetail(clientId) });
      toast.success('Guarantee status updated.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const verifyPayment = useMutation({
    mutationFn: (paymentId: number) => api.post(`/clients/${clientId}/payments/${paymentId}/verify`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clientDetail(clientId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clients('all') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clients('mine') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      toast.success('Payment verified and counted as revenue.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const uploadProof = useMutation({
    mutationFn: async ({ paymentId, file }: { paymentId: number; file: File }) => {
      const form = new FormData();
      form.append('proof', file);
      const response = await fetch(`/api/clients/${clientId}/payments/${paymentId}/proof`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string }; filename?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Upload failed');
      }
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clientDetail(clientId) });
      toast.success('Proof uploaded.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const clickToCallMutation = useMutation({
    mutationFn: () => api.post<{ message: string; callLogId: number }>('/telephony/call', { clientId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clientDetail(clientId) });
      toast.success(data.message || 'Call initiated via Exotel. Connecting your phone...');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!Number.isFinite(clientId) || clientId <= 0) {
    return <ErrorState error={new Error('Invalid client id.')} />;
  }
  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState error={isError} />;

  const { client, payments, notes } = data;
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const isService = user?.role === 'service';
  const confirmedSum = payments.filter((p) => p.status === 'Confirmed').reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, client.amount - confirmedSum);

  return (
    <>
      <Link to="/clients" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--color-text-secondary)', textDecoration: 'none', marginBottom: 12 }}>
        <ArrowLeft size={14} /> Back to clients
      </Link>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, marginBottom: 20 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' }}>{client.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
            <a href={`tel:${client.phone.replace(/[^0-9+]/g, '')}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--color-primary)', fontSize: 13.5, textDecoration: 'none', fontWeight: 500 }}>
              <Phone size={13} /> {client.phone}
            </a>
            <span style={{ color: 'var(--color-text-muted)' }}>·</span>
            <StatusTag status={client.status} />
            <span className="badge" style={paymentBadgeStyle(client.payment_status)}>{client.payment_status}</span>
            {client.due_date && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: client.is_overdue === 1 ? 'var(--color-danger-text)' : 'var(--color-text-secondary)' }}>
                <CalendarClock size={13} />
                SLA due {formatDateTime(client.due_date)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            variant="secondary"
            icon={<Phone size={14} style={{ color: 'var(--color-primary)' }} />}
            onClick={() => clickToCallMutation.mutate()}
            loading={clickToCallMutation.isPending}
          >
            Click to Call
          </Button>
          <Button
            variant="secondary"
            icon={<Banknote size={14} />}
            onClick={() => setShowAddPayment(true)}
            disabled={client.payment_status === 'Paid' || remaining <= 0.01}
          >
            Add payment
          </Button>
          {(isAdmin || isService) && (
            <Dropdown
              trigger={() => (
                <Button variant="secondary" icon={<CheckCircle2 size={14} />}>{client.status} ▾</Button>
              )}
            >
              {(close) =>
                CLIENT_STATUSES.filter((s) => s !== client.status).map((s) => (
                  <DropdownItem
                    key={s}
                    onClick={() => {
                      close();
                      updateStatus.mutate(s);
                    }}
                  >
                    Mark {s}
                  </DropdownItem>
                ))
              }
            </Dropdown>
          )}
          {(isAdmin || isService) && (
            <Dropdown
              trigger={() => (
                <Button variant="secondary" icon={<ShieldCheck size={14} />}>{client.guarantee_status} ▾</Button>
              )}
            >
              {(close) =>
                GUARANTEE_STATUSES.filter((s) => s !== client.guarantee_status).map((s) => (
                  <DropdownItem
                    key={s}
                    onClick={() => {
                      close();
                      updateGuarantee.mutate(s);
                    }}
                  >
                    {s}
                  </DropdownItem>
                ))
              }
            </Dropdown>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div className="stat-card" style={{ borderLeftColor: 'var(--color-success)' }}>
          <div className="stat-label"><span className="stat-icon" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-text)' }}><Banknote size={14} /></span>Confirmed received</div>
          <div className="stat-value">{formatINR(confirmedSum)}</div>
          <div className="stat-sub">of {formatINR(client.amount)} total</div>
        </div>
        <div className="stat-card" style={{ borderLeftColor: 'var(--color-warning)' }}>
          <div className="stat-label"><span className="stat-icon" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}><Banknote size={14} /></span>Balance due</div>
          <div className="stat-value">{formatINR(remaining)}</div>
          <div className="stat-sub">{client.payment_status === 'Paid' ? 'Fully paid' : 'Awaiting confirmation'}</div>
        </div>
      </div>

      <StatusSteps current={client.status} />

      <div className="content-grid content-grid-2" style={{ marginBottom: 18 }}>
        <Card>
          <CardHeader title="Client details" subtitle="Conversion snapshot" />
          <div style={{ padding: '6px 18px 16px' }}>
            <div className="kv-row"><span className="kv-key">Service</span><span className="kv-value">{client.service}</span></div>
            <div className="kv-row"><span className="kv-key">Package / plan</span><span className="kv-value">{client.package_plan ?? '—'}</span></div>
            <div className="kv-row"><span className="kv-key">Total amount</span><span className="kv-value">{formatINR(client.amount)}</span></div>
            <div className="kv-row"><span className="kv-key">Sales rep</span><span className="kv-value">{client.sales_person_name ?? '—'}</span></div>
            <div className="kv-row"><span className="kv-key">Service rep</span><span className="kv-value">{client.service_person_name ?? '—'}</span></div>
            <div className="kv-row"><span className="kv-key">Source</span><span className="kv-value">{client.source ?? '—'}</span></div>
            <div className="kv-row"><span className="kv-key">Inquiry date</span><span className="kv-value">{formatDateTime(client.inquiry_date)}</span></div>
            {client.alternate_phone && <div className="kv-row"><span className="kv-key">Alternate phone</span><span className="kv-value">{client.alternate_phone}</span></div>}
            {client.address && <div className="kv-row"><span className="kv-key">Address</span><span className="kv-value">{client.address}</span></div>}
            {client.transaction_ref && <div className="kv-row"><span className="kv-key">Transaction ref</span><span className="kv-value">{client.transaction_ref}</span></div>}
            <div className="kv-row"><span className="kv-key">Guarantee</span><span className="kv-value">{client.guarantee_status}</span></div>
            {client.service_description && (
              <div className="kv-row" style={{ alignItems: 'flex-start' }}>
                <span className="kv-key">Service description</span>
                <span className="kv-value" style={{ whiteSpace: 'pre-wrap' }}>{client.service_description}</span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Payments" subtitle={`${payments.length} record${payments.length === 1 ? '' : 's'}`} />
          {payments.length === 0 ? (
            <EmptyState icon={<Banknote size={20} />} title="No payments yet" description="Record the first payment against this client." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Amount</Th>
                  <Th>Method</Th>
                  <Th>Status</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <Td className="cell-strong">{formatINR(p.amount)}</Td>
                    <Td className="cell-muted">{p.method}</Td>
                    <Td>
                      <span className="badge" style={p.status === 'Confirmed' ? { background: 'var(--color-success-bg)', color: 'var(--color-success-text)' } : { background: 'var(--color-grey-bg)', color: 'var(--color-grey-text)' }}>
                        {p.status}
                      </span>
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        {isAdmin && p.status !== 'Confirmed' && (
                          <Button size="sm" variant="ghost" loading={verifyPayment.isPending} onClick={() => verifyPayment.mutate(p.id)}>
                            Verify
                          </Button>
                        )}
                        {(isAdmin || isService) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Upload size={13} />}
                            onClick={() => {
                              setProofTarget(p.id);
                              fileInput.current?.click();
                            }}
                          >
                            Proof
                          </Button>
                        )}
                        {p.proof_path && (
                          <a href={`/api/documents/file/${p.proof_path}`} target="_blank" rel="noreferrer" title="View proof" style={{ display: 'inline-flex', color: 'var(--color-primary)' }}>
                            <FileImage size={14} />
                          </a>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && proofTarget) uploadProof.mutate({ paymentId: proofTarget, file });
              e.target.value = '';
            }}
          />
        </Card>
      </div>

      <Card>
        <CardHeader title="Notes & handover history" subtitle="Timestamped team communication" />
        <div style={{ padding: 16 }}>
          <Field label="Add a note">
            <Textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Delivery updates, client feedback, handover details…"
            />
          </Field>
          <Button
            style={{ marginTop: 10 }}
            icon={<MessageSquarePlus size={14} />}
            loading={addNote.isPending}
            disabled={!noteBody.trim()}
            onClick={() => addNote.mutate()}
          >
            Add note
          </Button>
        </div>
        {notes.length === 0 ? (
          <EmptyState icon={<MessageSquarePlus size={20} />} title="No notes yet" description="Share handover details so the service team can deliver." />
        ) : (
          <div>
            {notes.map((note) => (
              <div key={note.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0, marginTop: 6 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{note.user_name ?? 'System'}</div>
                  <div style={{ fontSize: 13, marginTop: 2, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{note.body}</div>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{formatDateTime(note.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {showAddPayment && (
        <AddPaymentModal
          clientId={clientId}
          clientName={client.name}
          remaining={remaining}
          onClose={() => setShowAddPayment(false)}
        />
      )}
    </>
  );
}
