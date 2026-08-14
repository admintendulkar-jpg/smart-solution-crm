import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Square, ArrowRight, ArrowLeft, History, Layers } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader, CardBody } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Modal';
import { Field, Input } from '@/ui/Fields';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { Avatar } from '@/ui/Avatar';
import { useToast } from '@/ui/Toast';

interface RepItem {
  id: number;
  name: string;
  email: string;
  phone: string;
  branch: string;
}

interface HistoryBatchItem {
  id: number;
  rep_id: number;
  rep_name: string;
  assigned_count: number;
  daily_target: number;
}

interface DistributionBatch {
  id: number;
  actor_id: number | null;
  actor_name: string | null;
  total_leads: number;
  selected_reps_count: number;
  split_type: 'equal' | 'custom';
  daily_target: number;
  deadline: string | null;
  created_at: string;
  items: HistoryBatchItem[];
}

interface SummaryResponse {
  unassignedPool: number;
  reps: RepItem[];
  history: DistributionBatch[];
}

export function LeadDistributionPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['distributionSummary'],
    queryFn: () => api.get<SummaryResponse>('/admin/distribution/summary'),
    refetchInterval: 15_000,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form State
  const [selectedRepIds, setSelectedRepIds] = useState<number[]>([]);
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [customCounts, setCustomCounts] = useState<Record<number, number>>({});
  const [dailyTarget, setDailyTarget] = useState<number>(40);
  const [deadline, setDeadline] = useState<string>('');

  const [detailBatch, setDetailBatch] = useState<DistributionBatch | null>(null);

  const pool = data?.unassignedPool ?? 0;
  const activeReps = data?.reps ?? [];
  const history = data?.history ?? [];

  // Reset modal state when opening
  function handleOpenModal() {
    setStep(1);
    // By default select all active reps
    setSelectedRepIds(activeReps.map((r) => r.id));
    setSplitType('equal');
    setCustomCounts({});
    setDailyTarget(40);
    setDeadline('');
    setModalOpen(true);
  }

  // Selected reps list
  const selectedReps = useMemo(
    () => activeReps.filter((r) => selectedRepIds.includes(r.id)),
    [activeReps, selectedRepIds],
  );

  // Equal split calculation
  const equalCalculated = useMemo(() => {
    if (selectedReps.length === 0 || pool === 0) return {};
    const N = selectedReps.length;
    const baseShare = Math.floor(pool / N);
    const remainder = pool % N;
    const result: Record<number, number> = {};
    selectedReps.forEach((r, idx) => {
      result[r.id] = baseShare + (idx < remainder ? 1 : 0);
    });
    return result;
  }, [selectedReps, pool]);

  // Current assigned per rep mapping
  const currentAssignedCounts = useMemo(() => {
    if (splitType === 'equal') return equalCalculated;
    const res: Record<number, number> = {};
    selectedReps.forEach((r) => {
      res[r.id] = customCounts[r.id] ?? 0;
    });
    return res;
  }, [splitType, equalCalculated, customCounts, selectedReps]);

  // Live totals
  const totalAssignedInForm = useMemo(
    () => Object.values(currentAssignedCounts).reduce((a, b) => a + b, 0),
    [currentAssignedCounts],
  );

  const remainingInPool = pool - totalAssignedInForm;

  const distributeMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/distribution/distribute', {
        selectedRepIds,
        splitType,
        customCounts,
        dailyTarget,
        deadline: deadline || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distributionSummary'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      toast.success(`🎉 ${totalAssignedInForm} leads distributed successfully!`);
      setModalOpen(false);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const resetPoolMutation = useMutation({
    mutationFn: () => api.post<{ count: number }>('/admin/distribution/reset-pool', {}),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['distributionSummary'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      toast.success(`✅ ${res.count} leads returned to the Unassigned Lead Pool!`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function toggleRepSelection(id: number) {
    setSelectedRepIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (selectedRepIds.length === activeReps.length) {
      setSelectedRepIds([]);
    } else {
      setSelectedRepIds(activeReps.map((r) => r.id));
    }
  }

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader
        title="Lead Distribution"
        subtitle="Distribute batches of unassigned leads to your sales team with custom daily targets."
      />

      {/* ===== HERO UNASSIGNED LEADS CARD ===== */}
      <Card
        style={{
          background: 'linear-gradient(135deg, #071530 0%, #0c2254 50%, #082914 100%)',
          color: '#ffffff',
          borderRadius: 20,
          padding: '28px 32px',
          boxShadow: '0 16px 40px rgba(11, 30, 72, 0.25)',
          marginBottom: 28,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 20,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#22A045', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              <Layers size={16} /> Unassigned Lead Pool
            </div>
            <div style={{ fontSize: 44, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1 }}>
              {pool} <span style={{ fontSize: 20, fontWeight: 500, color: '#94a3b8' }}>leads waiting</span>
            </div>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 8 }}>
              {pool > 0
                ? `${pool} leads are currently sitting in the pool ready to be assigned.`
                : 'All leads are assigned or in queue. Click "Return All New Leads to Pool" below to unassign and re-distribute them.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button
              size="lg"
              disabled={pool === 0}
              onClick={handleOpenModal}
              style={{
                height: 48,
                padding: '0 24px',
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 12,
                background: pool > 0 ? 'linear-gradient(135deg, #22A045 0%, #187832 100%)' : '#334155',
                color: '#ffffff',
                boxShadow: pool > 0 ? '0 8px 24px rgba(34, 160, 69, 0.4)' : 'none',
                cursor: pool > 0 ? 'pointer' : 'not-allowed',
              }}
            >
              🚀 Distribute Leads
            </Button>

            <Button
              size="lg"
              variant="secondary"
              loading={resetPoolMutation.isPending}
              onClick={() => resetPoolMutation.mutate()}
              style={{
                height: 48,
                padding: '0 18px',
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
              }}
              title="Unassigns all uncalled New leads so you can test distributing them in a batch"
            >
              🔄 Return All New Leads to Pool
            </Button>
          </div>
        </div>
      </Card>

      {/* ===== RECENT DISTRIBUTIONS HISTORY ===== */}
      <Card>
        <CardHeader
          title="Recent Distributions"
          subtitle="History log of all previously distributed batches"
        />
        <CardBody>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)' }}>
              <History size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>No lead distributions yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Click "Distribute Leads" above to make your first batch distribution.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {history.map((batch) => (
                <div
                  key={batch.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 14,
                    padding: '16px 20px',
                    borderRadius: 14,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface)',
                    transition: 'box-shadow 0.2s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
                        {batch.total_leads} leads distributed
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 20,
                          background: batch.split_type === 'equal' ? 'var(--color-primary-subtle)' : 'var(--color-accent-subtle)',
                          color: batch.split_type === 'equal' ? 'var(--color-primary)' : 'var(--color-accent-hover)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {batch.split_type} split
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                        • {formatDateTime(batch.created_at)}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      {batch.items.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 8,
                            background: 'var(--color-surface-subtle)',
                            border: '1px solid var(--color-border)',
                            fontSize: 12,
                            fontWeight: 500,
                          }}
                        >
                          <Avatar name={item.rep_name} size="sm" />
                          <span>
                            <strong>{item.rep_name}:</strong> {item.assigned_count} leads
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Daily Target</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-success-text)' }}>
                        🎯 {batch.daily_target} / day
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDetailBatch(batch)}
                    >
                      View Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* ===== DISTRIBUTE WIZARD MODAL ===== */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          step === 1
            ? 'Step 1: Select Sales Reps'
            : step === 2
            ? 'Step 2: Distribution Method'
            : step === 3
            ? 'Step 3: Daily Target & Deadline'
            : 'Step 4: Final Review'
        }
        size="lg"
      >
        {/* Step Indicator Header */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--color-border)', paddingBottom: 12 }}>
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: step >= s ? 'var(--color-primary)' : 'var(--color-border)',
                transition: 'background 0.2s ease',
              }}
            />
          ))}
        </div>

        {/* STEP 1: SELECT REPS */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
                Who will receive leads in this batch?
              </h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                <strong>{pool} leads</strong> are waiting in the unassigned pool. Choose which active sales reps participate in this distribution.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {selectedRepIds.length} of {activeReps.length} sales reps selected
              </span>
              <button
                type="button"
                onClick={toggleSelectAll}
                style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
              >
                {selectedRepIds.length === activeReps.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
              {activeReps.map((rep) => {
                const isChecked = selectedRepIds.includes(rep.id);
                return (
                  <div
                    key={rep.id}
                    onClick={() => toggleRepSelection(rep.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: isChecked ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: isChecked ? 'var(--color-primary-soft)' : 'var(--color-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ color: isChecked ? 'var(--color-primary)' : 'var(--color-grey)' }}>
                      {isChecked ? <CheckSquare size={20} /> : <Square size={20} />}
                    </div>
                    <Avatar name={rep.name} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {rep.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{rep.branch}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button
                disabled={selectedRepIds.length === 0}
                icon={<ArrowRight size={16} />}
                onClick={() => setStep(2)}
              >
                Next: Distribution Method
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: DISTRIBUTION METHOD (EQUAL vs CUSTOM) */}
        {step === 2 && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
                How do you want to distribute {pool} leads?
              </h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {selectedReps.length} sales reps selected ({selectedReps.map((r) => r.name).join(', ')})
              </p>
            </div>

            {/* Split Type Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div
                onClick={() => setSplitType('equal')}
                style={{
                  padding: 16,
                  borderRadius: 14,
                  border: splitType === 'equal' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: splitType === 'equal' ? 'var(--color-primary-soft)' : 'var(--color-surface)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginBottom: 4 }}>
                  ⚡ Split Equally
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  Divide the {pool} leads equally among the {selectedReps.length} selected reps automatically.
                </div>
              </div>

              <div
                onClick={() => setSplitType('custom')}
                style={{
                  padding: 16,
                  borderRadius: 14,
                  border: splitType === 'custom' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: splitType === 'custom' ? 'var(--color-primary-soft)' : 'var(--color-surface)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-text)', marginBottom: 4 }}>
                  ✏️ Custom Split
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  Manually set exact lead count for each selected sales rep.
                </div>
              </div>
            </div>

            {/* Breakdown List */}
            <div style={{ background: 'var(--color-surface-subtle)', borderRadius: 12, padding: 16, border: '1px solid var(--color-border)', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--color-text)' }}>
                Lead Breakdown per Rep
              </div>

              {selectedReps.map((rep) => {
                const assigned = currentAssignedCounts[rep.id] ?? 0;
                return (
                  <div key={rep.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={rep.name} size="sm" />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{rep.name}</span>
                    </div>

                    {splitType === 'equal' ? (
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)' }}>
                        {assigned} leads
                      </span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Input
                          type="number"
                          min={0}
                          max={pool}
                          value={customCounts[rep.id] ?? 0}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                            setCustomCounts((prev) => ({ ...prev, [rep.id]: val }));
                          }}
                          style={{ width: 90, textAlign: 'center', fontWeight: 700 }}
                        />
                        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>leads</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Total Calculation Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Total Pool: <strong>{pool}</strong> • Assigned: <strong>{totalAssignedInForm}</strong>
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: remainingInPool < 0 ? 'var(--color-danger)' : 'var(--color-success-text)' }}>
                  {remainingInPool < 0 ? `⚠️ Exceeds pool by ${Math.abs(remainingInPool)}!` : `Remaining in Pool: ${remainingInPool}`}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 24 }}>
              <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setStep(1)}>Back</Button>
              <Button
                disabled={totalAssignedInForm <= 0 || remainingInPool < 0}
                icon={<ArrowRight size={16} />}
                onClick={() => setStep(3)}
              >
                Next: Daily Target
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: DAILY TARGET */}
        {step === 3 && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
                Set Daily Work Target & Deadline
              </h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                How many leads should each sales rep complete per day for this assigned batch?
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <Field label="Daily Target (Leads / Day)" hint="Work target for reps on this batch">
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{ fontWeight: 700, fontSize: 16 }}
                />
              </Field>

              <Field label="Completion Deadline (Optional)" hint="Target end date for campaign">
                <Input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </Field>
            </div>

            {/* Completion Estimate Cards */}
            <div style={{ background: 'var(--color-surface-subtle)', borderRadius: 12, padding: 16, border: '1px solid var(--color-border)', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', marginBottom: 10 }}>
                📅 Estimated Work Duration
              </div>

              {selectedReps.map((rep) => {
                const assigned = currentAssignedCounts[rep.id] ?? 0;
                const days = Math.ceil(assigned / Math.max(1, dailyTarget));
                return (
                  <div key={rep.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', fontSize: 12.5 }}>
                    <span><strong>{rep.name}:</strong> {assigned} leads at {dailyTarget}/day</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                      ~{days} working day{days > 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 24 }}>
              <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setStep(2)}>Back</Button>
              <Button
                icon={<ArrowRight size={16} />}
                onClick={() => setStep(4)}
              >
                Next: Review & Confirm
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: FINAL REVIEW & CONFIRM */}
        {step === 4 && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>
                Ready to Distribute Leads
              </h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                Review the distribution summary below before confirming.
              </p>
            </div>

            <div style={{ background: 'var(--color-surface-subtle)', borderRadius: 14, padding: 18, border: '1px solid var(--color-border)', marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Total Distributed</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)' }}>{totalAssignedInForm} leads</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Selected Reps</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text)' }}>{selectedReps.length} reps</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Daily Target</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-success-text)' }}>{dailyTarget} / day</div>
                </div>
              </div>

              <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8, color: 'var(--color-text)' }}>
                Individual Assignment Breakdown:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedReps.map((rep) => {
                  const count = currentAssignedCounts[rep.id] ?? 0;
                  const days = Math.ceil(count / Math.max(1, dailyTarget));
                  return (
                    <div key={rep.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={rep.name} size="sm" />
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{rep.name}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}>{count} leads</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{dailyTarget}/day (~{days}d)</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 24 }}>
              <Button variant="secondary" icon={<ArrowLeft size={16} />} onClick={() => setStep(3)}>Back</Button>
              <Button
                loading={distributeMutation.isPending}
                onClick={() => distributeMutation.mutate()}
                style={{ background: 'linear-gradient(135deg, #22A045 0%, #187832 100%)', color: '#fff', fontWeight: 700, padding: '0 24px' }}
              >
                🚀 Distribute {totalAssignedInForm} Leads
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ===== BATCH DETAIL MODAL ===== */}
      {detailBatch && (
        <Modal
          open={Boolean(detailBatch)}
          onClose={() => setDetailBatch(null)}
          title={`Distribution Batch #${detailBatch.id}`}
        >
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Distributed by {detailBatch.actor_name ?? 'Admin'} on {formatDateTime(detailBatch.created_at)}
            </div>
          </div>

          <div style={{ background: 'var(--color-surface-subtle)', padding: 14, borderRadius: 10, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 12 }}>
              <div>Total: <strong>{detailBatch.total_leads}</strong></div>
              <div>Type: <strong style={{ textTransform: 'capitalize' }}>{detailBatch.split_type}</strong></div>
              <div>Target: <strong>{detailBatch.daily_target}/day</strong></div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Rep Breakdown</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {detailBatch.items.map((item) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: 13 }}>
                <span>{item.rep_name}</span>
                <strong>{item.assigned_count} leads</strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
