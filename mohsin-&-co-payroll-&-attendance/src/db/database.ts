import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

let db: Database | null = null;
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'payroll.sqlite');

export async function getDatabase(): Promise<Database> {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  initSchemaAndSeed(db);
  saveDatabase();
  return db;
}

export function saveDatabase(): void {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Error persisting SQLite database:', err);
  }
}

function initSchemaAndSeed(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      check_in_time TEXT NOT NULL,
      check_out_time TEXT NOT NULL,
      grace_period_minutes INTEGER NOT NULL,
      mark_absent_after_grace INTEGER NOT NULL DEFAULT 1,
      work_days TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      employee_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      cnic TEXT NOT NULL,
      photo_url TEXT,
      department TEXT NOT NULL,
      designation TEXT NOT NULL,
      joining_date TEXT NOT NULL,
      employment_type TEXT NOT NULL, -- 'monthly_salary' | 'daily_wage'
      base_salary REAL NOT NULL,
      weekly_off_day TEXT NOT NULL DEFAULT '0', -- Legacy recurring weekly off-days (CSV weekday numbers). Superseded by custom_off_dates.
      custom_off_dates TEXT DEFAULT '', -- Specific calendar off-dates, CSV of ISO dates e.g. "2026-09-06,2026-09-13"
      shift_id TEXT NOT NULL,
      bank_name TEXT,
      account_number TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      exit_date TEXT,
      exit_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      date TEXT NOT NULL,
      check_in_time TEXT,
      check_out_time TEXT,
      status TEXT NOT NULL, -- 'present' | 'late' | 'absent' | 'half_day' | 'leave' | 'weekly_off'
      hours_worked REAL DEFAULT 0,
      late_minutes INTEGER DEFAULT 0,
      is_manual_override INTEGER DEFAULT 0,
      override_reason TEXT,
      override_by TEXT,
      device_id TEXT,
      UNIQUE(employee_id, date)
    );

    CREATE TABLE IF NOT EXISTS payroll (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      period_month TEXT NOT NULL, -- 'YYYY-MM'
      base_rate REAL NOT NULL,
      working_days INTEGER NOT NULL,
      days_present INTEGER NOT NULL,
      days_absent INTEGER NOT NULL,
      days_late INTEGER NOT NULL,
      days_leave INTEGER DEFAULT 0,
      days_off INTEGER DEFAULT 0,
      gross_earnings REAL NOT NULL,
      absent_deductions REAL NOT NULL,
      total_bonuses REAL DEFAULT 0,
      total_fines REAL DEFAULT 0,
      advance_deductions REAL DEFAULT 0,
      net_payout REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      generated_at TEXT NOT NULL,
      UNIQUE(employee_id, period_month)
    );

    CREATE TABLE IF NOT EXISTS payroll_adjustments (
      id TEXT PRIMARY KEY,
      payroll_id TEXT NOT NULL,
      employee_id TEXT NOT NULL,
      type TEXT NOT NULL, -- 'bonus' | 'fine' | 'advance_deduction' | 'other'
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      serial_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      last_heartbeat TEXT NOT NULL,
      total_pushes INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_name TEXT NOT NULL,
      user_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      details TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      contact TEXT DEFAULT '',
      department TEXT,
      permissions TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS employee_documents (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      document_type TEXT DEFAULT 'other',
      uploaded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_settings (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL DEFAULT 'Mohsin & Co',
      contact TEXT DEFAULT '',
      address TEXT DEFAULT '',
      logo_url TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS designations (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
  `);

  // Ensure company_settings has exactly one row
  const companyCount = database.exec("SELECT COUNT(*) FROM company_settings")[0]?.values[0][0] as number;
  if (!companyCount || companyCount === 0) {
    database.run(`INSERT INTO company_settings (id, company_name, contact, address, logo_url) VALUES ('company_1', 'Mohsin & Co', '+92 300 0000000', 'Karachi, Pakistan', '')`);
  }

  // Migration: Add contact column to users table if missing (for existing databases)
  try {
    const userColumns = database.exec("PRAGMA table_info(users)");
    const columns = userColumns[0]?.values?.map((row: any) => row[1]) || [];
    const migrations = [
      { name: 'contact', sql: "ALTER TABLE users ADD COLUMN contact TEXT DEFAULT ''" },
      { name: 'department', sql: "ALTER TABLE users ADD COLUMN department TEXT" },
      { name: 'permissions', sql: "ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '{}'" },
      { name: 'photo_url', sql: "ALTER TABLE users ADD COLUMN photo_url TEXT" },
    ];
    for (const m of migrations) {
      if (!columns.includes(m.name)) {
        database.run(m.sql);
        console.log(`Migration: Added ${m.name} column to users table`);
      }
    }
  } catch (err) {
    console.error('Migration check failed:', err);
  }

  // Migration: Add logo_url column to company_settings if missing
  try {
    const companyColumns = database.exec("PRAGMA table_info(company_settings)");
    const hasLogo = companyColumns[0]?.values?.some((row: any) => row[1] === 'logo_url');
    if (!hasLogo) {
      database.run("ALTER TABLE company_settings ADD COLUMN logo_url TEXT DEFAULT ''");
      console.log('Migration: Added logo_url column to company_settings table');
    }
  } catch (err) {
    console.error('Migration check failed:', err);
  }

  // Migration: Add custom_off_dates, exit_date, exit_reason columns to employees if missing (for existing databases)
  try {
    const empColumns = database.exec("PRAGMA table_info(employees)");
    const existingEmpCols = empColumns[0]?.values?.map((row: any) => row[1]) || [];
    if (!existingEmpCols.includes('custom_off_dates')) {
      database.run("ALTER TABLE employees ADD COLUMN custom_off_dates TEXT DEFAULT ''");
      console.log('Migration: Added custom_off_dates column to employees table');
    }
    if (!existingEmpCols.includes('exit_date')) {
      database.run("ALTER TABLE employees ADD COLUMN exit_date TEXT");
      console.log('Migration: Added exit_date column to employees table');
    }
    if (!existingEmpCols.includes('exit_reason')) {
      database.run("ALTER TABLE employees ADD COLUMN exit_reason TEXT");
      console.log('Migration: Added exit_reason column to employees table');
    }
  } catch (err) {
    console.error('Migration check failed:', err);
  }

  // Migration: Add days_leave, days_off columns to payroll if missing (for existing databases)
  try {
    const payrollColumns = database.exec("PRAGMA table_info(payroll)");
    const existingPayrollCols = payrollColumns[0]?.values?.map((row: any) => row[1]) || [];
    if (!existingPayrollCols.includes('days_leave')) {
      database.run("ALTER TABLE payroll ADD COLUMN days_leave INTEGER DEFAULT 0");
      console.log('Migration: Added days_leave column to payroll table');
    }
    if (!existingPayrollCols.includes('days_off')) {
      database.run("ALTER TABLE payroll ADD COLUMN days_off INTEGER DEFAULT 0");
      console.log('Migration: Added days_off column to payroll table');
    }
  } catch (err) {
    console.error('Migration check failed:', err);
  }

  // Seed default departments
  const deptCount = database.exec("SELECT COUNT(*) FROM departments")[0]?.values[0][0] as number;
  if (!deptCount || deptCount === 0) {
    database.run(`
      INSERT INTO departments (id, name) VALUES
      ('dept_1', 'Engineering'),
      ('dept_2', 'Human Resources'),
      ('dept_3', 'Operations'),
      ('dept_4', 'Finance'),
      ('dept_5', 'Administration')
    `);
  }

  // Seed default designations
  const desigCount = database.exec("SELECT COUNT(*) FROM designations")[0]?.values[0][0] as number;
  if (!desigCount || desigCount === 0) {
    database.run(`
      INSERT INTO designations (id, name) VALUES
      ('desig_1', 'Senior Software Engineer'),
      ('desig_2', 'HR Lead'),
      ('desig_3', 'Site Supervisor'),
      ('desig_4', 'Manager'),
      ('desig_5', 'Accountant'),
      ('desig_6', 'Staff'),
      ('desig_7', 'Cashier')
    `);
  }

  // Migration: Insecure Demo Admin Neutralization (BLOCKER-01 Remediation)
  // If the database contains unrotated demo credentials matching 'changeme123', deactivate them.
  try {
    const userRows = database.exec("SELECT id, email, password FROM users")[0]?.values || [];
    for (const [id, email, passwordHash] of userRows) {
      if (typeof passwordHash === 'string' && (email === 'admin@mohsinco.com' || email === 'hr@mohsinco.com' || email === 'ops@mohsinco.com')) {
        if (bcrypt.compareSync('changeme123', passwordHash)) {
          database.run(`DELETE FROM users WHERE id = '${id}'`);
          console.log(`Migration: Neutralized insecure default demo account ${email} to enforce secure first-run setup`);
        }
      }
    }
  } catch (err) {
    console.error('Demo admin cleanup check failed:', err);
  }

  // Check if seed data exists
  const countShifts = database.exec("SELECT COUNT(*) FROM shifts")[0]?.values[0][0] as number;
  if (!countShifts || countShifts === 0) {
    seedInitialData(database);
  } else {
    // Ensure clean database state without orphaned records
    database.run("DELETE FROM attendance WHERE employee_id NOT IN (SELECT id FROM employees)");
    database.run("DELETE FROM payroll WHERE employee_id NOT IN (SELECT id FROM employees)");
    database.run("DELETE FROM payroll_adjustments WHERE employee_id NOT IN (SELECT id FROM employees)");

    const countEmployees = database.exec("SELECT COUNT(*) FROM employees")[0]?.values[0][0] as number;
    if (!countEmployees || countEmployees === 0) {
      seedEmployeesAndAttendance(database);
    }
  }
}

function seedInitialData(database: Database): void {
  const now = new Date().toISOString();

  // 1. Shifts
  database.run(`
    INSERT INTO shifts (id, name, check_in_time, check_out_time, grace_period_minutes, mark_absent_after_grace, work_days) VALUES
    ('shift_gen', 'Standard Morning Shift', '09:00', '17:00', 30, 1, '[1,2,3,4,5,6]'),
    ('shift_flex', 'Flexible Support Shift', '10:00', '18:00', 45, 1, '[1,2,3,4,5,6]')
  `);

  // 2. Devices (1 Single Terminal)
  database.run(`
    INSERT INTO devices (id, serial_number, name, location, ip_address, status, last_heartbeat, total_pushes) VALUES
    ('dev_gate1', 'MC-882049102', 'Biometric Terminal (Main Gate)', 'Building Main Gate', '192.168.1.101', 'online', '${now}', 1420)
  `);

  // 3. Employees & Attendance
  seedEmployeesAndAttendance(database);

  // 4. Audit logs
  database.run(`
    INSERT INTO audit_logs (id, user_name, user_role, action, target, details, timestamp) VALUES
    ('log_1', 'Super Administrator', 'super_admin', 'SYSTEM_INIT', 'System', 'Initialized SQLite Payroll & Attendance Database', '${now}'),
    ('log_2', 'HR Manager', 'hr_admin', 'DEVICE_REGISTER', 'ZKTeco FaceDepot-7A', 'Registered ADMS device SN: ZK-882049102', '${now}')
  `);
}

function seedEmployeesAndAttendance(database: Database): void {
  const now = new Date().toISOString();

  // 1. Employees (Exactly 3 baseline employees)
  database.run(`
    INSERT INTO employees (id, employee_code, name, email, phone, cnic, photo_url, department, designation, joining_date, employment_type, base_salary, weekly_off_day, shift_id, bank_name, account_number, status, created_at) VALUES
    ('emp_001', 'EMP-1001', 'Syed Zohaib Ali', 'zohaib.ali@mohsinco.com', '+92 300 1234567', '42101-1234567-1', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 'Engineering', 'Senior Software Engineer', '2023-01-15', 'monthly_salary', 150000, 0, 'shift_gen', 'Meezan Bank', '010203040506', 'active', '${now}'),
    ('emp_002', 'EMP-1002', 'Ayesha Malik', 'ayesha.m@mohsinco.com', '+92 301 9876543', '42201-9876543-2', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150', 'Human Resources', 'HR Lead', '2022-06-01', 'monthly_salary', 130000, 0, 'shift_gen', 'Habib Bank Ltd', '123456789012', 'active', '${now}'),
    ('emp_003', 'EMP-1003', 'Tariq Mehmood', 'tariq.m@mohsinco.com', '+92 321 4567890', '42301-4567890-3', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 'Operations', 'Site Supervisor', '2024-02-10', 'daily_wage', 2500, 0, 'shift_gen', 'Bank Alfalah', '987654321098', 'active', '${now}')
  `);

  // 2. Seed Attendance for past days in current month
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  const employees = [
    { id: 'emp_001', code: 'EMP-1001', type: 'monthly_salary' },
    { id: 'emp_002', code: 'EMP-1002', type: 'monthly_salary' },
    { id: 'emp_003', code: 'EMP-1003', type: 'daily_wage' }
  ];

  for (let day = 1; day <= Math.min(today.getDate(), 15); day++) {
    const d = new Date(currentYear, currentMonth, day);
    const dateStr = d.toISOString().split('T')[0];
    const isSunday = d.getDay() === 0;

    employees.forEach((emp, index) => {
      if (isSunday) {
        database.run(`
          INSERT INTO attendance (id, employee_id, date, check_in_time, check_out_time, status, hours_worked, late_minutes, is_manual_override, override_reason, device_id)
          VALUES ('att_${emp.id}_${dateStr}', '${emp.id}', '${dateStr}', NULL, NULL, 'weekly_off', 0, 0, 0, NULL, NULL)
        `);
      } else {
        let status = 'present';
        let checkIn = '08:55:12';
        let checkOut = '17:05:40';
        let hours = 8.1;
        let lateMins = 0;

        if (day === 3 && index === 2) {
          status = 'late';
          checkIn = '09:22:10';
          lateMins = 22;
        }

        database.run(`
          INSERT INTO attendance (id, employee_id, date, check_in_time, check_out_time, status, hours_worked, late_minutes, is_manual_override, override_reason, device_id)
          VALUES ('att_${emp.id}_${dateStr}', '${emp.id}', '${dateStr}', ${checkIn ? `'${checkIn}'` : 'NULL'}, ${checkOut ? `'${checkOut}'` : 'NULL'}, '${status}', ${hours}, ${lateMins}, 0, NULL, 'dev_gate1')
        `);
      }
    });
  }

  // 6. Audit logs
  database.run(`
    INSERT INTO audit_logs (id, user_name, user_role, action, target, details, timestamp) VALUES
    ('log_1', 'Super Administrator', 'super_admin', 'SYSTEM_INIT', 'System', 'Initialized SQLite Payroll & Attendance Database', '${now}'),
    ('log_2', 'HR Manager', 'hr_admin', 'DEVICE_REGISTER', 'ZKTeco FaceDepot-7A', 'Registered ADMS device SN: ZK-882049102', '${now}')
  `);
}

// SQL Helper Utilities
export function queryAll<T = any>(db: Database, sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    const sanitized = params.map(p => (p === undefined ? null : p));
    stmt.bind(sanitized);
  }
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function queryOne<T = any>(db: Database, sql: string, params: any[] = []): T | null {
  const all = queryAll<T>(db, sql, params);
  return all.length > 0 ? all[0] : null;
}

export function runExec(db: Database, sql: string, params: any[] = [], autoSave: boolean = true): void {
  const sanitized = params.map(p => (p === undefined ? null : p));
  db.run(sql, sanitized);
  if (autoSave) {
    saveDatabase();
  }
}
