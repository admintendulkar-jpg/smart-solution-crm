import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Phone,
  MessageCircle,
  PhoneCall,
  CalendarClock,
  CheckCircle2,
  MessageSquarePlus,
  AlertTriangle,
  Play,
  Square,
  Pencil,
  StickyNote,
  Clock,
  Save,
  X,
  Undo2,
} from 'lucide-react';
import { useAuth } from '@/auth/auth';
import { api, errorMessage } from '@/lib/api';
import { BRANCHES, CALL_OUTCOMES, LEAD_PRIORITIES, LEAD_SOURCES, PACKAGES, QUERY_KEYS, SERVICES } from '@/lib/constants';
import { formatDateTime, formatDuration, toUtcInput } from '@/lib/format';
import type { AuditEntry, CallLog, Lead, LeadDetail as LeadDetailData, LeadNote } from '@/lib/types';
import { Button } from '@/ui/Button';
import { Field, Input, Select, Textarea } from '@/ui/Fields';
import { Modal } from '@/ui/Modal';
import { StatusTag } from '@/ui/StatusTag';
import { Card, CardHeader } from '@/ui/Card';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { useToast } from '@/ui/Toast';

function phoneHref(phone: string): string {
  const digits = phone.replace(/[^0-9+]/g, '');
  return digits ? `tel:${digits}` : '#';
}

function whatsappHref(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  return digits ? `https://wa.me/91${digits.length === 10 ? digits : digits.slice(-10)}` : '#';
}

const PRIORITY_META: Record<string, { color: string; bg: string; icon: string }> = {
  Hot: { color: '#b42318', bg: '#fef0ee', icon: '🔥' },
  Warm: { color: '#b54708', bg: '#fffaeb', icon: '🌡️' },
  Normal: { color: '#475467', bg: '#f2f4f7', icon: '' },
  Cold: { color: '#175cd3', bg: '#eff8ff', icon: '❄️' },
};

function priorityBadge(priority: string) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.Normal;
  return (
    <span
      style={{
        background: meta.bg,
        color: meta.color,
        borderRadius: 999,
        padding: '3px 9px',
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.icon} {priority}
    </span>
  );
}

function agingInfo(lead: { last_call_at: string | null }): { days: number | null } {
  if (!lead.last_call_at) return { days: null };
  const days = Math.floor((Date.now() - new Date(lead.last_call_at).getTime()) / 86_400_000);
  return { days };
}

interface CallOutcomeForm {
  outcome: string;
  durationSec: number;
  note: string;
  followUpAt: string;
}

function mmss(total: number): string {
  const m = Math.floor(total / 60).toString().padStart(2, '0');
  const s = (total % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function CallOutcomeModal({ leadId, onClose, onConvert }: { leadId: number; onClose: () => void; onConvert: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<CallOutcomeForm>({ outcome: 'Connected', durationSec: 0, note: '', followUpAt: '' });
  const [timerRunning, setTimerRunning] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    intervalRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, []);

  function stopTimer() {
    if (timerRunning && intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      setForm((f) => ({ ...f, durationSec: elapsed }));
      setTimerRunning(false);
    }
  }

  function startTimer() {
    if (!timerRunning) {
      setElapsed(0);
      setForm((f) => ({ ...f, durationSec: 0 }));
      setTimerRunning(true);
      intervalRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    }
  }

  const mutation = useMutation({
    mutationFn: (payload: { outcome: string; followUpAt?: string }) => {
      setPendingAction(payload.outcome);
      return api.post<{ status: string }>(`/leads/${leadId}/call`, {
        outcome: payload.outcome,
        durationSec: elapsed,
        note: form.note || undefined,
        followUpAt: payload.outcome === 'Call Back Later' && payload.followUpAt ? toUtcInput(new Date(payload.followUpAt)) : undefined,
      });
    },
    onSuccess: (data: { status: string }, payload) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leadDetail(leadId) });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leadStats });
      if (payload.outcome === 'Converted') {
        onConvert();
      } else {
        toast.success(`Call logged — lead moved to "${data.status}".`);
        onClose();
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
    onSettled: () => setPendingAction(null),
  });

  const needsFollowUp = form.outcome === 'Call Back Later';
  const isPending = (action: string) => mutation.isPending && pendingAction === action;

  return (
    <Modal
      open
      onClose={onClose}
      title="Log call outcome"
      subtitle="Timer started automatically — save when the call ends"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" icon={<X size={13} />} onClick={() => mutation.mutate({ outcome: 'Not Interested' })} loading={isPending('Not Interested')}>
            Not Interested
          </Button>
          <Button variant="secondary" icon={<CalendarClock size={13} />} onClick={() => setForm((f) => ({ ...f, outcome: 'Call Back Later' }))}>
            Follow-up
          </Button>
          <Button variant="secondary" icon={<CheckCircle2 size={13} />} onClick={() => mutation.mutate({ outcome: 'Converted' })} loading={isPending('Converted')}>
            Convert
          </Button>
          <Button icon={<Save size={13} />} loading={mutation.isPending && pendingAction === form.outcome} onClick={() => mutation.mutate({ outcome: form.outcome })} disabled={needsFollowUp && !form.followUpAt}>
            Save outcome
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: timerRunning ? 'var(--color-danger-bg)' : 'var(--color-grey-bg)',
            borderRadius: 10,
            padding: '10px 14px',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: timerRunning ? 'var(--color-danger-text)' : 'var(--color-text-secondary)' }}>
            <Clock size={18} /> {mmss(elapsed)}
          </span>
          <Button size="sm" variant={timerRunning ? 'danger-solid' : 'secondary'} icon={timerRunning ? <Square size={12} /> : <Play size={12} />} onClick={timerRunning ? stopTimer : startTimer}>
            {timerRunning ? 'Stop' : 'Start'}
          </Button>
        </div>
        <Field label="Outcome">
          <Select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
            {CALL_OUTCOMES.filter((o) => o !== 'Converted').map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </Select>
        </Field>
        {needsFollowUp && (
          <Field label="Follow-up date & time" hint="The lead resurfaces in your queue at this time">
            <Input type="datetime-local" value={form.followUpAt} onChange={(e) => setForm({ ...form, followUpAt: e.target.value })} />
          </Field>
        )}
        <Field label="Call notes">
          <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="What did the client say?" />
        </Field>
      </div>
    </Modal>
  );
}

function FollowUpModal({ leadId, onClose }: { leadId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [scheduledAt, setScheduledAt] = useState('');
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/leads/${leadId}/follow-up`, {
        scheduledAt: toUtcInput(new Date(scheduledAt)),
        note: note || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leadDetail(leadId) });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Follow-up scheduled.');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule follow-up"
      subtitle="The lead will auto-resurface at the top of your queue"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} onClick={() => mutation.mutate()} disabled={!scheduledAt}>
            Schedule
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Date & time">
          <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
        </Field>
        <Field label="Note (optional)">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context for the next call" />
        </Field>
      </div>
    </Modal>
  );
}

function ConvertModal({ leadId, onClose }: { leadId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [service, setService] = useState(SERVICES[0]);
  const [packagePlan, setPackagePlan] = useState(PACKAGES[SERVICES[0]][0]);
  const [amount, setAmount] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<'Pending' | 'Partial' | 'Paid'>('Pending');
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [amountPaid, setAmountPaid] = useState('');
  const [transactionRef, setTransactionRef] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ clientId: number }>(`/leads/${leadId}/convert`, {
        service,
        packagePlan,
        amount: Number(amount),
        whatsapp: whatsapp || undefined,
        email: email || undefined,
        notes: notes || undefined,
        paymentStatus,
        paymentMethod: paymentStatus !== 'Pending' ? paymentMethod : undefined,
        amountPaid: paymentStatus !== 'Pending' && Number(amountPaid) > 0 ? Number(amountPaid) : undefined,
        serviceDescription: serviceDescription || undefined,
        deliveryDate: deliveryDate || undefined,
        alternatePhone: alternatePhone || undefined,
        address: address || undefined,
        transactionRef: transactionRef || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leadStats });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leadDetail(leadId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clients('mine') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clients('all') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      toast.success('Client created and assigned to the Service Team.');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const paymentSelected = paymentStatus !== 'Pending';

  return (
    <Modal
      open
      onClose={onClose}
      title="Convert to client"
      subtitle="Creates the client record, records payment and assigns it to the Service Team"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
            disabled={!amount || Number(amount) <= 0 || (paymentSelected && Number(amountPaid) > 0 && Number(amountPaid) > Number(amount))}
          >
            Convert & assign
          </Button>
        </>
      }
    >
      <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 12 }}>
        Section 1 · Service details
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Service">
          <Select
            value={service}
            onChange={(e) => {
              setService(e.target.value);
              setPackagePlan(PACKAGES[e.target.value][0]);
            }}
          >
            {SERVICES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Package / Plan">
          <Select value={packagePlan} onChange={(e) => setPackagePlan(e.target.value)}>
            {PACKAGES[service].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </Field>
        <Field label="Total amount (₹)">
          <Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 2499" />
        </Field>
        <Field label="Expected delivery date">
          <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Service description">
            <Textarea value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} placeholder="What exactly will be delivered (e.g. ATS-optimised resume, 3 months of job support)…" rows={2} />
          </Field>
        </div>
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--color-border)', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 12 }}>
        Section 2 · Client details
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Email (optional)">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" />
        </Field>
        <Field label="WhatsApp number" hint="Leave blank to use the lead's phone">
          <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="10-digit number" />
        </Field>
        <Field label="Alternate phone (optional)">
          <Input value={alternatePhone} onChange={(e) => setAlternatePhone(e.target.value)} placeholder="10-digit number" />
        </Field>
        <Field label="Address (optional)">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city…" />
        </Field>
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--color-border)', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 12 }}>
        Section 3 · Payment
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
        <Field label="Payment status">
          <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as 'Pending' | 'Partial' | 'Paid')}>
            <option value="Pending">Pending</option>
            <option value="Partial">Partial</option>
            <option value="Paid">Paid</option>
          </Select>
        </Field>
        {paymentSelected && (
          <Field label="Payment method">
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="UPI">UPI</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Gateway">Gateway</option>
            </Select>
          </Field>
        )}
        {paymentSelected && (
          <Field label="Amount received (₹)">
            <Input type="number" min={0} value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="e.g. 2499" />
          </Field>
        )}
        {paymentSelected && (
          <Field label="Transaction ID / Ref">
            <Input value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} placeholder="UTR / txn id" />
          </Field>
        )}
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--color-border)', fontSize: 12.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 12 }}>
        Section 4 · Handover
      </div>
      <Field label="Notes for service team">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Key details for the service team" rows={3} />
      </Field>

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>On convert, the client is created (status: Open), payment recorded and it lands in the Service Team queue for delivery.</span>
      </div>
    </Modal>
  );
}

function EditLeadModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    name: lead.name,
    phone: lead.phone,
    email: lead.email ?? '',
    whatsapp: lead.whatsapp ?? '',
    source: lead.source,
    service: lead.service,
    branch: lead.branch,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<{ lead: Lead }>(`/leads/${lead.id}`, {
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        whatsapp: form.whatsapp || undefined,
        source: form.source,
        service: form.service,
        branch: form.branch,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leadDetail(lead.id) });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead updated.');
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const sources = [...new Set([...LEAD_SOURCES, form.source])];
  const services = [...new Set([...SERVICES, form.service])];

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit lead"
      subtitle="Admin edit — every change is recorded in the audit log"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={mutation.isPending} onClick={() => mutation.mutate()} disabled={!form.name.trim() || !form.phone.trim()}>
            Save changes
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="Email (optional)">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="lead@email.com" />
        </Field>
        <Field label="WhatsApp (optional)">
          <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="10-digit number" />
        </Field>
        <Field label="Source">
          <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Service">
          <Select value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })}>
            {services.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Branch">
          <Select value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })}>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function actionLabel(action: string): string {
  switch (action) {
    case 'lead.assign':
      return 'Lead assigned';
    case 'lead.bulk_assign':
      return 'Bulk assignment';
    case 'lead.convert':
      return 'Converted to client';
    case 'lead.followup':
      return 'Follow-up scheduled';
    case 'lead.edit':
      return 'Lead edited';
    case 'lead.priority':
      return 'Priority changed';
    case 'lead.resolve_duplicate':
      return 'Duplicate resolved';
    default:
      return 'Activity';
  }
}

interface TimelineItem {
  id: string;
  ts: string;
  kind: 'call' | 'note' | 'system';
  title: string;
  sub?: string;
  by: string;
  durationSec?: number;
  provider?: string;
  recordingUrl?: string | null;
}

function ActivityTimeline({
  leadId,
  calls,
  notes,
  events,
}: {
  leadId: number;
  calls: CallLog[];
  notes: LeadNote[];
  events: AuditEntry[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');

  const addNote = useMutation({
    mutationFn: () => api.post(`/leads/${leadId}/notes`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leadDetail(leadId) });
      setBody('');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const items: TimelineItem[] = [
    ...calls.map((c) => ({
      id: `c${c.id}`,
      ts: c.created_at,
      kind: 'call' as const,
      title: c.outcome,
      sub: c.note ?? undefined,
      by: c.user_name,
      durationSec: c.duration_sec,
      provider: c.provider,
      recordingUrl: c.recording_url,
    })),
    ...notes.map((n) => ({
      id: `n${n.id}`,
      ts: n.created_at,
      kind: 'note' as const,
      title: 'Note added',
      sub: n.body,
      by: n.user_name ?? 'System',
    })),
    ...events
      .filter((e) => e.action !== 'lead.call')
      .map((e) => ({
        id: `a${e.id}`,
        ts: e.created_at,
        kind: 'system' as const,
        title: actionLabel(e.action),
        sub: e.detail ?? undefined,
        by: e.user_name ?? 'System',
      })),
  ].sort((a, b) => b.ts.localeCompare(a.ts));

  const kindMeta: Record<TimelineItem['kind'], { icon: ReactNode; bg: string; color: string }> = {
    call: { icon: <PhoneCall size={13} />, bg: 'var(--color-primary-subtle)', color: 'var(--color-primary)' },
    note: { icon: <StickyNote size={13} />, bg: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' },
    system: { icon: <Clock size={13} />, bg: '#f2f4f7', color: 'var(--color-text-muted)' },
  };

  return (
    <Card>
      <CardHeader title="Activity timeline" subtitle="Calls, notes, status changes & assignments — newest first" />
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a note…"
            style={{ minHeight: 44 }}
          />
          <Button icon={<MessageSquarePlus size={14} />} onClick={() => addNote.mutate()} disabled={!body.trim()} loading={addNote.isPending}>
            Add
          </Button>
        </div>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {items.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>No activity yet. Log your first call to get started.</div>
          ) : (
            items.map((item) => {
              const meta = kindMeta[item.kind];
              return (
                <div key={item.id} style={{ display: 'flex', gap: 10 }}>
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: meta.bg,
                      color: meta.color,
                      fontSize: 12,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {meta.icon}
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.55, flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{item.title}</span>
                    {item.provider === 'exotel' && (
                      <span className="badge" style={{ marginLeft: 6, fontSize: 10, background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
                        Exotel
                      </span>
                    )}
                    {typeof item.durationSec === 'number' && item.durationSec > 0 && (
                      <span style={{ color: 'var(--color-text-muted)' }}> · {formatDuration(item.durationSec)}</span>
                    )}
                    <span style={{ color: 'var(--color-text-muted)' }}> · {formatDateTime(item.ts)}</span>
                    {item.sub && <div style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', marginTop: 2 }}>{item.sub}</div>}
                    {item.recordingUrl && (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>🎧 Recording:</span>
                        <audio controls src={item.recordingUrl} style={{ height: 28, maxWidth: 280 }} />
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{item.by}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Card>
  );
}

export function LeadDetailPage() {
  const { id } = useParams();
  const leadId = Number(id);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [showCallModal, setShowCallModal] = useState(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.leadDetail(leadId),
    queryFn: () => api.get<LeadDetailData>(`/leads/${leadId}`),
    enabled: Number.isFinite(leadId),
  });

  const { data: users } = useQuery({
    queryKey: QUERY_KEYS.users('role=sales&active=true'),
    queryFn: () => api.get<{ users: { id: number; name: string }[] }>('/admin/users?role=sales&active=true'),
    enabled: user?.role === 'super_admin' || user?.role === 'admin',
  });

  const assignMutation = useMutation({
    mutationFn: (userId: number) => api.post(`/leads/${leadId}/assign`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead reassigned.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const priorityMutation = useMutation({
    mutationFn: (priority: string) => api.patch(`/leads/${leadId}/priority`, { priority }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leadDetail(leadId) });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Priority updated.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const clickToCallMutation = useMutation({
    mutationFn: () => api.post<{ message: string; callLogId: number; telHref?: string }>('/telephony/call', { leadId }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leadDetail(leadId) });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(data.message || 'Opening dialer...');
      const digits = (data.telHref || lead?.phone || '').replace(/[^0-9+]/g, '');
      if (digits) {
        window.location.href = digits.startsWith('tel:') ? digits : `tel:${digits}`;
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const [assignTarget, setAssignTarget] = useState<number | null>(null);

  const revertMutation = useMutation({
    mutationFn: () => api.post(`/leads/${leadId}/revert`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leadDetail(leadId) });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.leadStats });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clients('mine') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.clients('all') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      toast.success('Lead status reset to New — accidental outcome undone!');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isError) return <ErrorState error={isError} />;
  if (isLoading || !data) return <Spinner />;

  const { lead, calls, notes, duplicateOf, events } = data;
  const canAct = user?.role === 'sales' && lead.assigned_to === user.id;
  const canAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const isConverted = lead.status === 'Converted';
  const aging = agingInfo(lead);

  return (
    <>
      <Link
        to="/leads"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12.5, cursor: 'pointer', marginBottom: 14, padding: 0, textDecoration: 'none' }}
      >
        <ArrowLeft size={14} /> Back to leads
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 19 }}>{lead.name}</h1>
              {priorityBadge(lead.priority)}
              <StatusTag status={lead.is_overdue ? 'Overdue' : lead.status} />
              {lead.is_duplicate === 1 && (
                <span className="badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>Duplicate</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span>{lead.phone}</span>
              <a href={phoneHref(lead.phone)} title="Call"><Phone size={14} style={{ color: 'var(--color-primary)' }} /></a>
              <a href={whatsappHref(lead.phone)} title="WhatsApp" target="_blank" rel="noreferrer"><MessageCircle size={14} style={{ color: 'var(--color-success)' }} /></a>
              {lead.email && <span>· {lead.email}</span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {(canAct || canAdmin) && !isConverted && (
            <>
              <Button
                variant="secondary"
                icon={<Phone size={14} style={{ color: 'var(--color-primary)' }} />}
                onClick={() => clickToCallMutation.mutate()}
                loading={clickToCallMutation.isPending}
              >
                Click to Call
              </Button>
              <Button icon={<PhoneCall size={14} />} onClick={() => setShowCallModal(true)}>
                Log call
              </Button>
              <Button variant="secondary" icon={<CalendarClock size={14} />} onClick={() => setShowFollowUpModal(true)}>
                Follow-up
              </Button>
              {(canAct || canAdmin) && (
                <Button variant="secondary" icon={<CheckCircle2 size={14} />} onClick={() => setShowConvertModal(true)}>
                  Convert
                </Button>
              )}
            </>
          )}
          {lead.status !== 'New' && (canAct || canAdmin) && (
            <Button
              variant="secondary"
              icon={<Undo2 size={14} style={{ color: 'var(--color-warning-text)' }} />}
              loading={revertMutation.isPending}
              onClick={() => {
                if (window.confirm('Reset this lead status back to New and clear accidental follow-up/call log?')) {
                  revertMutation.mutate();
                }
              }}
              title="Undo accidental call outcome or status change and reset lead back to New"
            >
              Undo Outcome
            </Button>
          )}
          {(canAct || canAdmin) && (
            <div style={{ minWidth: 122 }}>
              <Select
                value={lead.priority}
                onChange={(e) => priorityMutation.mutate(e.target.value)}
                title="Lead priority"
              >
                {LEAD_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>
          )}
          {canAdmin && (
            <Button variant="secondary" icon={<Pencil size={14} />} onClick={() => setShowEditModal(true)}>
              Edit lead
            </Button>
          )}
          {canAdmin && !isConverted && (
            <div style={{ minWidth: 170 }}>
              <Select value={assignTarget ?? ''} onChange={(e) => { const v = Number(e.target.value); setAssignTarget(v); assignMutation.mutate(v); }}>
                <option value="">Reassign to…</option>
                {users?.users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </div>
          )}
          {isConverted && (canAct || canAdmin) && (
            <Button
              variant="danger"
              icon={<Undo2 size={14} />}
              loading={revertMutation.isPending}
              onClick={() => {
                if (window.confirm('Revert this conversion? The client record, payments and notes will be removed and the lead returns to the sales queue.')) {
                  revertMutation.mutate();
                }
              }}
            >
              Revert
            </Button>
          )}
        </div>
      </div>

      {duplicateOf && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            This lead matches an existing record —{' '}
            <Link to={`/leads/${duplicateOf.id}`}>
              {duplicateOf.name} ({duplicateOf.phone})
            </Link>
            . Review before calling to avoid double-touch.
          </span>
        </div>
      )}

      <div className="content-grid content-grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card>
            <CardHeader title="Lead details" />
            <div style={{ padding: '6px 18px 16px' }}>
              <div className="kv-row"><span className="kv-key">Source</span><span className="kv-value">{lead.source}</span></div>
              <div className="kv-row"><span className="kv-key">Service interested</span><span className="kv-value">{lead.service}</span></div>
              <div className="kv-row"><span className="kv-key">Branch</span><span className="kv-value">{lead.branch}</span></div>
              <div className="kv-row"><span className="kv-key">Assigned to</span><span className="kv-value">{lead.assigned_name ?? 'Unassigned'}</span></div>
              <div className="kv-row"><span className="kv-key">Created</span><span className="kv-value">{formatDateTime(lead.created_at)}</span></div>
              {lead.follow_up_at && (
                <div className="kv-row">
                  <span className="kv-key">Next follow-up</span>
                  <span className="kv-value" style={{ color: lead.is_overdue ? 'var(--color-danger-text)' : 'var(--color-warning-text)' }}>{formatDateTime(lead.follow_up_at)}</span>
                </div>
              )}
              <div className="kv-row"><span className="kv-key">Last outcome</span><span className="kv-value">{lead.last_outcome ?? '—'}</span></div>
              <div className="kv-row"><span className="kv-key">Last call</span><span className="kv-value">{lead.last_call_at ? formatDateTime(lead.last_call_at) : 'Never'}</span></div>
              {aging.days === null ? (
                <div className="alert alert-danger" style={{ marginTop: 12, fontSize: 12.5 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Never contacted yet — reach out now to move this lead forward.</span>
                </div>
              ) : aging.days >= 6 ? (
                <div className="alert alert-danger" style={{ marginTop: 12, fontSize: 12.5 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Last contacted {aging.days} days ago — follow up urgently.</span>
                </div>
              ) : aging.days >= 2 ? (
                <div className="alert alert-warning" style={{ marginTop: 12, fontSize: 12.5 }}>
                  <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Last contacted {aging.days} days ago — schedule a follow-up.</span>
                </div>
              ) : (
                <div className="alert alert-success" style={{ marginTop: 12, fontSize: 12.5 }}>
                  <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Contacted recently — lead is warm.</span>
                </div>
              )}
            </div>
          </Card>
        </div>
        <ActivityTimeline leadId={leadId} calls={calls} notes={notes} events={events} />
      </div>

      {showCallModal && <CallOutcomeModal leadId={leadId} onClose={() => setShowCallModal(false)} onConvert={() => { setShowCallModal(false); setShowConvertModal(true); }} />}
      {showFollowUpModal && <FollowUpModal leadId={leadId} onClose={() => setShowFollowUpModal(false)} />}
      {showConvertModal && <ConvertModal leadId={leadId} onClose={() => setShowConvertModal(false)} />}
      {showEditModal && <EditLeadModal lead={lead} onClose={() => setShowEditModal(false)} />}
    </>
  );
}
