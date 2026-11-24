/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { EmployeeManagementView } from './components/EmployeeManagementView';
import { AttendanceView } from './components/AttendanceView';
import { PayrollView } from './components/PayrollView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { LoginPage } from './components/LoginPage';
import { AuthProvider, useAuth, authFetch } from './auth/AuthContext';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

import { 
  Employee, 
  ShiftRule, 
  AttendanceRecord, 
  PayrollRecord, 
  BiometricDevice, 
  User, 
  UserRole,
  DashboardMetrics 
} from './types';

function MainApp({ user, logout }: { user: User; logout: () => void }) {
  // Page Refresh Route Preservation (Bug #9)
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    const saved = localStorage.getItem('mohsin_payroll_active_tab') as NavTab;
    const validTabs: NavTab[] = ['dashboard', 'employees', 'attendance', 'payroll', 'reports', 'settings'];
    return (saved && validTabs.includes(saved)) ? saved : 'dashboard';
  });

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('mohsin_payroll_sidebar_collapsed') === 'true';
  });

  const handleToggleSidebar = () => {
    if (window.innerWidth < 768) {
      setIsMobileMenuOpen(prev => !prev);
    } else {
      setIsSidebarCollapsed(prev => {
        const next = !prev;
        localStorage.setItem('mohsin_payroll_sidebar_collapsed', String(next));
        return next;
      });
    }
  };

  const [employeeModelFilter, setEmployeeModelFilter] = useState<'all' | 'monthly_salary' | 'daily_wage'>('all');

  const handleTabChange = (tab: NavTab, modelFilter?: 'all' | 'monthly_salary' | 'daily_wage') => {
    setActiveTab(tab);
    if (modelFilter) {
      setEmployeeModelFilter(modelFilter);
    }
    localStorage.setItem('mohsin_payroll_active_tab', tab);
    setIsMobileMenuOpen(false);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const monthStr = todayStr.substring(0, 7);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<string>(monthStr);

  // App Data States
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<ShiftRule[]>([]);
  const [shiftRule, setShiftRule] = useState<ShiftRule>({
    id: 'shift_gen',
    name: 'Standard Morning Shift',
    check_in_time: '09:00',
    check_out_time: '17:00',
    grace_period_minutes: 30,
    mark_absent_after_grace: true,
    work_days: [1, 2, 3, 4, 5, 6]
  });
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    total_employees: 0,
    total_daily_wage: 0,
    total_monthly_salary: 0,
    present_today: 0,
    late_today: 0,
    absent_today: 0,
    today_payroll_accrual: 0,
    month_to_date_accrual: 0,
    active_devices: 0,
    monthly_payroll_estimate: 0,
    daily_wage_baseline: 0,
    monthly_salary_baseline: 0
  });

  // Fetch Initial Data
  const loadData = async () => {
    try {
      const [empRes, attRes, devRes, metricsRes, shiftRes] = await Promise.all([
        authFetch('/api/employees'),
        authFetch(`/api/attendance?date=${selectedDate}`),
        authFetch('/api/devices'),
        authFetch(`/api/dashboard/metrics?date=${selectedDate}`),
        authFetch('/api/shifts')
      ]);

      if (empRes.ok) setEmployees(await empRes.json());
      if (attRes.ok) setAttendanceRecords(await attRes.json());
      if (devRes.ok) setDevices(await devRes.json());
      if (metricsRes.ok) setMetrics(await metricsRes.json());
      
      if (shiftRes.ok) {
        const fetchedShifts = await shiftRes.json();
        const formattedShifts = fetchedShifts.map((s: any) => ({
          ...s,
          mark_absent_after_grace: Boolean(s.mark_absent_after_grace),
          work_days: typeof s.work_days === 'string' ? JSON.parse(s.work_days) : s.work_days
        }));
        setShifts(formattedShifts);
        if (formattedShifts.length > 0) {
          setShiftRule(formattedShifts[0]);
        }
      }

      loadPayroll(selectedMonth);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const loadPayroll = async (month: string) => {
    try {
      const res = await authFetch(`/api/payroll/records?month=${month}`);
      if (res.ok) {
        const records = await res.json();
        setPayrollRecords(records);
      }
    } catch (err) {
      console.error('Error loading payroll records:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate, activeTab]);

  useEffect(() => {
    loadPayroll(selectedMonth);
  }, [selectedMonth]);

  // Handlers
  const handleRoleSwitch = async (role: UserRole) => {
    try {
      const res = await authFetch('/api/auth/switch-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role })
      });
      if (res.ok) {
        // User role updated
      }
    } catch (err) {
      console.error('Role switch failed:', err);
    }
  };

  const handleAddEmployee = async (newEmp: Partial<Employee>): Promise<{ success: boolean; error?: string; id?: string }> => {
    try {
      const res = await authFetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmp)
      });
      if (res.ok) {
        const created = await res.json().catch(() => null);
        await loadData();
        return { success: true, id: created?.id };
      } else {
        let errorMsg = 'Failed to add employee';
        try {
          const err = await res.json();
          if (err.details?.fieldErrors) {
            const fieldMsgs = Object.entries(err.details.fieldErrors)
              .map(([field, msgs]: [string, any]) => `${field}: ${(msgs as string[]).join(', ')}`)
              .join(' | ');
            errorMsg = fieldMsgs || err.error || errorMsg;
          } else {
            errorMsg = err.error || errorMsg;
          }
        } catch {
          const text = await res.text().catch(() => '');
          if (text) errorMsg = `Server error (${res.status})`;
        }
        return { success: false, error: errorMsg };
      }
    } catch (err: any) {
      console.error('Add employee failed:', err);
      return { success: false, error: err.message || 'Network error while adding employee' };
    }
  };

  const handleUpdateEmployee = async (emp: Employee): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await authFetch(`/api/employees/${emp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emp)
      });
      if (res.ok) {
        await loadData();
        return { success: true };
      } else {
        let errorMsg = 'Failed to update employee';
        try {
          const err = await res.json();
          if (err.details?.fieldErrors) {
            const fieldMsgs = Object.entries(err.details.fieldErrors)
              .map(([field, msgs]: [string, any]) => `${field}: ${(msgs as string[]).join(', ')}`)
              .join(' | ');
            errorMsg = fieldMsgs || err.error || errorMsg;
          } else {
            errorMsg = err.error || errorMsg;
          }
        } catch {
          const text = await res.text().catch(() => '');
          if (text) errorMsg = `Server error (${res.status})`;
        }
        return { success: false, error: errorMsg };
      }
    } catch (err: any) {
      console.error('Update employee failed:', err);
      return { success: false, error: err.message || 'Network error while updating employee' };
    }
  };

  // Delete confirmation state (replaces blocking window.confirm / alert)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<string | null>(null);
  const [deleteResultMsg, setDeleteResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDeleteEmployee = async (id: string, options?: { force?: boolean; admin_password?: string } | boolean) => {
    const isForce = typeof options === 'boolean' ? options : options?.force;
    const adminPassword = typeof options === 'object' ? options?.admin_password : undefined;

    setDeleteConfirmId(null);
    setDeletingEmployeeId(id);
    setDeleteResultMsg(null);
    try {
      const res = await authFetch(`/api/employees/${id}${isForce ? '?force=true' : ''}`, {
        method: 'DELETE',
        headers: adminPassword ? { 'Content-Type': 'application/json' } : undefined,
        body: adminPassword ? JSON.stringify({ admin_password: adminPassword }) : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const msg = data.message || 'Employee deleted successfully.';
        setDeleteResultMsg({ type: 'success', text: msg });
        showToast(msg, 'success');
        await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
        await loadData();
        return { success: true, message: msg };
      } else {
        const errMsg = data.error || 'Failed to delete employee.';
        setDeleteResultMsg({ type: 'error', text: errMsg });
        showToast(errMsg, 'error');
        return { success: false, error: errMsg };
      }
    } catch (err: any) {
      console.error('Delete employee failed:', err);
      const errMsg = err.message || 'Network error while deleting employee.';
      setDeleteResultMsg({ type: 'error', text: errMsg });
      showToast(errMsg, 'error');
      return { success: false, error: errMsg };
    } finally {
      setDeletingEmployeeId(null);
      setTimeout(() => setDeleteResultMsg(null), 6000);
    }
  };

  const handleCreateShift = async (shiftData: Partial<ShiftRule>) => {
    try {
      const res = await authFetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shiftData)
      });
      if (res.ok) {
        await loadData();
      }
    } catch (err) {
      console.error('Create shift failed:', err);
    }
  };

  const handleUpdateShiftRule = async (rule: ShiftRule) => {
    try {
      const res = await authFetch(`/api/shifts/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rule)
      });
      if (res.ok) {
        setShiftRule(rule);
        await loadData();
      }
    } catch (err) {
      console.error('Update shift failed:', err);
    }
  };

  // Global non-blocking toast system to eliminate browser alert() freezes
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMsg({ text, type });
    setTimeout(() => {
      setToastMsg(prev => prev?.text === text ? null : prev);
    }, 5000);
  };

  const handleManualOverride = async (overrideData: any) => {
    try {
      const res = await authFetch('/api/attendance/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...overrideData, override_by: user?.name })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || 'Attendance override recorded.', 'success');
        await loadData();
        const month = (overrideData.date || selectedDate).substring(0, 7);
        await loadPayroll(month);
      } else {
        showToast(data.error || 'Failed to record attendance override.', 'error');
      }
    } catch (err: any) {
      console.error('Override failed:', err);
      showToast(err.message || 'Network error while saving attendance override.', 'error');
    }
  };

  const handleBulkAttendanceOverride = async (entries: any[]) => {
    try {
      const res = await authFetch('/api/attendance/bulk-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries, override_by: user?.name })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || `Saved ${entries.length} attendance records successfully.`, 'success');
        await loadData();
        if (entries.length > 0) {
          const months = Array.from(new Set(entries.map((e: any) => e.date?.substring(0, 7)).filter(Boolean)));
          for (const m of months) {
            await loadPayroll(m as string);
          }
        }
      } else {
        showToast(data.error || 'Failed to save attendance entries.', 'error');
      }
    } catch (err: any) {
      console.error('Bulk override failed:', err);
      showToast(err.message || 'Network error while saving bulk attendance entries.', 'error');
    }
  };

  const handleCalculatePayroll = async (month: string) => {
    try {
      const res = await authFetch('/api/payroll/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setPayrollRecords(data);
        showToast(`Payroll for ${month} calculated successfully (${data.length} records).`, 'success');
        await loadData();
      } else {
        showToast(data.error || 'Failed to calculate payroll.', 'error');
      }
    } catch (err: any) {
      console.error('Calculate payroll failed:', err);
      showToast(err.message || 'Network error while calculating payroll.', 'error');
    }
  };

  const handleAddAdjustment = async (adjData: any) => {
    try {
      const res = await authFetch('/api/payroll/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adjData)
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || 'Payroll adjustment applied.', 'success');
        await handleCalculatePayroll(adjData.month || selectedMonth);
      } else {
        showToast(data.error || 'Failed to add adjustment.', 'error');
      }
    } catch (err: any) {
      console.error('Add adjustment failed:', err);
      showToast(err.message || 'Network error while adding adjustment.', 'error');
    }
  };

  const handleUpdatePayrollStatus = async (month: string, status: 'draft' | 'approved' | 'paid') => {
    try {
      const res = await authFetch('/api/payroll/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, status })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || `Payroll marked as ${status}.`, 'success');
        await loadPayroll(month);
      } else {
        showToast(data.error || 'Failed to update payroll status.', 'error');
      }
    } catch (err: any) {
      console.error('Update payroll status failed:', err);
      showToast(err.message || 'Network error while updating payroll status.', 'error');
    }
  };

  const handleDeleteDraftPayroll = async (month: string) => {
    try {
      const res = await authFetch(`/api/payroll?month=${encodeURIComponent(month)}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || `Draft payroll for ${month} deleted.`, 'success');
        await loadPayroll(month);
        await loadData();
      } else {
        showToast(data.error || 'Failed to delete draft payroll.', 'error');
      }
    } catch (err: any) {
      console.error('Delete draft payroll failed:', err);
      showToast(err.message || 'Network error while deleting draft payroll.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f2f5] text-gray-800 flex flex-col antialiased selection:bg-blue-600 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        currentUser={user}
        onRoleSwitch={handleRoleSwitch}
        activeDevicesCount={devices.filter(d => d.status === 'online').length}
        onLogout={logout}
        onMenuToggle={handleToggleSidebar}
      />

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          role={user.role}
          userName={user.name}
          userEmail={user.email}
          userPhoto={user.photo_url}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => {
            setIsSidebarCollapsed(prev => {
              const next = !prev;
              localStorage.setItem('mohsin_payroll_sidebar_collapsed', String(next));
              return next;
            });
          }}
        />

        {/* Dynamic Center Stage Content View */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#f8fafc]">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardView
                metrics={metrics}
                recentAttendance={attendanceRecords}
                devices={devices}
                onNavigateTab={handleTabChange}
              />
            )}

            {activeTab === 'employees' && (
              <EmployeeManagementView
                employees={employees}
                shifts={shifts}
                attendanceRecords={attendanceRecords}
                payrollRecords={payrollRecords}
                selectedMonth={selectedMonth}
                onAddEmployee={handleAddEmployee}
                onUpdateEmployee={handleUpdateEmployee}
                onDeleteEmployee={handleDeleteEmployee}
                onCreateShift={handleCreateShift}
                userRole={user.role}
                deleteConfirmId={deleteConfirmId}
                deletingEmployeeId={deletingEmployeeId}
                deleteResultMsg={deleteResultMsg}
                onCancelDelete={() => setDeleteConfirmId(null)}
                initialModelFilter={employeeModelFilter}
                onModelFilterChange={setEmployeeModelFilter}
              />
            )}

            {activeTab === 'attendance' && (
              <AttendanceView
                attendanceRecords={attendanceRecords}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                shifts={shifts}
                shiftRule={shiftRule}
                onUpdateShiftRule={handleUpdateShiftRule}
                onCreateShift={handleCreateShift}
                onManualOverride={handleManualOverride}
                onBulkAttendanceOverride={handleBulkAttendanceOverride}
                userRole={user.role}
                employees={employees}
              />
            )}

            {activeTab === 'payroll' && (
              <PayrollView
                payrollRecords={payrollRecords}
                employees={employees}
                selectedMonth={selectedMonth}
                onMonthChange={setSelectedMonth}
                onCalculatePayroll={handleCalculatePayroll}
                onAddAdjustment={handleAddAdjustment}
                onUpdatePayrollStatus={handleUpdatePayrollStatus}
                onDeleteDraftPayroll={handleDeleteDraftPayroll}
                userRole={user.role}
              />
            )}

            {activeTab === 'reports' && (
              <ReportsView
                attendanceRecords={attendanceRecords}
                payrollRecords={payrollRecords}
                employees={employees}
                selectedDate={selectedDate}
                selectedMonth={selectedMonth}
                onDateChange={setSelectedDate}
                onMonthChange={setSelectedMonth}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView
                currentUserRole={user.role}
              />
            )}
          </div>
        </main>
      </div>

      {/* Global Non-blocking Notification Toast */}
      {toastMsg && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-xl border text-sm font-semibold flex items-center gap-2.5 animate-in slide-in-from-right duration-300 ${
          toastMsg.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : toastMsg.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          {toastMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : toastMsg.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : null}
          <span>{toastMsg.text}</span>
          <button
            onClick={() => setToastMsg(null)}
            className="ml-2 text-gray-400 hover:text-gray-600 cursor-pointer p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function AppContent() {
  const { user, isLoading, logout } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <MainApp user={user} logout={logout} />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
