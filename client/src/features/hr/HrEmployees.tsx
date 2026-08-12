import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, UserRoundCog } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { BRANCHES, QUERY_KEYS, ROLES, ROLE_LABELS } from '@/lib/constants';
import { formatDateInputValue, isValidPhone } from '@/lib/format';
import type { EmployeeProfile } from '@/lib/types';
import { PageHeader } from '@/ui/PageHeader';
import { Card, CardHeader } from '@/ui/Card';
import { Table, Th, Td } from '@/ui/Table';
import { Button } from '@/ui/Button';
import { Field, Input, Select } from '@/ui/Fields';
import { Modal } from '@/ui/Modal';
import { Avatar } from '@/ui/Avatar';
import { Spinner } from '@/ui/Spinner';
import { ErrorState } from '@/ui/ErrorState';
import { EmptyState } from '@/ui/EmptyState';
import { Dropdown, DropdownItem } from '@/ui/Dropdown';
import { SearchInput } from '@/ui/PageHeader';
import { useToast } from '@/ui/Toast';
import { ConfirmDialog } from '@/ui/ConfirmDialog';

type EmployeeRow = Pick<EmployeeProfile, 'id' | 'name' | 'email' | 'phone' | 'role' | 'branch' | 'active'> & {
  designation: string | null;
  department: string | null;
  joining_date: string | null;
  salary_grade: string | null;
};

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  super_admin: { bg: '#f0eafb', color: '#6b3ec6' },
  admin: { bg: '#e9f2f9', color: '#146eb4' },
  sales: { bg: '#e8f8f0', color: '#067647' },
  service: { bg: '#fdf5e3', color: '#8a6100' },
  hr: { bg: '#f2f4f7', color: '#475467' },
};

interface CreateForm {
  name: string;
  phone: string;
  email: string;
  role: string;
  branch: string;
  designation: string;
  department: string;
  joining_date: string;
}

const EMPTY_CREATE: CreateForm = { name: '', phone: '', email: '', role: 'sales', branch: 'Coimbatore', designation: '', department: '', joining_date: '' };

interface EditForm {
  name: string;
  email: string;
  phone: string;
  role: string;
  branch: string;
  designation: string;
  department: string;
  joining_date: string;
  salary_grade: string;
  active: boolean;
}

export function HrEmployees() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: '',
    email: '',
    phone: '',
    role: 'sales',
    branch: 'Coimbatore',
    designation: '',
    department: '',
    joining_date: '',
    salary_grade: '',
    active: true,
  });
  const [toggleTarget, setToggleTarget] = useState<EmployeeRow | null>(null);

  const queryKey = QUERY_KEYS.hrEmployees(`${role}|${search.trim()}`);
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => api.get<{ employees: EmployeeRow[] }>(`/hr/employees?role=${role}&search=${encodeURIComponent(search)}`),
  });

  const employees = data?.employees ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEYS.hrEmployees('') });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/hr/employees', {
        name: createForm.name,
        phone: createForm.phone,
        email: createForm.email || undefined,
        role: createForm.role,
        branch: createForm.branch,
        designation: createForm.designation || undefined,
        department: createForm.department || undefined,
        joining_date: createForm.joining_date || undefined,
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Employee created. Leave balances were seeded.');
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/hr/employees/${editing!.id}`, patch),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.users('all') });
      toast.success('Profile updated.');
      setEditing(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function openEdit(e: EmployeeRow) {
    setEditing(e);
    setEditForm({
      name: e.name,
      email: e.email ?? '',
      phone: e.phone ?? '',
      role: e.role,
      branch: e.branch,
      designation: e.designation ?? '',
      department: e.department ?? '',
      joining_date: formatDateInputValue(e.joining_date),
      salary_grade: e.salary_grade ?? '',
      active: e.active === 1,
    });
  }

  function saveEdit() {
    updateMutation.mutate({
      name: editForm.name,
      email: editForm.email || '',
      phone: editForm.phone,
      role: editForm.role,
      branch: editForm.branch,
      designation: editForm.designation || '',
      department: editForm.department || '',
      joining_date: editForm.joining_date || '',
      salary_grade: editForm.salary_grade || '',
      active: editForm.active,
    });
  }

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Staff records, departments and onboarding"
        actions={<Button icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>Add employee</Button>}
      />

      <Card>
        <CardHeader
          title={`${employees.length} staff`}
          actions={
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 150 }}>
                <option value="">All roles</option>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
              <SearchInput value={search} onChange={setSearch} placeholder="Search name / phone…" />
            </div>
          }
        />
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState error={isError} />
        ) : employees.length === 0 ? (
          <EmptyState icon={<UserRoundCog size={20} />} title="No employees" description="Add your first staff profile to get started." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                <Th>Department</Th>
                <Th>Role</Th>
                <Th>Branch</Th>
                <Th>Joined</Th>
                <Th>Status</Th>
                <Th style={{ width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <Td>
                    <Link to={`/hr/employees/${e.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={e.name} />
                        <div>
                          <div className="cell-strong">{e.name}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{e.phone}</div>
                        </div>
                      </div>
                    </Link>
                  </Td>
                  <Td>
                    <div>{e.designation ?? '—'}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{e.department ?? ''}</div>
                  </Td>
                  <Td>
                    <span className="badge" style={{ background: ROLE_BADGE[e.role].bg, color: ROLE_BADGE[e.role].color }}>{ROLE_LABELS[e.role]}</span>
                  </Td>
                  <Td className="cell-muted">{e.branch}</Td>
                  <Td className="cell-muted">{formatDateInputValue(e.joining_date) ? new Date(`${e.joining_date}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</Td>
                  <Td>
                    <span className="status-tag" style={{ color: e.active === 1 ? 'var(--color-success-text)' : 'var(--color-text-muted)' }}>
                      <span className="dot" style={{ background: e.active === 1 ? 'var(--color-success)' : 'var(--color-grey)' }} />
                      {e.active === 1 ? 'Active' : 'Inactive'}
                    </span>
                  </Td>
                  <Td>
                    <Dropdown
                      trigger={() => (
                        <button className="icon-btn" aria-label="Actions"><span style={{ fontSize: 15, lineHeight: 1 }}>⋯</span></button>
                      )}
                    >
                      {(close) => (
                        <>
                          <DropdownItem icon={<UserRoundCog size={14} />} onClick={() => { close(); openEdit(e); }}>
                            Edit profile
                          </DropdownItem>
                          {e.role !== 'super_admin' && (
                            <DropdownItem danger onClick={() => { close(); setToggleTarget(e); }}>
                              {e.active === 1 ? 'Deactivate' : 'Reactivate'}
                            </DropdownItem>
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
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add employee"
        subtitle="Creates a login account and seeds leave balances"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              loading={createMutation.isPending}
              disabled={!createForm.name.trim() || !isValidPhone(createForm.phone)}
              onClick={() => createMutation.mutate()}
            >
              Create employee
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Full name">
            <Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="e.g. Suresh Kumar" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Phone (login)">
              <Input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} placeholder="10-digit mobile" />
            </Field>
            <Field label="Email">
              <Input value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="name@company.in" />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Role">
              <Select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
            </Field>
            <Field label="Branch">
              <Select value={createForm.branch} onChange={(e) => setCreateForm({ ...createForm, branch: e.target.value })}>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </Select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Designation">
              <Input value={createForm.designation} onChange={(e) => setCreateForm({ ...createForm, designation: e.target.value })} placeholder="e.g. Sales Executive" />
            </Field>
            <Field label="Department">
              <Input value={createForm.department} onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })} placeholder="e.g. Sales" />
            </Field>
          </div>
          <Field label="Joining date">
            <Input type="date" value={createForm.joining_date} onChange={(e) => setCreateForm({ ...createForm, joining_date: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : undefined}
        subtitle="Employment details and profile fields"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={updateMutation.isPending} onClick={saveEdit}>Save changes</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Full name">
            <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="Full name" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Phone (login)">
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="Mobile number" />
            </Field>
            <Field label="Work email">
              <Input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} placeholder="Work email" />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Role">
              <Select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} disabled={editing?.role === 'super_admin'}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Branch">
              <Select value={editForm.branch} onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })}>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Designation">
              <Input value={editForm.designation} onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })} />
            </Field>
            <Field label="Department">
              <Input value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Joining date">
              <Input type="date" value={editForm.joining_date} onChange={(e) => setEditForm({ ...editForm, joining_date: e.target.value })} />
            </Field>
            <Field label="Salary grade">
              <Input value={editForm.salary_grade} onChange={(e) => setEditForm({ ...editForm, salary_grade: e.target.value })} placeholder="e.g. Grade B" />
            </Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })} />
            Account active (can sign in)
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        onClose={() => setToggleTarget(null)}
        onConfirm={() => {
          updateMutation.mutate({ active: toggleTarget!.active === 1 ? false : true });
          setToggleTarget(null);
        }}
        title={toggleTarget?.active === 1 ? 'Deactivate employee' : 'Reactivate employee'}
        message={`${toggleTarget?.name} will be ${toggleTarget?.active === 1 ? 'blocked from signing in' : 'allowed to sign in again'}.`}
        confirmLabel={toggleTarget?.active === 1 ? 'Deactivate' : 'Reactivate'}
        danger={toggleTarget?.active === 1}
        loading={updateMutation.isPending}
      />
    </>
  );
}
