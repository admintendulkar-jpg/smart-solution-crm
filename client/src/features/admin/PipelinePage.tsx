import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Inbox } from 'lucide-react';
import { api } from '@/lib/api';
import { LEAD_STATUSES, QUERY_KEYS } from '@/lib/constants';
import { timeAgo } from '@/lib/format';
import type { Lead } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { Avatar } from '@/ui/Avatar';

const COLUMN_META: Record<string, { dot: string; label: string; bg: string }> = {
  New: { dot: '#98a2b3', label: '#5c6675', bg: '#f2f4f7' },
  Attempting: { dot: '#146eb4', label: '#146eb4', bg: '#e9f2f9' },
  'Follow-up': { dot: '#f5a623', label: '#8a6100', bg: '#fdf5e3' },
  'Not Interested': { dot: '#d92d20', label: '#b42318', bg: '#fef1f0' },
  Converted: { dot: '#12b76a', label: '#067647', bg: '#e8f8f0' },
};

interface RepGroup {
  id: number | null;
  name: string;
  leads: Lead[];
}

export function PipelinePage() {
  const navigate = useNavigate();
  const [expandedRep, setExpandedRep] = useState<number | 'unassigned' | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.allLeads('pipeline'),
    queryFn: () => api.get<{ leads: Lead[] }>('/leads'),
  });

  const groups = useMemo(() => {
    const leads = (data?.leads ?? []).filter((l) => l.is_duplicate === 0);
    const map = new Map<string, RepGroup>();
    for (const lead of leads) {
      const key = lead.assigned_to ? String(lead.assigned_to) : 'unassigned';
      if (!map.has(key)) {
        map.set(key, { id: lead.assigned_to, name: lead.assigned_name ?? 'Unassigned', leads: [] });
      }
      map.get(key)!.leads.push(lead);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.id === null) return 1;
      if (b.id === null) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [data]);

  if (isError) return <ErrorState error={isError} />;
  if (isLoading) return <Spinner />;

  const expanded = expandedRep !== null ? groups.find((g) => (g.id ?? 'unassigned') === expandedRep) : null;

  return (
    <>
      <PageHeader
        title="Lead Pipeline"
        subtitle="Leads grouped by sales rep. Click a rep to see their queue."
      />

      {expanded ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button type="button" onClick={() => setExpandedRep(null)} className="icon-btn" aria-label="Back">
              <ChevronLeft size={16} />
            </button>
            <Avatar name={expanded.name} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{expanded.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{expanded.leads.length} leads</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${LEAD_STATUSES.length}, minmax(220px, 1fr))`, gap: 14, alignItems: 'start', overflowX: 'auto', paddingBottom: 8 }}>
            {LEAD_STATUSES.map((status) => {
              const columnLeads = expanded.leads
                .filter((l) => l.status === status)
                .sort((a, b) => Number(b.is_overdue ?? 0) - Number(a.is_overdue ?? 0));
              return (
                <div key={status} style={{ background: 'var(--color-surface-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', minHeight: 240 }}>
                  <div style={{ padding: '11px 13px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLUMN_META[status].dot }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: COLUMN_META[status].label }}>{status}</span>
                    <span className="badge" style={{ background: COLUMN_META[status].bg, color: COLUMN_META[status].label }}>{columnLeads.length}</span>
                  </div>
                  <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {columnLeads.length === 0 ? (
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', textAlign: 'center', padding: '18px 0' }}>Empty</div>
                    ) : (
                      columnLeads.map((lead) => (
                        <div
                          key={lead.id}
                          onClick={() => navigate(`/leads/${lead.id}`)}
                          style={{
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            borderLeft: `3px solid ${COLUMN_META[status].dot}`,
                            borderRadius: 7,
                            padding: '10px 12px',
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)',
                          }}
                        >
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{lead.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{lead.phone}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 11 }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>{timeAgo(lead.created_at)}</span>
                            {lead.follow_up_at && (
                              <span style={{ color: 'var(--color-warning-text)' }}>⏰ {timeAgo(lead.follow_up_at)}</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {groups.map((group) => {
            const statusCounts = LEAD_STATUSES.map((s) => group.leads.filter((l) => l.status === s).length);
            const activeCount = statusCounts.slice(0, 3).reduce((a, b) => a + b, 0);
            return (
              <div
                key={group.id ?? 'unassigned'}
                onClick={() => setExpandedRep((group.id ?? 'unassigned') as number | 'unassigned')}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '16px 18px',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'box-shadow 150ms ease, transform 150ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Avatar name={group.name} size="lg" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{group.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Inbox size={12} /> {group.leads.length} total leads · {activeCount} active
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                  {LEAD_STATUSES.map((s, i) => (
                    <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ width: 22, height: 4, borderRadius: 2, background: COLUMN_META[s].dot, margin: '0 auto 4px', opacity: statusCounts[i] > 0 ? 1 : 0.2 }} />
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{statusCounts[i]}</div>
                      <div style={{ fontSize: 9.5, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{s.split(' ')[0]}</div>
                    </div>
                  ))}
                </div>

                {group.id === null && (
                  <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--color-warning-text)' }}>⚠ Not yet assigned — run split</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
