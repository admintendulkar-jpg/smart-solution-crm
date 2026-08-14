import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth, RequireRoles } from './auth/auth';
import { FollowUpReminder } from './lib/useFollowUpReminder';
import { LoginPage } from './auth/LoginPage';
import { AppShell } from './layout/AppShell';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { LeadsPage } from './features/leads/LeadsPage';
import { LeadDetailPage } from './features/leads/LeadDetailPage';
import { PipelinePage } from './features/admin/PipelinePage';
import { DuplicatesPage } from './features/admin/DuplicatesPage';
import { ExportPage } from './features/admin/ExportPage';
import { ClientsPage } from './features/clients/ClientsPage';
import { ClientDetailPage } from './features/clients/ClientDetailPage';
import { UsersPage } from './features/admin/UsersPage';
import { ImportPage } from './features/admin/ImportPage';
import { LeadDistributionPage } from './features/admin/LeadDistributionPage';
import { GeneralSettingsPage } from './features/admin/GeneralSettingsPage';
import { AuditPage } from './features/admin/AuditPage';
import { MyBoard } from './features/hr/MyBoard';
import { MyLeave } from './features/hr/MyLeave';
import { MyDocuments } from './features/hr/MyDocuments';
import { MyAttendance } from './features/hr/MyAttendance';
import { MySalary } from './features/hr/MySalary';
import { HrDashboard } from './features/hr/HrDashboard';
import { HrEmployees } from './features/hr/HrEmployees';
import { HrEmployeeDetail } from './features/hr/HrEmployeeDetail';
import { HrLeaves } from './features/hr/HrLeaves';
import { HrDocuments } from './features/hr/HrDocuments';
import { HrAttendance } from './features/hr/HrAttendance';
import { HrPayroll } from './features/hr/HrPayroll';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

function HrAdmin({ children }: { children: React.ReactNode }) {
  return (
    <RequireRoles roles={['hr', 'super_admin']}>
      {children}
    </RequireRoles>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FollowUpReminder />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<Shell><DashboardPage /></Shell>} />

        <Route path="/my/dashboard" element={<Shell><MyBoard /></Shell>} />
        <Route path="/my/leave" element={<Shell><MyLeave /></Shell>} />
        <Route path="/my/documents" element={<Shell><MyDocuments /></Shell>} />
        <Route path="/my/attendance" element={<Shell><MyAttendance /></Shell>} />
        <Route path="/my/salary" element={<Shell><MySalary /></Shell>} />

        <Route path="/hr/dashboard" element={<Shell><HrAdmin><HrDashboard /></HrAdmin></Shell>} />
        <Route path="/hr/employees" element={<Shell><HrAdmin><HrEmployees /></HrAdmin></Shell>} />
        <Route path="/hr/employees/:id" element={<Shell><HrAdmin><HrEmployeeDetail /></HrAdmin></Shell>} />
        <Route path="/hr/leaves" element={<Shell><HrAdmin><HrLeaves /></HrAdmin></Shell>} />
        <Route path="/hr/documents" element={<Shell><HrAdmin><HrDocuments /></HrAdmin></Shell>} />
        <Route path="/hr/attendance" element={<Shell><HrAdmin><HrAttendance /></HrAdmin></Shell>} />
        <Route path="/hr/payroll" element={<Shell><HrAdmin><HrPayroll /></HrAdmin></Shell>} />

        <Route path="/leads" element={<Shell><LeadsPage /></Shell>} />
        <Route path="/leads/:id" element={<Shell><LeadDetailPage /></Shell>} />
        <Route path="/pipeline" element={<Shell><RequireRoles roles={['super_admin', 'admin']}><PipelinePage /></RequireRoles></Shell>} />
        <Route path="/clients" element={<Shell><ClientsPage /></Shell>} />
        <Route path="/clients/:id" element={<Shell><ClientDetailPage /></Shell>} />
        <Route path="/export" element={<Shell><RequireRoles roles={['super_admin', 'admin']}><ExportPage /></RequireRoles></Shell>} />
        <Route path="/users" element={<Shell><RequireRoles roles={['super_admin', 'admin']}><UsersPage /></RequireRoles></Shell>} />
        <Route path="/import" element={<Shell><RequireRoles roles={['super_admin']}><ImportPage /></RequireRoles></Shell>} />
        <Route path="/distribution" element={<Shell><RequireRoles roles={['super_admin', 'admin']}><LeadDistributionPage /></RequireRoles></Shell>} />
        <Route path="/split" element={<Navigate to="/distribution" replace />} />
        <Route path="/settings" element={<Shell><RequireRoles roles={['super_admin']}><GeneralSettingsPage /></RequireRoles></Shell>} />
        <Route path="/audit" element={<Shell><RequireRoles roles={['super_admin']}><AuditPage /></RequireRoles></Shell>} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
