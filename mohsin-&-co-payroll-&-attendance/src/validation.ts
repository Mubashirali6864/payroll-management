import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  contact: z.string().optional(),
  role: z.enum(['super_admin', 'hr_admin', 'manager', 'cashier']),
  department: z.string().optional(),
  photo_url: z.string().optional().nullable(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  contact: z.string().optional(),
  role: z.enum(['super_admin', 'hr_admin', 'manager', 'cashier']).optional(),
  department: z.string().optional(),
  photo_url: z.string().optional().nullable(),
  permissions: z.record(z.string(), z.record(z.string(), z.boolean())).optional(),
  password: z.string().min(8).optional(),
});

export const formatPakCnic = (val: string): string => {
  const digits = (val || '').replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
};

export const isValidPakCnic = (cnic: string): boolean => {
  return /^\d{5}-\d{7}-\d{1}$/.test(cnic);
};

export const createEmployeeSchema = z.object({
  id: z.string().optional(),
  employee_code: z.string().optional(),
  name: z.string().min(2, 'Name is required').max(100, 'Full name cannot exceed 100 characters'),
  email: z.string().email('Invalid email format'),
  phone: z.string().min(1, 'Phone is required'),
  cnic: z.string().regex(/^\d{5}-\d{7}-\d{1}$/, 'CNIC must follow the 13-digit Pakistani NADRA format: XXXXX-XXXXXXX-X (e.g. 42101-1234567-1)'),
  photo_url: z.string().optional().nullable(),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().min(1, 'Designation is required'),
  joining_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  employment_type: z.enum(['monthly_salary', 'daily_wage']),
  base_salary: z.number().nonnegative('Salary must be non-negative'),
  weekly_off_day: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
  custom_off_dates: z.string().optional(),
  shift_id: z.string().optional().default('shift_gen'),
  bank_name: z.string().optional().nullable(),
  account_number: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive', 'on_leave']).default('active'),
  exit_date: z.string().optional().nullable(),
  exit_reason: z.string().optional().nullable(),
  created_at: z.string().optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const createShiftSchema = z.object({
  name: z.string().min(2, 'Shift name is required'),
  check_in_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  check_out_time: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time format (HH:MM)'),
  grace_period_minutes: z.number().int().min(0).max(120).default(30),
  mark_absent_after_grace: z.boolean().default(true),
  work_days: z.array(z.number().int().min(0).max(6)).default([1,2,3,4,5,6]),
});

export const updateShiftSchema = createShiftSchema.partial();

export const attendanceOverrideSchema = z.object({
  employee_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  check_in_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Invalid time format (HH:MM or HH:MM:SS)').optional().nullable(),
  check_out_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Invalid time format (HH:MM or HH:MM:SS)').optional().nullable(),
  status: z.enum(['present', 'late', 'absent', 'half_day', 'leave', 'weekly_off']),
  reason: z.string().min(1, 'Reason is required'),
  override_by: z.string().optional(),
});

export const bulkAttendanceSchema = z.object({
  // Allow up to a full year of dates in one batch. The previous cap of 31 caused any range
  // longer than a month to be rejected wholesale (HTTP 400 → nothing saved), which looked
  // like "only some/one day got saved". Bulk backfills should persist the entire range.
  entries: z.array(attendanceOverrideSchema).min(1).max(366),
});

export const payrollAdjustmentSchema = z.object({
  employee_id: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  type: z.enum(['bonus', 'fine', 'advance_deduction', 'other']),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required'),
});

export const companySettingsSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  contact: z.string().optional(),
  address: z.string().optional(),
  logo_url: z.string().optional(),
});

export function validateBody(schema: z.ZodSchema) {
  return (req: any, res: any, next: any) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Validation failed', details: result.error.flatten() });
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: z.ZodSchema) {
  return (req: any, res: any, next: any) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: result.error.flatten() });
    }
    req.query = result.data;
    next();
  };
}