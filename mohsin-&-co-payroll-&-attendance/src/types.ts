export type EmploymentType = 'monthly_salary' | 'daily_wage';
export type EmployeeStatus = 'active' | 'inactive' | 'on_leave';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'half_day' | 'leave' | 'weekly_off';
export type UserRole = 'super_admin' | 'hr_admin' | 'manager' | 'employee' | 'cashier';

export interface Employee {
  id: string;
  employee_code: string;
  name: string;
  email: string;
  phone: string;
  cnic: string;
  photo_url?: string;
  department: string;
  designation: string;
  joining_date: string;
  employment_type: EmploymentType;
  base_salary: number; // Monthly salary or per-day rate
  weekly_off_day: string; // Legacy recurring weekly off-days (comma-separated weekday numbers). Superseded by custom_off_dates.
  custom_off_dates?: string; // Specific calendar off-dates (comma-separated ISO dates, e.g. "2026-09-06,2026-09-13")
  shift_id: string;
  bank_name?: string;
  account_number?: string;
  status: EmployeeStatus;
  exit_date?: string; // Optional exit / resignation date (YYYY-MM-DD)
  exit_reason?: string; // Optional resignation / termination notes
  created_at?: string;
}

export interface ShiftRule {
  id: string;
  name: string;
  check_in_time: string; // e.g., "09:00"
  check_out_time: string; // e.g., "17:00"
  grace_period_minutes: number; // e.g., 30
  mark_absent_after_grace: boolean; // if true, punch after grace = marked absent + pay cut
  work_days: number[]; // e.g., [1, 2, 3, 4, 5, 6] (Mon-Sat)
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  department?: string;
  employment_type?: EmploymentType;
  date: string; // YYYY-MM-DD
  check_in_time?: string; // HH:mm:ss
  check_out_time?: string; // HH:mm:ss
  status: AttendanceStatus;
  hours_worked: number;
  late_minutes: number;
  is_manual_override: boolean;
  override_reason?: string;
  override_by?: string;
  device_id?: string;
  device_name?: string;
}

export interface PayrollAdjustment {
  id: string;
  payroll_id: string;
  employee_id: string;
  type: 'bonus' | 'fine' | 'advance_deduction' | 'other';
  amount: number;
  description: string;
  created_at: string;
}

export interface PayrollRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  designation: string;
  employment_type: EmploymentType;
  period_month: string; // YYYY-MM
  base_rate: number; // Monthly salary or Daily wage rate
  working_days: number; // Total working days in month (excl. weekly offs for monthly)
  days_present: number; // Days present
  days_absent: number; // Days absent
  days_late: number;
  days_leave: number; // Approved leaves (excused, not deducted)
  days_off?: number; // Total weekly offs / designated off days in the period
  total_hours_worked?: number; // Total working hours worked in the period
  gross_earnings: number;
  absent_deductions: number;
  total_bonuses: number;
  total_fines: number;
  advance_deductions: number;
  net_payout: number;
  status: 'draft' | 'approved' | 'paid';
  generated_at: string;
}

export interface BiometricDevice {
  id: string;
  serial_number: string;
  name: string;
  location: string;
  ip_address: string;
  status: 'online' | 'offline';
  last_heartbeat?: string;
  total_pushes: number;
}

export interface AuditLog {
  id: string;
  user_name: string;
  user_role: UserRole;
  action: string;
  target: string;
  details: string;
  timestamp: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department?: string;
  photo_url?: string;
}

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  password?: string;
  contact: string;
  role: UserRole;
  department?: string;
  photo_url?: string;
  permissions: Record<string, { view: boolean; edit: boolean; add: boolean; delete: boolean }>;
}

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  file_name: string;
  file_path: string;
  document_type: string;
  uploaded_at: string;
}

export interface CompanySettings {
  id: string;
  company_name: string;
  contact: string;
  address: string;
  logo_url: string;
}

export interface DashboardMetrics {
  total_employees: number;
  total_daily_wage?: number;
  total_monthly_salary?: number;
  present_today: number;
  late_today: number;
  absent_today: number;
  today_payroll_accrual: number;
  month_to_date_accrual?: number;
  active_devices: number;
  monthly_payroll_estimate: number;
  daily_wage_baseline?: number;
  monthly_salary_baseline?: number;
}

export const ROLE_PERMISSIONS_TEMPLATES: Record<UserRole, Record<string, Record<string, boolean>>> = {
  super_admin: {
    employees: { view: true, add: true, edit: true, delete: true },
    attendance: { view: true, add: true, override: true, manage_shifts: true },
    payroll: { view: true, calculate: true, adjustments: true, payslip: true, approve: true, mark_paid: true },
    reports: { view: true, export_excel: true, print_pdf: true },
    settings: { view: true, company_setup: true, user_roles: true },
  },
  hr_admin: {
    employees: { view: true, add: true, edit: true, delete: false },
    attendance: { view: true, add: true, override: true, manage_shifts: true },
    payroll: { view: true, calculate: false, adjustments: false, payslip: true, approve: false, mark_paid: false },
    reports: { view: true, export_excel: true, print_pdf: true },
    settings: { view: false, company_setup: false, user_roles: false },
  },
  manager: {
    employees: { view: true, add: false, edit: false, delete: false },
    attendance: { view: true, add: false, override: false, manage_shifts: false },
    payroll: { view: true, calculate: false, adjustments: false, payslip: true, approve: true, mark_paid: false },
    reports: { view: true, export_excel: true, print_pdf: true },
    settings: { view: false, company_setup: false, user_roles: false },
  },
  cashier: {
    employees: { view: false, add: false, edit: false, delete: false },
    attendance: { view: false, add: false, override: false, manage_shifts: false },
    payroll: { view: true, calculate: false, adjustments: false, payslip: true, approve: false, mark_paid: true },
    reports: { view: false, export_excel: false, print_pdf: false },
    settings: { view: false, company_setup: false, user_roles: false },
  },
  employee: {
    employees: { view: false, add: false, edit: false, delete: false },
    attendance: { view: true, add: false, override: false, manage_shifts: false },
    payroll: { view: false, calculate: false, adjustments: false, payslip: true, approve: false, mark_paid: false },
    reports: { view: false, export_excel: false, print_pdf: false },
    settings: { view: false, company_setup: false, user_roles: false },
  }
};
