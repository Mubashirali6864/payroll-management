import React, { useState, useEffect } from 'react';
import { Employee, AttendanceRecord, PayrollRecord, EmployeeDocument, ShiftRule } from '../types';
import { printFormattedDocument, escapeHtml } from '../utils/printUtils';
import { authFetch } from '../auth/AuthContext';
import { 
  X, 
  User, 
  Clock, 
  CalendarCheck2, 
  DollarSign, 
  CheckCircle2, 
  Building2, 
  Phone, 
  Mail, 
  CreditCard,
  Briefcase,
  Printer,
  Paperclip,
  Download,
  Trash2,
  FileText,
  Upload,
  Calendar,
  UserCheck
} from 'lucide-react';
import { StatusChip } from './StatusChip';

const getMonthStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const formatMonthName = (monthStr: string): string => {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [y, m] = monthStr.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleString('default', { month: 'short', year: 'numeric' });
};

type PeriodFilter = 'this_month' | 'last_month' | 'all' | 'custom';

interface EmployeeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  shifts?: ShiftRule[];
  attendanceRecords: AttendanceRecord[];
  payrollRecord?: PayrollRecord;
  selectedMonth?: string;
  onEmployeeUpdated?: (updated: Employee) => void;
  onDeleteEmployee?: (id: string, force?: boolean) => void;
  onReactivate?: (employee: Employee) => void;
  userRole?: string;
}

export const EmployeeDetailModal: React.FC<EmployeeDetailModalProps> = ({
  isOpen,
  onClose,
  employee,
  shifts = [],
  attendanceRecords,
  payrollRecord,
  selectedMonth,
  onEmployeeUpdated,
  onDeleteEmployee,
  onReactivate,
  userRole
}) => {
  const [isReactivating, setIsReactivating] = useState(false);

  const handleReactivate = async () => {
    if (!employee) return;
    if (onReactivate) {
      onReactivate(employee);
      return;
    }
    if (!window.confirm(`Reactivate ${employee.name} (${employee.employee_code}) back to active status?`)) return;
    setIsReactivating(true);
    try {
      const res = await authFetch(`/api/employees/${employee.id}/reactivate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.employee && onEmployeeUpdated) {
          onEmployeeUpdated(data.employee);
        }
      }
    } catch (err) {
      console.error('Failed to reactivate employee:', err);
    } finally {
      setIsReactivating(false);
    }
  };

  const now = new Date();
  const currentCalendarMonth = getMonthStr(now);
  const thisMonth = selectedMonth || currentCalendarMonth;
  const [tYear, tMonth] = thisMonth.split('-').map(Number);
  const lastMonthDate = new Date(tYear, tMonth - 2, 1);
  const lastMonth = getMonthStr(lastMonthDate);

  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('this_month');
  const [customMonth, setCustomMonth] = useState<string>(thisMonth);
  const [periodPayroll, setPeriodPayroll] = useState<PayrollRecord | null>(payrollRecord || null);

  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState<string>('');
  // Full attendance history for THIS employee, fetched live from the attendance table.
  // The `attendanceRecords` prop only carries the currently-selected day (daily roster), which
  // is why the profile previously showed "1 Record". `null` = not yet loaded (fall back to prop).
  const [history, setHistory] = useState<AttendanceRecord[] | null>(null);

  useEffect(() => {
    if (!isOpen || !employee) {
      setDocuments([]);
      setCurrentPhoto('');
      setHistory(null);
      setSelectedPeriod('this_month');
      setPeriodPayroll(null);
      return;
    }
    setCurrentPhoto(employee.photo_url || '');
    fetchDocuments();
    fetchAttendanceHistory();
  }, [isOpen, employee]);

  // Keep the profile's aggregated counts in sync with the attendance table in real time.
  // `attendanceRecords` changes identity after any save (App re-runs loadData), so re-pull the
  // employee's full history whenever it does — this reflects bulk range entries immediately.
  useEffect(() => {
    if (isOpen && employee) fetchAttendanceHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceRecords]);

  const fetchAttendanceHistory = async () => {
    if (!employee) return;
    try {
      const res = await authFetch(`/api/attendance?employee_id=${employee.id}&all=true`);
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching employee attendance history:', err);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employee) return;
    setIsUploadingPhoto(true);

    try {
      const formData = new FormData();
      formData.append('picture', file);

      const res = await authFetch(`/api/employees/${employee.id}/profile-picture`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentPhoto(data.photo_url);
        if (onEmployeeUpdated) {
          onEmployeeUpdated({ ...employee, photo_url: data.photo_url });
        }
      }
    } catch (err) {
      console.error('Error uploading employee picture:', err);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const fetchDocuments = async () => {
    if (!employee) return;
    try {
      const res = await authFetch(`/api/employees/${employee.id}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (err) {
      console.error('Error fetching employee documents:', err);
    }
  };

  const handleUploadAdditionalDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!employee || !e.target.files || e.target.files.length === 0) return;
    setIsUploading(true);

    const formData = new FormData();
    Array.from(e.target.files).forEach((f: File) => formData.append('files', f));
    formData.append('document_type', 'verification');

    try {
      const res = await authFetch(`/api/employees/${employee.id}/documents`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        fetchDocuments();
      }
    } catch (err) {
      console.error('Upload document error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadDoc = async (doc: EmployeeDocument) => {
    if (!employee) return;
    try {
      const res = await authFetch(`/api/employees/${employee.id}/documents/${doc.id}/download`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        console.error('Download failed:', res.status);
      }
    } catch (err) {
      console.error('Download document error:', err);
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!employee || !window.confirm('Delete this attached document?')) return;
    try {
      const res = await authFetch(`/api/employees/${employee.id}/documents/${docId}`, {
        method: 'DELETE'
      });
      if (res.ok) fetchDocuments();
    } catch (err) {
      console.error('Delete document error:', err);
    }
  };

  const activeMonth = 
    selectedPeriod === 'this_month' ? thisMonth :
    selectedPeriod === 'last_month' ? lastMonth :
    selectedPeriod === 'custom' ? customMonth :
    null;

  useEffect(() => {
    if (!isOpen || !employee) {
      setPeriodPayroll(null);
      return;
    }

    if (!activeMonth) {
      setPeriodPayroll(payrollRecord || null);
      return;
    }

    if (payrollRecord && payrollRecord.period_month === activeMonth && payrollRecord.employee_id === employee.id) {
      setPeriodPayroll(payrollRecord);
      return;
    }

    let isSubscribed = true;
    authFetch(`/api/payroll/records?month=${activeMonth}`)
      .then(res => res.ok ? res.json() : [])
      .then((records: PayrollRecord[]) => {
        if (isSubscribed) {
          const found = records.find(r => r.employee_id === employee.id);
          setPeriodPayroll(found || null);
        }
      })
      .catch(err => {
        console.error('Error fetching payroll for period:', err);
      });

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, employee?.id, activeMonth, payrollRecord]);

  if (!isOpen || !employee) return null;

  // Prefer the live, full-history fetch (`history`); fall back to the daily-roster prop only while
  // it's still loading (`null`).
  const sourceRecords = history ?? attendanceRecords;
  const allEmpRecords = sourceRecords.filter(a => a.employee_id === employee.id);
  const assignedShift = shifts.find(s => s.id === employee.shift_id);

  const thisMonthCount = allEmpRecords.filter(a => a.date && a.date.startsWith(thisMonth)).length;
  const lastMonthCount = allEmpRecords.filter(a => a.date && a.date.startsWith(lastMonth)).length;

  const empRecords = activeMonth 
    ? allEmpRecords.filter(a => a.date && a.date.startsWith(activeMonth))
    : allEmpRecords;

  const periodTitle = 
    selectedPeriod === 'this_month' ? `This Month (${formatMonthName(thisMonth)})` :
    selectedPeriod === 'last_month' ? `Last Month (${formatMonthName(lastMonth)})` :
    selectedPeriod === 'custom' ? `Month of ${formatMonthName(customMonth)}` :
    'All Time Records';

  // Determine calendar and per-day rate
  const [activeYear, activeMonthNum] = activeMonth
    ? activeMonth.split('-').map(Number)
    : [now.getFullYear(), now.getMonth() + 1];
  const daysInMonth = activeMonth ? new Date(activeYear, activeMonthNum, 0).getDate() : 30;
  const perDayRate = employee.employment_type === 'monthly_salary'
    ? (daysInMonth > 0 ? Math.round(employee.base_salary / daysInMonth) : Math.round(employee.base_salary / 30))
    : employee.base_salary;

  // Track off dates configured for this employee
  const customOffSet = new Set(
    String(employee.custom_off_dates ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
  );
  const weeklyOffStr = String(employee.weekly_off_day || '').trim();
  const weeklyOffSet = new Set(
    weeklyOffStr
      ? weeklyOffStr
          .split(',')
          .map(s => s.trim())
          .filter(s => s !== '' && !isNaN(Number(s)))
          .map(Number)
      : []
  );

  // Compute key metrics for this employee within the selected period
  const daysPresent = empRecords.filter(a => a.status === 'present' || a.status === 'late').length;
  const halfDays = empRecords.filter(a => a.status === 'half_day').length;
  const explicitOffDays = empRecords.filter(a => a.status === 'weekly_off').length;
  const daysLeave = empRecords.filter(a => a.status === 'leave').length;
  const daysAbsent = empRecords.filter(a => a.status === 'absent').length;

  // If weekly off days were explicitly logged in attendance (standard in range entry and status dropdown),
  // use that count directly. If not explicitly logged (e.g. biometric terminal only punches on work days),
  // infer off days that occurred within the active recorded attendance date span [minDate..maxDate].
  let daysOff = explicitOffDays;
  if (daysOff === 0 && empRecords.length > 0) {
    const dates = empRecords.map(r => r.date).filter(Boolean).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];
    if (minDate && maxDate) {
      const recordedSet = new Set(dates);
      const [startY, startM, startD] = minDate.split('-').map(Number);
      const [endY, endM, endD] = maxDate.split('-').map(Number);
      const curr = new Date(startY, startM - 1, startD);
      const end = new Date(endY, endM - 1, endD);
      while (curr <= end) {
        const yStr = curr.getFullYear();
        const mStr = String(curr.getMonth() + 1).padStart(2, '0');
        const dStr = String(curr.getDate()).padStart(2, '0');
        const dtStr = `${yStr}-${mStr}-${dStr}`;
        const dayOfWeek = curr.getDay();
        if (!recordedSet.has(dtStr)) {
          if (customOffSet.has(dtStr) || weeklyOffSet.has(dayOfWeek)) {
            daysOff++;
          }
        }
        curr.setDate(curr.getDate() + 1);
      }
    }
  }

  const daysLate = empRecords.filter(a => a.status === 'late' || (a.late_minutes && a.late_minutes > 0)).length;
  const totalLateMinutes = empRecords.reduce((sum, a) => sum + (a.late_minutes || 0), 0);
  const totalHoursWorked = empRecords.reduce((sum, a) => sum + (a.hours_worked || 0), 0);

  // Day-wise payout calculation:
  // For monthly employees: paid for worked days (present + 0.5 half day) PLUS paid off days (+ leaves), but NOT absent.
  // For daily wage employees: paid for worked days only.
  const payableDays = employee.employment_type === 'monthly_salary'
    ? (daysPresent + (0.5 * halfDays) + daysOff + daysLeave)
    : (daysPresent + (0.5 * halfDays));

  const daysGross = Math.round(payableDays * perDayRate);

  const totalBonuses = periodPayroll?.total_bonuses || 0;
  const totalFines = periodPayroll?.total_fines || 0;
  const advanceDeductions = periodPayroll?.advance_deductions || 0;
  const netPayout = Math.max(0, daysGross + totalBonuses - totalFines - advanceDeductions);

  const payoutSubtitle = employee.employment_type === 'monthly_salary'
    ? `${payableDays} payable days (${daysPresent} present + ${daysOff} off) × PKR ${Math.round(perDayRate).toLocaleString()}/day`
      + (daysAbsent > 0 ? ` • ${daysAbsent} absent (unpaid)` : '')
      + ((totalBonuses > 0 || totalFines > 0 || advanceDeductions > 0)
          ? ` • Adj: +PKR ${totalBonuses.toLocaleString()} / -PKR ${(totalFines + advanceDeductions).toLocaleString()}`
          : '')
    : `${payableDays} days worked × PKR ${employee.base_salary.toLocaleString()}/day`
      + (daysAbsent > 0 ? ` • ${daysAbsent} absent` : '')
      + ((totalBonuses > 0 || totalFines > 0 || advanceDeductions > 0)
          ? ` • Adj: +PKR ${totalBonuses.toLocaleString()} / -PKR ${(totalFines + advanceDeductions).toLocaleString()}`
          : '');

  const handlePrintLedger = () => {
    const payoutAmount = netPayout;

    const attRows = empRecords.length === 0
      ? `<tr><td colspan="8" style="text-align: center; padding: 24px; color: #94a3b8; font-style: italic; font-family: sans-serif;">No attendance records logged for ${escapeHtml(employee.name)} in ${escapeHtml(periodTitle.toLowerCase())}.</td></tr>`
      : empRecords.map(rec => {
          const lateBadge = rec.late_minutes > 0
            ? `<span style="color: #b45309; font-weight: 700; background: #fef3c7; padding: 1px 5px; border-radius: 4px; border: 1px solid #fde68a;">+${rec.late_minutes} mins</span>`
            : (rec.status === 'present' && rec.check_in_time)
              ? `<span style="color: #047857; font-weight: 600;">On Time</span>`
              : (rec.status === 'late')
                ? `<span style="color: #b45309; font-weight: 600;">Late</span>`
                : `<span style="color: #94a3b8;">--</span>`;

          const statusBadge = rec.status === 'present'
            ? `<span class="badge bg-emerald">Present</span>`
            : rec.status === 'late'
              ? `<span class="badge bg-blue">Late</span>`
              : rec.status === 'absent'
                ? `<span class="badge bg-rose">Absent</span>`
                : `<span class="badge" style="background: #f1f5f9; color: #475569;">${escapeHtml(rec.status)}</span>`;

          const remarks = rec.override_reason
            ? `<span style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">${escapeHtml(rec.override_reason)}</span>`
            : `<span style="color: #94a3b8;">--</span>`;

          const source = rec.is_manual_override
            ? `Manual Override${rec.override_by ? ` (${escapeHtml(rec.override_by)})` : ''}`
            : 'ZKTeco ADMS Terminal';

          return `
            <tr>
              <td style="padding: 8px 10px; font-weight: 700; color: #1e293b; font-family: monospace;">${escapeHtml(rec.date)}</td>
              <td style="padding: 8px 10px; font-family: monospace;">${escapeHtml(rec.check_in_time || '--:--')}</td>
              <td style="padding: 8px 10px; font-family: monospace;">${escapeHtml(rec.check_out_time || '--:--')}</td>
              <td style="padding: 8px 10px; font-weight: 700; font-family: monospace;">${rec.hours_worked > 0 ? `${rec.hours_worked} hrs` : '--'}</td>
              <td style="padding: 8px 10px; font-family: monospace;">${lateBadge}</td>
              <td style="padding: 8px 10px;">${statusBadge}</td>
              <td style="padding: 8px 10px;">${remarks}</td>
              <td style="padding: 8px 10px; font-size: 10px; color: #64748b;">${source}</td>
            </tr>
          `;
        }).join('');

    const content = `
      <div class="a5-container" style="font-family: 'Inter', system-ui, -apple-system, sans-serif; width: 100%; max-width: 148mm; margin: 0 auto; box-sizing: border-box;">
      <div class="doc-title" style="text-align: center; font-size: 18px; font-weight: 900; color: #0f172a; margin-bottom: 4px; letter-spacing: -0.02em;">
        EMPLOYEE COMPREHENSIVE PROFILE & ATTENDANCE LEDGER
      </div>
      <div style="text-align: center; font-size: 12px; font-weight: 700; color: #2563eb; margin-bottom: 20px;">
        Active Filter Period: <strong>${escapeHtml(periodTitle)}</strong>
      </div>

      <!-- Employee Profile Header Box -->
      <div style="border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; padding: 16px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
          <div>
            <div style="font-size: 18px; font-weight: 800; color: #0f172a;">
              ${escapeHtml(employee.name)} 
              <span style="font-family: monospace; color: #1d4ed8; font-weight: 700; font-size: 15px;">(${escapeHtml(employee.employee_code)})</span>
              <span class="badge ${employee.status === 'active' ? 'bg-emerald' : 'bg-rose'}" style="margin-left: 8px; font-size: 9px; vertical-align: middle;">
                ${escapeHtml(employee.status || 'Active')}
              </span>
            </div>
            <div style="font-size: 12px; color: #475569; margin-top: 4px; font-weight: 500;">
              <strong>${escapeHtml(employee.designation)}</strong> • ${escapeHtml(employee.department)} • 
              <span style="color: #1d4ed8; font-weight: 600;">${assignedShift ? escapeHtml(assignedShift.name) : 'Standard Morning Shift'}</span> • 
              Joined: <strong style="font-family: monospace;">${escapeHtml(employee.joining_date)}</strong>
            </div>
          </div>
          <div style="text-align: right; background: #ffffff; padding: 8px 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
            <div style="font-size: 9px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Compensation Model</div>
            <div style="font-size: 12px; font-weight: 700; color: #1d4ed8; text-transform: capitalize; margin-top: 2px;">
              ${escapeHtml(employee.employment_type === 'monthly_salary' ? 'Monthly Fixed Salary' : 'Daily Wage Rate')}
            </div>
            <div style="font-size: 14px; font-weight: 800; font-family: monospace; color: #0f172a; margin-top: 2px;">
              PKR ${employee.base_salary.toLocaleString()} <span style="font-size: 10px; font-weight: 500; color: #64748b;">${employee.employment_type === 'monthly_salary' ? '/ mo' : '/ day'}</span>
            </div>
            ${employee.employment_type === 'monthly_salary' ? `
              <div style="font-family: monospace; font-size: 10px; color: #64748b; margin-top: 1px;">
                ≈ PKR ${Math.round(perDayRate).toLocaleString()} / day (${daysInMonth}d)
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Contact & Bank Payout Details Grid -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 11px; color: #475569;">
          <div>Email: <strong style="color: #0f172a;">${escapeHtml(employee.email || 'N/A')}</strong></div>
          <div>Phone: <strong style="color: #0f172a;">${escapeHtml(employee.phone || 'N/A')}</strong></div>
          <div>CNIC: <strong style="color: #0f172a; font-family: monospace;">${escapeHtml(employee.cnic || 'N/A')}</strong></div>
          <div style="grid-column: span 3; border-top: 1px dashed #cbd5e1; padding-top: 8px; margin-top: 2px;">
            Bank Account: <strong style="color: #0f172a;">${escapeHtml(employee.bank_name || 'Meezan Bank')} — <span style="font-family: monospace; color: #1d4ed8;">${escapeHtml(employee.account_number || '010203040506')}</span></strong>
          </div>
        </div>
      </div>

      <!-- Key Metrics Cards Grid (4 columns) -->
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
        <!-- Days Present / Working Hours -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px;">
          <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">
            ${employee.employment_type === 'daily_wage' ? 'Working Hours' : 'Days Present & Offs'}
          </div>
          <div style="font-size: 17px; font-weight: 800; color: #0f172a; font-family: monospace; margin-top: 2px;">
            ${employee.employment_type === 'daily_wage' ? `${totalHoursWorked.toFixed(1)} hrs` : `${daysPresent} Days <span style="font-size: 11px; color: #2563eb;">(+${daysOff} Off)</span>`}
          </div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
            ${employee.employment_type === 'monthly_salary'
              ? `${payableDays} Total Payable Days (${daysPresent} Present + ${daysOff} Off)`
              : `${totalHoursWorked.toFixed(1)} Working Hours logged`}
          </div>
        </div>

        <!-- Late Check-Ins -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px;">
          <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #b45309; letter-spacing: 0.05em;">
            Late Check-Ins
          </div>
          <div style="font-size: 17px; font-weight: 800; color: #b45309; font-family: monospace; margin-top: 2px;">
            ${daysLate} Times
          </div>
          <div style="font-size: 10px; color: #d97706; font-weight: 600; font-family: monospace; margin-top: 2px;">
            Total ${totalLateMinutes} mins late
          </div>
        </div>

        <!-- Total Hours -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px;">
          <div style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em;">
            Total Hours
          </div>
          <div style="font-size: 17px; font-weight: 800; color: #0f172a; font-family: monospace; margin-top: 2px;">
            ${totalHoursWorked.toFixed(1)} hrs
          </div>
          <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
            Biometric terminal time
          </div>
        </div>

        <!-- Net Salary Payout -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: #1d4ed8; letter-spacing: 0.05em;">
              Net Salary Payout (Day-Wise)
            </span>
            ${periodPayroll ? `<span class="badge ${periodPayroll.status === 'paid' ? 'bg-emerald' : periodPayroll.status === 'approved' ? 'bg-blue' : 'bg-rose'}" style="font-size: 8px; padding: 1px 5px;">${periodPayroll.status}</span>` : ''}
          </div>
          <div style="font-size: 17px; font-weight: 800; color: #1d4ed8; font-family: monospace; margin-top: 2px;">
            PKR ${payoutAmount.toLocaleString()}
          </div>
          <div style="font-size: 9px; color: #64748b; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(payoutSubtitle)}">
            ${escapeHtml(payoutSubtitle)}
          </div>
        </div>
      </div>

      <!-- Attendance History Log Table -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px; margin-bottom: 8px;">
        <div style="font-size: 13px; font-weight: 800; color: #0f172a;">
          Attendance History Log (${escapeHtml(periodTitle)})
        </div>
        <div style="font-size: 11px; color: #64748b; font-family: monospace;">
          ${empRecords.length} ${empRecords.length === 1 ? 'Record' : 'Records'} Found
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
        <thead>
          <tr style="background: #f1f5f9; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em;">
            <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Date</th>
            <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Check-In</th>
            <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Check-Out</th>
            <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Hours Worked</th>
            <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Late Delay</th>
            <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Status</th>
            <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Remarks / Reason</th>
            <th style="padding: 8px 10px; border-bottom: 2px solid #cbd5e1;">Source</th>
          </tr>
        </thead>
        <tbody>
          ${attRows}
        </tbody>
      </table>
      </div>
    `;

    printFormattedDocument(`Ledger_${employee.name.replace(/\s+/g, '_')}_${employee.employee_code}_${activeMonth || 'all'}`, content, { pageSize: 'A5' });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-gray-200 rounded-xl w-full max-w-4xl p-6 sm:p-7 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto space-y-5 text-gray-800 animate-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors cursor-pointer border border-gray-300"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Top Profile Header */}
        <div className="flex flex-wrap items-center gap-5 border-b border-gray-200 pb-5">
          <div className="relative group">
            <img
              src={currentPhoto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}
              alt={employee.name}
              className="w-16 h-16 rounded-full object-cover border-2 border-blue-600 shadow-xs"
            />
            <label className="absolute inset-0 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity text-[9px] font-bold">
              <Upload className="w-4 h-4 mb-0.5" />
              <span>{isUploadingPhoto ? '...' : 'Change'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handlePhotoUpload}
                disabled={isUploadingPhoto}
                className="hidden"
              />
            </label>
          </div>

          <div className="flex-1 min-w-[240px]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 font-heading tracking-tight">
                {employee.name} <span className="font-mono text-blue-700 font-bold text-lg">({employee.employee_code})</span>
              </h2>
              <StatusChip
                status={employee.status === 'inactive' ? 'offline' : 'online'}
                label={employee.status === 'inactive' ? 'Ex-Staff' : (employee.status || 'Active')}
                size="sm"
              />
            </div>

            <p className="text-xs text-gray-500 font-medium mt-1 flex items-center gap-2.5 flex-wrap">
              <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5 text-gray-400" /> {employee.designation}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5 text-gray-400" /> {employee.department}</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-blue-700 font-semibold"><Clock className="w-3.5 h-3.5 text-blue-600" /> {assignedShift ? assignedShift.name : 'Standard Shift'}</span>
              <span>•</span>
              <span>Joined: <strong className="font-mono text-gray-700">{employee.joining_date}</strong></span>
              {employee.status === 'inactive' && employee.exit_date && (
                <>
                  <span>•</span>
                  <span className="text-rose-700 font-semibold">Left: <strong className="font-mono">{employee.exit_date}</strong>{employee.exit_reason ? ` (${employee.exit_reason})` : ''}</span>
                </>
              )}
            </p>
          </div>

          <div className="bg-gray-50 p-3 rounded-lg text-right text-xs border border-gray-200">
            <p className="text-gray-500 font-bold uppercase text-[10px] tracking-wider">Compensation Model</p>
            <p className="font-bold text-blue-700 capitalize mt-0.5">
              {employee.employment_type === 'monthly_salary' ? 'Monthly Fixed Salary' : 'Daily Wage Rate'}
            </p>
            <p className="font-mono font-bold text-gray-900 text-base mt-0.5 tabular-nums">
              PKR {employee.base_salary.toLocaleString()} <span className="text-[10px] text-gray-500 font-sans">{employee.employment_type === 'monthly_salary' ? '/ mo' : '/ day'}</span>
            </p>
            {employee.employment_type === 'monthly_salary' && (
              <p className="text-[10px] text-gray-500 font-mono mt-0.5 tabular-nums">
                ≈ PKR {Math.round(perDayRate).toLocaleString()} / day ({daysInMonth}d)
              </p>
            )}
          </div>
        </div>

        {/* Ex-Staff / Inactive Alert Banner */}
        {employee.status === 'inactive' && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-amber-900 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
              <div>
                <p className="font-bold text-amber-950">Ex-Staff / Inactive Employee Record</p>
                <p className="text-amber-800 text-[11px] mt-0.5">
                  This employee is marked as left or inactive{employee.exit_date ? ` as of ${employee.exit_date}` : ''}. All historical attendance, payroll logs, and documents are preserved.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isReactivating}
              onClick={handleReactivate}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <UserCheck className="w-3.5 h-3.5" />
              {isReactivating ? 'Reactivating...' : 'Reactivate Employee'}
            </button>
          </div>
        )}

        {/* Period / Date Filter Bar */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-900">Period Filter</span>
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {periodTitle}
                </span>
              </div>
              <p className="text-[11px] text-gray-500">
                Switch between this and last month data for attendance, hours, and payout
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Filter Segmented Buttons */}
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-white shadow-2xs">
              <button
                type="button"
                onClick={() => setSelectedPeriod('this_month')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedPeriod === 'this_month'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title={`Filter to current month (${formatMonthName(thisMonth)})`}
              >
                <span>This Month</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                  selectedPeriod === 'this_month' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {formatMonthName(thisMonth)}
                  {thisMonthCount > 0 ? ` (${thisMonthCount})` : ''}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPeriod('last_month')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedPeriod === 'last_month'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title={`Filter to previous month (${formatMonthName(lastMonth)})`}
              >
                <span>Last Month</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                  selectedPeriod === 'last_month' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {formatMonthName(lastMonth)}
                  {lastMonthCount > 0 ? ` (${lastMonthCount})` : ''}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPeriod('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedPeriod === 'all'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title="Show all recorded attendance records"
              >
                <span>All Records</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                  selectedPeriod === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {allEmpRecords.length}
                </span>
              </button>
            </div>

            {/* Custom Month Picker */}
            <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs border transition-colors ${
              selectedPeriod === 'custom' 
                ? 'bg-blue-50 border-blue-400 text-blue-900' 
                : 'bg-white border-gray-300 text-gray-700 shadow-2xs'
            }`}>
              <span className="text-[11px] text-gray-500 font-medium">Other:</span>
              <input
                type="month"
                value={customMonth}
                onChange={(e) => {
                  if (e.target.value) {
                    setCustomMonth(e.target.value);
                    setSelectedPeriod('custom');
                  }
                }}
                className="text-xs font-mono bg-transparent focus:outline-none cursor-pointer"
                title="Select any custom month"
              />
            </div>
          </div>
        </div>

        {/* Key Metrics Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600 flex items-center justify-between">
              <span className="flex items-center gap-1">
                {employee.employment_type === 'daily_wage' ? (
                  <>
                    <Clock className="w-3.5 h-3.5 text-amber-600" /> Working Hours
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Days Present & Offs
                  </>
                )}
              </span>
              {employee.employment_type !== 'daily_wage' && daysOff > 0 && (
                <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[9px] px-1.5 py-0.5 rounded font-bold">
                  {daysOff} Off
                </span>
              )}
            </span>
            <p className="text-xl font-bold text-gray-900 font-mono tabular-nums">
              {employee.employment_type === 'daily_wage' ? (
                `${totalHoursWorked.toFixed(1)} hrs`
              ) : (
                <>{daysPresent} Days <span className="text-xs font-semibold text-blue-700 font-sans">(+{daysOff} Off)</span></>
              )}
            </p>
            <p className="text-[10px] text-gray-600 font-medium">
              {employee.employment_type === 'monthly_salary'
                ? `${payableDays} Total Payable Days (${daysPresent} Present + ${daysOff} Off)`
                : `${totalHoursWorked.toFixed(1)} Working Hours logged`}
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-600" /> Late Check-Ins
            </span>
            <p className="text-xl font-bold text-amber-700 font-mono tabular-nums">{daysLate} Times</p>
            <p className="text-[10px] text-amber-600 font-bold font-mono tabular-nums">
              Total {totalLateMinutes} mins late
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
              <CalendarCheck2 className="w-3.5 h-3.5 text-blue-600" /> Total Hours
            </span>
            <p className="text-xl font-bold text-gray-900 font-mono tabular-nums">{totalHoursWorked.toFixed(1)} hrs</p>
            <p className="text-[10px] text-gray-500">Biometric terminal time</p>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3.5 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-blue-600" /> Net Salary Payout
              </span>
              {periodPayroll ? (
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                  periodPayroll.status === 'paid' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' :
                  periodPayroll.status === 'approved' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                  'bg-amber-100 text-amber-800 border border-amber-300'
                }`}>
                  {periodPayroll.status}
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold uppercase bg-blue-100 text-blue-800 border border-blue-300">
                  Day-Wise
                </span>
              )}
            </span>
            <p className="text-xl font-bold text-blue-700 font-mono tabular-nums">
              PKR {netPayout.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-500 font-medium truncate" title={payoutSubtitle}>
              {payoutSubtitle}
            </p>
          </div>
        </div>

        {/* Contact & Banking Information */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs space-y-2.5">
          <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" /> Contact & Bank Payout Details
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-gray-600 pt-1">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-gray-400 shrink-0" />
              <span>Email: <strong className="text-gray-900">{employee.email}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-gray-400 shrink-0" />
              <span>Phone: <strong className="text-gray-900">{employee.phone}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-gray-400 shrink-0" />
              <span>CNIC: <strong className="font-mono text-gray-900 tabular-nums">{employee.cnic}</strong></span>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <CreditCard className="w-4 h-4 text-gray-400 shrink-0" />
              <span>Bank Account: <strong className="text-gray-900">{employee.bank_name || 'Meezan Bank'} — <span className="font-mono tabular-nums text-blue-700">{employee.account_number || '010203040506'}</span></strong></span>
            </div>
          </div>
        </div>

        {/* Attached Verification Documents */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-blue-600" /> Attached Employee Documents ({documents.length})
            </h4>

            <label className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-300 rounded text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer shadow-2xs">
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploading ? 'Uploading...' : 'Attach New File'}</span>
              <input
                type="file"
                multiple
                disabled={isUploading}
                onChange={handleUploadAdditionalDoc}
                accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                className="hidden"
              />
            </label>
          </div>

          {documents.length === 0 ? (
            <p className="text-gray-400 text-xs py-2">
              No attached documents uploaded for this employee (e.g. Joining Letter, CNIC copy, Degrees). Click "Attach New File" above to upload.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 text-xs truncate max-w-[180px] sm:max-w-[220px]" title={doc.file_name}>
                        {doc.file_name}
                      </p>
                      <p className="text-[10px] text-gray-400 font-mono">
                        {doc.uploaded_at.split('T')[0]}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleDownloadDoc(doc)}
                      className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Download File"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteDoc(doc.id)}
                      className="p-1.5 rounded text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete File"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attendance History Log Table with Remarks */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
              <CalendarCheck2 className="w-4 h-4 text-blue-600" /> Attendance History Log
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                {periodTitle}
              </span>
            </h3>
            <span className="text-xs text-gray-500 font-mono tabular-nums">
              {empRecords.length} {empRecords.length === 1 ? 'Record' : 'Records'} Found
            </span>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto bg-white">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Check-In</th>
                  <th className="p-3">Check-Out</th>
                  <th className="p-3">Hours Worked</th>
                  <th className="p-3">Late Delay</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Remarks / Reason</th>
                  <th className="p-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-mono text-xs">
                {empRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-gray-400 font-sans">
                      No attendance records logged for {employee.name} in {periodTitle.toLowerCase()}.
                    </td>
                  </tr>
                ) : (
                  empRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="p-3 font-bold text-gray-800 tabular-nums">{rec.date}</td>
                      <td className="p-3 font-semibold text-gray-700 tabular-nums">
                        {rec.check_in_time || '--:--'}
                      </td>
                      <td className="p-3 font-semibold text-gray-700 tabular-nums">
                        {rec.check_out_time || '--:--'}
                      </td>
                      <td className="p-3 font-bold text-gray-800 tabular-nums">
                        {rec.hours_worked > 0 ? `${rec.hours_worked} hrs` : '--'}
                      </td>
                      <td className="p-3 font-bold tabular-nums">
                        {rec.late_minutes > 0 ? (
                          <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            +{rec.late_minutes} mins
                          </span>
                        ) : (rec.status === 'present' && rec.check_in_time) ? (
                          <span className="text-emerald-700 font-medium font-sans">On Time</span>
                        ) : (rec.status === 'late') ? (
                          <span className="text-amber-700 font-medium font-sans">Late</span>
                        ) : (
                          <span className="text-gray-400 font-normal font-sans">--</span>
                        )}
                      </td>
                      <td className="p-3 font-sans">
                        <StatusChip
                          status={rec.status as any}
                          label={rec.status}
                          time={rec.check_in_time || undefined}
                          size="sm"
                        />
                      </td>
                      <td className="p-3 font-sans">
                        {rec.override_reason ? (
                          <div className="flex items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                              <FileText className="w-3 h-3 text-blue-600 shrink-0" />
                              {rec.override_reason}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                      <td className="p-3 text-[11px] font-sans text-gray-500">
                        {rec.is_manual_override ? `Manual Override${rec.override_by ? ` (${rec.override_by})` : ''}` : 'ZKTeco ADMS Terminal'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintLedger}
              className="px-3.5 py-2 rounded-md text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-2 border border-gray-300 transition-all cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4 text-gray-600" /> Print Complete PDF Ledger
            </button>
            {userRole === 'super_admin' && employee && onDeleteEmployee && (
              <button
                onClick={() => {
                  onDeleteEmployee(employee.id, true);
                  onClose();
                }}
                className="px-3 py-2 rounded-md text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center gap-1.5 border border-rose-200 transition-all cursor-pointer active:scale-95"
                title="Delete Employee Record (Requires Admin Password Confirmation)"
              >
                <Trash2 className="w-4 h-4 text-rose-600" /> Delete Employee
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-md text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer active:scale-95"
          >
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
};
