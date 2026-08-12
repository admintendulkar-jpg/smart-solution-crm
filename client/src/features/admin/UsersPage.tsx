import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserRoundCog, Plus } from 'lucide-react';
import { useAuth } from '@/auth/auth';
import { api, errorMessage } from '@/lib/api';
import { BRANCHES, QUERY_KEYS, ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import type { User } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Fields';
import { Modal } from '@/ui/Modal';
import { Avatar } from '@/ui/Avatar';
import { Spinner } from '@/ui/Spinner';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { Dropdown, DropdownItem, DropdownSeparator } from '@/ui/Dropdown';
import { useToast } from '@/ui/Toast';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { isValidPhone } from '@/lib/format';

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  super_admin: { bg: '#f0eafb', color: '#6b3ec6' },
  admin: { bg: '#e9f2f9', color: '#146eb4' },
  sales: { bg: '#e8f8f0', color: '#067647' },
  service: { bg: '#fdf5e3', color: '#8a6100' },
  hr: { bg: '#f2f4f7', color: '#475467' },
};

interface UserForm {
  name: string;
  email: string;
  phone: string;
  role: string;
  branch: string;
}

const EMPTY_FORM: UserForm = { name: '', email: '', phone: '', role: 'sales', branch: 'Coimbatore' };

export function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [editing, setEditing] = useState<User | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<User | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEYS.users('all'),
    queryFn: () => api.get<{ users: User[] }>('/admin/users'),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/users', {
        name: form.name,
        email: form.email || undefined,
        phone: form.phone,
        role: form.role,
        branch: form.branch,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users('all') });
      toast.success('Team member added. They can now log in with OTP.');
      setModalOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/admin/users/${editing!.id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users('all') });
      toast.success('Updated.');
      setModalOpen(false);
      setEditing(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const toggleActive = (target: User) => {
    updateMutation.mutate({ active: target.active === 1 ? false : true });
    setConfirmTarget(null);
  };

  const users = data?.users ?? [];

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(user: User) {
    setEditing(user);
    setForm({ name: user.name, email: user.email ?? '', phone: user.phone ?? '', role: user.role, branch: user.branch });
    setModalOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Staff accounts, roles and branch assignments. Access control is enforced on the server."
        actions={<Button icon={<Plus size={14} />} onClick={openCreate}>Add member</Button>}
      />

      <Card>
        <CardHeader
          title="All members"
          subtitle={`${users.length} active accounts`}
          actions={
            <div style={{ display: 'flex', gap: 8 }}>
              {ROLES.map((role) => (
                <span key={role} className="badge" style={{ background: ROLE_BADGE[role].bg, color: ROLE_BADGE[role].color }}>
                  {ROLE_LABELS[role]}
                </span>
              ))}
            </div>
          }
        />
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState error={isError} />
        ) : users.length === 0 ? (
          <EmptyState icon={<UserRoundCog size={20} />} title="No team members" description="Add your first staff account." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Role</Th>
                <Th>Branch</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
                <Th style={{ width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <Td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar name={user.name} />
                      <div>
                        <div className="cell-strong">{user.name}</div>
                        {user.id === me?.id && <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>You</div>}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div>{user.phone ?? '—'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{user.email ?? ''}</div>
                  </Td>
                  <Td>
                    <span className="badge" style={{ background: ROLE_BADGE[user.role].bg, color: ROLE_BADGE[user.role].color }}>
                      {ROLE_LABELS[user.role]}
                    </span>
                  </Td>
                  <Td className="cell-muted">{user.branch}</Td>
                  <Td>
                    <StatusPill active={user.active === 1} />
                  </Td>
                  <Td className="cell-muted">{formatDate(user.created_at)}</Td>
                  <Td>
                    <Dropdown
                      trigger={() => (
                        <button className="icon-btn" aria-label="Actions">
                          <span style={{ fontSize: 15, lineHeight: 1 }}>⋯</span>
                        </button>
                      )}
                    >
                      {(close) => (
                        <>
                          <DropdownItem icon={<UserRoundCog size={14} />} onClick={() => { close(); openEdit(user); }}>
                            Edit details
                          </DropdownItem>
                          {user.role !== 'super_admin' && (
                            <>
                              <DropdownSeparator />
                              <DropdownItem
                                danger
                                onClick={() => { close(); setConfirmTarget(user); }}
                              >
                                {user.active === 1 ? 'Deactivate account' : 'Reactivate account'}
                              </DropdownItem>
                            </>
                          )}
                        </>
                      )}
                    </Dropdown>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add team member'}
        subtitle="Members sign in with their registered phone or email + OTP"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button
              loading={createMutation.isPending || updateMutation.isPending}
              disabled={!form.name.trim() || !isValidPhone(form.phone)}
              onClick={() =>
                editing
                  ? updateMutation.mutate({
                      name: form.name,
                      email: form.email || '',
                      phone: form.phone,
                      role: form.role,
                      branch: form.branch,
                    })
                  : createMutation.mutate()
              }
            >
              {editing ? 'Save changes' : 'Add member'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Full name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Arun Kumar" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Phone (login)">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile" />
            </Field>
            <Field label="Work email">
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.in" />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Role">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={editing?.role === 'super_admin'}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS[role]}</option>
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
          {!editing && (
            <div className="alert alert-info" style={{ fontSize: 12 }}>
              {ROLE_DESCRIPTIONS[form.role as keyof typeof ROLE_DESCRIPTIONS]}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => confirmTarget && toggleActive(confirmTarget)}
        title={confirmTarget?.active === 1 ? 'Deactivate account' : 'Reactivate account'}
        message={
          confirmTarget?.active === 1
            ? `${confirmTarget.name} will no longer be able to sign in. Their assigned leads are kept in the database and can be reassigned.`
            : `${confirmTarget?.name} will regain access immediately.`
        }
        confirmLabel={confirmTarget?.active === 1 ? 'Deactivate' : 'Reactivate'}
        danger={confirmTarget?.active === 1}
        loading={updateMutation.isPending}
      />
    </>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className="status-tag" style={{ color: active ? 'var(--color-success-text)' : 'var(--color-text-muted)' }}>
      <span className="dot" style={{ background: active ? 'var(--color-success)' : 'var(--color-grey)' }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
