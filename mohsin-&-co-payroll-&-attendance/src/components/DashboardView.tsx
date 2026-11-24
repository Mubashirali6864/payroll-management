import React, { useState, useMemo } from 'react';
import { DashboardMetrics, AttendanceRecord, BiometricDevice } from '../types';
import { 
  Smile,
  ClipboardList, 
  Target, 
  CheckCheck, 
  ArrowDownCircle, 
  Radio,
  Calendar,
  AlertTriangle,
  Clock,
  Users
} from 'lucide-react';
import { StatusChip } from './StatusChip';

interface DashboardViewProps {
  metrics: DashboardMetrics;
  recentAttendance: AttendanceRecord[];
  devices: BiometricDevice[];
  onNavigateTab: (tab: any, modelFilter?: 'all' | 'monthly_salary' | 'daily_wage') => void;
}

const formatTimeDisplay = (timeStr?: string | null): string => {
  if (!timeStr || !timeStr.trim()) return '--:--';
  const clean = timeStr.trim();
  if (clean.includes('AM') || clean.includes('PM')) {
    return clean;
  }
  const parts = clean.split(':');
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    if (!isNaN(h)) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      return `${String(displayH).padStart(2, '0')}:${m} ${ampm}`;
    }
  }
  return clean;
};

const getRecordTimeScore = (record: AttendanceRecord): number => {
  if (record.check_in_time && record.check_in_time.trim()) {
    let clean = record.check_in_time.trim();
    const isPM = clean.toUpperCase().includes('PM');
    const isAM = clean.toUpperCase().includes('AM');
    clean = clean.replace(/AM|PM/gi, '').trim();
    const parts = clean.split(':');
    let hours = parseInt(parts[0], 10) || 0;
    const minutes = parseInt(parts[1], 10) || 0;
    const seconds = parseInt(parts[2], 10) || 0;
    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return -1;
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  metrics,
  recentAttendance,
  devices,
  onNavigateTab
}) => {
  const today = new Date().toISOString().split('T')[0];
  const [filterMode, setFilterMode] = useState<'punched' | 'all'>('punched');

  const formatNumber = (num: number) => {
    return (num || 0).toLocaleString();
  };

  // Sort attendance records so that:
  // 1. Employees with recorded punches are at the top, ordered with the most recent punches first (descending).
  // 2. Unpunched / absent records follow cleanly.
  const { sortedPunchedRecords, allSortedRecords, checkedInCount } = useMemo(() => {
    const punched = recentAttendance.filter(
      r => Boolean(r.check_in_time && r.check_in_time.trim()) || r.status === 'present' || r.status === 'late' || r.status === 'half_day'
    );
    const unpunched = recentAttendance.filter(
      r => !(Boolean(r.check_in_time && r.check_in_time.trim()) || r.status === 'present' || r.status === 'late' || r.status === 'half_day')
    );

    punched.sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      const scoreA = getRecordTimeScore(a);
      const scoreB = getRecordTimeScore(b);
      if (scoreA !== scoreB) {
        return scoreB - scoreA; // Latest check-in first
      }
      return String(a.employee_code || '').localeCompare(String(b.employee_code || ''));
    });

    unpunched.sort((a, b) => String(a.employee_code || '').localeCompare(String(b.employee_code || '')));

    return {
      sortedPunchedRecords: punched,
      allSortedRecords: [...punched, ...unpunched],
      checkedInCount: punched.length
    };
  }, [recentAttendance]);

  const displayRecords = (filterMode === 'punched' && checkedInCount > 0)
    ? sortedPunchedRecords.slice(0, 10)
    : allSortedRecords.slice(0, 10);

  return (
    <div className="space-y-5 pb-8">
      {/* Top Page Title */}
      <h2 className="text-xl md:text-2xl font-bold tracking-tight text-gray-700 font-heading">
        DASHBOARD
      </h2>

      {/* Sub-header Date & Overview Bar */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-3.5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-sm font-bold text-gray-700">Dashboard</span>
          <span className="text-[11px] text-gray-400 ml-2 font-normal">A Quick Overview</span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span className="text-gray-400 font-medium text-[11px]">System Date:</span>
          <span className="text-gray-800 font-bold font-mono text-xs">
            {today}
          </span>
        </div>
      </div>

      {/* Row 1: 3 Solid Color Stat Cards with Watermark Icons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Dual Half Cards: Daily Wage & Monthly Staff */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Half Card 1: Daily Wage Staff */}
          <div 
            onClick={() => onNavigateTab('employees', 'daily_wage')}
            className="relative overflow-hidden rounded-md bg-[#d97706] hover:bg-[#b45309] text-white p-3.5 shadow-sm cursor-pointer transition-all hover:-translate-y-0.5 duration-150 flex items-center justify-between group"
            title="Click to view Daily Wage Employees in HR Management"
          >
            <div className="z-10 min-w-0">
              <div className="text-2xl font-bold tracking-tight">
                {formatNumber(metrics.total_daily_wage ?? 0)}
              </div>
              <div className="text-xs font-semibold text-white/95 mt-1 truncate flex items-center gap-1">
                Daily Wage Staff <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">→</span>
              </div>
            </div>
            <div className="opacity-30 text-white shrink-0 -mr-1.5 group-hover:opacity-45 transition-opacity">
              <Clock className="w-11 h-11 stroke-[1.3]" />
            </div>
          </div>

          {/* Half Card 2: Monthly Salary Staff */}
          <div 
            onClick={() => onNavigateTab('employees', 'monthly_salary')}
            className="relative overflow-hidden rounded-md bg-[#1ea7fd] hover:bg-[#0284c7] text-white p-3.5 shadow-sm cursor-pointer transition-all hover:-translate-y-0.5 duration-150 flex items-center justify-between group"
            title="Click to view Monthly Salary Employees in HR Management"
          >
            <div className="z-10 min-w-0">
              <div className="text-2xl font-bold tracking-tight">
                {formatNumber(metrics.total_monthly_salary ?? 0)}
              </div>
              <div className="text-xs font-semibold text-white/95 mt-1 truncate flex items-center gap-1">
                Monthly Staff <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">→</span>
              </div>
            </div>
            <div className="opacity-30 text-white shrink-0 -mr-1.5 group-hover:opacity-45 transition-opacity">
              <Users className="w-11 h-11 stroke-[1.3]" />
            </div>
          </div>
        </div>

        {/* Emerald Green: Present Today */}
        <div 
          onClick={() => onNavigateTab('attendance')}
          className="relative overflow-hidden rounded-md bg-[#2ecc71] text-white p-4 shadow-sm cursor-pointer transition-transform hover:-translate-y-0.5 duration-150 flex items-center justify-between"
        >
          <div className="z-10">
            <div className="text-2xl font-bold tracking-tight">
              {formatNumber(metrics.present_today)}
            </div>
            <div className="text-xs font-semibold text-white/95 mt-1">
              Present Today
            </div>
          </div>
          <div className="opacity-40 text-white shrink-0 -mr-2">
            <ClipboardList className="w-16 h-16 stroke-[1.2]" />
          </div>
        </div>

        {/* Coral Red: Late & Absent Today */}
        <div 
          onClick={() => onNavigateTab('attendance')}
          className="relative overflow-hidden rounded-md bg-[#ff6b6b] text-white p-4 shadow-sm cursor-pointer transition-transform hover:-translate-y-0.5 duration-150 flex items-center justify-between"
        >
          <div className="z-10">
            <div className="text-2xl font-bold tracking-tight">
              {formatNumber(metrics.absent_today)}
            </div>
            <div className="text-xs font-semibold text-white/95 mt-1 flex items-center gap-1">
              Absent Today
              {metrics.late_today > 0 && (
                <span className="opacity-90 font-normal">({metrics.late_today} late)</span>
              )}
            </div>
          </div>
          <div className="opacity-40 text-white shrink-0 -mr-2">
            <Target className="w-16 h-16 stroke-[1.2]" />
          </div>
        </div>

      </div>

      {/* Row 2: 3 Solid Color Stat Cards with Watermark Icons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        
        {/* Coral Orange: Today's Accrual Cost */}
        <div 
          onClick={() => onNavigateTab('payroll')}
          className="relative overflow-hidden rounded-md bg-[#ff6e40] text-white p-4 shadow-sm cursor-pointer transition-transform hover:-translate-y-0.5 duration-150 flex items-center justify-between"
        >
          <div className="z-10">
            <div className="text-2xl font-bold tracking-tight">
              Rs. {metrics.today_payroll_accrual.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-white/95 mt-1 flex items-center gap-1.5 flex-wrap">
              <span>Today's Accrual Cost</span>
              {metrics.month_to_date_accrual !== undefined && (
                <span className="opacity-95 font-medium text-[11px] bg-black/15 px-1.5 py-0.5 rounded" title="Month-To-Date Accrued Payroll Cost">
                  Rs. {metrics.month_to_date_accrual.toLocaleString()} MTD
                </span>
              )}
            </div>
          </div>
          <div className="opacity-40 text-white shrink-0 -mr-2">
            <ArrowDownCircle className="w-16 h-16 stroke-[1.2]" />
          </div>
        </div>

        {/* Purple: Monthly Payroll Estimate */}
        <div 
          onClick={() => onNavigateTab('payroll')}
          className="relative overflow-hidden rounded-md bg-[#ba68c8] text-white p-4 shadow-sm cursor-pointer transition-transform hover:-translate-y-0.5 duration-150 flex items-center justify-between"
        >
          <div className="z-10">
            <div className="text-2xl font-bold tracking-tight">
              Rs. {metrics.monthly_payroll_estimate.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-white/95 mt-1">
              Monthly Payroll Estimate
            </div>
          </div>
          <div className="opacity-40 text-white shrink-0 -mr-2">
            <CheckCheck className="w-16 h-16 stroke-[1.2]" />
          </div>
        </div>

        {/* Sky / Cyan Blue: Active Biometric Devices */}
        <div 
          onClick={() => onNavigateTab('attendance')}
          className="relative overflow-hidden rounded-md bg-[#0288d1] text-white p-4 shadow-sm cursor-pointer transition-transform hover:-translate-y-0.5 duration-150 flex items-center justify-between"
        >
          <div className="z-10">
            <div className="text-2xl font-bold tracking-tight">
              {metrics.active_devices} Online
            </div>
            <div className="text-xs font-semibold text-white/95 mt-1">
              ZKTeco ADMS Terminal
            </div>
          </div>
          <div className="opacity-40 text-white shrink-0 -mr-2">
            <Radio className="w-16 h-16 stroke-[1.2]" />
          </div>
        </div>

      </div>

      {/* Panels Row: 2 Clean White Cards (Recent Activity & Shift Policy) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
        
        {/* Card 1: Recent Attendance Activity */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-800">
                  Recent Attendance Activity
                </h3>
                {checkedInCount > 0 && (
                  <span className="text-[11px] bg-emerald-50 text-emerald-700 font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                    {checkedInCount} Checked In
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-md bg-gray-100 p-0.5 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setFilterMode('punched')}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      filterMode === 'punched'
                        ? 'bg-white text-gray-800 shadow-xs font-bold'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    Checked In ({checkedInCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterMode('all')}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      filterMode === 'all'
                        ? 'bg-white text-gray-800 shadow-xs font-bold'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    All ({recentAttendance.length})
                  </button>
                </div>
                <button
                  onClick={() => onNavigateTab('attendance')}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer ml-1"
                >
                  View All
                </button>
              </div>
            </div>

            <div className="overflow-x-auto mt-2 max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-gray-400 font-semibold border-b border-gray-100">
                    <th className="py-2.5 px-2 text-center w-8">#</th>
                    <th className="py-2.5 px-2">Employee</th>
                    <th className="py-2.5 px-2">Department</th>
                    <th className="py-2.5 px-2">Check-in Time</th>
                    <th className="py-2.5 px-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayRecords.length > 0 ? (
                    displayRecords.map((att, idx) => (
                      <tr key={att.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="py-2.5 px-2 text-center font-mono text-gray-500 font-bold text-xs">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-2 font-medium text-gray-800">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{att.employee_name}</span>
                            {att.employee_code && (
                              <span className="font-mono text-blue-700 font-bold text-[11px] bg-blue-50 px-1 py-0.5 rounded border border-blue-100">
                                {att.employee_code}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-gray-500">
                          {att.department || 'Operations'}
                        </td>
                        <td className="py-2.5 px-2 font-mono">
                          {att.check_in_time ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                              <Clock className="w-3 h-3 text-emerald-600" />
                              {formatTimeDisplay(att.check_in_time)}
                            </span>
                          ) : (
                            <span className="text-gray-400 font-normal italic">--:--</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <StatusChip status={att.status as any} label={att.status} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400">
                        {filterMode === 'punched'
                          ? 'No employee check-ins recorded for today yet.'
                          : 'No attendance records available for today.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Card 2: Shift Policy & Grace Engine Rules */}
        <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-800">
                Active Shift Schedule & Grace Policy
              </h3>
              <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                Auto Enforced
              </span>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200/80 flex items-center justify-between">
                <div>
                  <div className="font-bold text-gray-800">Standard Morning Shift Check-in</div>
                  <div className="text-gray-500 mt-0.5">Select shift carefully during employee onboarding to prevent attendance and payroll errors.</div>
                </div>
                <span className="font-mono text-blue-700 font-bold bg-blue-50 px-2 py-1 rounded">
                  09:00 AM
                </span>
              </div>

              <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200/80 flex items-center justify-between">
                <div>
                  <div className="font-bold text-amber-900">Shift-Specific Grace Time</div>
                  <div className="text-amber-700 mt-0.5">Grace period and late arrival policies apply as per the assigned shift.</div>
                </div>
                <span className="font-mono text-amber-700 font-bold bg-amber-100/60 px-2 py-1 rounded">
                  09:30 AM
                </span>
              </div>

              <div className="p-3 bg-rose-50/60 rounded-lg border border-rose-200/80 flex items-center justify-between">
                <div>
                  <div className="font-bold text-rose-900">Automatic Absent Cut-off</div>
                  <div className="text-rose-700 mt-0.5">Arriving after the shift's grace period leads to automatic 1-day salary cut.</div>
                </div>
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>ZKTeco Terminal: <strong className="text-emerald-600">Online</strong></span>
            <button
              onClick={() => onNavigateTab('attendance')}
              className="text-blue-600 font-semibold hover:underline cursor-pointer"
            >
              Configure Policy
            </button>
          </div>
        </div>

      </div>

      {/* Compensation Breakdown Overview */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 shadow-xs">
        <h3 className="text-sm font-bold text-gray-800 mb-3">
          Compensation Breakdown
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200/80">
            <div className="text-gray-500 font-medium">Daily Wage Staff Rate</div>
            <div className="text-lg font-bold text-gray-800 mt-1">
              {metrics.daily_wage_baseline ? `Rs. ${metrics.daily_wage_baseline.toLocaleString()} / day` : 'Rs. 0'}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">Combined daily cost of all daily-wage staff</div>
          </div>
          <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200/80">
            <div className="text-gray-500 font-medium">Monthly Salary Baseline</div>
            <div className="text-lg font-bold text-gray-800 mt-1">
              {metrics.monthly_salary_baseline ? `Rs. ${metrics.monthly_salary_baseline.toLocaleString()} / month` : 'Rs. 0'}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">Subject to grace & absent cuts</div>
          </div>
          <div className="p-3.5 bg-gray-50 rounded-lg border border-gray-200/80">
            <div className="text-gray-500 font-medium">Monthly Estimated Total</div>
            <div className="text-lg font-bold text-blue-700 mt-1">Rs. {(metrics.monthly_payroll_estimate || 0).toLocaleString()}</div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Full Scheduled Monthly Total</div>
          </div>
        </div>
      </div>

    </div>
  );
};
