import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Play, SlidersHorizontal, Info, Users, Inbox, ArrowDown, ListChecks } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { BRANCHES, QUERY_KEYS, SETTINGS_KEYS } from '@/lib/constants';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader, CardBody } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Fields';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { Avatar } from '@/ui/Avatar';
import { useToast } from '@/ui/Toast';

interface SettingsPayload {
  settings: Record<string, string>;
}

function HowItWorks() {
  const steps = [
    { icon: <Inbox size={14} />, title: '1. Leads arrive', desc: 'CSV upload or Google Sheets sync inserts new leads. They start as "New" and unassigned.' },
    { icon: <Users size={14} />, title: '2. Pool builds up', desc: 'Unassigned leads sit in the pool. The number below shows how many are waiting.' },
    { icon: <ArrowDown size={14} />, title: '3. Split distributes', desc: 'Click "Run split now" and each active sales rep gets leads one-by-one (round-robin), up to their daily quota.' },
    { icon: <ListChecks size={14} />, title: '4. Queue updates', desc: 'Reps see the leads in their "My Leads" queue and start calling. Their load counter updates instantly.' },
  ];
  return (
    <Card>
      <CardHeader title="How the lead split works" subtitle="Four simple steps — nothing is assigned automatically" />
      <CardBody>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {steps.map((s) => (
            <div key={s.title} style={{ display: 'flex', gap: 10, padding: '12px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-subtle)' }}>
              <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, background: 'var(--color-primary-subtle)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{s.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 3, lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="alert" style={{ marginTop: 14, fontSize: 12.5, background: 'var(--color-grey-bg)', color: 'var(--color-text-secondary)' }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Quota per rep = maximum leads each rep gets per day. Reps who already hit their quota are skipped. Leads over the quota stay in the pool for the next day.</span>
        </div>
      </CardBody>
    </Card>
  );
}

export function SplitSettingsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: settingsData } = useQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: () => api.get<SettingsPayload>('/admin/settings'),
  });

  const { data: preview, isError: previewError } = useQuery({
    queryKey: QUERY_KEYS.splitPreview,
    queryFn: () =>
      api.get<{ reps: { id: number; name: string; load: number }[]; pool: number; quota: number; enabled: boolean }>('/admin/split/preview'),
  });

  const [quota, setQuota] = useState<number | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [sla, setSla] = useState<number | null>(null);

  const effective = {
    quota: quota ?? Number(settingsData?.settings[SETTINGS_KEYS.dailyLeadQuota] ?? 50),
    enabled: enabled ?? settingsData?.settings[SETTINGS_KEYS.leadSplitEnabled] === 'true',
    branch: branch ?? settingsData?.settings[SETTINGS_KEYS.defaultBranch] ?? 'Coimbatore',
    sla: sla ?? Number(settingsData?.settings[SETTINGS_KEYS.slaBusinessDays] ?? 4),
  };

  const saveSettings = useMutation({
    mutationFn: (overrides?: Record<string, unknown>) =>
      api.put('/admin/settings', {
        [SETTINGS_KEYS.dailyLeadQuota]: overrides?.[SETTINGS_KEYS.dailyLeadQuota] ?? effective.quota,
        [SETTINGS_KEYS.leadSplitEnabled]: overrides?.[SETTINGS_KEYS.leadSplitEnabled] ?? effective.enabled,
        [SETTINGS_KEYS.defaultBranch]: overrides?.[SETTINGS_KEYS.defaultBranch] ?? effective.branch,
        [SETTINGS_KEYS.slaBusinessDays]: overrides?.[SETTINGS_KEYS.slaBusinessDays] ?? effective.sla,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings });
      toast.success('Settings saved.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const runSplit = useMutation({
    mutationFn: () => api.post<{ assigned: number }>('/admin/split/run', {}),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.splitPreview });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      toast.success(`Split complete — ${result.assigned} leads assigned.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const forceAssign = useMutation({
    mutationFn: () => api.post<{ assigned: number }>('/admin/split/assign-all', {}),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.splitPreview });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      if (result.assigned > 0) {
        toast.success(`✅ ${result.assigned} leads distributed to your sales team!`);
      } else {
        toast.success('All leads are already assigned — nothing to distribute.');
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const reps = preview?.reps ?? [];
  const pool = preview?.pool ?? 0;
  const currentQuota = preview?.quota ?? 50;
  const isEnabled = preview?.enabled ?? false;

  return (
    <>
      <PageHeader title="Split & Settings" subtitle="Daily distribution rules and owner-level configuration." />

      <HowItWorks />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start', marginTop: 18 }}>
        <Card>
          <CardHeader title="Daily lead split" subtitle="Distributes the unassigned pool evenly across active sales reps" />
          <CardBody>
            {!preview ? (
              previewError ? <ErrorState error={previewError} /> : <Spinner />
            ) : (
              <>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <div className="stat-card" style={{ flex: 1 }}>
                    <div className="stat-label">Unassigned pool</div>
                    <div className="stat-value" style={{ fontSize: 22 }}>{pool}</div>
                  </div>
                  <div className="stat-card" style={{ flex: 1 }}>
                    <div className="stat-label">Quota per rep</div>
                    <div className="stat-value" style={{ fontSize: 22 }}>{currentQuota}</div>
                  </div>
                  <div className="stat-card" style={{ flex: 1 }}>
                    <div className="stat-label">Active reps</div>
                    <div className="stat-value" style={{ fontSize: 22 }}>{reps.length}</div>
                  </div>
                </div>

                {reps.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Load today</div>
                    {reps.map((rep) => (
                      <div key={rep.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                        <Avatar name={rep.name} size="sm" />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{rep.name}</span>
                        <span style={{ fontSize: 12, color: rep.load >= currentQuota ? 'var(--color-danger-text)' : 'var(--color-text-muted)' }}>
                          {rep.load} / {currentQuota}
                        </span>
                        <div style={{ width: 90, height: 6, background: 'var(--color-grey-bg)', borderRadius: 4, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, (rep.load / Math.max(1, currentQuota)) * 100)}%`,
                              background: rep.load >= currentQuota ? 'var(--color-danger)' : 'var(--color-primary)',
                              borderRadius: 4,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="alert alert-warning" style={{ fontSize: 12.5, marginBottom: 16 }}>
                  <GitBranch size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    {isEnabled
                      ? `Split is enabled. Running it assigns up to ${currentQuota} leads per rep from the pool of ${pool}.`
                      : 'Split is currently disabled. Enable it below before running.'}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Button icon={<Play size={14} />} loading={runSplit.isPending} disabled={!isEnabled || pool === 0} onClick={() => runSplit.mutate()}>
                    Run split now
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<Play size={14} />}
                    loading={forceAssign.isPending}
                    disabled={reps.length === 0}
                    onClick={() => forceAssign.mutate()}
                    title="Assigns ALL unassigned leads — bypasses quota and enabled settings"
                  >
                    🚀 Force Assign All
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Configuration" subtitle="Applies to all branches" />
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="Daily quota per sales rep" hint="Maximum leads each rep receives per day">
                <Input type="number" min={1} value={effective.quota} onChange={(e) => setQuota(Math.max(1, Number(e.target.value)))} />
              </Field>
              <Field label="Default branch for imports" hint="Applied to leads without a branch">
                <Select value={effective.branch} onChange={(e) => setBranch(e.target.value)}>
                  {BRANCHES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Service SLA (business days)" hint="Auto-calculated due date for each converted client">
                <Input type="number" min={1} max={30} value={effective.sla} onChange={(e) => setSla(Math.max(1, Number(e.target.value)))} />
              </Field>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Auto-split enabled</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Unassigned leads are distributed when you run the split</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={effective.enabled}
                  onClick={() => {
                    const next = !effective.enabled;
                    setEnabled(next);
                    saveSettings.mutate({ [SETTINGS_KEYS.leadSplitEnabled]: next });
                  }}
                  style={{
                    width: 40,
                    height: 22,
                    borderRadius: 12,
                    border: 'none',
                    background: effective.enabled ? 'var(--color-primary)' : 'var(--color-border-strong)',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background 150ms ease',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 3,
                      left: effective.enabled ? 21 : 3,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 150ms ease',
                    }}
                  />
                </button>
              </div>
              <Button variant="secondary" icon={<SlidersHorizontal size={14} />} loading={saveSettings.isPending} onClick={() => saveSettings.mutate({})}>
                Save settings
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
