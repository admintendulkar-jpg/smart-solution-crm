import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Users, CalendarClock } from 'lucide-react';
import { useAuth } from '@/auth/auth';
import { api } from '@/lib/api';
import { CLIENT_STATUSES, QUERY_KEYS } from '@/lib/constants';
import { formatDate, formatINR } from '@/lib/format';
import type { Client } from '@/lib/types';
import { PageHeader, SearchInput } from '@/ui/PageHeader';
import { Card } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { StatusTag } from '@/ui/StatusTag';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { Spinner } from '@/ui/Spinner';
import { Pagination } from '@/ui/Pagination';

const PAGE_SIZE = 25;

export function ClientsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<string>(() => searchParams.get('status') ?? 'All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const isSales = user?.role === 'sales';
  const isService = user?.role === 'service';
  const usesOwnQueue = isSales || isService;

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.clients(usesOwnQueue ? 'mine' : 'all'),
    queryFn: () => api.get<{ clients: Client[] }>(usesOwnQueue ? '/clients/mine' : '/clients'),
  });

  const filtered = useMemo(() => {
    const list = data?.clients ?? [];
    let rows = list;
    if (status !== 'All') rows = rows.filter((c) => c.status === status);
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      rows = rows.filter((c) => c.name.toLowerCase().includes(term) || c.phone.includes(term) || (c.email ?? '').toLowerCase().includes(term));
    }
    return rows;
  }, [data, status, search]);

  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <PageHeader
        title={isSales ? 'My Clients' : user?.role === 'service' ? 'Service Queue' : 'Clients'}
        subtitle={
          isSales
            ? 'Leads you converted. Payment confirmation moves clients to the Service Team.'
            : user?.role === 'service'
              ? 'Clients handed over after payment. Full delivery workflow arrives in Phase 2.'
              : 'Every client across the company, with payment and SLA visibility.'
        }
        actions={<SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, phone…" />}
      />

      <Card>
        <div style={{ padding: '0 18px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="tabs" style={{ borderBottom: 'none' }}>
            {['All', ...CLIENT_STATUSES].map((s) => (
              <button key={s} type="button" className={`tab${status === s ? ' active' : ''}`} onClick={() => { setStatus(s); setPage(1); }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState error={isError} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users size={20} />}
            title="No clients found"
            description={isSales ? 'Convert your first lead to see it here.' : 'Try a different filter.'}
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Service / Plan</Th>
                  <Th>Amount</Th>
                  <Th>Payment</Th>
                  <Th>Status</Th>
                  <Th>SLA due</Th>
                  <Th>Sales rep</Th>
                  <Th>Guarantee</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((client) => (
                  <tr key={client.id} className="clickable">
                    <Td>
                      <Link to={`/clients/${client.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <span className="cell-strong">{client.name}</span>
                        <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{client.phone}</div>
                      </Link>
                    </Td>
                    <Td>
                      <div>{client.service}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{client.package_plan}</div>
                    </Td>
                    <Td className="cell-strong">{formatINR(client.amount)}</Td>
                    <Td>
                      <span className="badge" style={paymentStyle(client.payment_status)}>{client.payment_status}</span>
                    </Td>
                    <Td><StatusTag status={client.status} /></Td>
                    <Td>
                      {client.due_date ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: client.is_overdue ? 'var(--color-danger-text)' : 'var(--color-text-secondary)', fontSize: 12.5 }}>
                          <CalendarClock size={13} />
                          {formatDate(client.due_date)}
                          {client.is_overdue === 1 && <span className="badge" style={{ background: 'var(--color-orange-bg)', color: 'var(--color-danger-text)' }}>SLA missed</span>}
                        </span>
                      ) : (
                        <span className="cell-muted">—</span>
                      )}
                    </Td>
                    <Td className="cell-muted">{client.sales_person_name ?? '—'}</Td>
                    <Td className="cell-muted">{client.guarantee_status}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {filtered.length > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onChange={setPage} />}
          </>
        )}
      </Card>
    </>
  );
}

function paymentStyle(status: string): { background: string; color: string } {
  switch (status) {
    case 'Paid':
      return { background: 'var(--color-success-bg)', color: 'var(--color-success-text)' };
    case 'Partial':
      return { background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' };
    default:
      return { background: 'var(--color-grey-bg)', color: 'var(--color-grey-text)' };
  }
}
