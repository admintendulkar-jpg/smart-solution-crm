import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '@/auth/auth';
import { api, errorMessage } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { timeAgo } from '@/lib/format';
import type { Lead } from '@/lib/types';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { StatusTag } from '@/ui/StatusTag';
import { Card, CardHeader } from '@/ui/Card';
import { Spinner } from '@/ui/Spinner';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { useToast } from '@/ui/Toast';

interface DuplicateGroup {
  key: string;
  phone: string | null;
  email: string | null;
  canonical: Lead | null;
  duplicates: Lead[];
}

interface ResolveRequest {
  id: number;
  targetId?: number;
}

export function DuplicatesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pendingResolve, setPendingResolve] = useState<ResolveRequest | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.duplicateLeads,
    queryFn: () => api.get<{ groups: DuplicateGroup[] }>('/leads/duplicates'),
  });

  const resolve = useMutation({
    mutationFn: ({ id, targetId }: ResolveRequest) =>
      api.post(`/leads/${id}/resolve-duplicate`, targetId ? { targetId } : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.duplicateLeads });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.allLeads('') });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.dashboard });
      toast.success('Duplicate group resolved.');
      setPendingResolve(null);
    },
    onError: (err) => {
      toast.error(errorMessage(err));
      setPendingResolve(null);
    },
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState error={isError} />;

  const groups = data.groups;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Duplicate leads</h1>
          <div className="page-subtitle">
            {groups.length > 0
              ? `${groups.length} group${groups.length === 1 ? '' : 's'} share a phone or email. Keep one lead per group.`
              : 'No duplicate groups found.'}
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState icon={<Copy size={20} />} title="No duplicates" description="Every lead has a unique phone and email combination." />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map((group) => (
            <Card key={group.key}>
              <CardHeader
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {group.phone ?? '—'}
                    {group.email && <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 400 }}>{group.email}</span>}
                  </span>
                }
                subtitle={`${group.duplicates.length + (group.canonical ? 1 : 0)} records share this identity`}
              />
              <div>
                {group.canonical && <DuplicateRow lead={group.canonical} canonical />}
                {group.duplicates.map((lead) => (
                  <DuplicateRow
                    key={lead.id}
                    lead={lead}
                    onKeep={() => setPendingResolve({ id: lead.id })}
                    onMerge={() => group.canonical && setPendingResolve({ id: lead.id, targetId: group.canonical.id })}
                    canMerge={Boolean(group.canonical)}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {pendingResolve && (
        <ConfirmDialog
          open={Boolean(pendingResolve)}
          onClose={() => setPendingResolve(null)}
          title={pendingResolve.targetId ? 'Merge into original lead?' : 'Keep this lead?'}
          message={
            pendingResolve.targetId
              ? 'This copy will be flagged as a duplicate of the original lead and hidden from the pipeline. Its call and note history stays attached to the original copy you kept.'
              : 'This lead becomes the original. All other copies with the same phone/email will be flagged as duplicates and hidden from the pipeline.'
          }
          confirmLabel={pendingResolve.targetId ? 'Merge copy' : 'Make original'}
          onConfirm={() => {
            const request = pendingResolve;
            setPendingResolve(null);
            resolve.mutate(request);
          }}
          loading={resolve.isPending}
        />
      )}
    </>
  );
}

function DuplicateRow({ lead, canonical, onKeep, onMerge, canMerge }: {
  lead: Lead;
  canonical?: boolean;
  onKeep?: () => void;
  onMerge?: () => void;
  canMerge?: boolean;
}) {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin' || user?.role === 'admin';

  return (
    <div className="list-item" style={{ padding: '13px 18px' }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          flexShrink: 0,
          background: canonical ? 'var(--color-success)' : 'var(--color-warning)',
        }}
        title={canonical ? 'Original' : 'Duplicate copy'}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link to={`/leads/${lead.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>{lead.name}</span>
          </Link>
          {canonical && <span className="badge" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success-text)' }}>Original</span>}
          {!canonical && <span className="badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning-text)' }}>Duplicate</span>}
          <StatusTag status={lead.status} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
          {lead.phone}{lead.email ? ` · ${lead.email}` : ''} · {lead.service} · {lead.assigned_name ?? 'unassigned'} · added {timeAgo(lead.created_at)}
        </div>
      </div>
      {!canonical && canEdit && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {canMerge && onMerge && (
            <Button size="sm" variant="ghost" icon={<ShieldCheck size={13} />} onClick={onMerge}>
              Merge into original
            </Button>
          )}
          {onKeep && (
            <Button size="sm" variant="secondary" icon={<Trash2 size={13} />} onClick={onKeep}>
              Make original
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
