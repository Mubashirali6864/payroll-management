import React, { useState, useEffect } from 'react';
import { PayrollRecord, PayrollAdjustment, Employee } from '../types';
import { printFormattedDocument, escapeHtml } from '../utils/printUtils';
import { authFetch } from '../auth/AuthContext';
import { 
  DollarSign, 
  Calculator, 
  Printer, 
  Plus, 
  FileText, 
  Calendar, 
  X, 
  TrendingDown, 
  CreditCard,
  Lock,
  Unlock,
  CheckCircle,
  AlertCircle,
  Trash2,
  Loader2,
  Search,
  Users,
  Briefcase,
  Download,
  CheckSquare,
  Square,
  Table,
  FileDown,
  Clock
} from 'lucide-react';

export const getDaysInMonth = (monthStr?: string): number => {
  if (!monthStr || typeof monthStr !== 'string' || !monthStr.includes('-')) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  }
  const [y, m] = monthStr.split('-').map(Number);
  if (!y || !m || isNaN(y) || isNaN(m)) return 30;
  return new Date(y, m, 0).getDate();
};

interface PayrollViewProps {
  payrollRecords: PayrollRecord[];
  employees?: Employee[];
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  onCalculatePayroll: (month: string) => void;
  onAddAdjustment: (data: { employee_id: string; month: string; type: string; amount: number; description: string }) => void;
  onUpdatePayrollStatus?: (month: string, status: 'draft' | 'approved' | 'paid') => void | Promise<void>;
  onDeleteDraftPayroll?: (month: string) => void | Promise<void>;
  userRole: string;
}

export const PayrollView: React.FC<PayrollViewProps> = ({
  payrollRecords,
  employees = [],
  selectedMonth,
  onMonthChange,
  onCalculatePayroll,
  onAddAdjustment,
  onUpdatePayrollStatus,
  onDeleteDraftPayroll,
  userRole
}) => {
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollRecord | null>(null);
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjEmployeeId, setAdjEmployeeId] = useState('');
  const [loadingPayslip, setLoadingPayslip] = useState(false);
  const [isDeletingDraft, setIsDeletingDraft] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(null);

  const showNotice = (text: string, type: 'error' | 'success' | 'info' = 'info') => {
    setNoticeMsg({ text, type });
    setTimeout(() => setNoticeMsg(null), 5000);
  };

  const isPaid = payrollRecords.length > 0 && payrollRecords.some(r => r.status === 'paid');
  const isApproved = !isPaid && payrollRecords.length > 0 && payrollRecords.some(r => r.status === 'approved');
  const periodStatus: 'paid' | 'approved' | 'draft' = isPaid ? 'paid' : isApproved ? 'approved' : 'draft';
  const isLocked = isPaid || isApproved;

  // Individual Adjustments for the Selected Payslip (Bug #10 Fix)
  const [payslipAdjustments, setPayslipAdjustments] = useState<PayrollAdjustment[]>([]);

  // Company Logo
  const [companyLogo, setCompanyLogo] = useState<string>('');

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

  // Adjustment Form State
  const [adjForm, setAdjForm] = useState({
    type: 'bonus',
    amount: 5000,
    description: 'Performance Bonus'
  });

  // Employment Model Switch & Search Filter
  const [modelFilter, setModelFilter] = useState<'all' | 'monthly_salary' | 'daily_wage'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Top Sub-Tab Navigation & Batch Selection States
  const [payrollSubTab, setPayrollSubTab] = useState<'register' | 'all_payslips'>('register');
  const [isCompilingBatch, setIsCompilingBatch] = useState(false);
  const [selectedBatchEmpIds, setSelectedBatchEmpIds] = useState<Set<string>>(new Set());

  const monthlyRecords = payrollRecords.filter(r => r.employment_type === 'monthly_salary');
  const dailyRecords = payrollRecords.filter(r => r.employment_type === 'daily_wage');
  const monthlyCount = monthlyRecords.length;
  const dailyCount = dailyRecords.length;
  const monthlyPayout = monthlyRecords.reduce((sum, r) => sum + r.net_payout, 0);
  const dailyPayout = dailyRecords.reduce((sum, r) => sum + r.net_payout, 0);

  const filteredRecords = payrollRecords.filter(r => {
    if (modelFilter !== 'all' && r.employment_type !== modelFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = r.employee_name?.toLowerCase().includes(q);
      const matchCode = r.employee_code?.toLowerCase().includes(q);
      const matchDept = r.department?.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchDept) return false;
    }
    return true;
  });

  const totalGross = filteredRecords.reduce((sum, r) => sum + r.gross_earnings, 0);
  // Only monthly_salary staff have absent days actually deducted from a full salary. For daily_wage,
  // gross is already Present Days × Daily Wage, so `absent_deductions` is informational only and must
  // NOT be summed here — otherwise the banner double-counts and Gross − Deductions ≠ Net Payout.
  const totalDeductions = filteredRecords.reduce((sum, r) => {
    const absentCut = r.employment_type === 'monthly_salary' ? r.absent_deductions : 0;
    return sum + absentCut + r.total_fines + r.advance_deductions;
  }, 0);

  // Daily wage staff are paid daily in cash upon shift completion. Their month-end pending payout is 0.
  // Month-end bank transfer net payout only includes monthly staff.
  const totalPayout = filteredRecords.reduce((sum, r) => {
    if (r.employment_type === 'daily_wage') return sum;
    return sum + r.net_payout;
  }, 0);

  const totalDailyCleared = filteredRecords
    .filter(r => r.employment_type === 'daily_wage')
    .reduce((sum, r) => sum + r.gross_earnings, 0);

  // Fetch individual adjustment line items whenever selected payslip OR payrollRecords change
  useEffect(() => {
    if (!selectedPayslip) {
      setPayslipAdjustments([]);
      return;
    }

    // Keep selectedPayslip in sync with payrollRecords (new object after recalculation)
    const updatedRecord = payrollRecords.find(r => r.employee_id === selectedPayslip.employee_id && r.period_month === selectedPayslip.period_month);
    if (updatedRecord && updatedRecord !== selectedPayslip) {
      setSelectedPayslip(updatedRecord);
    }

    const fetchAdjustments = async () => {
      try {
        const res = await authFetch(`/api/payroll/adjustments?employee_id=${selectedPayslip.employee_id}&month=${selectedPayslip.period_month}`);
        if (res.ok) {
          const data = await res.json();
          setPayslipAdjustments(data);
        }
      } catch (err) {
        console.error('Error fetching adjustments for payslip:', err);
      }
    };

    fetchAdjustments();
  }, [selectedPayslip, payrollRecords]);

  const handleOpenPayslip = async (record: PayrollRecord) => {
    setLoadingPayslip(true);
    try {
      const res = await authFetch(`/api/payroll/adjustments?employee_id=${record.employee_id}&month=${record.period_month}`);
      if (res.ok) {
        const data = await res.json();
        setPayslipAdjustments(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching adjustments for payslip:', err);
    } finally {
      setSelectedPayslip(record);
      setLoadingPayslip(false);
    }
  };

  const handleOpenAdjModal = (empId: string) => {
    if (isLocked) {
      showNotice(`Cannot add adjustments to a ${periodStatus.toUpperCase()} period.`, 'error');
      return;
    }
    setAdjEmployeeId(empId);
    setAdjForm({ type: 'bonus', amount: 5000, description: 'Performance Bonus' });
    setIsAdjModalOpen(true);
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) {
      showNotice(`Cannot add adjustments to a ${periodStatus.toUpperCase()} period.`, 'error');
      setIsAdjModalOpen(false);
      return;
    }
    onAddAdjustment({
      employee_id: adjEmployeeId,
      month: selectedMonth,
      type: adjForm.type,
      amount: adjForm.amount,
      description: adjForm.description
    });
    setIsAdjModalOpen(false);
  };

  const buildPayslipContentHtml = (
    record: PayrollRecord,
    adjustments: PayrollAdjustment[],
    logo: string
  ): string => {
    let adjustmentRows = '';
    if (adjustments && adjustments.length > 0) {
      adjustmentRows = adjustments.map(adj => {
        const isPositive = adj.type === 'bonus';
        const color = isPositive ? '#059669' : '#e11d48';
        const prefix = isPositive ? '+ ' : '- ';
        const typeLabel = adj.type === 'bonus' ? 'Bonus' : adj.type === 'fine' ? 'Fine' : 'Advance';
        return `
          <tr style="border-bottom: 1px solid #f1f5f9; color: ${color};">
            <td style="padding: 7px 10px; font-weight: 600;">${prefix}${typeLabel}: ${escapeHtml(adj.description)}</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace; font-weight: bold;">${prefix}PKR ${adj.amount.toLocaleString()}</td>
          </tr>
        `;
      }).join('');
    } else {
      if (record.total_bonuses > 0) {
        adjustmentRows += `
          <tr style="border-bottom: 1px solid #f1f5f9; color: #059669;">
            <td style="padding: 7px 10px; font-weight: 600;">+ Bonus</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace; font-weight: bold;">+ PKR ${record.total_bonuses.toLocaleString()}</td>
          </tr>
        `;
      }
      if (record.total_fines > 0) {
        adjustmentRows += `
          <tr style="border-bottom: 1px solid #f1f5f9; color: #e11d48;">
            <td style="padding: 7px 10px; font-weight: 600;">- Fine</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace; font-weight: bold;">- PKR ${record.total_fines.toLocaleString()}</td>
          </tr>
        `;
      }
      if (record.advance_deductions > 0) {
        adjustmentRows += `
          <tr style="border-bottom: 1px solid #f1f5f9; color: #e11d48;">
            <td style="padding: 7px 10px; font-weight: 600;">- Advance Recovery</td>
            <td style="padding: 7px 10px; text-align: right; font-family: monospace; font-weight: bold;">- PKR ${record.advance_deductions.toLocaleString()}</td>
          </tr>
        `;
      }
    }

    const payslipMonthDays = getDaysInMonth(record.period_month);
    const payslipOffDays = (record.days_off !== undefined && record.days_off !== null)
      ? record.days_off
      : Math.max(0, payslipMonthDays - record.working_days);

    const isDaily = record.employment_type === 'daily_wage';
    const displayedTitle = isDaily ? 'Daily Wage Voucher' : 'Salary Payslip';
    const displayedSubTitle = isDaily ? 'Daily Cash Clearance (1-Day Payout)' : 'Salary Payslip';
    const displayedWageLabel = isDaily ? "Today's Daily Wage Rate (Shift Clearance)" : 'Base Salary';
    const displayedWageAmount = isDaily ? record.base_rate : record.gross_earnings;
    const displayedNetPay = isDaily ? record.base_rate : record.net_payout;
    const primaryThemeColor = isDaily ? '#d97706' : '#2563eb';
    const badgeBg = isDaily ? '#fffbeb' : '#eff6ff';
    const badgeText = isDaily ? '#b45309' : '#1d4ed8';
    const badgeBorder = isDaily ? '#fde68a' : '#bfdbfe';

    return `
      <div class="a5-container" style="font-family: 'Inter', system-ui, -apple-system, sans-serif; font-size: 11px; color: #0f172a; width: 100%; max-width: 148mm; margin: 0 auto; page-break-inside: avoid; box-sizing: border-box;">
        <!-- Compact Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${primaryThemeColor}; padding-bottom: 10px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            ${logo ? `<img src="${escapeHtml(logo)}" alt="Logo" style="height: 38px; width: auto; max-width: 100px; object-fit: contain;" />` : ''}
            <div>
              <div style="font-size: 18px; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; line-height: 1.1;">MOHSIN & CO</div>
              <div style="font-size: 10px; color: ${primaryThemeColor}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">${displayedTitle}</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="background: ${badgeBg}; color: ${badgeText}; border: 1px solid ${badgeBorder}; padding: 3px 9px; border-radius: 6px; font-weight: 700; font-family: monospace; font-size: 11px;">
              ${isDaily ? 'Daily Payout' : `Period: ${record.period_month}`}
            </div>
            ${isDaily ? `<div style="font-size: 9px; color: #78350f; font-weight: 600; margin-top: 2px;">Month: ${record.period_month}</div>` : ''}
          </div>
        </div>

        <!-- Employee Info Summary -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; background: #f8fafc; padding: 10px 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
          <div>
            <div style="font-size: 13px; font-weight: 800; color: #0f172a;">
              ${escapeHtml(record.employee_name)} <span style="font-family: monospace; color: ${primaryThemeColor}; font-weight: 700;">(${escapeHtml(record.employee_code)})</span>
            </div>
            <div style="color: #475569; margin-top: 2px; font-size: 11px;">
              ${escapeHtml(record.designation)} • ${escapeHtml(record.department)}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: 700; color: #1e293b; text-transform: capitalize;">
              ${isDaily ? 'Daily Wage (Daily Come, Daily Pay)' : 'Monthly Staff'}
            </div>
            <div style="color: #64748b; font-family: monospace; margin-top: 2px; font-size: 10px;">
              ${isDaily
                ? `1 Day Worked Today • Shift Payout`
                : `${record.days_present}P / ${record.days_absent}A / ${payslipOffDays}Off / ${record.days_leave ?? 0}L (${payslipMonthDays}d)`}
            </div>
          </div>
        </div>

        <!-- Breakdown Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px;">
          <thead>
            <tr style="background: #f8fafc; text-align: left; border-bottom: 1.5px solid #cbd5e1;">
              <th style="padding: 6px 10px; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em;">Description</th>
              <th style="padding: 6px 10px; font-weight: 700; color: #475569; text-align: right; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em;">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 7px 10px;">${displayedWageLabel}</td>
              <td style="padding: 7px 10px; text-align: right; font-family: monospace; font-weight: bold;">PKR ${displayedWageAmount.toLocaleString()}</td>
            </tr>
            ${!isDaily && record.employment_type === 'monthly_salary' && record.absent_deductions > 0 ? `
              <tr style="border-bottom: 1px solid #f1f5f9; color: #e11d48;">
                <td style="padding: 7px 10px; font-weight: 600;">Absence Cut (${record.days_absent}d)</td>
                <td style="padding: 7px 10px; text-align: right; font-family: monospace; font-weight: bold;">- PKR ${record.absent_deductions.toLocaleString()}</td>
              </tr>
            ` : ''}
            ${!isDaily ? adjustmentRows : ''}
          </tbody>
        </table>

        <!-- Net Payable Amount -->
        <div style="background: ${badgeBg}; border: 1.5px solid ${primaryThemeColor}; padding: 10px 14px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 800; color: ${badgeText}; font-size: 13px;">${isDaily ? 'TODAY NET PAYABLE' : 'NET PAY'}</span>
          <span style="font-size: 18px; font-weight: 900; color: ${primaryThemeColor}; font-family: monospace;">
            PKR ${displayedNetPay.toLocaleString()}
          </span>
        </div>

        ${isDaily ? `
          <div style="font-size: 9.5px; color: #64748b; margin-top: 6px; padding: 4px 6px; background: #fffbeb; border-radius: 4px; border: 1px dashed #fde68a;">
            ⓘ <strong>Daily Cash Clearance:</strong> Handed over in cash upon shift completion. (Month-to-Date: ${record.days_present} days worked).
          </div>
        ` : ''}

        <!-- Signatures (Fits Half-A4 / A5) -->
        <div style="display: flex; justify-content: space-between; margin-top: ${isDaily ? '24px' : '36px'}; padding-top: 10px; font-size: 10px; color: #64748b; border-top: 1px dashed #cbd5e1;">
          <div>Disbursed By: ____________________</div>
          <div>Worker Signature / Thumb: ____________________</div>
        </div>
      </div>
    `;
  };

  const buildDailyWageSheetHtml = (
    records: PayrollRecord[],
    month: string,
    logo: string
  ): string => {
    const totalDays = getDaysInMonth(month);
    let totalGross = 0;
    let totalDeductions = 0;
    let totalPayout = 0;

    const rows = records.map((r, idx) => {
      totalGross += r.gross_earnings;
      const cuts = r.total_fines + r.advance_deductions;
      totalDeductions += cuts;
      totalPayout += r.net_payout;

      const actualOffDays = (r.days_off !== undefined && r.days_off !== null)
        ? r.days_off
        : Math.max(0, totalDays - r.working_days);

      let adjSummary = 'PKR 0';
      const adjParts: string[] = [];
      if (r.total_bonuses > 0) adjParts.push(`+${r.total_bonuses.toLocaleString()} Bon`);
      if (r.total_fines > 0) adjParts.push(`-${r.total_fines.toLocaleString()} Fine`);
      if (r.advance_deductions > 0) adjParts.push(`-${r.advance_deductions.toLocaleString()} Adv`);
      if (adjParts.length > 0) adjSummary = adjParts.join(', ');

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <td style="padding: 7px 8px; text-align: center; color: #64748b; font-family: monospace;">${idx + 1}</td>
          <td style="padding: 7px 8px;">
            <strong style="color: #0f172a;">${escapeHtml(r.employee_name)}</strong>
            <span style="font-family: monospace; color: #2563eb; font-weight: 700; margin-left: 4px;">(${escapeHtml(r.employee_code)})</span>
          </td>
          <td style="padding: 7px 8px; color: #475569;">${escapeHtml(r.designation || r.department || '-')}</td>
          <td style="padding: 7px 8px; text-align: right; font-family: monospace; font-weight: 600;">PKR ${r.base_rate.toLocaleString()}</td>
          <td style="padding: 7px 8px; text-align: center; font-family: monospace; font-size: 11px; font-weight: bold; color: #b45309;">
            ${r.total_hours_worked ?? (r.days_present * 8)} hrs
          </td>
          <td style="padding: 7px 8px; text-align: right; font-family: monospace; font-weight: 600;">PKR ${r.gross_earnings.toLocaleString()}</td>
          <td style="padding: 7px 8px; text-align: right; font-family: monospace; font-size: 10px; color: ${cuts > 0 ? '#e11d48' : r.total_bonuses > 0 ? '#059669' : '#64748b'};">
            ${adjSummary}
          </td>
          <td style="padding: 7px 8px; text-align: right; font-family: monospace; font-weight: 800; color: #0f172a; background: #fffbeb;">
            PKR ${r.net_payout.toLocaleString()}
          </td>
          <td style="padding: 7px 8px; border-left: 1px dashed #cbd5e1; text-align: center; min-width: 115px;">
            <div style="border-bottom: 1px dotted #94a3b8; height: 16px; width: 85%; margin: 0 auto;"></div>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; font-size: 11px; color: #0f172a; width: 100%; margin: 0 auto;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #d97706; padding-bottom: 10px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            ${logo ? `<img src="${escapeHtml(logo)}" alt="Logo" style="height: 36px; width: auto; max-width: 100px; object-fit: contain;" />` : ''}
            <div>
              <div style="font-size: 18px; font-weight: 900; color: #0f172a; letter-spacing: -0.02em; line-height: 1.1;">MOHSIN & CO</div>
              <div style="font-size: 10px; color: #d97706; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em;">Daily Wage Payslip & Disbursement Sheet (Single-Row Register)</div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-family: monospace; font-size: 11px; display: inline-block;">
              Period: ${month}
            </div>
            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
              Total Workers: <strong style="color: #0f172a;">${records.length}</strong> | Total Month Days: <strong>${totalDays}d</strong>
            </div>
          </div>
        </div>

        <!-- Wage Sheet Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <thead>
            <tr style="background: #f8fafc; text-align: left; border-top: 1px solid #e2e8f0; border-bottom: 2px solid #cbd5e1; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em;">
              <th style="padding: 6px 8px; font-weight: 700; color: #475569; width: 28px; text-align: center;">#</th>
              <th style="padding: 6px 8px; font-weight: 700; color: #475569;">Employee Name & ID</th>
              <th style="padding: 6px 8px; font-weight: 700; color: #475569;">Designation</th>
              <th style="padding: 6px 8px; font-weight: 700; color: #475569; text-align: right;">Daily Rate</th>
              <th style="padding: 6px 8px; font-weight: 700; color: #475569; text-align: center;">Working Hours</th>
              <th style="padding: 6px 8px; font-weight: 700; color: #475569; text-align: right;">Gross Wage</th>
              <th style="padding: 6px 8px; font-weight: 700; color: #475569; text-align: right;">Bonus / Fine / Adv</th>
              <th style="padding: 6px 8px; font-weight: 800; color: #0f172a; text-align: right; background: #fef3c7;">Net Payable</th>
              <th style="padding: 6px 8px; font-weight: 700; color: #475569; text-align: center; width: 115px;">Signature / Thumb</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid #cbd5e1; border-bottom: 2px solid #94a3b8; font-size: 11px;">
              <td colspan="5" style="padding: 8px 10px; text-transform: uppercase; color: #0f172a;">
                Total Daily Wage Payout (${records.length} Staff)
              </td>
              <td style="padding: 8px 10px; text-align: right; font-family: monospace;">PKR ${totalGross.toLocaleString()}</td>
              <td style="padding: 8px 10px; text-align: right; font-family: monospace; font-size: 10px; color: #e11d48;">- PKR ${totalDeductions.toLocaleString()}</td>
              <td style="padding: 8px 10px; text-align: right; font-family: monospace; font-size: 12px; color: #b45309; font-weight: 900; background: #fef3c7;">
                PKR ${totalPayout.toLocaleString()}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <!-- Signatures Footer -->
        <div style="display: flex; justify-content: space-between; margin-top: 28px; padding-top: 10px; font-size: 10px; color: #64748b; border-top: 1px dashed #cbd5e1;">
          <div>Prepared By: ____________________</div>
          <div>Checked By: ____________________</div>
          <div>Disbursed / Cashier: ____________________</div>
        </div>
      </div>
    `;
  };

  const handlePrintPayslip = () => {
    if (!selectedPayslip) return;
    if (isNaN(selectedPayslip.net_payout) || selectedPayslip.net_payout < 0) {
      showNotice('Cannot print payslip: Invalid net payout detected.', 'error');
      return;
    }
    const html = buildPayslipContentHtml(selectedPayslip, payslipAdjustments, companyLogo);
    printFormattedDocument(`Payslip_${selectedPayslip.employee_name}_${selectedPayslip.period_month}`, html, {
      pageSize: 'A5',
      hideDefaultHeader: true
    });
  };

  const handlePrintBatchPayslips = async (recordsToPrint: PayrollRecord[], titleLabel = 'All') => {
    if (!recordsToPrint || recordsToPrint.length === 0) {
      showNotice('No records available to download or print.', 'error');
      return;
    }

    setIsCompilingBatch(true);
    try {
      const isOnlyDailyWage = recordsToPrint.every(r => r.employment_type === 'daily_wage') || titleLabel.toLowerCase().includes('daily');

      if (isOnlyDailyWage) {
        // Daily wage bulk in single continuous rows without separate page breaks
        const sheetHtml = buildDailyWageSheetHtml(recordsToPrint, selectedMonth, companyLogo);
        printFormattedDocument(`DailyWage_Sheet_${selectedMonth}`, sheetHtml, {
          pageSize: 'A4',
          hideDefaultHeader: true
        });
        showNotice(`Compiled ${recordsToPrint.length} daily wage workers into a single-row payroll sheet. Opening print dialog...`, 'success');
        return;
      }

      // If mixed or monthly:
      const monthlyStaff = recordsToPrint.filter(r => r.employment_type === 'monthly_salary');
      const dailyStaff = recordsToPrint.filter(r => r.employment_type === 'daily_wage');

      // Fetch adjustments for the month in one batch request
      const adjMap: Record<string, PayrollAdjustment[]> = {};
      try {
        const res = await authFetch(`/api/payroll/adjustments?month=${selectedMonth}`);
        if (res.ok) {
          const allAdjs: PayrollAdjustment[] = await res.json();
          if (Array.isArray(allAdjs)) {
            allAdjs.forEach(adj => {
              if (!adjMap[adj.employee_id]) adjMap[adj.employee_id] = [];
              adjMap[adj.employee_id].push(adj);
            });
          }
        }
      } catch (err) {
        console.warn('Failed to load batch adjustments:', err);
      }

      const sections: string[] = [];

      // Monthly staff rendered as A5 individual payslips
      if (monthlyStaff.length > 0) {
        monthlyStaff.forEach(rec => {
          const recAdjs = adjMap[rec.employee_id] || [];
          const content = buildPayslipContentHtml(rec, recAdjs, companyLogo);
          sections.push(`<div class="payslip-page">${content}</div>`);
        });
      }

      // Daily wage staff rendered as continuous single-row wage sheet (no separate page per worker)
      if (dailyStaff.length > 0) {
        const dailySheet = buildDailyWageSheetHtml(dailyStaff, selectedMonth, companyLogo);
        sections.push(`<div class="payslip-page" style="page-break-before: always;">${dailySheet}</div>`);
      }

      const batchHtml = sections.join('\n');
      printFormattedDocument(`Payslips_${titleLabel}_${selectedMonth}`, batchHtml, {
        pageSize: 'A4',
        hideDefaultHeader: true
      });
      showNotice(`Compiled ${recordsToPrint.length} records (${monthlyStaff.length} Monthly Payslips + ${dailyStaff.length} Daily Wage Sheet Rows). Opening print dialog...`, 'success');
    } catch (err: any) {
      showNotice(err.message || 'Failed to generate batch payslips', 'error');
    } finally {
      setIsCompilingBatch(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-700 tracking-tight font-heading flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-blue-600" /> Payroll Management & Compensation Engine
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Calculates proportional salary deductions for monthly staff & attendance payout for daily wage workers
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Period Status Indicator */}
          {periodStatus === 'paid' ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
              <Lock className="w-3.5 h-3.5 text-emerald-600" /> PAID (LOCKED)
            </div>
          ) : periodStatus === 'approved' ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 shadow-xs">
              <Lock className="w-3.5 h-3.5 text-amber-600" /> APPROVED (FROZEN)
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-xs">
              <Unlock className="w-3.5 h-3.5 text-blue-600" /> DRAFT (OPEN)
            </div>
          )}

          {/* Month Picker */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 tabular-nums shadow-xs">
            <Calendar className="w-4 h-4 text-blue-600" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => onMonthChange(e.target.value)}
              className="bg-transparent text-gray-800 focus:outline-none cursor-pointer font-bold"
            />
          </div>

          {/* Calculate Payroll Button - Super Admin only, disabled if locked */}
          {userRole === 'super_admin' && (
            <button
              onClick={() => {
                if (isLocked) {
                  showNotice(`Cannot recalculate payroll for ${selectedMonth} because period is ${periodStatus.toUpperCase()} and locked.`, 'error');
                  return;
                }
                onCalculatePayroll(selectedMonth);
              }}
              disabled={isLocked}
              title={isLocked ? `Period is ${periodStatus.toUpperCase()} and locked against recalculation` : 'Recalculate monthly payroll'}
              className={`font-bold px-3.5 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer ${
                isLocked
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-70'
                  : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95'
              }`}
            >
              <Calculator className="w-4 h-4 text-white" /> Recalculate Payroll
            </button>
          )}

          {/* Status Transitions & Delete Draft */}
          {periodStatus === 'draft' && payrollRecords.length > 0 && (
            <>
              {(userRole === 'super_admin' || userRole === 'manager') && (
                <button
                  onClick={async () => {
                    if (isUpdatingStatus) return;
                    setIsUpdatingStatus('approved');
                    try {
                      await onUpdatePayrollStatus?.(selectedMonth, 'approved');
                    } catch (err: any) {
                      showNotice(err.message || 'Failed to approve payroll', 'error');
                    } finally {
                      setIsUpdatingStatus(null);
                    }
                  }}
                  disabled={isUpdatingStatus !== null || isDeletingDraft}
                  className="bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-95"
                  title="Freeze payroll calculations and submit for approval"
                >
                  {isUpdatingStatus === 'approved' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" /> Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 text-white" /> Approve Payroll
                    </>
                  )}
                </button>
              )}

              {userRole === 'super_admin' && (
                showDeleteConfirm ? (
                  <div className="flex items-center gap-2 bg-rose-50 border border-rose-300 px-3 py-1.5 rounded-lg text-xs animate-in fade-in duration-150">
                    <span className="font-bold text-rose-800">Delete {selectedMonth} draft?</span>
                    <button
                      onClick={async () => {
                        if (isDeletingDraft) return;
                        setIsDeletingDraft(true);
                        try {
                          await onDeleteDraftPayroll?.(selectedMonth);
                          setShowDeleteConfirm(false);
                        } catch (err: any) {
                          showNotice(err.message || 'Failed to delete draft payroll', 'error');
                        } finally {
                          setIsDeletingDraft(false);
                        }
                      }}
                      disabled={isDeletingDraft}
                      className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-bold px-2.5 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      {isDeletingDraft ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" /> Deleting...
                        </>
                      ) : (
                        'Yes, Delete'
                      )}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeletingDraft}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold px-2 py-1 rounded text-[11px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeletingDraft || isUpdatingStatus !== null}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold px-3 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                    title="Delete all draft payroll records for this month"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" /> Delete Draft
                  </button>
                )
              )}
            </>
          )}

          {periodStatus === 'approved' && (
            <>
              {(userRole === 'super_admin' || userRole === 'cashier') && (
                <button
                  onClick={async () => {
                    if (isUpdatingStatus) return;
                    setIsUpdatingStatus('paid');
                    try {
                      await onUpdatePayrollStatus?.(selectedMonth, 'paid');
                    } catch (err: any) {
                      showNotice(err.message || 'Failed to mark as paid', 'error');
                    } finally {
                      setIsUpdatingStatus(null);
                    }
                  }}
                  disabled={isUpdatingStatus !== null}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-95"
                  title="Mark payroll as paid and disburse funds"
                >
                  {isUpdatingStatus === 'paid' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" /> Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 text-white" /> Mark as Paid
                    </>
                  )}
                </button>
              )}
              {userRole === 'super_admin' && (
                <>
                  <button
                    onClick={async () => {
                      if (isUpdatingStatus) return;
                      setIsUpdatingStatus('draft');
                      try {
                        await onUpdatePayrollStatus?.(selectedMonth, 'draft');
                      } catch (err: any) {
                        showNotice(err.message || 'Failed to reopen to draft', 'error');
                      } finally {
                        setIsUpdatingStatus(null);
                      }
                    }}
                    disabled={isUpdatingStatus !== null || isDeletingDraft}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 font-bold px-3 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                    title="Reopen approved period back to draft"
                  >
                    {isUpdatingStatus === 'draft' ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-600" /> Reopening...
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5 text-gray-600" /> Reopen to Draft
                      </>
                    )}
                  </button>

                  {showDeleteConfirm ? (
                    <div className="flex items-center gap-2 bg-rose-50 border border-rose-300 px-3 py-1.5 rounded-lg text-xs animate-in fade-in duration-150">
                      <span className="font-bold text-rose-800">Delete {selectedMonth} approved payroll?</span>
                      <button
                        onClick={async () => {
                          if (isDeletingDraft) return;
                          setIsDeletingDraft(true);
                          try {
                            await onDeleteDraftPayroll?.(selectedMonth);
                            setShowDeleteConfirm(false);
                          } catch (err: any) {
                            showNotice(err.message || 'Failed to delete approved payroll', 'error');
                          } finally {
                            setIsDeletingDraft(false);
                          }
                        }}
                        disabled={isDeletingDraft}
                        className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white font-bold px-2.5 py-1 rounded text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        {isDeletingDraft ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" /> Deleting...
                          </>
                        ) : (
                          'Yes, Delete'
                        )}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(false)}
                        disabled={isDeletingDraft}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold px-2 py-1 rounded text-[11px] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isDeletingDraft || isUpdatingStatus !== null}
                      className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold px-3 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                      title="Delete approved payroll records for this month to release employees"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" /> Delete Approved Payroll
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {periodStatus === 'paid' && userRole === 'super_admin' && (
            <button
              onClick={async () => {
                if (isUpdatingStatus) return;
                setIsUpdatingStatus('draft');
                try {
                  await onUpdatePayrollStatus?.(selectedMonth, 'draft');
                } catch (err: any) {
                  showNotice(err.message || 'Failed to unlock to draft', 'error');
                } finally {
                  setIsUpdatingStatus(null);
                }
              }}
              disabled={isUpdatingStatus !== null}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 font-bold px-3 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Unlock paid period back to draft"
            >
              {isUpdatingStatus === 'draft' ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-600" /> Unlocking...
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5 text-gray-600" /> Unlock to Draft
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {noticeMsg && (
        <div className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 border animate-in fade-in duration-200 ${
          noticeMsg.type === 'error'
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : noticeMsg.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center gap-2">
            {noticeMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span className="font-semibold">{noticeMsg.text}</span>
          </div>
          <button
            onClick={() => setNoticeMsg(null)}
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Sub-Tab Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPayrollSubTab('register')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              payrollSubTab === 'register'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Table className="w-4 h-4" />
            <span>Payroll Register</span>
          </button>

          <button
            type="button"
            onClick={() => setPayrollSubTab('all_payslips')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              payrollSubTab === 'all_payslips'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>All Payslips & Batch Download</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono tabular-nums ${
              payrollSubTab === 'all_payslips' ? 'bg-blue-500 text-white font-bold' : 'bg-gray-100 text-gray-700 font-bold border border-gray-200'
            }`}>
              {payrollRecords.length}
            </span>
          </button>
        </div>

        {/* Global Batch Download Quick Actions */}
        {payrollRecords.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={dailyCount === 0 || isCompilingBatch}
              onClick={() => handlePrintBatchPayslips(dailyRecords, 'DailyWage_Staff')}
              className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Download consolidated single-row wage sheet for all daily wage workers (no separate pages)"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Daily Wage Sheet ({dailyCount} {dailyCount === 1 ? 'Row' : 'Rows'})</span>
            </button>

            <button
              type="button"
              disabled={(monthlyCount > 0 ? monthlyCount : payrollRecords.length) === 0 || isCompilingBatch}
              onClick={() => handlePrintBatchPayslips(monthlyCount > 0 ? monthlyRecords : payrollRecords, 'Monthly_Staff')}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Download all monthly employee payslips for the month in a single A5 document"
            >
              {isCompilingBatch ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Compiling...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>
                    {dailyCount > 0
                      ? `Download Monthly Payslips (${monthlyCount})`
                      : `Download All Payslips (${payrollRecords.length})`}
                  </span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {payrollSubTab === 'register' ? (
        <>
          {/* Summary Metrics Banner */}
          {/* Summary Metrics Banner: Mathematically balanced accounting equation */}
          {modelFilter === 'monthly_salary' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Monthly Gross Earnings</p>
                <p className="text-2xl font-bold text-gray-800 mt-1 font-mono tabular-nums">PKR {totalGross.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Monthly staff earned period gross compensation</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Absenteeism & Cuts</p>
                <p className="text-2xl font-bold text-rose-600 mt-1 font-mono tabular-nums">- PKR {totalDeductions.toLocaleString()}</p>
                <p className="text-[10px] text-rose-500 mt-0.5 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" /> Absenteeism, fines & advance recovery
                </p>
              </div>

              <div className="bg-white border border-blue-200 bg-blue-50/20 rounded-lg p-4 shadow-xs">
                <p className="text-[11px] text-blue-900 font-bold uppercase tracking-wider">Net Month-End Payout</p>
                <p className="text-2xl font-bold text-blue-700 mt-1 font-mono tabular-nums">PKR {totalPayout.toLocaleString()}</p>
                <p className="text-[10px] text-blue-600 mt-0.5 font-medium">Final bank transfer total ({totalGross.toLocaleString()} - {totalDeductions.toLocaleString()})</p>
              </div>
            </div>
          ) : modelFilter === 'daily_wage' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Total Daily Wages Earned</p>
                <p className="text-2xl font-bold text-amber-700 mt-1 font-mono tabular-nums">PKR {totalGross.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Accumulated shifts compensation ({dailyCount} {dailyCount === 1 ? 'worker' : 'workers'})</p>
              </div>

              <div className="bg-white border border-amber-200 bg-amber-50/20 rounded-lg p-4 shadow-xs">
                <p className="text-[11px] text-amber-900 font-bold uppercase tracking-wider">Cleared Daily in Cash</p>
                <p className="text-2xl font-bold text-amber-700 mt-1 font-mono tabular-nums">- PKR {totalDailyCleared.toLocaleString()}</p>
                <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1 font-medium">
                  <CheckCircle className="w-3 h-3" /> Disbursed daily upon shift completion
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Month-End Pending Due</p>
                <p className="text-2xl font-bold text-gray-500 mt-1 font-mono tabular-nums">PKR 0</p>
                <p className="text-[10px] text-gray-400 mt-0.5 font-medium">No month-end balance (Daily Come, Daily Pay)</p>
              </div>
            </div>
          ) : totalDailyCleared > 0 ? (
            /* 4-Card Mathematically Balanced Banner: Gross (50,168) - Deductions (1,936) - Daily Cash (25,000) = Net Bank Payout (23,232) */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Total Gross</p>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 font-mono">ALL</span>
                </div>
                <p className="text-2xl font-bold text-gray-800 mt-1 font-mono tabular-nums">PKR {totalGross.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Monthly ({((totalGross - totalDailyCleared)).toLocaleString()}) + Daily ({totalDailyCleared.toLocaleString()})
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Absent & Cuts</p>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 font-mono">DEDUCT</span>
                </div>
                <p className="text-2xl font-bold text-rose-600 mt-1 font-mono tabular-nums">- PKR {totalDeductions.toLocaleString()}</p>
                <p className="text-[10px] text-rose-500 mt-0.5 flex items-center gap-1 font-medium">
                  <TrendingDown className="w-3 h-3" /> Monthly staff deductions & fines
                </p>
              </div>

              <div className="bg-white border border-amber-200 bg-amber-50/30 rounded-lg p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-amber-900 font-bold uppercase tracking-wider">Daily Cash Paid</p>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-mono">SETTLED</span>
                </div>
                <p className="text-2xl font-bold text-amber-700 mt-1 font-mono tabular-nums">- PKR {totalDailyCleared.toLocaleString()}</p>
                <p className="text-[10px] text-amber-700 mt-0.5 font-medium flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-amber-600" /> Disbursed in cash on daily shifts
                </p>
              </div>

              <div className="bg-white border border-blue-200 bg-blue-50/20 rounded-lg p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-blue-900 font-bold uppercase tracking-wider">Net Month-End Payout</p>
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-mono">BANK DUE</span>
                </div>
                <p className="text-2xl font-bold text-blue-700 mt-1 font-mono tabular-nums">PKR {totalPayout.toLocaleString()}</p>
                <p className="text-[10px] text-blue-600 mt-0.5 font-medium">
                  Final monthly bank transfer total
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Total Gross Earnings</p>
                <p className="text-2xl font-bold text-gray-800 mt-1 font-mono tabular-nums">PKR {totalGross.toLocaleString()}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Period gross earnings across active staff</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Total Deductions & Cuts</p>
                <p className="text-2xl font-bold text-rose-600 mt-1 font-mono tabular-nums">- PKR {totalDeductions.toLocaleString()}</p>
                <p className="text-[10px] text-rose-500 mt-0.5 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" /> Absenteeism, fines & advance recovery
                </p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-xs">
                <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Net Month-End Payout</p>
                <p className="text-2xl font-bold text-blue-700 mt-1 font-mono tabular-nums">PKR {totalPayout.toLocaleString()}</p>
                <p className="text-[10px] text-blue-600 mt-0.5 font-medium">Final calculated bank transfer total</p>
              </div>
            </div>
          )}

      {/* Payroll Records Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-xs">
        <div className="p-3.5 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-bold text-gray-800 text-xs flex items-center gap-2">
              <span>Payroll Roll Period:</span>
              <span className="font-mono tabular-nums text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">{selectedMonth}</span>
            </h3>

            {/* Segmented Switch for Daily Wage vs Monthly */}
            <div className="inline-flex items-center p-1 bg-gray-200/80 rounded-lg border border-gray-300/80 shadow-inner">
              <button
                type="button"
                onClick={() => setModelFilter('all')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  modelFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Show all employees"
              >
                <Users className="w-3.5 h-3.5" />
                <span>All Staff</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono tabular-nums ${
                  modelFilter === 'all' ? 'bg-gray-100 text-gray-700 font-bold' : 'bg-gray-300 text-gray-600'
                }`}>
                  {payrollRecords.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModelFilter('monthly_salary')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  modelFilter === 'monthly_salary'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Filter to monthly salary staff only"
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>Monthly Staff</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono tabular-nums ${
                  modelFilter === 'monthly_salary' ? 'bg-blue-500 text-white font-bold' : 'bg-gray-300 text-gray-600'
                }`}>
                  {monthlyCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModelFilter('daily_wage')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  modelFilter === 'daily_wage'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                title="Filter to daily wage workers only"
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Daily Wage</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono tabular-nums ${
                  modelFilter === 'daily_wage' ? 'bg-amber-500 text-white font-bold' : 'bg-gray-300 text-gray-600'
                }`}>
                  {dailyCount}
                </span>
              </button>
            </div>
          </div>

          {/* Search Input & Count Display */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search name, ID, dept..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-7 py-1 text-xs bg-white border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-48 sm:w-56"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-500 font-mono tabular-nums whitespace-nowrap hidden sm:inline-block">
              Showing: <span className="font-bold text-gray-700">{filteredRecords.length}</span> / {payrollRecords.length}
            </p>

            {payrollRecords.length > 0 && (
              <button
                type="button"
                onClick={() => handlePrintBatchPayslips(filteredRecords, modelFilter === 'daily_wage' ? 'DailyWage' : modelFilter === 'monthly_salary' ? 'Monthly' : 'All')}
                disabled={isCompilingBatch}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold px-2.5 py-1.5 rounded-lg text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap"
                title={`Download / print all ${filteredRecords.length} payslips shown below in an A5 document`}
              >
                {isCompilingBatch ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Printer className="w-3.5 h-3.5" />
                )}
                <span>
                  {modelFilter === 'daily_wage'
                    ? `Print Daily Wage (${dailyCount})`
                    : modelFilter === 'monthly_salary'
                    ? `Print Monthly (${monthlyCount})`
                    : `Print Payslips (${filteredRecords.length})`}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-700">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5 text-center w-12">#</th>
                <th className="p-3.5">Employee Name & ID</th>
                <th className="p-3.5">Compensation Model</th>
                <th className="p-3.5">
                  {modelFilter === 'daily_wage' ? 'Working Hours' : 'Month Days / Attendance Breakdown'}
                </th>
                <th className="p-3.5">Base Rate</th>
                <th className="p-3.5">Gross Earnings</th>
                <th className="p-3.5">Absent Cuts</th>
                <th className="p-3.5">Bonus / Fine / Advance</th>
                <th className="p-3.5">Net Payout</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {payrollRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    No payroll generated for {selectedMonth}. Click "Recalculate Payroll" above to run the engine.
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <p className="text-sm font-semibold text-gray-600">No matching employees found</p>
                      <p className="text-xs text-gray-400">
                        {searchQuery ? `No results for "${searchQuery}"` : `No records found in ${modelFilter === 'daily_wage' ? 'Daily Wage' : 'Monthly Salary'} category`}
                      </p>
                      {(modelFilter !== 'all' || searchQuery) && (
                        <button
                          type="button"
                          onClick={() => {
                            setModelFilter('all');
                            setSearchQuery('');
                          }}
                          className="mt-1 px-3 py-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors cursor-pointer"
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, idx) => {
                  const totalMonthDays = getDaysInMonth(r.period_month || selectedMonth);
                  const actualOffDays = (r.days_off !== undefined && r.days_off !== null)
                    ? r.days_off
                    : Math.max(0, totalMonthDays - r.working_days);

                  return (
                  <tr key={r.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="p-3.5 text-center font-mono text-gray-500 font-bold text-xs">
                      {idx + 1}
                    </td>
                    <td className="p-3.5">
                      {/* Requirement 8: Mandatory Display of Name and EMP ID together */}
                      <div className="whitespace-nowrap">
                        <span className="font-bold text-gray-900 text-sm">{r.employee_name}</span>{' '}
                        <span className="font-mono text-blue-700 font-bold text-xs">({r.employee_code})</span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-medium">{r.department}</p>
                    </td>

                    <td className="p-3.5">
                      {r.employment_type === 'monthly_salary' ? (
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          Monthly Salary
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Daily Wage Rate
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 font-mono tabular-nums">
                      {r.employment_type === 'daily_wage' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 text-amber-900 border border-amber-200 font-bold text-xs">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          {(r.total_hours_worked ?? (r.days_present * 8))} Working Hours
                        </span>
                      ) : (
                        <>
                          <span className="text-gray-900 font-bold" title={`Total days in month: ${totalMonthDays}d (${r.working_days} working days)`}>{totalMonthDays}d</span> | <span className="text-emerald-600 font-bold">{r.days_present}P</span> | <span className="text-rose-600 font-bold">{r.days_absent}A</span> | <span className="text-blue-600 font-bold" title="Weekly Off Days">{actualOffDays}Off</span> | <span className="text-amber-600 font-bold">{r.days_leave ?? 0}L</span>
                        </>
                      )}
                    </td>

                    <td className="p-3.5 font-semibold text-gray-800 font-mono tabular-nums">
                      PKR {r.base_rate.toLocaleString()}
                    </td>

                    <td className="p-3.5 font-semibold text-gray-800 font-mono tabular-nums">
                      PKR {r.gross_earnings.toLocaleString()}
                    </td>

                    <td className="p-3.5 font-mono tabular-nums">
                      {r.employment_type === 'monthly_salary' ? (
                        <span className="font-bold text-rose-600">- PKR {r.absent_deductions.toLocaleString()}</span>
                      ) : (
                        <span className="text-gray-400">--</span>
                      )}
                    </td>

                    <td className="p-3.5 text-[11px] font-mono tabular-nums">
                      {r.total_bonuses > 0 && <p className="text-emerald-600 font-bold">+ PKR {r.total_bonuses.toLocaleString()}</p>}
                      {r.total_fines > 0 && <p className="text-rose-600 font-bold">- PKR {r.total_fines.toLocaleString()}</p>}
                      {r.advance_deductions > 0 && <p className="text-orange-600 font-bold">- PKR {r.advance_deductions.toLocaleString()} <span className="text-gray-400 font-normal">adv</span></p>}
                      {r.total_bonuses === 0 && r.total_fines === 0 && r.advance_deductions === 0 && <span className="text-gray-400">--</span>}
                    </td>

                    <td className="p-3.5 font-bold text-sm text-blue-700 font-mono tabular-nums">
                      {r.employment_type === 'daily_wage' ? (
                        <div className="flex flex-col">
                          <span className="text-gray-900 font-bold">PKR 0</span>
                          <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 w-fit font-medium">
                            Cleared Daily (PKR {r.gross_earnings.toLocaleString()} Paid)
                          </span>
                        </div>
                      ) : r.net_payout === 0 && r.advance_deductions > r.gross_earnings ? (
                        <span title="Advance deductions exceed gross — remaining balance carries forward">
                          PKR 0 <span className="text-[10px] text-orange-600 font-normal">ⓘ</span>
                        </span>
                      ) : (
                        `PKR ${r.net_payout.toLocaleString()}`
                      )}
                    </td>

                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {userRole === 'super_admin' && !isLocked && (
                          <button
                            onClick={() => handleOpenAdjModal(r.employee_id)}
                            className="p-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors border border-gray-300 cursor-pointer"
                            title="Add Bonus / Fine Adjustment"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenPayslip(r)}
                          disabled={loadingPayslip}
                          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all text-xs flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
                        >
                          <FileText className="w-3.5 h-3.5 text-white" /> Payslip
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  ) : (
    /* Dedicated All Payslips & Batch Download Hub */
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* 3 Prominent Batch Download Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Daily Wage Card */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-900 border border-amber-300 uppercase tracking-wider">
                Daily Wage Category
              </span>
              <span className="text-xs font-mono font-bold text-amber-700">{selectedMonth}</span>
            </div>
            <h4 className="text-base font-bold text-gray-900 font-heading">Daily Wage Payslip Sheet</h4>
            <p className="text-xs text-gray-600 mt-1">
              Consolidated single-row payout sheet with signature column for daily workers (no separate pages).
            </p>
            <div className="mt-3 pt-3 border-t border-amber-200/60 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Workers</p>
                <p className="text-lg font-bold text-amber-800 font-mono tabular-nums">{dailyCount}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-500 font-bold uppercase">Total Wages (Cleared Daily)</p>
                <p className="text-lg font-bold text-amber-800 font-mono tabular-nums">PKR {dailyPayout.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={dailyCount === 0 || isCompilingBatch}
            onClick={() => handlePrintBatchPayslips(dailyRecords, 'DailyWage_Workers')}
            className="mt-4 w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            {isCompilingBatch ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            <span>Download Daily Wage Sheet ({dailyCount} {dailyCount === 1 ? 'Row' : 'Rows'} - Single Page)</span>
          </button>
        </div>

        {/* Monthly Staff Card */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-200/80 text-blue-900 border border-blue-300 uppercase tracking-wider">
                Monthly Salary Category
              </span>
              <span className="text-xs font-mono font-bold text-blue-700">{selectedMonth}</span>
            </div>
            <h4 className="text-base font-bold text-gray-900 font-heading">Monthly Staff Payslips</h4>
            <p className="text-xs text-gray-600 mt-1">
              Contractual monthly salaries with absenteeism and adjustments.
            </p>
            <div className="mt-3 pt-3 border-t border-blue-200/60 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Employees</p>
                <p className="text-lg font-bold text-blue-800 font-mono tabular-nums">{monthlyCount}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-500 font-bold uppercase">Total Net Payout</p>
                <p className="text-lg font-bold text-blue-800 font-mono tabular-nums">PKR {monthlyPayout.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={monthlyCount === 0 || isCompilingBatch}
            onClick={() => handlePrintBatchPayslips(monthlyRecords, 'Monthly_Staff')}
            className="mt-4 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            {isCompilingBatch ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Printer className="w-4 h-4" />
            )}
            <span>Download All Monthly Payslips ({monthlyCount})</span>
          </button>
        </div>

        {/* Complete Month Card */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200/80 text-emerald-900 border border-emerald-300 uppercase tracking-wider">
                End-of-Month Complete
              </span>
              <span className="text-xs font-mono font-bold text-emerald-700">{selectedMonth}</span>
            </div>
            <h4 className="text-base font-bold text-gray-900 font-heading">Complete Month Batch</h4>
            <p className="text-xs text-gray-600 mt-1">
              Download all employee payslips for corporate record-keeping in a single PDF.
            </p>
            <div className="mt-3 pt-3 border-t border-emerald-200/60 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Total Staff</p>
                <p className="text-lg font-bold text-emerald-800 font-mono tabular-nums">{payrollRecords.length}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-500 font-bold uppercase">Combined Net Disbursed</p>
                <p className="text-lg font-bold text-emerald-800 font-mono tabular-nums">PKR {payrollRecords.reduce((s, r) => s + r.net_payout, 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={payrollRecords.length === 0 || isCompilingBatch}
            onClick={() => handlePrintBatchPayslips(payrollRecords, 'All_Employees_Complete')}
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-2.5 px-3 rounded-lg text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            {isCompilingBatch ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Compiling Batch...
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download All ({payrollRecords.length}) Payslips (A5 PDF)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Individual Payslips Explorer & Selection */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div className="flex flex-wrap items-center gap-3">
            {/* Category Switch */}
            <div className="inline-flex items-center p-1 bg-gray-200/80 rounded-lg border border-gray-300/80 shadow-inner">
              <button
                type="button"
                onClick={() => setModelFilter('all')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  modelFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>All ({payrollRecords.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setModelFilter('monthly_salary')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  modelFilter === 'monthly_salary'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                <span>Monthly ({monthlyCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setModelFilter('daily_wage')}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  modelFilter === 'daily_wage'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Daily Wage ({dailyCount})</span>
              </button>
            </div>

            {/* Quick Select All / Deselect All */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (selectedBatchEmpIds.size === filteredRecords.length) {
                    setSelectedBatchEmpIds(new Set());
                  } else {
                    setSelectedBatchEmpIds(new Set(filteredRecords.map(r => r.id)));
                  }
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {selectedBatchEmpIds.size === filteredRecords.length && filteredRecords.length > 0 ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                    <span>Deselect All</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5 text-gray-500" />
                    <span>Select All ({filteredRecords.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Search & Download Selected */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search name, code, dept..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-7 py-1 text-xs bg-white border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 w-44 sm:w-52"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {selectedBatchEmpIds.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  const toDownload = filteredRecords.filter(r => selectedBatchEmpIds.has(r.id));
                  handlePrintBatchPayslips(toDownload, `Selected_${toDownload.length}`);
                }}
                disabled={isCompilingBatch}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 text-xs rounded-lg shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95 whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Download Selected ({selectedBatchEmpIds.size})</span>
              </button>
            )}
          </div>
        </div>

        {/* Grid of Payslips */}
        {filteredRecords.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm font-semibold">No payslips found matching your filters</p>
            <p className="text-xs text-gray-400 mt-1">Try resetting the search or category filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredRecords.map((r) => {
              const isSelected = selectedBatchEmpIds.has(r.id);
              const totalDays = getDaysInMonth(r.period_month || selectedMonth);
              const offDays = (r.days_off !== undefined && r.days_off !== null)
                ? r.days_off
                : Math.max(0, totalDays - r.working_days);

              return (
                <div
                  key={r.id}
                  className={`border rounded-xl p-4 transition-all flex flex-col justify-between ${
                    isSelected ? 'border-blue-500 bg-blue-50/20 shadow-xs ring-1 ring-blue-400' : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div>
                    {/* Top card bar: Checkbox + Name & ID + Model Badge */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const next = new Set(selectedBatchEmpIds);
                            if (e.target.checked) next.add(r.id);
                            else next.delete(r.id);
                            setSelectedBatchEmpIds(next);
                          }}
                          className="w-4 h-4 rounded text-blue-600 cursor-pointer"
                        />
                        <div>
                          <p className="font-bold text-gray-900 text-xs leading-tight">
                            {r.employee_name} <span className="font-mono text-blue-700 font-bold">({r.employee_code})</span>
                          </p>
                          <p className="text-[10px] text-gray-500">{r.designation} • {r.department}</p>
                        </div>
                      </div>

                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold shrink-0 border ${
                        r.employment_type === 'monthly_salary'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {r.employment_type === 'monthly_salary' ? 'Monthly' : 'Daily Wage'}
                      </span>
                    </div>

                    {/* Attendance Breakdown Pills */}
                    {r.employment_type === 'daily_wage' ? (
                      <div className="bg-amber-50 rounded-lg p-2 my-2 text-xs text-amber-900 font-bold flex items-center gap-1.5 border border-amber-200">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>{(r.total_hours_worked ?? (r.days_present * 8))} Working Hours</span>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-lg p-2 my-2 text-[10px] text-gray-600 flex items-center justify-between font-mono">
                        <span>{r.days_present} Present</span>
                        <span>•</span>
                        <span className={r.days_absent > 0 ? 'text-rose-600 font-bold' : ''}>{r.days_absent} Absent</span>
                        <span>•</span>
                        <span>{offDays} Off</span>
                        <span>•</span>
                        <span>{totalDays}d Month</span>
                      </div>
                    )}

                    {/* Financials Row */}
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-gray-500 font-medium">Net Payout:</span>
                      {r.employment_type === 'daily_wage' ? (
                        <div className="text-right">
                          <span className="font-mono font-bold text-gray-500 text-sm tabular-nums">
                            PKR 0
                          </span>
                          <span className="block text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5">
                            Cleared Daily (PKR {r.net_payout.toLocaleString()} Paid)
                          </span>
                        </div>
                      ) : (
                        <span className="font-mono font-bold text-blue-700 text-sm tabular-nums">
                          PKR {r.net_payout.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Action */}
                  <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleOpenPayslip(r)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" /> View Payslip
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const singleHtml = buildPayslipContentHtml(r, [], companyLogo);
                        printFormattedDocument(`Payslip_${r.employee_name}_${selectedMonth}`, singleHtml, {
                          pageSize: 'A5',
                          hideDefaultHeader: true
                        });
                      }}
                      className="px-2.5 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                      title="Print / Save this individual payslip"
                    >
                      <Printer className="w-3 h-3 text-gray-600" /> Print
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  )}

      {/* Bonus / Fine Adjustment Modal */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto text-gray-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsAdjModalOpen(false)}
              className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-1 font-heading">Add Payroll Adjustment</h3>
            <p className="text-xs text-gray-500 mb-5">
              Add a performance bonus, late fine, or loan advance recovery for {selectedMonth}
            </p>

            <form onSubmit={handleSaveAdjustment} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Adjustment Type *</label>
                <select
                  value={adjForm.type}
                  onChange={(e) => setAdjForm({ ...adjForm, type: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-semibold focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="bonus">Bonus / Performance Reward</option>
                  <option value="fine">Late / Policy Fine</option>
                  <option value="advance_deduction">Salary Advance Recovery</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Amount (PKR) *</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={adjForm.amount}
                  onChange={(e) => setAdjForm({ ...adjForm, amount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-bold font-mono tabular-nums focus:outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Reason / Description *</label>
                <input
                  type="text"
                  required
                  value={adjForm.description}
                  onChange={(e) => setAdjForm({ ...adjForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600"
                  placeholder="e.g. Eid Bonus / Overtime reward / Late arrival fine"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsAdjModalOpen(false)}
                  className="px-4 py-2 rounded-md text-gray-600 hover:text-gray-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-md font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer active:scale-95"
                >
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Payslip Modal (Half-A4 / A5 Layout) */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-lg p-5 sm:p-6 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto text-gray-800 space-y-4 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedPayslip(null)}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 print:hidden cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            {(() => {
              const isSelectedDaily = selectedPayslip.employment_type === 'daily_wage';
              const themeColor = isSelectedDaily ? 'text-amber-600' : 'text-blue-600';
              const badgeStyle = isSelectedDaily 
                ? 'bg-amber-50 text-amber-700 border-amber-200' 
                : 'bg-blue-50 text-blue-700 border-blue-200';
              const netBoxStyle = isSelectedDaily
                ? 'bg-amber-50 text-amber-900 border-amber-200'
                : 'bg-blue-50 text-blue-900 border-blue-200';
              const netTextColor = isSelectedDaily ? 'text-amber-700' : 'text-blue-700';

              return (
                <>
                  <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 font-heading tracking-tight">MOHSIN & CO</h2>
                      <p className={`text-[11px] font-semibold uppercase tracking-wider ${themeColor}`}>
                        {isSelectedDaily ? 'Daily Wage Voucher (Daily Clearance)' : 'Salary Payslip'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border uppercase font-mono tabular-nums ${badgeStyle}`}>
                        {isSelectedDaily ? 'Daily Payout' : `Period: ${selectedPayslip.period_month}`}
                      </span>
                    </div>
                  </div>

                  {/* Info Summary */}
                  <div className="flex items-start justify-between gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">
                        {selectedPayslip.employee_name} <span className={`font-mono font-semibold ${netTextColor}`}>({selectedPayslip.employee_code})</span>
                      </p>
                      <p className="text-gray-500 mt-0.5">{selectedPayslip.designation} • {selectedPayslip.department}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-800 capitalize">
                        {isSelectedDaily ? 'Daily Wage (Daily Come, Daily Pay)' : 'Monthly Staff'}
                      </p>
                      <p className="font-medium text-gray-500 font-mono tabular-nums mt-0.5 text-[11px]">
                        {isSelectedDaily
                          ? `1 Day Worked Today • Shift Payout`
                          : `${selectedPayslip.days_present}P / ${selectedPayslip.days_absent}A / ${(selectedPayslip.days_off !== undefined && selectedPayslip.days_off !== null ? selectedPayslip.days_off : Math.max(0, getDaysInMonth(selectedPayslip.period_month) - selectedPayslip.working_days))}Off / ${selectedPayslip.days_leave ?? 0}L (${getDaysInMonth(selectedPayslip.period_month)}d)`}
                      </p>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="space-y-1.5 text-xs">
                    <h4 className="font-bold text-gray-600 uppercase tracking-wider text-[10px]">
                      {isSelectedDaily ? 'Daily Shift Earnings' : 'Earnings & Deductions'}
                    </h4>
                    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                      <div className="flex justify-between px-3 py-2 bg-gray-50 font-bold border-b border-gray-200 text-gray-600 text-[11px] uppercase tracking-wider">
                        <span>Description</span>
                        <span>Amount</span>
                      </div>
                      
                      {/* Base Rate */}
                      <div className="flex justify-between px-3 py-2.5 border-b border-gray-100 text-gray-700">
                        <span>
                          {isSelectedDaily 
                            ? "Today's Daily Wage Rate (Shift Clearance)" 
                            : 'Base Salary'}
                        </span>
                        <span className="font-mono tabular-nums font-semibold">
                          PKR {(isSelectedDaily ? selectedPayslip.base_rate : selectedPayslip.gross_earnings).toLocaleString()}
                        </span>
                      </div>

                      {/* Absent Deductions */}
                      {!isSelectedDaily && selectedPayslip.employment_type === 'monthly_salary' && selectedPayslip.absent_deductions > 0 && (
                        <div className="flex justify-between px-3 py-2.5 border-b border-gray-100 text-rose-700 font-medium">
                          <span>Absence Cut ({selectedPayslip.days_absent}d)</span>
                          <span className="font-mono tabular-nums">- PKR {selectedPayslip.absent_deductions.toLocaleString()}</span>
                        </div>
                      )}

                      {/* Dynamic Adjustments */}
                      {!isSelectedDaily && (
                        payslipAdjustments.length > 0 ? (
                          payslipAdjustments.map((adj) => {
                            const isPositive = adj.type === 'bonus';
                            return (
                              <div 
                                key={adj.id} 
                                className={`flex justify-between px-3 py-2.5 border-b border-gray-100 ${isPositive ? 'text-emerald-700' : 'text-rose-700'} font-medium`}
                              >
                                <span>
                                  {isPositive ? '+ ' : '- '}
                                  {adj.type === 'bonus' ? 'Bonus' : adj.type === 'fine' ? 'Fine' : 'Advance'}: {escapeHtml(adj.description)}
                                </span>
                                <span className="font-mono tabular-nums font-semibold">
                                  {isPositive ? '+' : '-'} PKR {adj.amount.toLocaleString()}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <>
                            {selectedPayslip.total_bonuses > 0 && (
                              <div className="flex justify-between px-3 py-2.5 border-b border-gray-100 text-emerald-700 font-medium">
                                <span>+ Bonus</span>
                                <span className="font-mono tabular-nums">+ PKR {selectedPayslip.total_bonuses.toLocaleString()}</span>
                              </div>
                            )}
                            {selectedPayslip.total_fines > 0 && (
                              <div className="flex justify-between px-3 py-2.5 border-b border-gray-100 text-rose-700 font-medium">
                                <span>- Fine</span>
                                <span className="font-mono tabular-nums">- PKR {selectedPayslip.total_fines.toLocaleString()}</span>
                              </div>
                            )}
                            {selectedPayslip.advance_deductions > 0 && (
                              <div className="flex justify-between px-3 py-2.5 border-b border-gray-100 text-orange-700 font-medium">
                                <span>- Advance Recovery</span>
                                <span className="font-mono tabular-nums">- PKR {selectedPayslip.advance_deductions.toLocaleString()}</span>
                              </div>
                            )}
                          </>
                        )
                      )}

                      <div className={`flex justify-between px-3 py-3 font-extrabold text-sm border-t ${netBoxStyle}`}>
                        <span>{isSelectedDaily ? 'TODAY NET PAYABLE' : 'NET PAY'}</span>
                        <span className={`font-mono tabular-nums text-base ${netTextColor}`}>
                          PKR {(isSelectedDaily ? selectedPayslip.base_rate : selectedPayslip.net_payout).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {isSelectedDaily && (
                      <p className="text-[10px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 mt-2">
                        ⓘ <strong>Daily Clearance:</strong> Cash handed over upon today&apos;s shift completion. (Month-to-date worked: {selectedPayslip.days_present} days = PKR {selectedPayslip.gross_earnings.toLocaleString()}).
                      </p>
                    )}
                  </div>
                </>
              );
            })()}

            {/* Print Action */}
            <div className="flex justify-end gap-3 pt-3 border-t border-gray-200 print:hidden">
              <button
                onClick={() => setSelectedPayslip(null)}
                className="px-4 py-2 rounded-md text-xs font-semibold text-gray-600 hover:text-gray-800 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handlePrintPayslip}
                className="px-5 py-2 rounded-md text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
              >
                <Printer className="w-4 h-4 text-white" /> Print Payslip (A5)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
