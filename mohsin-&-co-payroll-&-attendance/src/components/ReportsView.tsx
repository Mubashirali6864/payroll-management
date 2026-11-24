import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx-js-style';
import { AttendanceRecord, PayrollRecord, Employee } from '../types';
import { printFormattedDocument, escapeHtml } from '../utils/printUtils';
import { authFetch } from '../auth/AuthContext';
import { 
  FileSpreadsheet,
  Download,
  Printer,
  Building2,
  Calendar,
  Clock,
  DollarSign,
  Briefcase
} from 'lucide-react';

interface ReportsViewProps {
  attendanceRecords: AttendanceRecord[];
  payrollRecords: PayrollRecord[];
  employees: Employee[];
  selectedDate: string;
  selectedMonth: string;
  onDateChange?: (date: string) => void;
  onMonthChange?: (month: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  attendanceRecords,
  payrollRecords,
  employees,
  selectedDate,
  selectedMonth,
  onDateChange,
  onMonthChange
}) => {
  const [reportType, setReportType] = useState<'daily' | 'monthly'>('daily');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [companyLogo, setCompanyLogo] = useState<string>('');

  // Monthly Payroll Summary now spans a custom From -> To window (recomputed on the
  // server for the exact date range), rather than a single calendar month.
  const monthBounds = (ym: string): { first: string; last: string } => {
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return { first: `${ym}-01`, last: `${ym}-${String(last).padStart(2, '0')}` };
  };
  const [rangeFrom, setRangeFrom] = useState<string>(() => monthBounds(selectedMonth).first);
  const [rangeTo, setRangeTo] = useState<string>(() => monthBounds(selectedMonth).last);
  const [rangeSummary, setRangeSummary] = useState<PayrollRecord[]>([]);
  const [rangeLoading, setRangeLoading] = useState(false);

  useEffect(() => {
    const loadLogo = async () => {
      try {
        const res = await authFetch('/api/settings/company');
        if (res.ok) {
          const data = await res.json();
          setCompanyLogo(data.logo_url || '');
        }
      } catch (e) {
        console.error('Failed to load logo:', e);
      }
    };
    loadLogo();
  }, []);

  // Fetch the recomputed payroll summary whenever the active window changes. Monthly uses the
  // From/To range; Daily collapses to the single selected date (from = to = selectedDate). The
  // server prorates counts + net pay for the exact window, so both tabs share one table.
  useEffect(() => {
    const winFrom = reportType === 'daily' ? selectedDate : rangeFrom;
    const winTo = reportType === 'daily' ? selectedDate : rangeTo;
    if (!winFrom || !winTo || winFrom > winTo) return;
    let cancelled = false;
    const fetchRange = async () => {
      setRangeLoading(true);
      try {
        const res = await authFetch(`/api/payroll/range?from=${winFrom}&to=${winTo}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setRangeSummary(data);
        }
      } catch (e) {
        console.error('Failed to load range payroll:', e);
      } finally {
        if (!cancelled) setRangeLoading(false);
      }
    };
    fetchRange();
    return () => { cancelled = true; };
  }, [reportType, rangeFrom, rangeTo, selectedDate]);

  const departments = Array.from(new Set(employees.map(e => e.department)));

  // Monthly summary rows come from the recomputed range endpoint, filtered by department.
  const filteredRangeSummary = rangeSummary.filter(p => {
    return departmentFilter === 'all' || p.department === departmentFilter;
  });

  const dailyWageRecords = filteredRangeSummary.filter(p => p.employment_type === 'daily_wage');
  const monthlySalaryRecords = filteredRangeSummary.filter(p => p.employment_type === 'monthly_salary');

  const dailyWageTotalPayout = dailyWageRecords.reduce((sum, p) => sum + p.net_payout, 0);
  const monthlySalaryTotalPayout = monthlySalaryRecords.reduce((sum, p) => sum + p.net_payout, 0);
  const grandTotalPayout = dailyWageTotalPayout + monthlySalaryTotalPayout;

  // Export Daily Payroll Summary (single selected date) to Excel — same shape as the monthly export.
  const handleExportDailyExcel = () => {
    const data = filteredRangeSummary.map((p, idx) => ({
      'S.No': idx + 1,
      'Employee Code': p.employee_code,
      'Employee Name': p.employee_name,
      'Department': p.department,
      'Designation': p.designation,
      'Employment Model': p.employment_type === 'daily_wage' ? 'Daily Wage' : 'Monthly Salary',
      'Date': selectedDate,
      'Base Rate (PKR)': p.base_rate,
      'Working Hours / Days': p.employment_type === 'daily_wage' ? `${p.total_hours_worked ?? (p.days_present * 8)} hrs` : `${p.working_days} days`,
      'Days Present': p.employment_type === 'daily_wage' ? '-' : p.days_present,
      'Days Absent': p.employment_type === 'daily_wage' ? '-' : p.days_absent,
      'Days Off': p.employment_type === 'daily_wage' ? '-' : (p.days_off ?? 0),
      'Days Leave': p.employment_type === 'daily_wage' ? '-' : (p.days_leave ?? 0),
      'Gross Base': p.gross_earnings,
      'Absent Deductions': p.employment_type === 'daily_wage' ? 0 : p.absent_deductions,
      'Total Bonuses': p.total_bonuses,
      'Total Fines': p.total_fines,
      'Advance Deductions': p.advance_deductions,
      'Net Payout (PKR)': p.net_payout
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily Payroll Summary');
    XLSX.writeFile(workbook, `Daily_Payroll_Summary_${selectedDate}.xlsx`);
  };

  // Export Monthly Payroll to Excel
  const handleExportMonthlyExcel = () => {
    const data = filteredRangeSummary.map((p, idx) => ({
      'S.No': idx + 1,
      'Employee Code': p.employee_code,
      'Employee Name': p.employee_name,
      'Department': p.department,
      'Designation': p.designation,
      'Employment Model': p.employment_type === 'daily_wage' ? 'Daily Wage' : 'Monthly Salary',
      'Period From': rangeFrom,
      'Period To': rangeTo,
      'Base Rate (PKR)': p.base_rate,
      'Working Hours / Days': p.employment_type === 'daily_wage' ? `${p.total_hours_worked ?? (p.days_present * 8)} hrs` : `${p.working_days} days`,
      'Days Present': p.employment_type === 'daily_wage' ? '-' : p.days_present,
      'Days Absent': p.employment_type === 'daily_wage' ? '-' : p.days_absent,
      'Days Off': p.employment_type === 'daily_wage' ? '-' : (p.days_off ?? 0),
      'Days Leave': p.employment_type === 'daily_wage' ? '-' : (p.days_leave ?? 0),
      'Gross Base': p.gross_earnings,
      'Absent Deductions': p.employment_type === 'daily_wage' ? 0 : p.absent_deductions,
      'Total Bonuses': p.total_bonuses,
      'Total Fines': p.total_fines,
      'Advance Deductions': p.advance_deductions,
      'Net Payout (PKR)': p.net_payout
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payroll Summary');
    XLSX.writeFile(workbook, `Payroll_Summary_${rangeFrom}_to_${rangeTo}.xlsx`);
  };

  const handlePrintPDF = () => {
    // Both Daily and Monthly print the identical payroll summary table; only the title,
    // period line and file name differ (Daily = single date, Monthly = From→To window).
    const rowsHtml = filteredRangeSummary.map((p, idx) => `
      <tr>
        <td style="text-align: center; font-family: monospace; color: #64748b; font-weight: 700;">${idx + 1}</td>
        <td><strong>${escapeHtml(p.employee_name)}</strong> <span style="font-family: monospace; color: #1d4ed8; font-weight: 700;">(${escapeHtml(p.employee_code)})</span></td>
        <td>${escapeHtml(p.department)}</td>
        <td><strong style="color: ${p.employment_type === 'daily_wage' ? '#b45309' : '#1d4ed8'}; font-size: 10px;">${p.employment_type === 'daily_wage' ? 'Daily Wage' : 'Monthly Salary'}</strong></td>
        <td class="font-mono">${p.employment_type === 'daily_wage' ? `${p.total_hours_worked ?? (p.days_present * 8)} hrs` : `${p.working_days} Days`}</td>
        <td class="font-mono">${p.employment_type === 'daily_wage' ? `<strong style="color: #b45309;">${p.total_hours_worked ?? (p.days_present * 8)} Working Hours</strong>` : `<span style="color: #059669; font-weight: bold;">${p.days_present}P</span> / <span style="color: #be123c; font-weight: bold;">${p.days_absent}A</span> / <span style="color: #2563eb; font-weight: bold;">${p.days_off ?? 0}Off</span> / <span style="color: #d97706; font-weight: bold;">${p.days_leave ?? 0}L</span>`}</td>
        <td class="font-mono">PKR ${p.gross_earnings.toLocaleString()}</td>
        <td class="font-mono" style="color: ${p.employment_type === 'daily_wage' ? '#6b7280' : '#be123c'}; font-weight: bold;">${p.employment_type === 'daily_wage' ? '--' : `- PKR ${p.absent_deductions.toLocaleString()}`}</td>
        <td class="font-mono">${p.total_bonuses > 0 ? `<span style="color: #059669;">+${p.total_bonuses}</span>` : '--'} / ${p.total_fines > 0 ? `<span style="color: #be123c;">-${p.total_fines}</span>` : '--'} / ${p.advance_deductions > 0 ? `<span style="color: #ea580c;">-${p.advance_deductions} adv</span>` : '--'}</td>
        <td class="font-mono font-black" style="color: #1d4ed8;">PKR ${p.net_payout.toLocaleString()}</td>
      </tr>
    `).join('');

    const docTitle = reportType === 'daily' ? 'DAILY PAYROLL SUMMARY REPORT' : 'PAYROLL & PAYOUT SUMMARY REPORT';
    const periodLine = reportType === 'daily'
      ? `Date: <strong>${selectedDate}</strong>`
      : `Period: <strong>${rangeFrom}</strong> to <strong>${rangeTo}</strong>`;
    const fileName = reportType === 'daily'
      ? `Daily_Payroll_Summary_${selectedDate}`
      : `Payroll_Summary_${rangeFrom}_to_${rangeTo}`;

    const content = `
      <div style="display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px;">
        ${companyLogo ? `<img src="${escapeHtml(companyLogo)}" alt="Company Logo" style="height: 50px; width: auto; max-width: 120px; object-fit: contain;" />` : ''}
        <div>
          <div class="doc-title">${docTitle}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
            ${periodLine} | Department: <strong>${escapeHtml(departmentFilter)}</strong>
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width: 28px; text-align: center;">#</th>
            <th>Employee Name & ID</th>
            <th>Department</th>
            <th>Model</th>
            <th>Working Days / Hours</th>
            <th>Attendance / Hours</th>
            <th>Gross Earnings</th>
            <th>Absent Cuts</th>
            <th>Bonus / Fine / Advance</th>
            <th>Net Payout</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      
      <!-- Payout Estimate Breakdown Summary -->
      <div style="margin-top: 18px; border: 1.5px solid #0f172a; border-radius: 8px; overflow: hidden; background: #f8fafc;">
        <div style="display: flex; justify-content: space-between; padding: 8px 14px; border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <span style="font-weight: 700; color: #b45309;">DAILY WAGE TOTAL PAYOUT (${dailyWageRecords.length} Staff):</span>
          <span class="font-mono" style="font-weight: 800; color: #b45309;">PKR ${dailyWageTotalPayout.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px 14px; border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <span style="font-weight: 700; color: #1d4ed8;">MONTHLY SALARY TOTAL PAYOUT (${monthlySalaryRecords.length} Staff):</span>
          <span class="font-mono" style="font-weight: 800; color: #1d4ed8;">PKR ${monthlySalaryTotalPayout.toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 14px; background: #eff6ff; font-size: 13px;">
          <span style="font-weight: 900; color: #1e3a8a;">COMBINED GRAND TOTAL PAYOUT (${filteredRangeSummary.length} Total Staff):</span>
          <span class="font-mono" style="font-weight: 900; color: #1d4ed8; font-size: 15px;">PKR ${grandTotalPayout.toLocaleString()}</span>
        </div>
      </div>
    `;
    printFormattedDocument(fileName, content);
  };

  return (
    <div className="space-y-5 pb-8">
      
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-700 tracking-tight font-heading flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-blue-600" /> Executive Reports & Exports
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Generate and export daily attendance logs, salary deduction statements, and monthly payout summaries
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          <button
            onClick={reportType === 'daily' ? handleExportDailyExcel : handleExportMonthlyExcel}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95 flex-1 sm:flex-none"
          >
            <Download className="w-4 h-4 text-white" /> Export Excel (.xlsx)
          </button>
          <button
            onClick={handlePrintPDF}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3.5 py-2 rounded-lg text-xs transition-all border border-gray-300 flex items-center justify-center gap-2 cursor-pointer active:scale-95 flex-1 sm:flex-none"
          >
            <Printer className="w-4 h-4 text-gray-600" /> Print PDF Report
          </button>
        </div>
      </div>

      {/* Report Toggle & Filters */}
      <div className="bg-white p-3.5 border border-gray-200 rounded-lg flex flex-wrap items-center justify-between gap-4 shadow-xs">
        
        {/* Toggle Daily vs Monthly */}
        <div className="flex items-center p-1 bg-gray-100 border border-gray-200 rounded-lg w-full sm:w-auto">
          <button
            onClick={() => setReportType('daily')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              reportType === 'daily' ? 'bg-white text-blue-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Daily Payroll Summary
          </button>
          <button
            onClick={() => setReportType('monthly')}
            className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
              reportType === 'monthly' ? 'bg-white text-blue-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Monthly Payroll Summary
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Date Picker for Daily / Month Picker for Monthly */}
          {reportType === 'daily' && onDateChange && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1 text-xs text-gray-700">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-gray-500">Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="bg-transparent text-gray-800 font-bold focus:outline-none cursor-pointer"
              />
            </div>
          )}

          {reportType === 'monthly' && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1 text-xs text-gray-700">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-gray-500">From:</span>
              <input
                type="date"
                value={rangeFrom}
                max={rangeTo || undefined}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="bg-transparent text-gray-800 font-bold focus:outline-none cursor-pointer"
              />
              <span className="font-semibold text-gray-500 pl-1">To:</span>
              <input
                type="date"
                value={rangeTo}
                min={rangeFrom || undefined}
                onChange={(e) => setRangeTo(e.target.value)}
                className="bg-transparent text-gray-800 font-bold focus:outline-none cursor-pointer"
              />
            </div>
          )}

          {/* Filter Department */}
          <div className="flex items-center gap-2 text-xs text-gray-700 flex-1 sm:flex-none">
            <Building2 className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="font-semibold text-gray-500">Department:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="flex-1 sm:flex-none py-1.5 px-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-800 focus:outline-none focus:border-blue-600 cursor-pointer font-medium"
            >
              <option value="all">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Payout Estimate Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Daily Wage Payout Estimate */}
        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-600" /> Daily Wage Payout
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
              {dailyWageRecords.length} Staff
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold font-mono tabular-nums text-amber-950 mt-2">
            PKR {dailyWageTotalPayout.toLocaleString()}
          </div>
          <p className="text-[11px] text-amber-700/80 mt-1 font-medium">
            Estimated wage payout for {reportType === 'daily' ? 'selected date' : 'selected period'}
          </p>
        </div>

        {/* Monthly Staff Payout Estimate */}
        <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-blue-600" /> Monthly Staff Payout
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
              {monthlySalaryRecords.length} Staff
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold font-mono tabular-nums text-blue-950 mt-2">
            PKR {monthlySalaryTotalPayout.toLocaleString()}
          </div>
          <p className="text-[11px] text-blue-700/80 mt-1 font-medium">
            Estimated salary payout for {reportType === 'daily' ? 'selected date' : 'selected period'}
          </p>
        </div>

        {/* Combined Total Payout Estimate */}
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" /> Combined Grand Total
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
              {filteredRangeSummary.length} Staff
            </span>
          </div>
          <div className="text-xl md:text-2xl font-bold font-mono tabular-nums text-emerald-950 mt-2">
            PKR {grandTotalPayout.toLocaleString()}
          </div>
          <p className="text-[11px] text-emerald-700/80 mt-1 font-medium">
            Total net payout liability across all employees
          </p>
        </div>
      </div>

      {/* Payroll Summary View — Daily shows a single selected date, Monthly shows the From→To window.
          Both render the identical recomputed payroll table (server prorates counts + net pay). */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-xs">
        <div className="p-3.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-bold text-gray-800 text-xs">
            {reportType === 'daily' ? (
              <>Daily Payroll Summary — Date: <span className="font-mono tabular-nums text-blue-600">{selectedDate}</span></>
            ) : (
              <>Payroll Summary Report — Period: <span className="font-mono tabular-nums text-blue-600">{rangeFrom}</span> to <span className="font-mono tabular-nums text-blue-600">{rangeTo}</span></>
            )}
          </h3>
          {rangeLoading && <span className="text-[11px] text-gray-500 font-semibold animate-pulse">Recalculating…</span>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-700">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5 text-center w-12">#</th>
                <th className="p-3.5">Employee Name & ID</th>
                <th className="p-3.5">Department</th>
                <th className="p-3.5">Model</th>
                <th className="p-3.5">Working Days / Hours</th>
                <th className="p-3.5">Attendance / Hours</th>
                <th className="p-3.5">Gross Earnings</th>
                <th className="p-3.5">Absent Cuts</th>
                <th className="p-3.5">Bonus / Fine / Advance</th>
                <th className="p-3.5">Net Payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRangeSummary.map((p, idx) => (
                <tr key={p.id} className="hover:bg-blue-50/40 transition-colors">
                  <td className="p-3.5 text-center font-mono text-gray-500 font-bold text-xs">
                    {idx + 1}
                  </td>
                  <td className="p-3.5 font-bold text-gray-900">
                    {p.employee_name} <span className="font-mono text-blue-700 font-bold text-xs">({p.employee_code})</span>
                  </td>
                  <td className="p-3.5 text-gray-600 font-medium">{p.department}</td>
                  <td className="p-3.5">
                    {p.employment_type === 'daily_wage' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Daily Wage
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        Monthly
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 font-mono tabular-nums">
                    {p.employment_type === 'daily_wage' ? `${p.total_hours_worked ?? (p.days_present * 8)} hrs` : `${p.working_days} days`}
                  </td>
                  <td className="p-3.5 font-mono tabular-nums">
                    {p.employment_type === 'daily_wage' ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 font-bold text-xs">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        {(p.total_hours_worked ?? (p.days_present * 8))} Working Hours
                      </span>
                    ) : (
                      <>
                        <span className="text-emerald-600 font-bold">{p.days_present}P</span> / <span className="text-rose-600 font-bold">{p.days_absent}A</span> / <span className="text-blue-600 font-bold">{p.days_off ?? 0}Off</span> / <span className="text-amber-600 font-bold">{p.days_leave ?? 0}L</span>
                      </>
                    )}
                  </td>
                  <td className="p-3.5 font-semibold font-mono tabular-nums text-gray-800">PKR {p.gross_earnings.toLocaleString()}</td>
                  <td className="p-3.5 font-mono tabular-nums">
                    {p.employment_type === 'daily_wage' ? (
                      <span className="text-gray-400">--</span>
                    ) : (
                      <span className="font-bold text-rose-600">- PKR {p.absent_deductions.toLocaleString()}</span>
                    )}
                  </td>
                  <td className="p-3.5 font-mono tabular-nums text-xs">
                    {p.total_bonuses > 0 && <span className="text-emerald-600 font-bold">+{p.total_bonuses}</span>}
                    {p.total_bonuses > 0 && p.total_fines > 0 && <span> / </span>}
                    {p.total_fines > 0 && <span className="text-rose-600 font-bold">-{p.total_fines}</span>}
                    {(p.total_bonuses > 0 || p.total_fines > 0) && p.advance_deductions > 0 && <span> / </span>}
                    {p.advance_deductions > 0 && <span className="text-orange-600 font-bold">-{p.advance_deductions} <span className="text-gray-400 font-normal">adv</span></span>}
                    {p.total_bonuses === 0 && p.total_fines === 0 && p.advance_deductions === 0 && <span className="text-gray-400">--</span>}
                  </td>
                  <td className="p-3.5 font-bold text-blue-700 font-mono tabular-nums">
                    {p.net_payout === 0 && p.advance_deductions > p.gross_earnings ? (
                      <span title="Advance deductions exceed daily gross — remaining balance carries forward">
                        PKR 0 <span className="text-[10px] text-orange-600 font-normal">ⓘ</span>
                      </span>
                    ) : (
                      `PKR ${p.net_payout.toLocaleString()}`
                    )}
                  </td>
                </tr>
              ))}
              {!rangeLoading && filteredRangeSummary.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-gray-400 text-xs font-medium">
                    {reportType === 'daily'
                      ? 'No payroll data for this date. Pick another date above.'
                      : 'No payroll data for this period. Adjust the From / To dates above.'}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRangeSummary.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300 font-bold text-xs text-gray-800">
                <tr className="border-b border-gray-200">
                  <td colSpan={9} className="p-3 text-right uppercase text-[11px] text-amber-800 tracking-wider">
                    Daily Wage Total Payout ({dailyWageRecords.length} staff):
                  </td>
                  <td className="p-3 font-mono text-amber-800 text-right tabular-nums text-xs">
                    PKR {dailyWageTotalPayout.toLocaleString()}
                  </td>
                </tr>
                <tr className="border-b border-gray-200">
                  <td colSpan={9} className="p-3 text-right uppercase text-[11px] text-blue-800 tracking-wider">
                    Monthly Salary Total Payout ({monthlySalaryRecords.length} staff):
                  </td>
                  <td className="p-3 font-mono text-blue-800 text-right tabular-nums text-xs">
                    PKR {monthlySalaryTotalPayout.toLocaleString()}
                  </td>
                </tr>
                <tr className="bg-blue-50/80 text-blue-950 font-black">
                  <td colSpan={9} className="p-3.5 text-right uppercase text-xs tracking-wider">
                    Grand Total Net Payout ({filteredRangeSummary.length} Total Staff):
                  </td>
                  <td className="p-3.5 font-mono text-sm text-blue-700 text-right tabular-nums">
                    PKR {grandTotalPayout.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
