import React, { useState, useEffect } from 'react';
import { AttendanceRecord, ShiftRule, Employee } from '../types';
import { 
  CalendarCheck2, 
  Clock, 
  Calendar, 
  Sliders, 
  Search, 
  Plus, 
  X, 
  AlertCircle, 
  CalendarRange, 
  Save, 
  ChevronRight, 
  CheckCircle,
  FileText,
  History,
  CalendarDays,
  Loader2
} from 'lucide-react';
import { StatusChip } from './StatusChip';
import { authFetch } from '../auth/AuthContext';

interface AttendanceViewProps {
  attendanceRecords: AttendanceRecord[];
  selectedDate: string;
  onDateChange: (date: string) => void;
  shifts?: ShiftRule[];
  shiftRule: ShiftRule;
  onUpdateShiftRule: (rule: ShiftRule) => void;
  onCreateShift?: (shift: Partial<ShiftRule>) => Promise<void>;
  onManualOverride: (data: {
    employee_id: string;
    date: string;
    check_in_time?: string;
    check_out_time?: string;
    status: string;
    reason: string;
  }) => void;
  onBulkAttendanceOverride?: (entries: Array<{
    employee_id: string;
    date: string;
    check_in_time?: string;
    check_out_time?: string;
    status: string;
    reason: string;
  }>) => void;
  userRole: string;
  employees?: Employee[];
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  attendanceRecords,
  selectedDate,
  onDateChange,
  shifts = [],
  shiftRule,
  onUpdateShiftRule,
  onCreateShift,
  onManualOverride,
  onBulkAttendanceOverride,
  userRole,
  employees = []
}) => {
  const canOverride = userRole === 'super_admin' || userRole === 'hr_admin';
  const [viewMode, setViewMode] = useState<'daily' | 'history'>('daily');
  const [historyMonth, setHistoryMonth] = useState<string>(selectedDate.substring(0, 7));
  const [isAllHistory, setIsAllHistory] = useState<boolean>(true);
  const [selectedHistoryEmp, setSelectedHistoryEmp] = useState<string>('all');
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);

  // Sync historyMonth whenever selectedDate changes
  useEffect(() => {
    if (selectedDate && selectedDate.length >= 7) {
      setHistoryMonth(selectedDate.substring(0, 7));
    }
  }, [selectedDate]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [isMultiDateModalOpen, setIsMultiDateModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);

  // Selected shift for shift manager modal
  const [selectedShiftForEdit, setSelectedShiftForEdit] = useState<ShiftRule>(shiftRule);

  // New shift creation state inside Shift Policies Modal
  const [isCreatingNewShift, setIsCreatingNewShift] = useState(false);
  const [newShiftForm, setNewShiftForm] = useState<Partial<ShiftRule>>({
    name: '',
    check_in_time: '09:00',
    check_out_time: '17:00',
    grace_period_minutes: 30,
    mark_absent_after_grace: true
  });
  const [isSavingShift, setIsSavingShift] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [shiftSuccessMsg, setShiftSuccessMsg] = useState<string | null>(null);

  // Multi-date Attendance Form State (P-10: Default to empty, require explicit selection)
  const [multiFormEmployeeId, setMultiFormEmployeeId] = useState('');
  const [dateRangeFrom, setDateRangeFrom] = useState(selectedDate);
  const [dateRangeTo, setDateRangeTo] = useState(selectedDate);
  const [multiDateError, setMultiDateError] = useState<string | null>(null);
  const [isSavingMultiDate, setIsSavingMultiDate] = useState(false);
  const [dateEntries, setDateEntries] = useState<Array<{
    date: string;
    status: string;
    check_in_time: string;
    check_out_time: string;
    reason: string;
  }>>([]);

  // Single Override Form
  const [overrideForm, setOverrideForm] = useState({
    check_in_time: '09:00:00',
    check_out_time: '17:00:00',
    status: 'present',
    reason: ''
  });
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  // Whenever shifts update or shiftRule changes, sync selectedShiftForEdit
  useEffect(() => {
    setSelectedShiftForEdit(shiftRule);
  }, [shiftRule]);

  // Fetch full history when in history mode
  const fetchHistoryRecords = async () => {
    setIsLoadingHistory(true);
    try {
      let url = isAllHistory ? '/api/attendance?all=true' : `/api/attendance?month=${historyMonth}`;
      if (selectedHistoryEmp !== 'all') {
        url += `${url.includes('?') ? '&' : '?'}employee_id=${selectedHistoryEmp}`;
      }
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setHistoryRecords(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching attendance history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'history') {
      fetchHistoryRecords();
    }
  }, [viewMode, historyMonth, isAllHistory, selectedHistoryEmp, attendanceRecords]);

  // When opening multi-date modal or changing date range, generate dates
  useEffect(() => {
    if (!isMultiDateModalOpen) return;
    generateDateRangeEntries(dateRangeFrom, dateRangeTo);
  }, [dateRangeFrom, dateRangeTo, multiFormEmployeeId, isMultiDateModalOpen]);

  const generateDateRangeEntries = (from: string, to: string) => {
    const [sYear, sMonth, sDay] = from.split('-').map(Number);
    const [eYear, eMonth, eDay] = to.split('-').map(Number);
    let start = new Date(sYear, sMonth - 1, sDay);
    const end = new Date(eYear, eMonth - 1, eDay);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    if (!multiFormEmployeeId) {
      setDateEntries([]);
      return;
    }

    // Pick chosen employee's shift defaults
    const emp = employees.find(e => e.id === multiFormEmployeeId);

    const empShift = shifts.find(s => s.id === emp?.shift_id) || shiftRule;

    const defaultIn = empShift.check_in_time ? (empShift.check_in_time.length === 5 ? `${empShift.check_in_time}:00` : empShift.check_in_time) : '09:00:00';
    const defaultOut = empShift.check_out_time ? (empShift.check_out_time.length === 5 ? `${empShift.check_out_time}:00` : empShift.check_out_time) : '17:00:00';

    const entries: Array<{
      date: string;
      status: string;
      check_in_time: string;
      check_out_time: string;
      reason: string;
    }> = [];

    const assignedOffDates = new Set(
      String(emp?.custom_off_dates ?? '')
        .split(',')
        .map(s => s.trim())
        .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
    );
    const weeklyOffStr = String(emp?.weekly_off_day || '').trim();
    const assignedWeeklyOffSet = new Set(
      weeklyOffStr
        ? weeklyOffStr.split(',').map(s => s.trim()).filter(s => s !== '' && !isNaN(Number(s))).map(Number)
        : []
    );

    let curr = new Date(start);
    let count = 0;
    while (curr <= end && count < 366) {
      const yearStr = curr.getFullYear();
      const monthStr = String(curr.getMonth() + 1).padStart(2, '0');
      const dayStr = String(curr.getDate()).padStart(2, '0');
      const dStr = `${yearStr}-${monthStr}-${dayStr}`;

      const isOff = assignedOffDates.has(dStr) || assignedWeeklyOffSet.has(curr.getDay());

      entries.push({
        date: dStr,
        status: isOff ? 'weekly_off' : 'present',
        check_in_time: isOff ? '' : defaultIn,
        check_out_time: isOff ? '' : defaultOut,
        reason: 'Manual Range Entry'
      });

      curr.setDate(curr.getDate() + 1);
      count++;
    }

    setDateEntries(entries);
  };

  const handleDateEntryChange = (index: number, field: string, value: string) => {
    const emp = employees.find(e => e.id === multiFormEmployeeId);
    const empShift = shifts.find(s => s.id === emp?.shift_id) || shiftRule;
    const defaultIn = empShift.check_in_time ? (empShift.check_in_time.length === 5 ? `${empShift.check_in_time}:00` : empShift.check_in_time) : '09:00:00';
    const defaultOut = empShift.check_out_time ? (empShift.check_out_time.length === 5 ? `${empShift.check_out_time}:00` : empShift.check_out_time) : '17:00:00';

    setDateEntries(prev => {
      const updated = [...prev];
      const entry = { ...updated[index], [field]: value };
      if (field === 'status') {
        if (value === 'present' || value === 'late') {
          if (!entry.check_in_time) entry.check_in_time = defaultIn;
          if (!entry.check_out_time) entry.check_out_time = defaultOut;
        } else if (value === 'weekly_off' || value === 'absent' || value === 'leave') {
          entry.check_in_time = '';
          entry.check_out_time = '';
        }
      }
      updated[index] = entry;
      return updated;
    });
  };

  const handleSaveMultiDateAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setMultiDateError(null);
    if (!multiFormEmployeeId) {
      setMultiDateError('Please select an employee before saving attendance.');
      return;
    }

    const selectedEmp = employees.find(emp => emp.id === multiFormEmployeeId);
    if (!selectedEmp) {
      setMultiDateError('Selected employee record not found.');
      return;
    }

    if (dateEntries.length === 0) {
      setMultiDateError('No attendance date entries generated to save.');
      return;
    }

    setIsSavingMultiDate(true);
    try {
      if (onBulkAttendanceOverride) {
        const payload = dateEntries.map(entry => ({
          employee_id: multiFormEmployeeId,
          date: entry.date,
          check_in_time: entry.status === 'weekly_off' || entry.status === 'absent' ? undefined : entry.check_in_time,
          check_out_time: entry.status === 'weekly_off' || entry.status === 'absent' ? undefined : entry.check_out_time,
          status: entry.status,
          reason: entry.reason?.trim() || 'Manual Range Entry'
        }));
        await onBulkAttendanceOverride(payload);
      } else {
        for (const entry of dateEntries) {
          await onManualOverride({
            employee_id: multiFormEmployeeId,
            date: entry.date,
            check_in_time: entry.status === 'weekly_off' || entry.status === 'absent' ? undefined : entry.check_in_time,
            check_out_time: entry.status === 'weekly_off' || entry.status === 'absent' ? undefined : entry.check_out_time,
            status: entry.status,
            reason: entry.reason?.trim() || 'Manual Range Entry'
          });
        }
      }

      setIsMultiDateModalOpen(false);
      fetchHistoryRecords();
    } catch (err: any) {
      setMultiDateError(err.message || 'Failed to save attendance entries');
    } finally {
      setIsSavingMultiDate(false);
    }
  };

  const activeRecords = viewMode === 'daily' ? attendanceRecords : historyRecords;

  const filteredRecords = activeRecords.filter(r => {
    const matchesSearch = (r.employee_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (r.employee_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (r.department || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (r.override_reason || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOpenOverride = (record: AttendanceRecord) => {
    setSelectedRecord(record);
    setOverrideForm({
      check_in_time: record.check_in_time || '09:00:00',
      check_out_time: record.check_out_time || '17:00:00',
      status: record.status,
      reason: record.override_reason || ''
    });
    setIsOverrideModalOpen(true);
  };

  const handleOpenMultiDateModal = () => {
    // P-10: Default to empty so user must explicitly select an employee — never pre-select a real employee
    setMultiFormEmployeeId('');
    const todayStr = new Date().toISOString().split('T')[0];
    const initialDate = viewMode === 'daily' ? selectedDate : todayStr;
    setDateRangeFrom(initialDate);
    setDateRangeTo(initialDate);
    setIsMultiDateModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setShiftError(null);
    setShiftSuccessMsg(null);
    setIsSavingShift(true);

    try {
      if (isCreatingNewShift) {
        if (!newShiftForm.name?.trim()) {
          setShiftError('Shift Name is required.');
          setIsSavingShift(false);
          return;
        }
        if (onCreateShift) {
          await onCreateShift({
            name: newShiftForm.name.trim(),
            check_in_time: newShiftForm.check_in_time || '09:00',
            check_out_time: newShiftForm.check_out_time || '17:00',
            grace_period_minutes: Number(newShiftForm.grace_period_minutes) || 0,
            mark_absent_after_grace: Boolean(newShiftForm.mark_absent_after_grace)
          });
        }
        setShiftSuccessMsg(`New shift "${newShiftForm.name.trim()}" created successfully!`);
        setIsCreatingNewShift(false);
        setNewShiftForm({
          name: '',
          check_in_time: '09:00',
          check_out_time: '17:00',
          grace_period_minutes: 30,
          mark_absent_after_grace: true
        });
        setTimeout(() => {
          setIsShiftModalOpen(false);
          setShiftSuccessMsg(null);
        }, 1200);
      } else {
        onUpdateShiftRule(selectedShiftForEdit);
        setShiftSuccessMsg('Shift policy updated successfully!');
        setTimeout(() => {
          setIsShiftModalOpen(false);
          setShiftSuccessMsg(null);
        }, 800);
      }
    } catch (err: any) {
      setShiftError(err.message || 'Failed to save shift.');
    } finally {
      setIsSavingShift(false);
    }
  };

  const handleSaveOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverrideError(null);
    if (!selectedRecord) return;
    const targetDate = selectedRecord.date || selectedDate;

    setIsSavingOverride(true);
    try {
      await onManualOverride({
        employee_id: selectedRecord.employee_id,
        date: targetDate,
        check_in_time: overrideForm.check_in_time,
        check_out_time: overrideForm.check_out_time,
        status: overrideForm.status,
        reason: overrideForm.reason
      });
      setIsOverrideModalOpen(false);
      fetchHistoryRecords();
    } catch (err: any) {
      setOverrideError(err.message || 'Failed to save attendance override');
    } finally {
      setIsSavingOverride(false);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-700 tracking-tight font-heading flex items-center gap-2">
            <CalendarCheck2 className="w-6 h-6 text-blue-600" /> Biometric Attendance Logs & Shifts
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Tracks check-in/out timestamps, multi-date history, and highlighted override remarks
          </p>
        </div>

        {/* View Mode Switcher + Action Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          
          {/* View Mode Switcher */}
          <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-2xs">
            <button
              onClick={() => setViewMode('daily')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'daily'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Daily Roster
            </button>
            <button
              onClick={() => {
                setViewMode('history');
                setIsAllHistory(true);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'history'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <History className="w-3.5 h-3.5" /> Complete History
            </button>
          </div>

          {/* Date Picker (Daily Mode) */}
          {viewMode === 'daily' ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 tabular-nums shadow-xs">
                <Calendar className="w-4 h-4 text-blue-600" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => onDateChange(e.target.value)}
                  className="bg-transparent text-gray-800 font-bold focus:outline-none cursor-pointer"
                />
              </div>
              {selectedDate !== new Date().toISOString().split('T')[0] && (
                <button
                  type="button"
                  onClick={() => onDateChange(new Date().toISOString().split('T')[0])}
                  className="px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs"
                  title="Jump to today's date"
                >
                  Today
                </button>
              )}
            </div>
          ) : (
            /* History Mode Controls: Month / All Time Toggle + Employee Filter */
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 text-xs">
                <button
                  type="button"
                  onClick={() => setIsAllHistory(false)}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                    !isAllHistory ? 'bg-white text-blue-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  By Month
                </button>
                <button
                  type="button"
                  onClick={() => setIsAllHistory(true)}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                    isAllHistory ? 'bg-white text-blue-700 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  All History
                </button>
              </div>

              {!isAllHistory && (
                <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-xs text-gray-700 tabular-nums shadow-xs">
                  <History className="w-3.5 h-3.5 text-blue-600" />
                  <input
                    type="month"
                    value={historyMonth}
                    onChange={(e) => setHistoryMonth(e.target.value)}
                    className="bg-transparent text-gray-800 font-bold focus:outline-none cursor-pointer text-xs"
                  />
                </div>
              )}

              {/* Employee Filter Dropdown in History Mode */}
              <div className="flex items-center bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs shadow-xs">
                <select
                  value={selectedHistoryEmp}
                  onChange={(e) => setSelectedHistoryEmp(e.target.value)}
                  className="bg-transparent text-gray-800 font-medium focus:outline-none cursor-pointer max-w-[150px] truncate"
                >
                  <option value="all">All Employees</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employee_code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Multi-Date Manual Entry Button (Bug #7 Fix) */}
          {canOverride && (
            <button
              onClick={handleOpenMultiDateModal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
            >
              <CalendarRange className="w-4 h-4 text-white" /> Manual / Range Entry
            </button>
          )}

          {/* Shift Rules Button */}
          {canOverride && (
            <button
              onClick={() => {
                setSelectedShiftForEdit(shiftRule);
                setIsShiftModalOpen(true);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
            >
              <Sliders className="w-4 h-4 text-white" /> Shift Policies
            </button>
          )}
        </div>
      </div>

      {/* Top Status Counter Pills */}
      <div className="flex items-center gap-2 bg-white p-3 rounded-lg text-xs font-semibold text-gray-700 border border-gray-200 shadow-xs flex-wrap">
        <span className="text-gray-500 font-bold mr-1">
          {viewMode === 'daily' ? `Log Summary (${selectedDate}):` : `Monthly Summary (${historyMonth}):`}
        </span>
        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded font-bold flex items-center gap-1.5">
          Present <span className="bg-emerald-600 text-white text-[10px] px-1.5 rounded-full">{activeRecords.filter(r => r.status === 'present' || r.status === 'late' || r.status === 'half_day').length}</span>
        </span>
        <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded font-bold flex items-center gap-1.5">
          Late <span className="bg-amber-600 text-white text-[10px] px-1.5 rounded-full">{activeRecords.filter(r => r.status === 'late' || ((r.late_minutes ?? 0) > 0 && r.status !== 'absent')).length}</span>
        </span>
        <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded font-bold flex items-center gap-1.5">
          Absent <span className="bg-rose-600 text-white text-[10px] px-1.5 rounded-full">{activeRecords.filter(r => r.status === 'absent').length}</span>
        </span>
        <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded font-bold flex items-center gap-1.5">
          Off/Leave <span className="bg-blue-600 text-white text-[10px] px-1.5 rounded-full">{activeRecords.filter(r => r.status === 'weekly_off' || r.status === 'leave').length}</span>
        </span>
        <span className="ml-auto text-gray-400 font-mono text-[11px]">
          Total {filteredRecords.length} records shown
        </span>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 border border-gray-200 rounded-lg flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by employee name, EMP ID, department, or remarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 min-w-[160px]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-1.5 px-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-800 focus:outline-none focus:border-blue-600 cursor-pointer font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="present">Present (On Time)</option>
              <option value="late">Late (Grace Period)</option>
              <option value="absent">Absent (Salary Cut)</option>
              <option value="weekly_off">Weekly Off</option>
              <option value="leave">Approved Leave</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer border border-gray-300 transition-colors"
        >
          Reset Filters
        </button>
      </div>

      {/* Attendance Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-700">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10">
              <tr>
                <th className="p-3.5 text-center w-12">#</th>
                {viewMode === 'history' && <th className="p-3.5">Date</th>}
                <th className="p-3.5">Employee Name & ID</th>
                <th className="p-3.5">Department</th>
                <th className="p-3.5">Check-In</th>
                <th className="p-3.5">Check-Out</th>
                <th className="p-3.5">Hours Worked</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Remarks / Reason</th>
                <th className="p-3.5">Data Source</th>
                {canOverride && <th className="p-3.5 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={viewMode === 'history' ? 11 : 10} className="text-center py-12 text-gray-400 font-medium">
                    {isLoadingHistory ? 'Loading history logs...' : `No attendance logs recorded for ${viewMode === 'daily' ? selectedDate : historyMonth}. Click "Manual / Range Entry" to record.`}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r, idx) => (
                  <tr key={r.id || `${r.employee_id}_${r.date}`} className="hover:bg-blue-50/40 transition-colors">
                    <td className="p-3.5 text-center font-mono text-gray-500 font-bold text-xs">
                      {idx + 1}
                    </td>
                    {viewMode === 'history' && (
                      <td className="p-3.5 font-bold font-mono text-gray-900 tabular-nums whitespace-nowrap">
                        {r.date}
                      </td>
                    )}
                    <td className="p-3.5">
                      <div>
                        {/* Requirement 8: Mandatory Display of Name and EMP ID together */}
                        <p className="font-bold text-gray-900 text-xs sm:text-sm">
                          {r.employee_name} <span className="font-mono text-blue-700 font-bold text-xs">({r.employee_code || 'EMP'})</span>
                        </p>
                        <p className="text-[10px] text-blue-600 font-medium capitalize mt-0.5">{r.employment_type?.replace('_', ' ')}</p>
                      </div>
                    </td>

                    <td className="p-3.5 text-gray-600 font-medium">{r.department || 'Operations'}</td>

                    <td className="p-3.5 font-mono font-medium text-gray-800 tabular-nums">
                      {r.check_in_time || '--:--'}
                      {r.late_minutes > 0 && (
                        <span className="text-[10px] text-amber-700 font-bold ml-1.5 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                          (+{r.late_minutes}m late)
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 font-mono font-medium text-gray-800 tabular-nums">
                      {r.check_out_time || '--:--'}
                    </td>

                    <td className="p-3.5 font-bold text-gray-800 font-mono tabular-nums">
                      {r.hours_worked > 0 ? `${r.hours_worked} hrs` : '--'}
                    </td>

                    <td className="p-3.5">
                      <StatusChip
                        status={r.status as any}
                        label={r.status}
                        time={r.check_in_time || undefined}
                      />
                    </td>

                    {/* Highlighted Remarks / Reason Column (Bug #7 Fix) */}
                    <td className="p-3.5">
                      {r.override_reason ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                            <FileText className="w-3 h-3 text-blue-600 shrink-0" />
                            {r.override_reason}
                          </span>
                          {r.override_by && (
                            <span className="text-[9px] text-gray-400 font-sans">By: {r.override_by}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">--</span>
                      )}
                    </td>

                    <td className="p-3.5 text-[11px]">
                      {r.is_manual_override ? (
                        <span className="text-blue-600 font-bold">
                          Manual Entry
                        </span>
                      ) : !r.check_in_time ? (
                        <span className="text-gray-400 italic">No Biometric Punch</span>
                      ) : (
                        <span className="text-gray-500">ZKTeco ADMS Terminal</span>
                      )}
                    </td>

                    {canOverride && (
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => handleOpenOverride(r)}
                          className="px-2.5 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-all text-xs cursor-pointer border border-gray-300 shadow-xs"
                        >
                          Override
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-Date / Range Manual Attendance Modal (Bug #7 Fix) */}
      {isMultiDateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-2xl p-6 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto text-gray-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsMultiDateModalOpen(false)}
              className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-1 font-heading flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-emerald-600" /> Date Range & Multi-Day Attendance
            </h3>
            <p className="text-xs text-gray-500 mb-5">
              Select date span (or month range) to record status and check-in/out without overwriting other records.
            </p>

            <form onSubmit={handleSaveMultiDateAttendance} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 p-3.5 rounded-lg border border-gray-200">
                
                {/* Employee Selector (P-10: Required, no default selection, displays Joining Date) */}
                <div className="sm:col-span-1">
                  <label className="block font-semibold text-gray-700 mb-1">Select Employee *</label>
                  <select
                    required
                    value={multiFormEmployeeId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      setMultiFormEmployeeId(newId);
                    }}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 font-bold focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value="">-- Select Employee * --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.employee_code}){emp.joining_date ? ` - Joined ${emp.joining_date}` : ''}
                      </option>
                    ))}
                  </select>
                  {multiFormEmployeeId && (
                    <p className="text-[10px] text-blue-600 mt-1 font-medium">
                      Joining Date: {employees.find(e => e.id === multiFormEmployeeId)?.joining_date || 'N/A'}
                    </p>
                  )}
                </div>

                {/* From Date */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">From Date *</label>
                  <input
                    type="date"
                    required
                    value={dateRangeFrom}
                    onChange={(e) => setDateRangeFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 font-mono font-medium focus:outline-none focus:border-blue-600 cursor-pointer"
                  />
                </div>

                {/* To Date */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">To Date *</label>
                  <input
                    type="date"
                    required
                    value={dateRangeTo}
                    onChange={(e) => setDateRangeTo(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 font-mono font-medium focus:outline-none focus:border-blue-600 cursor-pointer"
                  />
                </div>
              </div>

              {/* Date-wise Breakdown List (P-08: Text defect pluralization fix) */}
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">
                  Date-wise Status & Timings ({dateEntries.length} {dateEntries.length === 1 ? 'day' : 'days'} generated)
                </label>

                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase text-[10px] sticky top-0 z-10">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Check-In</th>
                        <th className="p-2">Check-Out</th>
                        <th className="p-2">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white font-mono">
                      {dateEntries.map((entry, idx) => (
                        <tr key={entry.date} className="hover:bg-gray-50">
                          <td className="p-2 font-bold text-gray-800 whitespace-nowrap">
                            {entry.date}
                          </td>
                          <td className="p-2">
                            <select
                              value={entry.status}
                              onChange={(e) => handleDateEntryChange(idx, 'status', e.target.value)}
                              className="px-2 py-1 bg-gray-50 border border-gray-300 rounded text-xs font-sans font-bold capitalize focus:outline-none"
                            >
                              <option value="present">Present</option>
                              <option value="late">Late</option>
                              <option value="absent">Absent</option>
                              <option value="weekly_off">Weekly Off</option>
                              <option value="leave">Leave</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              disabled={entry.status === 'weekly_off' || entry.status === 'absent'}
                              value={entry.check_in_time}
                              onChange={(e) => handleDateEntryChange(idx, 'check_in_time', e.target.value)}
                              placeholder="09:00:00"
                              className="w-20 px-1.5 py-1 bg-gray-50 border border-gray-300 rounded text-xs text-center disabled:opacity-30"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              disabled={entry.status === 'weekly_off' || entry.status === 'absent'}
                              value={entry.check_out_time}
                              onChange={(e) => handleDateEntryChange(idx, 'check_out_time', e.target.value)}
                              placeholder="17:00:00"
                              className="w-20 px-1.5 py-1 bg-gray-50 border border-gray-300 rounded text-xs text-center disabled:opacity-30"
                            />
                          </td>
                          <td className="p-2 font-sans">
                            <input
                              type="text"
                              value={entry.reason}
                              onChange={(e) => handleDateEntryChange(idx, 'reason', e.target.value)}
                              placeholder="Reason"
                              className="w-24 px-1.5 py-1 bg-gray-50 border border-gray-300 rounded text-xs"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {multiDateError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{multiDateError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  disabled={isSavingMultiDate}
                  onClick={() => setIsMultiDateModalOpen(false)}
                  className="px-4 py-2 rounded-md text-gray-600 hover:text-gray-800 disabled:opacity-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingMultiDate}
                  className="px-5 py-2 rounded-md font-bold bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5"
                >
                  {isSavingMultiDate ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving Records...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Save {dateEntries.length} Attendance Records
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Rules Modal */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-lg p-6 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto text-gray-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsShiftModalOpen(false)}
              className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center justify-between mb-1 pr-6">
              <h3 className="text-xl font-bold text-gray-900 font-heading">
                {isCreatingNewShift ? 'Add New Shift Policy' : 'Shift Schedule & Grace Policy'}
              </h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {isCreatingNewShift 
                ? 'Define a new working shift with its scheduled timings and grace cutoff.'
                : 'Select a shift to edit its timings and grace cutoff policy.'}
            </p>

            {/* Mode Tabs: Edit Existing vs Add New Shift */}
            <div className="flex items-center gap-2 mb-4 p-1 bg-gray-100 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setIsCreatingNewShift(false);
                  setShiftError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  !isCreatingNewShift
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Edit Existing ({shifts.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingNewShift(true);
                  setShiftError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isCreatingNewShift
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Plus className="w-3.5 h-3.5" /> Add New Shift
              </button>
            </div>

            {shiftError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{shiftError}</span>
              </div>
            )}
            {shiftSuccessMsg && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2 text-xs text-emerald-700">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{shiftSuccessMsg}</span>
              </div>
            )}

            {!isCreatingNewShift ? (
              <form onSubmit={handleSaveShift} className="space-y-4 text-xs">
                {shifts.length > 1 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-semibold text-gray-700">Select Shift to Edit</label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingNewShift(true);
                          setShiftError(null);
                        }}
                        className="text-[11px] text-blue-600 font-bold hover:text-blue-800 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add Another
                      </button>
                    </div>
                    <select
                      value={selectedShiftForEdit?.id || ''}
                      onChange={(e) => {
                        const s = shifts.find(item => item.id === e.target.value);
                        if (s) setSelectedShiftForEdit(s);
                      }}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md font-bold text-gray-900 focus:outline-none"
                    >
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.check_in_time} - {s.check_out_time})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Shift Name *</label>
                  <input
                    type="text"
                    required
                    value={selectedShiftForEdit?.name || ''}
                    onChange={(e) => setSelectedShiftForEdit({ ...selectedShiftForEdit, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Scheduled Check-In *</label>
                    <input
                      type="text"
                      required
                      value={selectedShiftForEdit?.check_in_time || ''}
                      onChange={(e) => setSelectedShiftForEdit({ ...selectedShiftForEdit, check_in_time: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-mono focus:outline-none focus:border-blue-600 tabular-nums"
                      placeholder="09:00"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Scheduled Check-Out *</label>
                    <input
                      type="text"
                      required
                      value={selectedShiftForEdit?.check_out_time || ''}
                      onChange={(e) => setSelectedShiftForEdit({ ...selectedShiftForEdit, check_out_time: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-mono focus:outline-none focus:border-blue-600 tabular-nums"
                      placeholder="17:00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Grace Period (Minutes) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={120}
                    value={selectedShiftForEdit?.grace_period_minutes ?? 30}
                    onChange={(e) => setSelectedShiftForEdit({ ...selectedShiftForEdit, grace_period_minutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-bold font-mono focus:outline-none focus:border-blue-600 tabular-nums"
                  />
                </div>

                <div className="flex items-center gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="mark_absent_edit"
                    checked={Boolean(selectedShiftForEdit?.mark_absent_after_grace)}
                    onChange={(e) => setSelectedShiftForEdit({ ...selectedShiftForEdit, mark_absent_after_grace: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600"
                  />
                  <label htmlFor="mark_absent_edit" className="text-gray-800 font-medium cursor-pointer">
                    Mark employee <span className="text-rose-600 font-bold">Absent + Cut Day Salary</span> if check-in is past grace cutoff
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setIsShiftModalOpen(false)}
                    className="px-4 py-2 rounded-md text-gray-600 hover:text-gray-800 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingShift}
                    className="px-5 py-2 rounded-md font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSavingShift ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                      </>
                    ) : (
                      'Save Shift Policy'
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSaveShift} className="space-y-4 text-xs">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
                  <p className="font-bold flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-blue-600" /> Define New Shift Policy
                  </p>
                  <p className="text-[11px] text-blue-700 mt-0.5">
                    This new shift will be available across the system and can be assigned to employees in the Employee Directory.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">New Shift Name *</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Night Shift, Morning Shift, Shift B"
                    value={newShiftForm.name || ''}
                    onChange={(e) => setNewShiftForm({ ...newShiftForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-semibold focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Scheduled Check-In *</label>
                    <input
                      type="text"
                      required
                      value={newShiftForm.check_in_time || '09:00'}
                      onChange={(e) => setNewShiftForm({ ...newShiftForm, check_in_time: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-mono focus:outline-none focus:border-blue-600 tabular-nums"
                      placeholder="09:00"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">Format: HH:MM (24-hour)</p>
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Scheduled Check-Out *</label>
                    <input
                      type="text"
                      required
                      value={newShiftForm.check_out_time || '17:00'}
                      onChange={(e) => setNewShiftForm({ ...newShiftForm, check_out_time: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-mono focus:outline-none focus:border-blue-600 tabular-nums"
                      placeholder="17:00"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">Format: HH:MM (24-hour)</p>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Grace Period (Minutes) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={120}
                    value={newShiftForm.grace_period_minutes ?? 30}
                    onChange={(e) => setNewShiftForm({ ...newShiftForm, grace_period_minutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-bold font-mono focus:outline-none focus:border-blue-600 tabular-nums"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Punches within grace time are marked on time.</p>
                </div>

                <div className="flex items-center gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="mark_absent_new"
                    checked={Boolean(newShiftForm.mark_absent_after_grace)}
                    onChange={(e) => setNewShiftForm({ ...newShiftForm, mark_absent_after_grace: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600"
                  />
                  <label htmlFor="mark_absent_new" className="text-gray-800 font-medium cursor-pointer">
                    Mark employee <span className="text-rose-600 font-bold">Absent + Cut Day Salary</span> if check-in is past grace cutoff
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setIsCreatingNewShift(false)}
                    className="px-4 py-2 rounded-md text-gray-600 hover:text-gray-800 font-semibold cursor-pointer"
                  >
                    Back to Edit
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingShift || !newShiftForm.name?.trim()}
                    className="px-5 py-2 rounded-md font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer active:scale-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSavingShift ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating Shift...
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" /> Create Shift
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Manual Single Override Modal */}
      {isOverrideModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto text-gray-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsOverrideModalOpen(false)}
              className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-1 font-heading">Manual Attendance Override</h3>
            <p className="text-xs text-gray-500 mb-5">
              Overriding record for <strong className="text-gray-900">{selectedRecord.employee_name} ({selectedRecord.employee_code})</strong> on {selectedRecord.date || selectedDate}
            </p>

            <form onSubmit={handleSaveOverride} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Check-In Time</label>
                  <input
                    type="text"
                    value={overrideForm.check_in_time}
                    onChange={(e) => setOverrideForm({ ...overrideForm, check_in_time: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-mono focus:outline-none focus:border-blue-600 tabular-nums"
                    placeholder="09:00:00"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Check-Out Time</label>
                  <input
                    type="text"
                    value={overrideForm.check_out_time}
                    onChange={(e) => setOverrideForm({ ...overrideForm, check_out_time: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-mono focus:outline-none focus:border-blue-600 tabular-nums"
                    placeholder="17:00:00"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Attendance Status *</label>
                <select
                  value={overrideForm.status}
                  onChange={(e) => setOverrideForm({ ...overrideForm, status: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-bold capitalize focus:outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="present">Present (On Time)</option>
                  <option value="late">Late (Within Grace)</option>
                  <option value="absent">Absent (Salary Cut)</option>
                  <option value="weekly_off">Weekly Off</option>
                  <option value="leave">Approved Leave</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Mandatory Override Reason *</label>
                <textarea
                  required
                  rows={3}
                  value={overrideForm.reason}
                  onChange={(e) => setOverrideForm({ ...overrideForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600"
                  placeholder="e.g. Hardware connectivity issue / Approved official site visit"
                />
              </div>

              {overrideError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{overrideError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  disabled={isSavingOverride}
                  onClick={() => setIsOverrideModalOpen(false)}
                  className="px-4 py-2 rounded-md text-gray-600 hover:text-gray-800 disabled:opacity-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingOverride}
                  className="px-5 py-2 rounded-md font-bold bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5"
                >
                  {isSavingOverride ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    'Save Override Log'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
