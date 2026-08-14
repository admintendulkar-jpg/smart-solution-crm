import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Inbox,
  KanbanSquare,
  Users,
  UserRoundCog,
  Upload,
  GitBranch,
  ScrollText,
  LogOut,
  Copy,
  FileDown,
  Menu,
  X,
  UserRound,
  CalendarDays,
  FileText,
  CalendarCheck,
  Wallet,
  CalendarCheck2,
  FileCheck2,
  ClipboardCheck,
  Banknote,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuth } from '@/auth/auth';
import { ROLE_LABELS } from '@/lib/constants';
import { Avatar } from '@/ui/Avatar';
import { Dropdown, DropdownItem } from '@/ui/Dropdown';
import { NotificationsBell } from './NotificationsBell';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles: string[];
  end?: boolean;
  group?: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, roles: ['super_admin', 'admin', 'sales', 'service', 'hr'], end: true, group: 'Overview' },
  { to: '/leads', label: 'My Leads', icon: <Inbox size={16} />, roles: ['sales'] },
  { to: '/leads', label: 'All Leads', icon: <Inbox size={16} />, roles: ['super_admin', 'admin'] },
  { to: '/pipeline', label: 'Pipeline', icon: <KanbanSquare size={16} />, roles: ['super_admin', 'admin'] },
  { to: '/clients', label: 'Clients', icon: <Users size={16} />, roles: ['super_admin', 'admin', 'sales', 'service'] },
  { to: '/users', label: 'Team', icon: <UserRoundCog size={16} />, roles: ['super_admin', 'admin'] },
  { to: '/import', label: 'Lead Import', icon: <Upload size={16} />, roles: ['super_admin'] },
  { to: '/distribution', label: 'Lead Distribution', icon: <GitBranch size={16} />, roles: ['super_admin', 'admin'] },
  { to: '/export', label: 'Export', icon: <FileDown size={16} />, roles: ['super_admin', 'admin'] },
  { to: '/settings', label: 'General Settings', icon: <SlidersHorizontal size={16} />, roles: ['super_admin'] },
  { to: '/audit', label: 'Audit Log', icon: <ScrollText size={16} />, roles: ['super_admin'] },

  { to: '/my/dashboard', label: 'My Dashboard', icon: <UserRound size={16} />, roles: ['super_admin', 'admin', 'sales', 'service', 'hr'], end: true, group: 'My Workspace' },
  { to: '/my/leave', label: 'My Leave', icon: <CalendarDays size={16} />, roles: ['super_admin', 'admin', 'sales', 'service', 'hr'] },
  { to: '/my/documents', label: 'My Documents', icon: <FileText size={16} />, roles: ['super_admin', 'admin', 'sales', 'service', 'hr'] },
  { to: '/my/attendance', label: 'My Attendance', icon: <CalendarCheck size={16} />, roles: ['super_admin', 'admin', 'sales', 'service', 'hr'] },
  { to: '/my/salary', label: 'My Salary', icon: <Wallet size={16} />, roles: ['super_admin', 'admin', 'sales', 'service', 'hr'] },

  { to: '/hr/dashboard', label: 'HR Dashboard', icon: <LayoutDashboard size={16} />, roles: ['hr', 'super_admin'], end: true, group: 'HR Admin' },
  { to: '/hr/employees', label: 'Employees', icon: <UserRoundCog size={16} />, roles: ['hr', 'super_admin'] },
  { to: '/hr/leaves', label: 'Leave Requests', icon: <CalendarCheck2 size={16} />, roles: ['hr', 'super_admin'] },
  { to: '/hr/documents', label: 'Documents', icon: <FileCheck2 size={16} />, roles: ['hr', 'super_admin'] },
  { to: '/hr/attendance', label: 'Attendance', icon: <ClipboardCheck size={16} />, roles: ['hr', 'super_admin'] },
  { to: '/hr/payroll', label: 'Payroll', icon: <Banknote size={16} />, roles: ['hr', 'super_admin'] },
];

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px' }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          padding: 4,
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        }}
      >
        <img
          src="/logo.png"
          alt="Smart Solution Agency"
          style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }}
          onError={(e) => {
            const t = e.currentTarget.parentElement!;
            t.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M3 21l9-18 9 18H3z" fill="#1B52D4"/></svg>';
          }}
        />
      </div>
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ fontWeight: 800, fontSize: 13.5, color: '#ffffff', letterSpacing: '-0.2px' }}>Smart Solution</div>
        <div style={{ fontSize: 10.5, color: '#22A045', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Agency CRM</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  const sidebar = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Logo />
      <nav style={{ padding: '6px 10px', flex: 1, overflowY: 'auto' }}>
        {items.map((item, index) => {
          const showGroup = item.group && items[index - 1]?.group !== item.group;
          return (
            <div key={`${item.to}-${item.label}`}>
              {showGroup && (
                <div style={{ padding: '14px 11px 6px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>
                  {item.group}
                </div>
              )}
              <NavLink
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => (isActive ? 'nav-active' : '')}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 11px',
                  marginBottom: 3,
                  borderRadius: 9,
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: isActive ? '#fff' : '#cbd5e1',
                  background: isActive ? 'var(--gradient-primary)' : 'transparent',
                  boxShadow: isActive ? '0 4px 14px rgba(37, 99, 235, 0.35)' : 'none',
                  textDecoration: 'none',
                  transition: 'all 160ms ease',
                })}
              >
                {item.icon}
                {item.label}
              </NavLink>
            </div>
          );
        })}
      </nav>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={user.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#e2e8f0' }}>{user.name}</div>
            <div style={{ fontSize: 11.5, color: '#94a3b8' }}>{ROLE_LABELS[user.role]} · {user.branch}</div>
          </div>
          <Dropdown
            trigger={() => (
              <button className="icon-btn" aria-label="Account menu" style={{ marginTop: -8, color: '#94a3b8' }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>⋯</span>
              </button>
            )}
          >
            {(close) => (
              <>
                <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border)', marginBottom: 5 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{user.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{user.email ?? user.phone}</div>
                </div>
                <DropdownItem
                  danger
                  icon={<LogOut size={14} />}
                  onClick={() => {
                    close();
                    logout();
                  }}
                >
                  Sign out
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Desktop sidebar */}
      <aside
        className="sidebar-desktop"
        style={{
          width: 'var(--sidebar-width)',
          background: 'var(--gradient-sidebar)',
          position: 'fixed',
          top: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          zIndex: 60,
        }}
      >
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(2px)',
            zIndex: 70,
          }}
        />
      )}

      {/* Mobile drawer */}
      {mobileOpen && (
        <aside
          style={{
            position: 'fixed',
            top: 0,
            bottom: 0,
            left: 0,
            width: 260,
            background: 'var(--gradient-sidebar)',
            zIndex: 80,
            animation: 'scale-in 200ms ease-out',
          }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            style={{ position: 'absolute', top: 14, right: 12, background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
          {sidebar}
        </aside>
      )}

      <div style={{ flex: 1, marginLeft: 'var(--sidebar-width)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            height: 'var(--topbar-height)',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur))',
            WebkitBackdropFilter: 'blur(var(--glass-blur))',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 24px',
            gap: 10,
            position: 'sticky',
            top: 0,
            zIndex: 50,
          }}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="icon-btn hamburger"
            aria-label="Open menu"
            style={{ marginRight: 'auto' }}
          >
            <Menu size={19} />
          </button>
          <NotificationsBell />
          <button
            type="button"
            onClick={() => { if (window.confirm('Sign out of Smart Solution CRM?')) logout(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 13px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)', background: 'var(--color-surface)',
              color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', transition: 'all 150ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-danger)'; e.currentTarget.style.color = 'var(--color-danger-text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </header>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
