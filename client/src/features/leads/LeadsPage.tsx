import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Inbox, MessageCircle, Phone } from 'lucide-react';
import { useAuth } from '@/auth/auth';
import { api, errorMessage } from '@/lib/api';
import { LEAD_PRIORITIES, LEAD_STATUSES, QUERY_KEYS } from '@/lib/constants';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { Lead, LeadListResponse } from '@/lib/types';
import { PageHeader, SearchInput } from '@/ui/PageHeader';
import { Card } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { StatusTag } from '@/ui/StatusTag';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { Spinner } from '@/ui/Spinner';
import { Pagination } from '@/ui/Pagination';
import { Select } from '@/ui/Fields';
import { Button } from '@/ui/Button';
import { useToast } from '@/ui/Toast';

const PAGE_SIZE = 25;

const SALES_TABS = [
  { key: 'Overdue', label: 'Overdue' },
  { key: 'All', label: 'All Active' },
  { key: 'Attempting', label: 'Attempting' },
  { key: 'Follow-up', label: 'Follow-up' },
  { key: 'Not Interested', label: 'Not Interested' },
  { key: 'Converted', label: 'Converted' },
];

const ADMIN_TABS = [
  { key: 'All', label: 'All' },
  ...LEAD_STATUSES.map((s) => ({ key: s, label: s })),
];

const PRIORITY_META: Record<string, { color: string; bg: string; icon: string }> = {
  Hot: { color: '#b42318', bg: '#fef0ee', icon: '🔥' },
  Warm: { color: '#b54708', bg: '#fffaeb', icon: '🌡️' },
  Normal: { color: '#475467', bg: '#f2f4f7', icon: '' },
  Cold: { color: '#175cd3', bg: '#eff8ff', icon: '❄️' },
};

function priorityPill(priority: string) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.Normal;
  return (
    <span
      style={{
        background: meta.bg,
        color: meta.color,
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {meta.icon} {priority}
    </span>
  );
}

function AgingCell({ lastCallAt }: { lastCallAt: string | null }) {
  if (!lastCallAt) {
    return <span className="badge" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}>Never</span>;
  }
  const days = Math.floor((Date.now() - new Date(lastCallAt).getTime()) / 86_400_000);
  if (days <= 1) {
    return <span style={{ color: 'var(--color-success-text)', fontWeight: 600 }}>Today/Yesterday</span>;
  }
  if (days <= 5) {
    return <span style={{ color: 'var(--color-warning-text)', fontWeight: 600 }}>{days}d</span>;
  }
  return (
    <span className="badge" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger-text)' }}>
      ⚠️ {days}d
    </span>
  );
}

function phoneHref(phone: string): string {
  const digits = phone.replace(/[^0-9+]/g, '');
  return digits ? `tel:${digits}` : '#';
}

function whatsappHref(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  return digits ? `https://wa.me/91${digits.length === 10 ? digits : digits.slice(-10)}` : '#';
}

function rangeFor(filter: string): { from?: string; to?: string } {
  if (filter === 'all') return {};
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  if (filter === 'today') {
    from.setHours(0, 0, 0, 0);
  } else if (filter === 'week') {
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - 6);
  } else if (filter === 'month') {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  } else {
    return {};
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export function LeadsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<string>(() => (searchParams.get('status') ?? 'All'));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dateFilter, setDateFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const isSales = user?.role === 'sales';

  const { data, isLoading, isError } = useQuery({
    queryKey: isSales
      ? QUERY_KEYS.myLeads(activeTab, search)
      : ['leads', 'all', activeTab, search, dateFilter, priorityFilter, page],
    queryFn: () => {
      if (isSales) {
        const params = new URLSearchParams();
        if (activeTab !== 'All' && activeTab !== 'Overdue') params.set('status', activeTab);
        if (activeTab === 'Overdue') params.set('status', 'Overdue');
        if (search.trim()) params.set('search', search.trim());
        const qs = params.toString();
        return api.get<{ leads: Lead[] }>(`/leads/mine${qs ? `?${qs}` : ''}`);
      }
      const params = new URLSearchParams();
      if (activeTab !== 'All') params.set('status', activeTab);
      if (search.trim()) params.set('search', search.trim());
      if (priorityFilter) params.set('priority', priorityFilter);
      const range = rangeFor(dateFilter);
      if (range.from) params.set('from', range.from);
      if (range.to) params.set('to', range.to);
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
      return api.get<LeadListResponse>(`/leads?${params.toString()}`);
    },
  });

  const paged = useMemo(() => {
    const leads = data?.leads ?? [];
    if (isSales) {
      const start = (page - 1) * PAGE_SIZE;
      return { rows: leads.slice(start, start + PAGE_SIZE), total: leads.length };
    }
    const r = data as LeadListResponse | undefined;
    return { rows: r?.leads ?? [], total: r?.total ?? 0 };
  }, [data, isSales, page]);

  const { data: reps } = useQuery({
    queryKey: QUERY_KEYS.users('role=sales&active=true'),
    queryFn: () => api.get<{ users: { id: number; name: string }[] }>('/admin/users?role=sales&active=true'),
    enabled: !isSales,
  });

  const bulkAssign = useMutation({
    mutationFn: (userId: number) => api.post<{ assigned: number }>('/leads/bulk-assign', { leadIds: [...selected], userId }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`${r.assigned} leads assigned.`);
      setSelected(new Set());
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const pageRows = paged.rows;
  const allPageSelected = pageRows.length > 0 && pageRows.every((l) => selected.has(l.id));

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageRows.forEach((l) => next.delete(l.id));
      } else {
        pageRows.forEach((l) => next.add(l.id));
      }
      return next;
    });
  }

  const tabs = isSales ? SALES_TABS : ADMIN_TABS;

  return (
    <>
      <PageHeader
        title={isSales ? 'My Leads' : 'All Leads'}
        subtitle={isSales ? 'Your assigned queue. Overdue items float to the top automatically.' : 'Every lead across the company, with filters. Hot leads sort first.'}
        actions={
          <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, phone, email…" />
        }
      />

      <Card>
        <div style={{ padding: '0 18px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="tabs" style={{ borderBottom: 'none' }}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`tab${activeTab === tab.key ? ' active' : ''}`}
                onClick={() => { setActiveTab(tab.key); setPage(1); }}
              >
                {tab.key === 'Overdue' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-orange)' }} />}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {!isSales && (
          <div style={{ display: 'flex', gap: 10, padding: '12px 18px', borderBottom: '1px solid var(--color-border)', alignItems: 'center', flexWrap: 'wrap' }}>
            <Select value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPage(1); }} style={{ width: 150 }}>
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </Select>
            <Select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }} style={{ width: 140 }}>
              <option value="">All priorities</option>
              {LEAD_PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
            {selected.size > 0 && (
              <span className="badge" style={{ background: 'var(--color-primary-subtle)', color: 'var(--color-primary)' }}>
                {selected.size} selected
              </span>
            )}
          </div>
        )}

        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState error={isError} />
        ) : paged.rows.length === 0 ? (
          <EmptyState
            icon={<Inbox size={20} />}
            title={activeTab === 'Overdue' ? 'Nothing overdue' : activeTab === 'All' ? 'No leads in your queue' : `No leads with status "${activeTab}"`}
            description={isSales && activeTab === 'All' ? 'New leads appear here automatically after the daily split.' : 'Try a different filter or search.'}
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  {!isSales && (
                    <Th>
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectAll}
                        title="Select all on this page"
                      />
                    </Th>
                  )}
                  <Th>Lead</Th>
                  <Th>Contact</Th>
                  <Th>Source</Th>
                  <Th>Service</Th>
                  <Th>Priority</Th>
                  <Th>Status</Th>
                  <Th>Follow-up</Th>
                  <Th>Last call</Th>
                  <Th>Assigned</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {paged.rows.map((lead) => (
                  <tr key={lead.id} className="clickable" onClick={() => navigate(`/leads/${lead.id}`)}>
                    {!isSales && (
                      <Td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                        />
                      </Td>
                    )}
                    <Td>
                      <span className="cell-strong">{lead.name}</span>
                      {lead.is_duplicate === 1 && (
                        <span className="badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)', marginLeft: 8 }}>Duplicate</span>
                      )}
                      {lead.is_overdue === 1 && (
                        <span className="badge" style={{ background: 'var(--color-orange-bg)', color: 'var(--color-danger-text)', marginLeft: 6 }}>Overdue</span>
                      )}
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span>{lead.phone}</span>
                        <a href={phoneHref(lead.phone)} onClick={(e) => e.stopPropagation()} title="Call"><Phone size={13} style={{ color: 'var(--color-primary)' }} /></a>
                        <a href={whatsappHref(lead.phone)} onClick={(e) => e.stopPropagation()} title="WhatsApp" target="_blank" rel="noreferrer"><MessageCircle size={13} style={{ color: 'var(--color-success)' }} /></a>
                      </div>
                    </Td>
                    <Td className="cell-muted">{lead.source}</Td>
                    <Td className="cell-muted">{lead.service}</Td>
                    <Td>{priorityPill(lead.priority)}</Td>
                    <Td><StatusTag status={lead.is_overdue ? 'Overdue' : lead.status} /></Td>
                    <Td>{lead.follow_up_at ? <span style={{ color: lead.is_overdue ? 'var(--color-danger-text)' : 'var(--color-warning-text)' }}>{formatDateTime(lead.follow_up_at)}</span> : <span className="cell-muted">—</span>}</Td>
                    <Td><AgingCell lastCallAt={lead.last_call_at} /></Td>
                    <Td className="cell-muted">{lead.assigned_name ?? '—'}</Td>
                    <Td className="cell-muted">{timeAgo(lead.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {paged.total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={paged.total} onChange={setPage} />}
          </>
        )}
      </Card>

      {selected.size > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#1d2939',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            fontSize: 13,
          }}
        >
          <span style={{ fontWeight: 600 }}>{selected.size} selected</span>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) bulkAssign.mutate(Number(e.target.value));
            }}
            style={{
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8,
              padding: '6px 8px',
              fontSize: 12.5,
            }}
          >
            <option value="" style={{ color: '#000' }}>Assign to…</option>
            {reps?.users.map((u) => (
              <option key={u.id} value={u.id} style={{ color: '#000' }}>{u.name}</option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={() => setSelected(new Set())} disabled={bulkAssign.isPending}>
            Clear
          </Button>
        </div>
      )}
    </>
  );
}
