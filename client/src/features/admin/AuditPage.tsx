import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Select } from '@/ui/Fields';
import { Spinner } from '@/ui/Spinner';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { Pagination } from '@/ui/Pagination';

const PAGE_SIZE = 50;

export function AuditPage() {
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.audit(200),
    queryFn: () => api.get<{ entries: AuditEntry[] }>('/admin/audit?limit=200'),
  });

  const filtered = entity ? (data?.entries ?? []).filter((e) => e.entity === entity) : data?.entries ?? [];
  const start = (page - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  const entities = [...new Set((data?.entries ?? []).map((e) => e.entity).filter(Boolean))] as string[];

  return (
    <>
      <PageHeader title="Audit Log" subtitle="Every status change, reassignment, import and login — visible only to the owner." />
      <Card>
        <CardHeader
          title="System activity"
          subtitle={`${filtered.length} entries`}
          actions={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Filter:</span>
              <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} style={{ width: 160 }}>
                <option value="">All entities</option>
                {entities.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </Select>
            </div>
          }
        />
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState error={isError} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<ScrollText size={20} />} title="No activity recorded" description="Actions you and your team take will appear here." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>User</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>Details</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id}>
                    <Td className="cell-muted" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.created_at)}</Td>
                    <Td className="cell-strong">{entry.user_name ?? 'System'}</Td>
                    <Td><span className="badge" style={{ background: 'var(--color-grey-bg)', color: 'var(--color-grey-text)' }}>{entry.action}</span></Td>
                    <Td className="cell-muted">{entry.entity ?? '—'}{entry.entity_id ? ` #${entry.entity_id}` : ''}</Td>
                    <Td style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.detail ?? '—'}</Td>
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
