import React, { useState, useEffect, useRef } from 'react';
import { Employee, EmploymentType, AttendanceRecord, PayrollRecord, ShiftRule } from '../types';
import { authFetch } from '../auth/AuthContext';
import { 
  Users, 
  UserPlus, 
  Search, 
  Building2, 
  DollarSign, 
  Edit3, 
  Trash2, 
  X,
  Eye,
  Briefcase,
  Plus,
  Clock,
  Paperclip,
  FileText,
  AlertCircle,
  Upload,
  CheckCircle2,
  CalendarDays,
  ChevronDown,
  Check,
  Lock,
  EyeOff,
  ShieldAlert,
  ShieldCheck,
  UserCheck
} from 'lucide-react';
import { StatusChip } from './StatusChip';
import { EmployeeDetailModal } from './EmployeeDetailModal';

interface EmployeeManagementViewProps {
  employees: Employee[];
  shifts?: ShiftRule[];
  attendanceRecords?: AttendanceRecord[];
  payrollRecords?: PayrollRecord[];
  selectedMonth?: string;
  onAddEmployee: (emp: Partial<Employee>) => Promise<{ success: boolean; error?: string; id?: string }>;
  onUpdateEmployee: (emp: Employee) => Promise<{ success: boolean; error?: string }>;
  onDeleteEmployee: (id: string, options?: { force?: boolean; admin_password?: string } | boolean) => Promise<any> | void;
  onCreateShift?: (shift: Partial<ShiftRule>) => Promise<void>;
  userRole: string;
  // Inline delete confirmation state (replaces blocking window.confirm / alert)
  deleteConfirmId?: string | null;
  deletingEmployeeId?: string | null;
  deleteResultMsg?: { type: 'success' | 'error'; text: string } | null;
  onCancelDelete?: () => void;
  initialModelFilter?: 'all' | 'monthly_salary' | 'daily_wage';
  onModelFilterChange?: (filter: 'all' | 'monthly_salary' | 'daily_wage') => void;
}

// Pakistani CNIC helpers: 13 digits formatted as XXXXX-XXXXXXX-X (e.g. 42101-1234567-1)
export const formatPakCnic = (val: string): string => {
  const digits = (val || '').replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
};

export const isValidPakCnic = (cnic: string): boolean => {
  return /^\d{5}-\d{7}-\d{1}$/.test(cnic);
};

export interface NadraCnicInfo {
  isValid: boolean;
  rawDigits: string;
  formatted: string;
  provinceCode: string;
  provinceName: string;
  regionCode: string;
  familyNumber: string;
  genderDigit: string;
  gender: 'Male' | 'Female' | 'Unknown';
}

export const parseNadraCnic = (val: string): NadraCnicInfo | null => {
  const digits = (val || '').replace(/\D/g, '').slice(0, 13);
  if (digits.length !== 13) return null;

  const provinceCode = digits[0];
  const provinceMap: Record<string, string> = {
    '1': 'Khyber Pakhtunkhwa (KPK)',
    '2': 'FATA / Merged Tribal Areas',
    '3': 'Punjab',
    '4': 'Sindh',
    '5': 'Balochistan',
    '6': 'Islamabad (ICT)',
    '7': 'Gilgit-Baltistan',
    '8': 'Azad Jammu & Kashmir'
  };

  const regionCode = digits.slice(0, 5);
  const familyNumber = digits.slice(5, 12);
  const genderDigit = digits[12];
  const lastNum = parseInt(genderDigit, 10);
  const gender = isNaN(lastNum) ? 'Unknown' : (lastNum % 2 !== 0 ? 'Male' : 'Female');

  return {
    isValid: true,
    rawDigits: digits,
    formatted: `${regionCode}-${familyNumber}-${genderDigit}`,
    provinceCode,
    provinceName: provinceMap[provinceCode] || 'Pakistan',
    regionCode,
    familyNumber,
    genderDigit,
    gender
  };
};

// Off-days are specific one-off calendar dates (they do NOT auto-repeat). Default the picker's
// From→To span to the current calendar month so the common case (this month's offs) is one tap away.
const currentMonthBounds = (): { first: string; last: string } => {
  const d = new Date();
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
  return { first: `${y}-${mm}-01`, last: `${y}-${mm}-${String(lastDay).padStart(2, '0')}` };
};

export const EmployeeManagementView: React.FC<EmployeeManagementViewProps> = ({
  employees,
  shifts = [],
  attendanceRecords = [],
  payrollRecords = [],
  selectedMonth,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onCreateShift,
  userRole,
  deleteConfirmId,
  deletingEmployeeId,
  deleteResultMsg,
  onCancelDelete,
  initialModelFilter,
  onModelFilterChange
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>(initialModelFilter || 'all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');

  // Synchronize when initialModelFilter changes (e.g. from Dashboard redirection)
  useEffect(() => {
    if (initialModelFilter) {
      setSelectedType(initialModelFilter);
    }
  }, [initialModelFilter]);
  const [localToastMsg, setLocalToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Profile Detail Modal state
  const [detailEmployee, setDetailEmployee] = useState<Employee | null>(null);

  // Delete Confirmation Modal with Super Admin Password
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);
  const [isDeletingWithPassword, setIsDeletingWithPassword] = useState(false);

  const handleInitiateDelete = (emp: Employee) => {
    setEmployeeToDelete(emp);
    setAdminPasswordInput('');
    setShowAdminPassword(false);
    setDeleteModalError(null);
  };

  const handleConfirmDeleteWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeToDelete) return;
    if (!adminPasswordInput.trim()) {
      setDeleteModalError('Please enter the administrator password.');
      return;
    }

    setIsDeletingWithPassword(true);
    setDeleteModalError(null);

    try {
      const result = await (onDeleteEmployee as any)(employeeToDelete.id, {
        force: employeeToDelete.status === 'inactive',
        admin_password: adminPasswordInput.trim()
      });

      if (result && result.success === false) {
        setDeleteModalError(result.error || 'Incorrect administrator password.');
        setIsDeletingWithPassword(false);
      } else {
        setIsDeletingWithPassword(false);
        setEmployeeToDelete(null);
        setAdminPasswordInput('');
      }
    } catch (err: any) {
      setDeleteModalError(err.message || 'Failed to delete employee.');
      setIsDeletingWithPassword(false);
    }
  };

  // Reactivate Confirmation Modal with Admin Password
  const [employeeToReactivate, setEmployeeToReactivate] = useState<Employee | null>(null);
  const [reactivatePasswordInput, setReactivatePasswordInput] = useState('');
  const [showReactivatePassword, setShowReactivatePassword] = useState(false);
  const [reactivateModalError, setReactivateModalError] = useState<string | null>(null);
  const [isReactivatingWithPassword, setIsReactivatingWithPassword] = useState(false);

  const handleInitiateReactivate = (emp: Employee) => {
    setEmployeeToReactivate(emp);
    setReactivatePasswordInput('');
    setShowReactivatePassword(false);
    setReactivateModalError(null);
  };

  const handleConfirmReactivateWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeToReactivate) return;
    if (!reactivatePasswordInput.trim()) {
      setReactivateModalError('Please enter the administrator password.');
      return;
    }

    setIsReactivatingWithPassword(true);
    setReactivateModalError(null);

    try {
      const res = await authFetch(`/api/employees/${employeeToReactivate.id}/reactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_password: reactivatePasswordInput.trim() })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setReactivateModalError(data.error || 'Incorrect administrator password.');
        setIsReactivatingWithPassword(false);
        return;
      }

      if (data.employee) {
        onUpdateEmployee(data.employee);
        if (detailEmployee && detailEmployee.id === data.employee.id) {
          setDetailEmployee(data.employee);
        }
        setLocalToastMsg({
          type: 'success',
          text: `Employee ${data.employee.name} (${data.employee.employee_code}) successfully reactivated to Active status.`
        });
        setTimeout(() => setLocalToastMsg(null), 4000);
      }

      setIsReactivatingWithPassword(false);
      setEmployeeToReactivate(null);
      setReactivatePasswordInput('');
    } catch (err: any) {
      setReactivateModalError(err.message || 'Failed to reactivate employee.');
      setIsReactivatingWithPassword(false);
    }
  };

  // Departments & Designations from database / lookup
  const [departmentsList, setDepartmentsList] = useState<string[]>([
    'Engineering', 'Human Resources', 'Operations', 'Finance', 'Administration'
  ]);
  const [designationsList, setDesignationsList] = useState<string[]>([
    'Senior Software Engineer', 'HR Lead', 'Site Supervisor', 'Manager', 'Accountant', 'Staff', 'Cashier'
  ]);

  // Inline "Add New" states for Dept & Designation
  const [isAddingDept, setIsAddingDept] = useState(false);
  const [newDeptInput, setNewDeptInput] = useState('');
  const [isAddingDesig, setIsAddingDesig] = useState(false);
  const [newDesigInput, setNewDesigInput] = useState('');

  // Shift Modal state
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [newShiftForm, setNewShiftForm] = useState({
    name: '',
    check_in_time: '09:00',
    check_out_time: '17:00',
    grace_period_minutes: 30,
    mark_absent_after_grace: true
  });

  // Form State
  const [formData, setFormData] = useState<Partial<Employee>>({
    employee_code: '',
    name: '',
    email: '',
    phone: '',
    cnic: '',
    department: 'Engineering',
    designation: 'Senior Software Engineer',
    joining_date: new Date().toISOString().split('T')[0],
    employment_type: 'monthly_salary',
    base_salary: 100000,
    weekly_off_day: '',
    custom_off_dates: '',
    shift_id: shifts.length > 0 ? shifts[0].id : 'shift_gen',
    bank_name: 'Meezan Bank',
    account_number: '',
    status: 'active'
  });

  // Controlled String state for Salary Field (Bug #1 Fix: allow clearing 0 and blank entry)
  const [salaryStr, setSalaryStr] = useState<string>('100000');

  // Document attachments state
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Profile Picture state
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Form error state (Bug #5: "Employee ID Already Exists")
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Off Days popup (specific calendar off-dates picker)
  const [isOffDaysOpen, setIsOffDaysOpen] = useState(false);
  const offDaysRef = useRef<HTMLDivElement | null>(null);
  // From→To span used to generate the toggleable date list inside the off-days picker.
  const [offRangeFrom, setOffRangeFrom] = useState<string>(() => currentMonthBounds().first);
  const [offRangeTo, setOffRangeTo] = useState<string>(() => currentMonthBounds().last);

  // Fetch departments & designations on mount
  useEffect(() => {
    fetchLookups();
  }, []);

  // Close the Off Days popup when clicking outside of it
  useEffect(() => {
    if (!isOffDaysOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (offDaysRef.current && !offDaysRef.current.contains(e.target as Node)) {
        setIsOffDaysOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOffDaysOpen]);

  const fetchLookups = async () => {
    try {
      const [deptRes, desigRes] = await Promise.all([
        authFetch('/api/departments'),
        authFetch('/api/designations')
      ]);
      if (deptRes.ok) {
        const data = await deptRes.json();
        if (data.length > 0) setDepartmentsList(data.map((d: any) => d.name));
      }
      if (desigRes.ok) {
        const data = await desigRes.json();
        if (data.length > 0) setDesignationsList(data.map((d: any) => d.name));
      }
    } catch (err) {
      console.error('Error fetching lookups:', err);
    }
  };

  const departments = Array.from(new Set([...departmentsList, ...employees.map(e => e.department)]));

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          emp.designation.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (emp.employee_code || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDept = selectedDept === 'all' || emp.department === selectedDept;
    const matchesType = selectedType === 'all' || emp.employment_type === selectedType;
    const matchesStatus = statusFilter === 'all' || emp.status === statusFilter;
    return matchesSearch && matchesDept && matchesType && matchesStatus;
  });

  const handleReactivateEmployee = (emp: Employee) => {
    handleInitiateReactivate(emp);
  };

  const handleOpenAddModal = async () => {
    setEditingEmployee(null);
    setFormError(null);
    setAttachedFiles([]);
    setSelectedPhotoFile(null);
    setPhotoPreview(null);
    
    // Auto-generate employee_code
    let nextCode = 'EMP-1001';
    try {
      const res = await authFetch('/api/employees/next-code');
      if (res.ok) {
        const data = await res.json();
        if (data.next_code) nextCode = data.next_code;
      }
    } catch (err) {
      console.error('Error getting next code:', err);
    }

    setFormData({
      employee_code: nextCode,
      name: '',
      email: '',
      phone: '',
      cnic: '',
      department: departmentsList[0] || 'Engineering',
      designation: designationsList[0] || 'Senior Software Engineer',
      joining_date: new Date().toISOString().split('T')[0],
      employment_type: 'monthly_salary',
      base_salary: 0,
      weekly_off_day: '',
      custom_off_dates: '',
      shift_id: shifts.length > 0 ? shifts[0].id : 'shift_gen',
      bank_name: 'Meezan Bank',
      account_number: '',
      status: 'active'
    });
    const bounds = currentMonthBounds();
    setOffRangeFrom(bounds.first);
    setOffRangeTo(bounds.last);
    setSalaryStr(''); // Start blank so user can type freely without stuck 0
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormError(null);
    setAttachedFiles([]);
    setSelectedPhotoFile(null);
    setPhotoPreview(emp.photo_url || null);
    setFormData(emp);
    // Position the off-days range so any existing off-dates are immediately visible & editable.
    const existingOff = String(emp.custom_off_dates || '')
      .split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort();
    if (existingOff.length > 0) {
      setOffRangeFrom(existingOff[0]);
      setOffRangeTo(existingOff[existingOff.length - 1]);
    } else {
      const bounds = currentMonthBounds();
      setOffRangeFrom(bounds.first);
      setOffRangeTo(bounds.last);
    }
    setSalaryStr(emp.base_salary !== undefined ? String(emp.base_salary) : '');
    setIsModalOpen(true);
  };

  // Inline Add Department
  const handleAddNewDepartment = async () => {
    if (!newDeptInput.trim()) return;
    const trimmed = newDeptInput.trim();
    if (!departmentsList.includes(trimmed)) {
      setDepartmentsList(prev => [...prev, trimmed]);
      try {
        await authFetch('/api/departments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed })
        });
      } catch (e) {}
    }
    setFormData({ ...formData, department: trimmed });
    setNewDeptInput('');
    setIsAddingDept(false);
  };

  // Inline Add Designation
  const handleAddNewDesignation = async () => {
    if (!newDesigInput.trim()) return;
    const trimmed = newDesigInput.trim();
    if (!designationsList.includes(trimmed)) {
      setDesignationsList(prev => [...prev, trimmed]);
      try {
        await authFetch('/api/designations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed })
        });
      } catch (e) {}
    }
    setFormData({ ...formData, designation: trimmed });
    setNewDesigInput('');
    setIsAddingDesig(false);
  };

  // Save new shift from onboarding
  const handleSaveNewShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftForm.name.trim()) return;
    if (onCreateShift) {
      await onCreateShift(newShiftForm);
    }
    setIsShiftModalOpen(false);
    setNewShiftForm({
      name: '',
      check_in_time: '09:00',
      check_out_time: '17:00',
      grace_period_minutes: 30,
      mark_absent_after_grace: true
    });
  };

  // Handle salary input change (Bug #1 Fix)
  const handleSalaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setSalaryStr(val);
      const parsed = parseFloat(val);
      setFormData(prev => ({
        ...prev,
        base_salary: isNaN(parsed) ? 0 : parsed
      }));
    }
  };

  const handleSalaryFocus = () => {
    if (salaryStr === '0') {
      setSalaryStr('');
    }
  };

  const handleSalaryBlur = () => {
    if (salaryStr === '' || isNaN(parseFloat(salaryStr))) {
      setSalaryStr('0');
      setFormData(prev => ({ ...prev, base_salary: 0 }));
    }
  };

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setAttachedFiles(prev => [...prev, ...filesArray]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Handle photo selection
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedPhotoFile(file);
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    }
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    const payload = {
      ...formData,
      base_salary: Math.max(0, parseFloat(salaryStr) || 0)
    };

    if (payload.name && payload.name.trim().length > 100) {
      setFormError(`Full Name cannot exceed 100 characters (entered ${payload.name.trim().length} characters). Please shorten the name.`);
      setIsSubmitting(false);
      return;
    }

    if (!payload.cnic || !isValidPakCnic(payload.cnic)) {
      setFormError('Please enter a valid 13-digit Pakistani NADRA CNIC in XXXXX-XXXXXXX-X format (not greater than 13 digits, e.g. 42101-1234567-1).');
      setIsSubmitting(false);
      return;
    }

    let result: { success: boolean; error?: string; id?: string };
    let empId = editingEmployee?.id;

    if (editingEmployee) {
      result = await onUpdateEmployee({ ...editingEmployee, ...payload } as Employee);
    } else {
      result = await onAddEmployee(payload);
    }

    if (!result.success) {
      setFormError(result.error || 'Failed to save employee');
      setIsSubmitting(false);
      return;
    }

    // Determine target ID for photo and document uploads.
    // New employees now return their persisted id from the create call; fall back to matching
    // by employee_code only as a last resort.
    let targetId = empId || result.id;
    if (!targetId) {
      try {
        const empRes = await authFetch('/api/employees');
        if (empRes.ok) {
          const allEmps: Employee[] = await empRes.json();
          const matching = allEmps.find(e => e.employee_code === payload.employee_code);
          if (matching) targetId = matching.id;
        }
      } catch (err) {
        console.error('Error finding newly created employee ID:', err);
      }
    }

    // Upload profile photo if selected
    if (selectedPhotoFile && targetId) {
      try {
        const photoFormData = new FormData();
        photoFormData.append('picture', selectedPhotoFile);
        await authFetch(`/api/employees/${targetId}/profile-picture`, {
          method: 'POST',
          body: photoFormData
        });
      } catch (err) {
        console.error('Error uploading profile picture:', err);
      }
    }

    // If there are files attached and we have employee ID, upload them
    if (attachedFiles.length > 0 && targetId) {
      try {
        const docFormData = new FormData();
        attachedFiles.forEach(f => docFormData.append('files', f));
        docFormData.append('document_type', 'onboarding');

        await authFetch(`/api/employees/${targetId}/documents`, {
          method: 'POST',
          body: docFormData
        });
      } catch (err) {
        console.error('Error uploading attached documents:', err);
      }
    }

    setIsSubmitting(false);
    setIsModalOpen(false);
  };

  // ---- Weekly Off Days (Recurring weekday numbers e.g. "0" for Sun, "5" for Fri) ----
  const WEEKDAY_OPTIONS = [
    { label: 'Sun', value: 0, full: 'Sunday' },
    { label: 'Mon', value: 1, full: 'Monday' },
    { label: 'Tue', value: 2, full: 'Tuesday' },
    { label: 'Wed', value: 3, full: 'Wednesday' },
    { label: 'Thu', value: 4, full: 'Thursday' },
    { label: 'Fri', value: 5, full: 'Friday' },
    { label: 'Sat', value: 6, full: 'Saturday' },
  ];

  const selectedWeeklyOffs = String(formData.weekly_off_day || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '' && !isNaN(Number(s)))
    .map(Number);

  const toggleWeeklyOff = (dayNum: number) => {
    const curr = new Set(selectedWeeklyOffs);
    if (curr.has(dayNum)) {
      curr.delete(dayNum);
    } else {
      curr.add(dayNum);
    }
    setFormData({ ...formData, weekly_off_day: Array.from(curr).sort((a, b) => a - b).join(',') });
  };

  // ---- Off Days (specific calendar dates) helpers ----
  // Stored in custom_off_dates as a comma-separated list of ISO dates, e.g. "2026-09-06,2026-09-13".
  // These are specific one-off dates that do NOT auto-repeat — mirroring the Attendance
  // "Manual / Range Entry" flow: choose a From→To span, then toggle which dates are off.
  const selectedOffDates = (formData.custom_off_dates || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
    .sort();

  const setOffDates = (dates: string[]) => {
    const unique = Array.from(new Set(dates)).sort();
    setFormData({ ...formData, custom_off_dates: unique.join(',') });
  };

  const toggleOffDate = (dateStr: string) => {
    if (selectedOffDates.includes(dateStr)) {
      setOffDates(selectedOffDates.filter(d => d !== dateStr));
    } else {
      setOffDates([...selectedOffDates, dateStr]);
    }
  };

  // Expand the From→To span into individual ISO dates (inclusive; capped for safety).
  const buildRangeDates = (from: string, to: string): string[] => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return [];
    const [sY, sM, sD] = from.split('-').map(Number);
    const [eY, eM, eD] = to.split('-').map(Number);
    const start = new Date(sY, sM - 1, sD);
    const end = new Date(eY, eM - 1, eD);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];
    const out: string[] = [];
    const curr = new Date(start);
    let count = 0;
    while (curr <= end && count < 366) {
      const y = curr.getFullYear();
      const m = String(curr.getMonth() + 1).padStart(2, '0');
      const d = String(curr.getDate()).padStart(2, '0');
      out.push(`${y}-${m}-${d}`);
      curr.setDate(curr.getDate() + 1);
      count++;
    }
    return out;
  };

  const rangeDates = buildRangeDates(offRangeFrom, offRangeTo);

  const OFF_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const OFF_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const formatOffDate = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${OFF_WEEKDAYS[dt.getDay()]}, ${d} ${OFF_MONTHS[m - 1]} ${y}`;
  };

  const offDaysSummary = selectedOffDates.length === 0
    ? 'No off days selected'
    : `${selectedOffDates.length} off day${selectedOffDates.length > 1 ? 's' : ''} selected`;

  return (
    <div className="space-y-5 pb-8">
      {/* Non-blocking result toast */}
      {(localToastMsg || deleteResultMsg) && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-lg shadow-lg border text-sm font-semibold flex items-center gap-2 animate-in slide-in-from-right duration-300 ${
          (localToastMsg || deleteResultMsg)?.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {(localToastMsg || deleteResultMsg)?.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{(localToastMsg || deleteResultMsg)?.text}</span>
        </div>
      )}
      
      {/* Top Header Row with Title & Count Pills */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-700 tracking-tight font-heading flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" /> HR Management & Employee Directory
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage personnel profiles, compensation structures, shift assignments, and documents
          </p>
        </div>

        {/* Top Right Status Counter Pills, Model Switch & Add Button */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Active Employment Model Toggle Segment */}
          {(() => {
            const activeScopeEmployees = employees.filter(e => statusFilter === 'all' || e.status === statusFilter);
            const allCount = activeScopeEmployees.length;
            const monthlyCount = activeScopeEmployees.filter(e => e.employment_type === 'monthly_salary').length;
            const dailyCount = activeScopeEmployees.filter(e => e.employment_type === 'daily_wage').length;

            return (
              <div className="inline-flex items-center p-1 bg-gray-200/80 rounded-lg border border-gray-300/80 shadow-inner">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedType('all');
                    onModelFilterChange?.('all');
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    selectedType === 'all'
                      ? 'bg-white text-gray-900 shadow-xs ring-1 ring-black/5'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Show all employees"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>All ({allCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedType('monthly_salary');
                    onModelFilterChange?.('monthly_salary');
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    selectedType === 'monthly_salary'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Filter to Monthly Salary Staff"
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Monthly ({monthlyCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedType('daily_wage');
                    onModelFilterChange?.('daily_wage');
                  }}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    selectedType === 'daily_wage'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Filter to Daily Wage Workers"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Daily Wage ({dailyCount})</span>
                </button>
              </div>
            );
          })()}

          {/* Active / Ex-Staff Status Pills */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 border border-gray-200 shadow-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`px-2.5 py-0.5 rounded font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                statusFilter === 'active' ? 'bg-blue-600 text-white shadow-xs' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
              title="Filter to Active employees"
            >
              Active <span className={`text-[10px] px-1 rounded ${statusFilter === 'active' ? 'bg-white/20 text-white' : 'bg-white text-blue-700'}`}>{employees.filter(e => e.status === 'active').length}</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inactive')}
              className={`px-2.5 py-0.5 rounded font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                statusFilter === 'inactive' ? 'bg-amber-600 text-white shadow-xs' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
              title="Filter to Inactive / Ex-employees"
            >
              Ex-Staff <span className={`text-[10px] px-1 rounded ${statusFilter === 'inactive' ? 'bg-white/20 text-white' : 'bg-white text-amber-700'}`}>{employees.filter(e => e.status === 'inactive').length}</span>
            </button>
          </div>

          {userRole !== 'manager' && (
            <button
              onClick={handleOpenAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-xs flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-white" /> Onboard Employee
            </button>
          )}
        </div>
      </div>

      {/* Filter Controls Box */}
      <div className="bg-white p-3.5 border border-gray-200 rounded-lg flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, EMP-ID, or designation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>

          {/* Filter Status */}
          <div className="flex items-center gap-2 min-w-[150px]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="w-full py-1.5 px-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-800 focus:outline-none focus:border-blue-600 cursor-pointer font-medium"
            >
              <option value="active">Active Staff (Default)</option>
              <option value="inactive">Ex-Staff / Inactive</option>
              <option value="all">All Statuses</option>
            </select>
          </div>

          {/* Filter Department */}
          <div className="flex items-center gap-2 min-w-[160px]">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full py-1.5 px-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-800 focus:outline-none focus:border-blue-600 cursor-pointer font-medium"
            >
              <option value="all">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Filter Employment Type */}
          <div className="flex items-center gap-2 min-w-[160px]">
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                onModelFilterChange?.(e.target.value as any);
              }}
              className="w-full py-1.5 px-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-800 focus:outline-none focus:border-blue-600 cursor-pointer font-medium"
            >
              <option value="all">All Compensation Models</option>
              <option value="monthly_salary">Monthly Fixed Salary</option>
              <option value="daily_wage">Daily Wage Rate</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => { 
            setSearchQuery(''); 
            setSelectedDept('all'); 
            setSelectedType('all'); 
            setStatusFilter('active');
            onModelFilterChange?.('all');
          }}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3.5 py-1.5 rounded-md text-xs font-semibold cursor-pointer border border-gray-300 transition-colors"
        >
          Reset Filters
        </button>
      </div>

      {/* Employees Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-700">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="p-3.5 text-center w-12">#</th>
                <th className="p-3.5">Employee Name & ID</th>
                <th className="p-3.5">Department & Role</th>
                <th className="p-3.5">Assigned Shift</th>
                <th className="p-3.5">Compensation Model</th>
                <th className="p-3.5">Base Rate</th>
                <th className="p-3.5">Joining Date</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-gray-400">
                    No employee records match the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp, idx) => {
                  const assignedShift = shifts.find(s => s.id === emp.shift_id);
                  return (
                    <tr key={emp.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="p-3.5 text-center font-mono text-gray-500 font-bold text-xs">
                        {idx + 1}
                      </td>
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={emp.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}
                            alt={emp.name}
                            className="w-8 h-8 rounded-full object-cover border border-gray-200 shadow-xs shrink-0"
                          />
                          <div>
                            {/* Requirement 8: Mandatory Display of Name and EMP ID together */}
                            <p className="font-bold text-gray-900 text-xs sm:text-sm">
                              {emp.name} <span className="font-mono text-blue-700 font-bold text-xs">({emp.employee_code})</span>
                            </p>
                            <p className="text-[10px] text-gray-500">{emp.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="p-3.5">
                        <p className="font-bold text-gray-800">{emp.designation}</p>
                        <p className="text-[10px] text-gray-500 font-medium">{emp.department}</p>
                      </td>

                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                          <Clock className="w-3 h-3 text-blue-600" />
                          {assignedShift ? assignedShift.name : 'Standard Morning Shift'}
                        </span>
                      </td>

                      <td className="p-3.5">
                        {emp.employment_type === 'monthly_salary' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            Monthly Salary
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Daily Wage Rate
                          </span>
                        )}
                      </td>

                      <td className="p-3.5 font-mono tabular-nums">
                        <p className="font-bold text-gray-800 text-xs sm:text-sm">
                          PKR {emp.base_salary.toLocaleString()}
                        </p>
                        <p className="text-[9px] text-gray-500 font-sans">
                          {emp.employment_type === 'monthly_salary' ? '/ month' : '/ day'}
                        </p>
                      </td>

                      <td className="p-3.5 font-mono text-gray-600 tabular-nums">
                        {emp.joining_date}
                      </td>

                      <td className="p-3.5">
                        {emp.status === 'inactive' ? (
                          <div>
                            <StatusChip
                              status="offline"
                              label="Ex-Staff"
                            />
                            {emp.exit_date && (
                              <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                                Left: {emp.exit_date}
                              </p>
                            )}
                          </div>
                        ) : (
                          <StatusChip
                            status="online"
                            label="Active"
                          />
                        )}
                      </td>

                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {emp.status === 'inactive' && (
                            <button
                              onClick={() => handleReactivateEmployee(emp)}
                              className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold transition-all text-xs flex items-center gap-1 cursor-pointer border border-emerald-300"
                              title="Reactivate Employee (Return to Active Staff)"
                            >
                              <UserCheck className="w-3.5 h-3.5 text-emerald-600" /> Reactivate
                            </button>
                          )}
                          <button
                            onClick={() => setDetailEmployee(emp)}
                            className="px-2.5 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-all text-xs flex items-center gap-1 cursor-pointer border border-gray-300"
                            title="View Complete Profile"
                          >
                            <Eye className="w-3.5 h-3.5 text-blue-600" /> View
                          </button>
                          {userRole !== 'manager' && (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(emp)}
                                className="p-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors cursor-pointer border border-gray-300"
                                title="Edit Employee"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {userRole === 'super_admin' && (
                                deletingEmployeeId === emp.id ? (
                                  /* Loading spinner while delete is in progress */
                                  <span className="p-1.5 rounded bg-amber-50 border border-amber-200 flex items-center gap-1 text-amber-700 text-[10px] font-bold">
                                    <span className="animate-spin inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full" />
                                    Deleting…
                                  </span>
                                ) : deleteConfirmId === emp.id ? (
                                  /* Inline confirm/cancel buttons — opening admin password confirmation */
                                  <span className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleInitiateDelete(emp)}
                                      className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer transition-colors"
                                      title={emp.status === 'inactive' ? 'Permanently Purge Employee' : 'Confirm Delete'}
                                    >
                                      {emp.status === 'inactive' ? 'Purge' : 'Confirm'}
                                    </button>
                                    <button
                                      onClick={() => onCancelDelete?.()}
                                      className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-[10px] font-bold cursor-pointer transition-colors"
                                      title="Cancel"
                                    >
                                      Cancel
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => handleInitiateDelete(emp)}
                                    className="p-1.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer border border-rose-200"
                                    title={emp.status === 'inactive' ? 'Permanently Delete Inactive Employee' : 'Delete Employee (Requires Admin Password)'}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}
                            </>
                          )}
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

      {/* Onboard / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-3xl p-6 shadow-2xl relative my-auto max-h-[90vh] overflow-y-auto text-gray-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-bold text-gray-900 mb-1 font-heading">
              {editingEmployee ? 'Edit Employee Record' : 'Onboard New Employee'}
            </h3>
            <p className="text-xs text-gray-500 mb-5">
              Specify employee details, choose shift schedule, compensation model, bank details, and attach verification documents.
            </p>

            {/* Error Banner (Requirement 5: "Employee ID Already Exists") */}
            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Profile Photo Uploader */}
              <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-blue-600 bg-gray-200 shrink-0 flex items-center justify-center">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <Users className="w-7 h-7 text-gray-400" />
                  )}
                </div>
                <div className="flex-1">
                  <label className="block font-semibold text-gray-700 mb-0.5">Profile Picture</label>
                  <p className="text-[10px] text-gray-400 mb-1.5">Upload a clear photo (JPG, PNG, WebP up to 5MB)</p>
                  <label className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-gray-300 rounded text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer shadow-2xs">
                    <Upload className="w-3 h-3" />
                    <span>{photoPreview ? 'Change Photo' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Employee ID (Auto-Generated but Editable, Requirement 5) */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Employee ID (Auto-Generated / Editable) *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.employee_code || ''}
                    onChange={(e) => setFormData({ ...formData, employee_code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-blue-700 font-bold font-mono focus:outline-none focus:border-blue-600 uppercase"
                    placeholder="EMP-1001"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Unique system identifier (e.g. EMP-1001)</p>
                </div>

                {/* Full Name */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-gray-700">Full Name *</label>
                    <span className={`text-[10px] font-mono ${
                      (formData.name?.length || 0) > 100
                        ? 'text-rose-600 font-bold'
                        : (formData.name?.length || 0) > 85
                        ? 'text-amber-600 font-bold'
                        : 'text-gray-400'
                    }`}>
                      {(formData.name?.length || 0)}/100
                    </span>
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full px-3 py-2 bg-gray-50 border rounded-md text-gray-900 focus:outline-none transition-colors ${
                      (formData.name?.length || 0) > 100
                        ? 'border-rose-400 focus:border-rose-600 bg-rose-50/40 text-rose-900'
                        : 'border-gray-300 focus:border-blue-600'
                    }`}
                    placeholder="e.g. Syed Zohaib Ali"
                  />
                  {(formData.name?.length || 0) > 100 && (
                    <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1 animate-in fade-in">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Name exceeds 100 character limit by {(formData.name?.length || 0) - 100} character{((formData.name?.length || 0) - 100) === 1 ? '' : 's'}. Please shorten before saving.
                    </p>
                  )}
                </div>

                {/* Email Address */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600"
                    placeholder="e.g. zohaib@mohsinco.com"
                  />
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 font-mono"
                    placeholder="+92 300 1234567"
                  />
                </div>

                {/* CNIC with Pakistani NADRA Format Restriction (XXXXX-XXXXXXX-X) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-gray-700">Pakistani NADRA CNIC / National ID *</label>
                    <span className="text-[11px] font-mono text-gray-400">XXXXX-XXXXXXX-X (13 Digits)</span>
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={15}
                    value={formData.cnic || ''}
                    onKeyDown={(e) => {
                      if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) return;
                      // Block non-digit input
                      if (!/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        return;
                      }
                      // Block typing more than 13 digits (strict "not greater than that")
                      const currentDigits = (formData.cnic || '').replace(/\D/g, '');
                      if (/^\d$/.test(e.key) && currentDigits.length >= 13 && !window.getSelection()?.toString()) {
                        e.preventDefault();
                      }
                    }}
                    onChange={(e) => setFormData({ ...formData, cnic: formatPakCnic(e.target.value) })}
                    className={`w-full px-3 py-2 bg-gray-50 border rounded-md text-gray-900 font-mono focus:outline-none tabular-nums ${
                      formData.cnic && !isValidPakCnic(formData.cnic)
                        ? 'border-amber-400 focus:border-amber-500 bg-amber-50/20'
                        : formData.cnic && isValidPakCnic(formData.cnic)
                        ? 'border-emerald-500 focus:border-emerald-600'
                        : 'border-gray-300 focus:border-blue-600'
                    }`}
                    placeholder="42101-1234567-1"
                  />
                  {formData.cnic && !isValidPakCnic(formData.cnic) && (
                    <p className="text-[11px] text-amber-600 font-medium mt-1 flex items-center gap-1 animate-in fade-in">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Must be strictly 13 digits: 5-7-1 format ({formData.cnic.replace(/\D/g, '').length}/13 digits entered)
                    </p>
                  )}
                  {formData.cnic && isValidPakCnic(formData.cnic) && (() => {
                    const info = parseNadraCnic(formData.cnic);
                    if (!info) return null;
                    return (
                      <div className="mt-2 p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs space-y-1.5 animate-in fade-in">
                        <div className="flex items-center justify-between text-emerald-800 font-bold">
                          <span className="flex items-center gap-1">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0" /> Valid NADRA CNIC (13 Digits)
                          </span>
                          <span className="font-mono text-[11px] bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded font-bold border border-emerald-300">
                            {info.formatted}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pt-0.5 text-[11px]">
                          <div className="bg-white p-2 rounded border border-emerald-100 shadow-2xs">
                            <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Origin Code (5)</span>
                            <span className="font-mono font-bold text-gray-900 text-xs">{info.regionCode}</span>
                            <span className="text-[10px] text-emerald-700 block font-semibold truncate" title={info.provinceName}>{info.provinceName}</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-emerald-100 shadow-2xs">
                            <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Family Tree (7)</span>
                            <span className="font-mono font-bold text-gray-900 text-xs">{info.familyNumber}</span>
                            <span className="text-[10px] text-gray-500 block">Family Unit Number</span>
                          </div>
                          <div className="bg-white p-2 rounded border border-emerald-100 shadow-2xs">
                            <span className="text-[9px] text-gray-500 block uppercase font-bold tracking-wider">Gender Indicator (1)</span>
                            <span className="font-mono font-bold text-gray-900 text-xs">Digit {info.genderDigit}</span>
                            <span className="text-[10px] font-bold text-blue-700 block">
                              {info.gender} ({parseInt(info.genderDigit, 10) % 2 !== 0 ? 'Odd: Male' : 'Even: Female'})
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Department Dropdown with '+ Add New' (Requirement 2) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-gray-700">Department *</label>
                    {!isAddingDept && (
                      <button
                        type="button"
                        onClick={() => setIsAddingDept(true)}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add New
                      </button>
                    )}
                  </div>

                  {isAddingDept ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={newDeptInput}
                        onChange={(e) => setNewDeptInput(e.target.value)}
                        placeholder="Enter department name..."
                        className="flex-1 px-3 py-1.5 bg-gray-50 border border-blue-500 rounded-md text-gray-900 focus:outline-none text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddNewDepartment}
                        className="px-2.5 py-1.5 bg-blue-600 text-white rounded text-xs font-bold cursor-pointer hover:bg-blue-700"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsAddingDept(false); setNewDeptInput(''); }}
                        className="px-2 py-1.5 bg-gray-200 text-gray-700 rounded text-xs font-bold cursor-pointer hover:bg-gray-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 cursor-pointer font-medium"
                    >
                      {departmentsList.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Designation Dropdown with '+ Add New' (Requirement 2) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-gray-700">Designation / Role *</label>
                    {!isAddingDesig && (
                      <button
                        type="button"
                        onClick={() => setIsAddingDesig(true)}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add New
                      </button>
                    )}
                  </div>

                  {isAddingDesig ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={newDesigInput}
                        onChange={(e) => setNewDesigInput(e.target.value)}
                        placeholder="Enter designation name..."
                        className="flex-1 px-3 py-1.5 bg-gray-50 border border-blue-500 rounded-md text-gray-900 focus:outline-none text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddNewDesignation}
                        className="px-2.5 py-1.5 bg-blue-600 text-white rounded text-xs font-bold cursor-pointer hover:bg-blue-700"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsAddingDesig(false); setNewDesigInput(''); }}
                        className="px-2 py-1.5 bg-gray-200 text-gray-700 rounded text-xs font-bold cursor-pointer hover:bg-gray-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formData.designation}
                      onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 cursor-pointer font-medium"
                    >
                      {designationsList.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Shift Dropdown & Setup (Requirement 3 & 4) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-gray-700">Assigned Shift (Required for Late/Grace) *</label>
                    <button
                      type="button"
                      onClick={() => setIsShiftModalOpen(true)}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Add New Shift
                    </button>
                  </div>

                  <select
                    required
                    value={formData.shift_id || (shifts[0]?.id || 'shift_gen')}
                    onChange={(e) => setFormData({ ...formData, shift_id: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 cursor-pointer font-medium"
                  >
                    {shifts.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.check_in_time} - {s.check_out_time}, Grace: {s.grace_period_minutes}m)
                      </option>
                    ))}
                    {shifts.length === 0 && (
                      <option value="shift_gen">Standard Morning Shift (09:00 - 17:00)</option>
                    )}
                  </select>
                </div>

                {/* Compensation Model */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Compensation Model *</label>
                  <select
                    value={formData.employment_type}
                    onChange={(e) => setFormData({ ...formData, employment_type: e.target.value as EmploymentType })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-bold focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value="monthly_salary">Monthly Fixed Salary</option>
                    <option value="daily_wage">Daily Wage Rate</option>
                  </select>
                </div>

                {/* Salary Field (Bug #1 Fix: Allow empty field and replace 0 on new typing) */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">
                    {formData.employment_type === 'monthly_salary' ? 'Monthly Salary (PKR) *' : 'Per-Day Wage Rate (PKR) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={salaryStr}
                    onChange={handleSalaryChange}
                    onFocus={handleSalaryFocus}
                    onBlur={handleSalaryBlur}
                    placeholder="Enter amount (e.g. 50000)"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-bold font-mono tabular-nums focus:outline-none focus:border-blue-600"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Allows backspacing to fully empty field</p>
                </div>

                {/* Joining Date */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Joining Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.joining_date || ''}
                    onChange={(e) => setFormData({ ...formData, joining_date: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-mono tabular-nums focus:outline-none focus:border-blue-600"
                  />
                </div>

                {/* Employment Status */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Employment Status *</label>
                  <select
                    value={formData.status || 'active'}
                    onChange={(e) => {
                      const newStatus = e.target.value as 'active' | 'inactive' | 'on_leave';
                      setFormData({
                        ...formData,
                        status: newStatus,
                        exit_date: newStatus === 'inactive' ? (formData.exit_date || new Date().toISOString().split('T')[0]) : undefined
                      });
                    }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-bold focus:outline-none focus:border-blue-600 cursor-pointer"
                  >
                    <option value="active">Active Staff</option>
                    <option value="inactive">Inactive / Left Company</option>
                    <option value="on_leave">On Extended Leave</option>
                  </select>
                </div>

                {formData.status === 'inactive' && (
                  <>
                    <div>
                      <label className="block font-semibold text-rose-700 mb-1">Exit / Last Working Date *</label>
                      <input
                        type="date"
                        required={formData.status === 'inactive'}
                        value={formData.exit_date || ''}
                        onChange={(e) => setFormData({ ...formData, exit_date: e.target.value })}
                        className="w-full px-3 py-2 bg-rose-50 border border-rose-300 rounded-md text-gray-900 font-mono tabular-nums focus:outline-none focus:border-rose-600"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Exit / Separation Reason</label>
                      <input
                        type="text"
                        value={formData.exit_reason || ''}
                        onChange={(e) => setFormData({ ...formData, exit_reason: e.target.value })}
                        placeholder="e.g. Resigned, Relocated, Contract Completed"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </>
                )}

                {/* Weekly Off Days (Recurring) */}
                <div className="sm:col-span-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block font-semibold text-gray-800 text-xs">
                      Weekly Off Days <span className="font-normal text-gray-500">(Recurring day of week)</span>
                    </label>
                    {selectedWeeklyOffs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, weekly_off_day: '' })}
                        className="text-[11px] font-bold text-rose-500 hover:text-rose-700 cursor-pointer"
                      >
                        Clear Weekly Offs
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_OPTIONS.map(d => {
                      const isSelected = selectedWeeklyOffs.includes(d.value);
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleWeeklyOff(d.value)}
                          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                          }`}
                          title={`Toggle ${d.full} as recurring weekly off`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1.5">
                    {selectedWeeklyOffs.length === 0
                      ? 'No recurring weekly off selected (Standard 7-day schedule / no default offs).'
                      : `Selected: ${selectedWeeklyOffs.map(val => WEEKDAY_OPTIONS.find(o => o.value === val)?.full).filter(Boolean).join(', ')} — strictly these days will be off, no other offs.`}
                  </p>
                </div>

                {/* Off Days (specific calendar dates) — range picker + toggleable list */}
                <div className="relative sm:col-span-2" ref={offDaysRef}>
                  <label className="block font-semibold text-gray-700 mb-1">
                    Off Days <span className="font-normal text-gray-400">(specific calendar dates)</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsOffDaysOpen(o => !o)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 cursor-pointer font-medium"
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <CalendarDays className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className={selectedOffDates.length === 0 ? 'text-gray-400' : ''}>{offDaysSummary}</span>
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOffDaysOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Selected off-date chips — always visible so edits are obvious even when closed */}
                  {selectedOffDates.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedOffDates.map(dateStr => (
                        <span key={dateStr} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-semibold">
                          {formatOffDate(dateStr)}
                          <button
                            type="button"
                            onClick={() => toggleOffDate(dateStr)}
                            className="p-0.5 rounded-full hover:bg-blue-200 cursor-pointer"
                            title="Remove off day"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {isOffDaysOpen && (
                    <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                      {/* From→To range, mirroring the Attendance "Manual / Range Entry" flow */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">From</label>
                          <input
                            type="date"
                            value={offRangeFrom}
                            onChange={(e) => setOffRangeFrom(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-md text-gray-900 text-xs font-mono focus:outline-none focus:border-blue-600 cursor-pointer"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">To</label>
                          <input
                            type="date"
                            value={offRangeTo}
                            onChange={(e) => setOffRangeTo(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-md text-gray-900 text-xs font-mono focus:outline-none focus:border-blue-600 cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between px-0.5 py-1 mb-1 border-b border-gray-100">
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">
                          Tap dates to mark off ({rangeDates.length} in range)
                        </span>
                        {selectedOffDates.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setOffDates([])}
                            className="text-[11px] font-bold text-rose-500 hover:text-rose-700 cursor-pointer"
                          >
                            Clear all
                          </button>
                        )}
                      </div>

                      <div className="max-h-56 overflow-y-auto">
                        {rangeDates.length === 0 ? (
                          <p className="text-[11px] text-gray-400 text-center py-4">
                            Pick a valid From → To range to list dates.
                          </p>
                        ) : (
                          rangeDates.map(dateStr => {
                            const isOn = selectedOffDates.includes(dateStr);
                            return (
                              <button
                                key={dateStr}
                                type="button"
                                onClick={() => toggleOffDate(dateStr)}
                                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                                  isOn ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                <span className="flex items-center gap-2">
                                  <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                    isOn ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
                                  }`}>
                                    {isOn && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                  </span>
                                  {formatOffDate(dateStr)}
                                </span>
                                {isOn && <span className="text-[10px] text-blue-500 font-bold uppercase">Off</span>}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                  <div className="text-[11px] text-gray-400 mt-1">These specific dates won't count as working days in payroll. They don't repeat — add new dates each month as needed.</div>
                </div>

                {/* Bank Name */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={formData.bank_name || ''}
                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600"
                    placeholder="Meezan Bank"
                  />
                </div>

                {/* Account Number */}
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Bank Account / IBAN</label>
                  <input
                    type="text"
                    value={formData.account_number || ''}
                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-mono tabular-nums focus:outline-none focus:border-blue-600"
                    placeholder="010203040506"
                  />
                </div>
              </div>

              {/* Document Attachment Feature (Requirement 6) */}
              <div className="pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="font-semibold text-gray-700 flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-blue-600" /> Document Attachments (Joining Letter, CNIC, Resume, etc.)
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" /> Select Files
                  </button>
<input
                      type="file"
                      multiple
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".jpg,.jpeg,.png,.pdf,.doc,.docx"
                      className="hidden"
                    />
                </div>

                {attachedFiles.length > 0 ? (
                  <div className="space-y-1.5 bg-gray-50 p-3 rounded-lg border border-gray-200 max-h-32 overflow-y-auto">
                    {attachedFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between p-1.5 bg-white rounded border border-gray-200 text-xs">
                        <span className="font-medium text-gray-800 flex items-center gap-1.5 truncate max-w-[80%]">
                          <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          {f.name} <span className="text-[10px] text-gray-400 font-mono">({(f.size / 1024).toFixed(0)} KB)</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(i)}
                          className="text-red-500 hover:text-red-700 p-0.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 border-2 border-dashed border-gray-200 rounded-lg text-center cursor-pointer hover:bg-blue-50/50 transition-colors"
                  >
                    <p className="text-gray-400 text-xs flex items-center justify-center gap-1">
                      <Upload className="w-4 h-4 text-gray-400" /> Click to upload CNIC copy, joining letter, or experience certificates
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-md text-gray-600 hover:text-gray-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-md font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingEmployee ? 'Save Changes' : 'Onboard Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-modal: Add New Shift from Onboarding (Requirement 3) */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-gray-200 rounded-xl w-full max-w-md p-6 shadow-2xl relative my-auto text-gray-800 animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setIsShiftModalOpen(false)}
              className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" /> Create New Shift Schedule
            </h3>
            <p className="text-xs text-gray-500 mb-5">
              Specify check-in, check-out, and grace minutes for late policy calculation.
            </p>

            <form onSubmit={handleSaveNewShift} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Shift Name *</label>
                <input
                  type="text"
                  required
                  value={newShiftForm.name}
                  onChange={(e) => setNewShiftForm({ ...newShiftForm, name: e.target.value })}
                  placeholder="e.g. Evening Shift / Factory Night Shift"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Check-In Time *</label>
                  <input
                    type="time"
                    required
                    value={newShiftForm.check_in_time}
                    onChange={(e) => setNewShiftForm({ ...newShiftForm, check_in_time: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-mono focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Check-Out Time *</label>
                  <input
                    type="time"
                    required
                    value={newShiftForm.check_out_time}
                    onChange={(e) => setNewShiftForm({ ...newShiftForm, check_out_time: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-mono focus:outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Grace Time (Minutes) *</label>
                <input
                  type="number"
                  required
                  min={0}
                  max={120}
                  value={newShiftForm.grace_period_minutes}
                  onChange={(e) => setNewShiftForm({ ...newShiftForm, grace_period_minutes: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-gray-900 font-mono font-bold focus:outline-none focus:border-blue-600"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Punches within grace time are marked present on time.</p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setIsShiftModalOpen(false)}
                  className="px-4 py-2 rounded-md text-gray-600 hover:text-gray-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-md font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer active:scale-95"
                >
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Employee 360 Detail Modal */}
      <EmployeeDetailModal
        isOpen={Boolean(detailEmployee)}
        onClose={() => setDetailEmployee(null)}
        employee={detailEmployee}
        shifts={shifts}
        attendanceRecords={attendanceRecords}
        payrollRecord={payrollRecords.find(p => p.employee_id === detailEmployee?.id)}
        selectedMonth={selectedMonth}
        onEmployeeUpdated={(updated) => {
          setDetailEmployee(updated);
          onUpdateEmployee(updated);
        }}
        onDeleteEmployee={(id) => {
          const emp = employees.find(e => e.id === id) || detailEmployee;
          if (emp) {
            setDetailEmployee(null);
            handleInitiateDelete(emp);
          } else {
            onDeleteEmployee(id);
          }
        }}
        onReactivate={(emp) => {
          handleInitiateReactivate(emp);
        }}
        userRole={userRole}
      />

      {/* Super Administrator Password Confirmation Modal for Delete */}
      {employeeToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-rose-50 border-b border-rose-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Confirm Employee Deletion</h3>
                  <p className="text-xs text-rose-700 font-medium">Administrator password required</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmployeeToDelete(null);
                  setAdminPasswordInput('');
                  setDeleteModalError(null);
                }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-rose-100/50 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleConfirmDeleteWithPassword} className="p-6 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Employee Name:</span>
                  <span className="font-bold text-gray-900">{employeeToDelete.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Employee ID:</span>
                  <span className="font-mono text-gray-800">{employeeToDelete.employee_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Department:</span>
                  <span className="text-gray-800">{employeeToDelete.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Status:</span>
                  <span className={`font-semibold capitalize ${employeeToDelete.status === 'active' ? 'text-emerald-700' : 'text-gray-600'}`}>
                    {employeeToDelete.status}
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                {employeeToDelete.status === 'inactive'
                  ? 'This action will permanently delete this inactive employee. Please enter the Super Administrator password to confirm.'
                  : 'To prevent unauthorized or accidental deletions, enter your Super Administrator password to proceed.'}
              </p>

              {deleteModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-700 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-medium">{deleteModalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Super Administrator Password *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    required
                    autoFocus
                    value={adminPasswordInput}
                    onChange={(e) => {
                      setAdminPasswordInput(e.target.value);
                      if (deleteModalError) setDeleteModalError(null);
                    }}
                    placeholder="Enter admin password to confirm"
                    className="w-full pl-9 pr-10 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmployeeToDelete(null);
                    setAdminPasswordInput('');
                    setDeleteModalError(null);
                  }}
                  disabled={isDeletingWithPassword}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeletingWithPassword || !adminPasswordInput.trim()}
                  className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isDeletingWithPassword ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Verifying & Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      Confirm & Delete
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Administrator Password Confirmation Modal for Reactivate */}
      {employeeToReactivate && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">Confirm Employee Reactivation</h3>
                  <p className="text-xs text-emerald-700 font-medium">Administrator password required</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEmployeeToReactivate(null);
                  setReactivatePasswordInput('');
                  setReactivateModalError(null);
                }}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-emerald-100/50 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleConfirmReactivateWithPassword} className="p-6 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Employee Name:</span>
                  <span className="font-bold text-gray-900">{employeeToReactivate.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Employee ID:</span>
                  <span className="font-mono text-gray-800">{employeeToReactivate.employee_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 font-medium">Department:</span>
                  <span className="text-gray-800">{employeeToReactivate.department}</span>
                </div>
                {employeeToReactivate.exit_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-500 font-medium">Separation Date:</span>
                    <span className="font-mono text-rose-600 font-bold">{employeeToReactivate.exit_date}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                This action will restore this employee back to <strong>Active Staff</strong>, resuming daily attendance records and payroll calculations. Please enter the Administrator password to authorize reactivation.
              </p>

              {reactivateModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-700 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="font-medium">{reactivateModalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                  Administrator Password *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showReactivatePassword ? 'text' : 'password'}
                    required
                    autoFocus
                    value={reactivatePasswordInput}
                    onChange={(e) => {
                      setReactivatePasswordInput(e.target.value);
                      if (reactivateModalError) setReactivateModalError(null);
                    }}
                    placeholder="Enter admin password to authorize"
                    className="w-full pl-9 pr-10 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowReactivatePassword(!showReactivatePassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 cursor-pointer"
                  >
                    {showReactivatePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmployeeToReactivate(null);
                    setReactivatePasswordInput('');
                    setReactivateModalError(null);
                  }}
                  disabled={isReactivatingWithPassword}
                  className="px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReactivatingWithPassword || !reactivatePasswordInput.trim()}
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {isReactivatingWithPassword ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Authorizing & Reactivating…
                    </>
                  ) : (
                    <>
                      <UserCheck className="w-3.5 h-3.5" />
                      Authorize Reactivation
                    </>
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
