import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import { getDatabase, queryAll, queryOne, runExec, saveDatabase } from './src/db/database';
import { Employee, AttendanceRecord, PayrollRecord, BiometricDevice, AuditLog, ROLE_PERMISSIONS_TEMPLATES, UserRole } from './src/types';
import multer from 'multer';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  getJwtSecret,
  authMiddleware,
  requirePermission,
  requireRole,
  JWTPayload
} from './src/auth';
import {
  validateBody,
  validateQuery,
  loginSchema,
  createUserSchema,
  updateUserSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  createShiftSchema,
  updateShiftSchema,
  attendanceOverrideSchema,
  bulkAttendanceSchema,
  payrollAdjustmentSchema,
  companySettingsSchema
} from './src/validation';
import { z } from 'zod';

async function startServer() {
  // Fail closed immediately if JWT_SECRET is missing or insecure in production
  getJwtSecret();

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  // Reverse proxy trust configuration (Step 6)
  const trustProxyEnv = process.env.TRUST_PROXY;
  if (trustProxyEnv === 'true' || trustProxyEnv === '1') {
    app.set('trust proxy', 1);
  } else if (trustProxyEnv && !isNaN(Number(trustProxyEnv))) {
    app.set('trust proxy', Number(trustProxyEnv));
  }

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        mediaSrc: ["'self'", "data:", "https:", "blob:"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // CORS configuration
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  app.use(cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '2000'), // limit each IP to 2000 requests per windowMs
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/assets/') || req.path.includes('.') || req.path.startsWith('/api/auth/'),
  });
  app.use(limiter);

  // Helper for generating auth rate limit composite key (IP + account)
  const getAuthAccountKey = (req: Request) => {
    const ip = ipKeyGenerator(req.ip || '127.0.0.1');
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `${ip}_${email}`;
  };

  // Stricter rate limiting for auth endpoints per IP + account (prevents single-account brute-force without locking out other users on same NAT)
  const authLimiter = rateLimit({
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
    message: { error: 'Too many login attempts, please try again later' },
    skipSuccessfulRequests: true,
    keyGenerator: getAuthAccountKey,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Global IP defense-in-depth against distributed/horizontal credential spraying
  const authIpLimiter = rateLimit({
    windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.AUTH_IP_RATE_LIMIT_MAX || '30', 10), // Generous for corporate NAT, hard cap on automated spraying
    message: { error: 'Too many login attempts, please try again later' },
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Raw body parser for ZKTeco ADMS device push protocol (/iclock/cdata)
  app.use(express.text({ type: ['text/plain', 'text/*', 'application/x-www-form-urlencoded'] }));

  // Skip JSON/urlencoded parsing for multipart/form-data (let multer handle it)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.startsWith('multipart/form-data')) {
      return next();
    }
    express.json()(req, res, () => {
      express.urlencoded({ extended: true })(req, res, next);
    });
  });

  // Document upload directory
  const DOCUMENTS_DIR = path.join(process.cwd(), 'data', 'documents');
  if (!fs.existsSync(DOCUMENTS_DIR)) {
    fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
  }

  // Multer config for document uploads - inline to ensure req.params is available
  const documentUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const empDir = path.join(DOCUMENTS_DIR, req.params.id || 'unknown');
        if (!fs.existsSync(empDir)) {
          fs.mkdirSync(empDir, { recursive: true });
        }
        cb(null, empDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'image/jpeg',
        'image/png',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      allowedMimes.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG, PDF, DOC, DOCX allowed'));
    }
  });

  // Profile picture upload directory
  const PROFILE_PICS_DIR = path.join(process.cwd(), 'data', 'profile_pictures');
  if (!fs.existsSync(PROFILE_PICS_DIR)) {
    fs.mkdirSync(PROFILE_PICS_DIR, { recursive: true });
  }

  // Multer config for profile pictures
  const profilePicUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, PROFILE_PICS_DIR);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `${req.params.id}_${Date.now()}${ext}`;
        cb(null, uniqueName);
      }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      allowedMimes.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG, WebP, GIF allowed'));
    }
  });

  // Initialize SQLite database
  const db = await getDatabase();

  // Helper to log audit actions
  const addAuditLog = (userName: string, userRole: any, action: string, target: string, details: string) => {
    const id = `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const timestamp = new Date().toISOString();
    runExec(db, `
      INSERT INTO audit_logs (id, user_name, user_role, action, target, details, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, userName, userRole, action, target, details, timestamp]);
  };

  // ==========================================
  // ZKTECO ADMS PUSH PROTOCOL ENDPOINTS
  // ==========================================

  // 1. Handshake & Config
  app.get('/iclock/cdata', (req: Request, res: Response) => {
    const sn = (req.query.SN as string) || (req.query.sn as string) || 'UNKNOWN';
    console.log(`[ADMS] Handshake request from device SN: ${sn}`);

    // Update or register device
    const existing = queryOne(db, 'SELECT * FROM devices WHERE serial_number = ?', [sn]);
    const now = new Date().toISOString();
    if (existing) {
      runExec(db, 'UPDATE devices SET last_heartbeat = ?, status = ? WHERE serial_number = ?', [now, 'online', sn]);
    } else {
      const devId = `dev_${Date.now()}`;
      runExec(db, `
        INSERT INTO devices (id, serial_number, name, location, ip_address, status, last_heartbeat, total_pushes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      `, [devId, sn, `ZKTeco Device (${sn})`, 'Auto-Registered Gate', req.ip || '192.168.1.100', 'online', now]);
      addAuditLog('ADMS Listener', 'super_admin', 'DEVICE_AUTO_REGISTER', sn, `Auto-registered ZKTeco device SN: ${sn}`);
    }

    // ADMS response format
    res.setHeader('Content-Type', 'text/plain');
    res.send('GET OPTION FROM: ' + sn + '\nStamp=1000\nOpStamp=1000\nErrorDelay=30\nDelay=10\nTransTimes=00:00;14:00\nRealtime=1');
  });

  // 2. Attendance Punch Ingestion
  app.post('/iclock/cdata', (req: Request, res: Response) => {
    const sn = (req.query.SN as string) || (req.query.sn as string) || 'UNKNOWN';
    const table = (req.query.table as string) || 'ATTLOG';
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    console.log(`[ADMS] Log upload from SN: ${sn}, Table: ${table}`);

    if (table === 'ATTLOG') {
      const lines = rawBody.split('\n');
      let processedPunches = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Standard ADMS ATTLOG format: PIN\tTIMESTAMP\tSTATUS\tVERIFY\tWORKCODE\tRESERVED
        // Example: 1001\t2026-08-12 09:05:00\t0\t0\t0\t0
        const parts = trimmed.split('\t');
        if (parts.length >= 2) {
          const empPin = parts[0].trim();
          const timestampStr = parts[1].trim(); // "YYYY-MM-DD HH:mm:ss"

          processBiometricPunch(empPin, timestampStr, sn);
          processedPunches++;
        }
      }

      // Update device heartbeat & stats
      const now = new Date().toISOString();
      runExec(db, 'UPDATE devices SET last_heartbeat = ?, status = ?, total_pushes = total_pushes + ? WHERE serial_number = ?', [now, 'online', processedPunches, sn]);

      res.setHeader('Content-Type', 'text/plain');
      return res.send(`OK: ${processedPunches}`);
    }

    res.setHeader('Content-Type', 'text/plain');
    res.send('OK');
  });

  // 3. Command Polling
  app.get('/iclock/getrequest', (req: Request, res: Response) => {
    const sn = (req.query.SN as string) || 'UNKNOWN';
    const now = new Date().toISOString();
    runExec(db, 'UPDATE devices SET last_heartbeat = ?, status = ? WHERE serial_number = ?', [now, 'online', sn]);
    res.setHeader('Content-Type', 'text/plain');
    res.send('OK');
  });

  // 4. Command Execution Confirmation
  app.post('/iclock/devicecmd', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send('OK');
  });

  // Shift Duration Helper with 24-hour midnight rollover (P1-03 / DEFECT-02 fix)
  function calculateHoursWorked(inTime: string, outTime: string): number {
    const [inH, inM] = inTime.split(':').map(Number);
    const [outH, outM] = outTime.split(':').map(Number);
    if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) return 0;
    let diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
    if (diffMinutes < 0) {
      diffMinutes += 24 * 60; // 24-hour midnight rollover
    }
    return Math.max(0, Math.round((diffMinutes / 60) * 10) / 10);
  }

  // Biometric Processing Logic Helper
  function processBiometricPunch(empCodeOrPin: string, timestampStr: string, deviceSn: string) {
    // Find employee by code (e.g. EMP-1001 or 1001 or emp_001)
    let emp = queryOne(db, 'SELECT * FROM employees WHERE employee_code = ? OR employee_code = ? OR id = ?', [empCodeOrPin, `EMP-${empCodeOrPin}`, empCodeOrPin]);
    if (!emp) {
      console.warn(`[ADMS] Received punch for unknown employee PIN/Code: ${empCodeOrPin}`);
      return;
    }

    const dateParts = timestampStr.split(' ');
    const punchDate = dateParts[0]; // YYYY-MM-DD
    const punchTime = dateParts[1] || '09:00:00'; // HH:mm:ss

    // Fetch shift rule for employee
    const shift = queryOne(db, 'SELECT * FROM shifts WHERE id = ?', [emp.shift_id]) || {
      check_in_time: '09:00',
      check_out_time: '17:00',
      grace_period_minutes: 30,
      mark_absent_after_grace: 1
    };

    // Calculate time offset
    const [shiftHour, shiftMin] = shift.check_in_time.split(':').map(Number);
    const [punchHour, punchMin, punchSec] = punchTime.split(':').map(Number);

    const shiftTotalMinutes = shiftHour * 60 + shiftMin;
    const punchTotalMinutes = punchHour * 60 + punchMin;
    const diffMinutes = punchTotalMinutes - shiftTotalMinutes;

    const graceLimitMinutes = shift.grace_period_minutes || 30;

    let status = 'present';
    let lateMins = 0;

    if (diffMinutes > 0) {
      lateMins = diffMinutes;
      // Salaries should only be deducted for full absences, never for late arrivals or within grace
      if (diffMinutes > graceLimitMinutes) {
        status = 'late';
      } else {
        status = 'present'; // within grace period
      }
    }

    // Check if attendance already exists for today
    const existingAtt = queryOne(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [emp.id, punchDate]);

    if (!existingAtt) {
      // First punch of the day = Check-In
      const attId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      runExec(db, `
        INSERT INTO attendance (id, employee_id, date, check_in_time, check_out_time, status, hours_worked, late_minutes, is_manual_override, device_id)
        VALUES (?, ?, ?, ?, NULL, ?, 0, ?, 0, ?)
      `, [attId, emp.id, punchDate, punchTime, status, lateMins, deviceSn]);
    } else {
      // Debounce: If a punch occurs within 5 minutes of check-in, ignore it as an accidental duplicate tap
      const checkInTime = existingAtt.check_in_time || '09:00:00';
      const [cInH, cInM] = checkInTime.split(':').map(Number);
      let elapsedMinutes = (punchHour * 60 + punchMin) - (cInH * 60 + cInM);
      if (elapsedMinutes < 0) {
        elapsedMinutes += 24 * 60; // 24-hour midnight rollover
      }

      if (elapsedMinutes >= 0 && elapsedMinutes < 5) {
        console.warn(`[ADMS] Debounced duplicate biometric punch for employee ${emp.id} at ${punchTime} (${elapsedMinutes}m after check-in)`);
        return;
      }

      // Subsequent punch after debounce window = Check-Out
      const hoursWorked = calculateHoursWorked(checkInTime, punchTime);

      runExec(db, `
        UPDATE attendance 
        SET check_out_time = ?, hours_worked = ?, device_id = ?
        WHERE employee_id = ? AND date = ?
      `, [punchTime, hoursWorked, deviceSn, emp.id, punchDate]);
    }
  }

  // ==========================================
  // AUTHENTICATION & SETUP ENDPOINTS
  // ==========================================

  // First-Run Administrator Setup Status
  app.get('/api/auth/setup-status', (req: Request, res: Response) => {
    const admin = queryOne(db, "SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'");
    const setupRequired = !admin || admin.count === 0;
    res.json({ setupRequired });
  });

  // First-Run Administrator Setup
  app.post('/api/auth/setup', validateBody(z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8)
  })), async (req: Request, res: Response) => {
    const existingAdmin = queryOne(db, "SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'");
    if (existingAdmin && existingAdmin.count > 0) {
      return res.status(400).json({ error: 'Initial administrator setup has already been completed' });
    }

    const { name, email, password } = req.body;
    const passwordHash = await hashPassword(password);
    const id = `usr_${Date.now()}`;
    runExec(db, `
      INSERT INTO users (id, name, email, password, role, department, contact, permissions)
      VALUES (?, ?, ?, ?, 'super_admin', 'Administration', '', '{}')
    `, [id, name, email, passwordHash]);
    saveDatabase();

    const user = {
      id,
      name,
      email,
      role: 'super_admin',
      department: 'Administration',
      contact: '',
      permissions: {}
    };
    const token = generateToken({
      userId: id,
      email,
      role: 'super_admin',
      permissions: {}
    });

    addAuditLog('System Setup', 'super_admin', 'INITIAL_SETUP', email, 'Initial primary administrator setup completed');
    res.json({ success: true, message: 'Administrator setup completed successfully', user, token });
  });

  // Login (Rate limiting disabled per user request)
  app.post('/api/auth/login', validateBody(loginSchema), async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Insecure default demo password rejection (BLOCKER-01 Remediation)
    if (password === 'changeme123') {
      return res.status(401).json({ error: 'Insecure default credentials are disabled. Please complete administrator setup.' });
    }

    const user = queryOne(db, 'SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !user.password || typeof user.password !== 'string') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Reset rate limiter count for this (IP, account) upon successful authentication
    try {
      authLimiter.resetKey(getAuthAccountKey(req));
    } catch {
      // Ignore if store doesn't support resetKey
    }

    // Parse permissions
    const permissions = typeof user.permissions === 'string' ? JSON.parse(user.permissions || '{}') : user.permissions;

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      permissions
    };

    const token = generateToken(payload);

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({
      user: { ...userWithoutPassword, permissions },
      token
    });
  });

  // Get current user (requires auth)
  app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user as JWTPayload;
    res.json(user);
  });

  // Change password
  app.post('/api/auth/change-password', authMiddleware, validateBody(z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
  })), async (req: Request, res: Response) => {
    const user = (req as any).user as JWTPayload;
    const { currentPassword, newPassword } = req.body;

    const dbUser = queryOne(db, 'SELECT * FROM users WHERE id = ?', [user.userId]);
    if (!dbUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await verifyPassword(currentPassword, dbUser.password);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await hashPassword(newPassword);
    runExec(db, 'UPDATE users SET password = ? WHERE id = ?', [newHash, user.userId]);

    res.json({ success: true, message: 'Password changed successfully' });
  });

  // ==========================================
  // DEPARTMENTS & DESIGNATIONS LOOKUP
  // ==========================================

  app.get('/api/departments', authMiddleware, requirePermission('employees', 'view'), (req: Request, res: Response) => {
    const depts = queryAll(db, 'SELECT * FROM departments ORDER BY name ASC');
    res.json(depts);
  });

  app.post('/api/departments', authMiddleware, requirePermission('employees', 'add'), validateBody(z.object({ name: z.string().min(1) })), (req: Request, res: Response) => {
    const { name } = req.body;
    const existing = queryOne(db, 'SELECT * FROM departments WHERE name = ?', [name]);
    if (existing) return res.json(existing);
    const id = `dept_${Date.now()}`;
    runExec(db, 'INSERT INTO departments (id, name) VALUES (?, ?)', [id, name]);
    res.json({ id, name });
  });

  app.get('/api/designations', authMiddleware, requirePermission('employees', 'view'), (req: Request, res: Response) => {
    const desigs = queryAll(db, 'SELECT * FROM designations ORDER BY name ASC');
    res.json(desigs);
  });

  app.post('/api/designations', authMiddleware, requirePermission('employees', 'add'), validateBody(z.object({ name: z.string().min(1) })), (req: Request, res: Response) => {
    const { name } = req.body;
    const existing = queryOne(db, 'SELECT * FROM designations WHERE name = ?', [name]);
    if (existing) return res.json(existing);
    const id = `desig_${Date.now()}`;
    runExec(db, 'INSERT INTO designations (id, name) VALUES (?, ?)', [id, name]);
    res.json({ id, name });
  });

  // ==========================================
  // EMPLOYEES CRUD
  // ==========================================

  app.get('/api/employees', authMiddleware, requirePermission('employees', 'view'), (req: Request, res: Response) => {
    const employees = queryAll(db, 'SELECT * FROM employees ORDER BY employee_code ASC');
    res.json(employees);
  });

  // Auto-generate next employee code
  app.get('/api/employees/next-code', authMiddleware, requirePermission('employees', 'add'), (req: Request, res: Response) => {
    const allEmployees = queryAll(db, 'SELECT employee_code FROM employees');
    let nextNum = 1001;
    if (allEmployees.length > 0) {
      const nums = allEmployees
        .map(e => e.employee_code)
        .filter(code => code && code.startsWith('EMP-'))
        .map(code => parseInt(code.replace('EMP-', ''), 10))
        .filter(n => !isNaN(n));
      if (nums.length > 0) {
        nextNum = Math.max(...nums) + 1;
      }
    }
    res.json({ next_code: `EMP-${nextNum}` });
  });

  app.get('/api/employees/:id', authMiddleware, requirePermission('employees', 'view'), (req: Request, res: Response) => {
    const emp = queryOne(db, 'SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });
    res.json(emp);
  });

  app.post('/api/employees', authMiddleware, requirePermission('employees', 'add'), validateBody(createEmployeeSchema), (req: Request, res: Response) => {
    try {
      const {
        employee_code: customCode, name, email, phone, cnic, photo_url, department, designation,
        joining_date, employment_type, base_salary, weekly_off_day, custom_off_dates,
        shift_id, bank_name, account_number, status
      } = req.body;

      // Auto-generate or use custom employee_code
      let empCode = customCode;
      if (!empCode) {
        const allEmployees = queryAll(db, 'SELECT employee_code FROM employees');
        let nextNum = 1001;
        if (allEmployees.length > 0) {
          const nums = allEmployees
            .map(e => e.employee_code)
            .filter(code => code && code.startsWith('EMP-'))
            .map(code => parseInt(code.replace('EMP-', ''), 10))
            .filter(n => !isNaN(n));
          if (nums.length > 0) {
            nextNum = Math.max(...nums) + 1;
          }
        }
        empCode = `EMP-${nextNum}`;
      }

      // Duplicate check
      const duplicateCheck = queryOne(db, 'SELECT id FROM employees WHERE employee_code = ?', [empCode]);
      if (duplicateCheck) {
        return res.status(409).json({ error: 'Employee ID Already Exists' });
      }

      const id = req.body.id || `emp_${Date.now()}`;
      const now = new Date().toISOString();

      runExec(db, `
        INSERT INTO employees (
          id, employee_code, name, email, phone, cnic, photo_url, department, designation,
          joining_date, employment_type, base_salary, weekly_off_day, custom_off_dates, shift_id, bank_name,
          account_number, status, exit_date, exit_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, empCode, name, email, phone, cnic, photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
        department || 'Operations', designation || 'Staff', joining_date || now.split('T')[0],
        employment_type || 'monthly_salary', base_salary ?? 50000, weekly_off_day ?? '', custom_off_dates ?? '',
        shift_id || 'shift_gen', bank_name || '', account_number || '', status || 'active',
        req.body.exit_date || '', req.body.exit_reason || '', now
      ]);

      addAuditLog('HR Admin', 'hr_admin', 'EMPLOYEE_CREATE', name, `Created employee ${empCode} (${employment_type})`);
      const created = queryOne(db, 'SELECT * FROM employees WHERE id = ?', [id]);
      res.json(created);
    } catch (err: any) {
      console.error('Error creating employee:', err);
      res.status(500).json({ error: err.message || 'Failed to create employee' });
    }
  });

  app.put('/api/employees/:id', authMiddleware, requirePermission('employees', 'edit'), validateBody(updateEmployeeSchema), (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const existing = queryOne(db, 'SELECT * FROM employees WHERE id = ?', [id]);
      if (!existing) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      const {
        employee_code, name, email, phone, cnic, photo_url, department, designation,
        joining_date, employment_type, base_salary, weekly_off_day, custom_off_dates,
        shift_id, bank_name, account_number, status, exit_date, exit_reason
      } = req.body;

      // If employee_code changed, check for duplicates
      if (employee_code && employee_code !== existing.employee_code) {
        const duplicateCheck = queryOne(db, 'SELECT id FROM employees WHERE employee_code = ? AND id != ?', [employee_code, id]);
        if (duplicateCheck) {
          return res.status(409).json({ error: 'Employee ID Already Exists' });
        }
      }

      const updatedCode = employee_code !== undefined ? employee_code : existing.employee_code;
      const updatedName = name !== undefined ? name : existing.name;
      const updatedEmail = email !== undefined ? email : existing.email;
      const updatedPhone = phone !== undefined ? phone : existing.phone;
      const updatedCnic = cnic !== undefined ? cnic : existing.cnic;
      const updatedPhotoUrl = photo_url !== undefined ? photo_url : (existing.photo_url || '');
      const updatedDept = department !== undefined ? department : existing.department;
      const updatedDesig = designation !== undefined ? designation : existing.designation;
      const updatedJoining = joining_date !== undefined ? joining_date : existing.joining_date;
      const updatedEmpType = employment_type !== undefined ? employment_type : existing.employment_type;
      const updatedSalary = base_salary !== undefined ? base_salary : existing.base_salary;
      const updatedWeeklyOff = weekly_off_day !== undefined ? weekly_off_day : existing.weekly_off_day;
      const updatedCustomOff = custom_off_dates !== undefined ? custom_off_dates : (existing.custom_off_dates ?? '');
      const updatedShift = shift_id !== undefined ? shift_id : existing.shift_id;
      const updatedBank = bank_name !== undefined ? bank_name : (existing.bank_name || '');
      const updatedAccount = account_number !== undefined ? account_number : (existing.account_number || '');
      const updatedStatus = status !== undefined ? status : existing.status;
      const updatedExitDate = exit_date !== undefined ? (exit_date || '') : (existing.exit_date || '');
      const updatedExitReason = exit_reason !== undefined ? (exit_reason || '') : (existing.exit_reason || '');

      runExec(db, `
        UPDATE employees SET
          employee_code = ?, name = ?, email = ?, phone = ?, cnic = ?, photo_url = ?, department = ?,
          designation = ?, joining_date = ?, employment_type = ?, base_salary = ?,
          weekly_off_day = ?, custom_off_dates = ?, shift_id = ?, bank_name = ?, account_number = ?,
          status = ?, exit_date = ?, exit_reason = ?
        WHERE id = ?
      `, [
        updatedCode, updatedName, updatedEmail, updatedPhone, updatedCnic, updatedPhotoUrl,
        updatedDept, updatedDesig, updatedJoining, updatedEmpType, updatedSalary,
        updatedWeeklyOff, updatedCustomOff, updatedShift, updatedBank, updatedAccount,
        updatedStatus, updatedExitDate, updatedExitReason, id
      ]);

      addAuditLog('HR Admin', 'hr_admin', 'EMPLOYEE_UPDATE', updatedName, `Updated details for ${updatedCode || id}`);
      const updated = queryOne(db, 'SELECT * FROM employees WHERE id = ?', [id]);
      res.json(updated);
    } catch (err: any) {
      console.error('Error updating employee:', err);
      res.status(500).json({ error: err.message || 'Failed to update employee' });
    }
  });

  app.delete('/api/employees/:id', authMiddleware, requireRole('super_admin'), async (req: Request, res: Response) => {
    const { id } = req.params;
    const user = (req as any).user as JWTPayload;

    // Verify admin password if provided (confirmation window requirement)
    const adminPassword = req.body?.admin_password || req.body?.password;
    if (adminPassword !== undefined) {
      const adminUser = queryOne(db, 'SELECT password FROM users WHERE id = ?', [user.userId]);
      const isValid = adminUser && (await verifyPassword(String(adminPassword), adminUser.password));
      if (!isValid) {
        return res.status(401).json({ error: 'Incorrect administrator password. Deletion cancelled.' });
      }
    }

    const emp = queryOne(db, 'SELECT name, employee_code FROM employees WHERE id = ?', [id]);
    if (!emp) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Check attendance or payroll history (P-02 cascade rules)
    const attCount = queryOne(db, 'SELECT COUNT(*) as count FROM attendance WHERE employee_id = ?', [id])?.count || 0;
    const paidOrApprovedCount = queryOne(db, "SELECT COUNT(*) as count FROM payroll WHERE employee_id = ? AND (status = 'paid' OR status = 'approved')", [id])?.count || 0;
    const isForce = req.query.force === 'true' || req.body?.force === true;

    if (!isForce && (paidOrApprovedCount > 0 || attCount > 0)) {
      // Soft delete: deactivate employee so finalized historical audit & payroll records are preserved
      runExec(db, "UPDATE employees SET status = 'inactive' WHERE id = ?", [id]);
      addAuditLog(user.email, 'super_admin', 'EMPLOYEE_DEACTIVATE', `${emp.name} (${emp.employee_code})`, `Deactivated employee ${emp.name} (has ${attCount} attendance logs, ${paidOrApprovedCount} approved/paid payroll records)`);
      return res.json({
        success: true,
        action: 'deactivated',
        deactivated: true,
        message: `Employee ${emp.name} (${emp.employee_code}) has historical records (${attCount} attendance logs, ${paidOrApprovedCount} finalized payroll). Profile has been deactivated (soft-deleted) rather than permanently removed to preserve data integrity.`
      });
    }

    // No finalized history (or force requested) -> safe permanent hard delete (cleans up any draft calculations and records)
    runExec(db, "DELETE FROM payroll WHERE employee_id = ? AND status != 'paid'", [id], false);
    runExec(db, "DELETE FROM payroll_adjustments WHERE employee_id = ?", [id], false);
    runExec(db, "DELETE FROM attendance WHERE employee_id = ?", [id], false);
    runExec(db, "DELETE FROM employee_documents WHERE employee_id = ?", [id], false);
    runExec(db, 'DELETE FROM employees WHERE id = ?', [id], true);
    addAuditLog(user.email, 'super_admin', 'EMPLOYEE_DELETE', `${emp.name} (${emp.employee_code})`, `Permanently deleted employee ${emp.name} (${emp.employee_code})`);
    res.json({
      success: true,
      action: 'deleted',
      deactivated: false,
      message: `Employee ${emp.name} (${emp.employee_code}) permanently deleted.`
    });
  });

  // Reactivate Employee (Re-hire / return from inactive) - Requires Admin Password
  app.post('/api/employees/:id/reactivate', authMiddleware, requirePermission('employees', 'edit'), async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const user = (req as any).user as JWTPayload;

      const adminPassword = req.body?.admin_password || req.body?.password;
      if (!adminPassword || typeof adminPassword !== 'string' || !adminPassword.trim()) {
        return res.status(400).json({ error: 'Administrator password is required to reactivate an employee.' });
      }

      // Verify password against current user or super_admin users
      const currentUser = queryOne(db, 'SELECT password FROM users WHERE id = ?', [user.userId]);
      let isValid = currentUser && (await verifyPassword(adminPassword.trim(), currentUser.password));
      if (!isValid) {
        // Fallback: allow super_admin password validation
        const superAdmins = queryAll(db, "SELECT password FROM users WHERE role = 'super_admin'");
        for (const sa of superAdmins) {
          if (await verifyPassword(adminPassword.trim(), sa.password)) {
            isValid = true;
            break;
          }
        }
      }

      if (!isValid) {
        return res.status(401).json({ error: 'Incorrect administrator password. Reactivation cancelled.' });
      }

      const emp = queryOne(db, 'SELECT * FROM employees WHERE id = ?', [id]);
      if (!emp) {
        return res.status(404).json({ error: 'Employee not found' });
      }

      runExec(db, "UPDATE employees SET status = 'active', exit_date = '', exit_reason = '' WHERE id = ?", [id]);
      addAuditLog(user?.email || 'Admin', user?.role || 'super_admin', 'EMPLOYEE_REACTIVATE', `${emp.name} (${emp.employee_code})`, `Reactivated employee ${emp.name} to active status with password authorization`);
      const updated = queryOne(db, 'SELECT * FROM employees WHERE id = ?', [id]);
      res.json({
        success: true,
        employee: updated,
        message: `Employee ${emp.name} (${emp.employee_code}) has been reactivated to Active status.`
      });
    } catch (err: any) {
      console.error('Error reactivating employee:', err);
      res.status(500).json({ error: err.message || 'Failed to reactivate employee' });
    }
  });

  // ==========================================
  // EMPLOYEE DOCUMENTS
  // ==========================================

  app.get('/api/employees/:id/documents', authMiddleware, requirePermission('employees', 'view'), (req: Request, res: Response) => {
    const docs = queryAll(db, 'SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY uploaded_at DESC', [req.params.id]);
    res.json(docs);
  });

  app.post('/api/employees/:id/documents', authMiddleware, requirePermission('employees', 'add'), documentUpload.array('files', 10), (req: Request, res: Response) => {
    const employeeId = req.params.id;
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Validate file types - only allow images and PDFs
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    for (const file of files) {
      if (!allowedMimes.includes(file.mimetype)) {
        return res.status(400).json({ error: `File type not allowed: ${file.mimetype}. Allowed: JPEG, PNG, GIF, PDF` });
      }
    }

    const docs: any[] = [];
    const now = new Date().toISOString();

    for (const file of files) {
      const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const relativePath = `/api/employees/${employeeId}/documents/${docId}/download`;
      const docType = (req.body.document_type as string) || 'other';

      runExec(db, `
        INSERT INTO employee_documents (id, employee_id, file_name, file_path, document_type, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [docId, employeeId, file.originalname, file.path, docType, now]);

      docs.push({ id: docId, employee_id: employeeId, file_name: file.originalname, file_path: relativePath, document_type: docType, uploaded_at: now });
    }

    addAuditLog('HR Admin', 'hr_admin', 'DOCUMENT_UPLOAD', employeeId, `Uploaded ${files.length} document(s)`);
    res.json(docs);
  });

  app.get('/api/employees/:id/documents/:docId/download', authMiddleware, requirePermission('employees', 'view'), (req: Request, res: Response) => {
    const doc = queryOne(db, 'SELECT * FROM employee_documents WHERE id = ? AND employee_id = ?', [req.params.docId, req.params.id]);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    let targetPath = doc.file_path;
    if (!path.isAbsolute(targetPath)) {
      targetPath = path.join(process.cwd(), targetPath);
    }

    if (fs.existsSync(targetPath)) {
      res.download(targetPath, doc.file_name);
    } else {
      res.status(404).json({ error: 'File not found on disk' });
    }
  });

  app.delete('/api/employees/:id/documents/:docId', authMiddleware, requirePermission('employees', 'delete'), (req: Request, res: Response) => {
    const doc = queryOne(db, 'SELECT * FROM employee_documents WHERE id = ? AND employee_id = ?', [req.params.docId, req.params.id]);
    if (doc && doc.file_path && fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }
    runExec(db, 'DELETE FROM employee_documents WHERE id = ?', [req.params.docId]);
    res.json({ success: true });
  });

  // ==========================================
  // PROFILE PICTURE UPLOAD (Employees & Users)
  // ==========================================

  // Upload employee profile picture
  app.post('/api/employees/:id/profile-picture', authMiddleware, requirePermission('employees', 'edit'), profilePicUpload.single('picture'), (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No picture file uploaded' });
    const employeeId = req.params.id;
    const user = (req as any).user as JWTPayload;

    const emp = queryOne(db, 'SELECT * FROM employees WHERE id = ?', [employeeId]);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // Delete old profile picture if exists
    if (emp.photo_url && emp.photo_url.startsWith('/api/employees/')) {
      const oldPath = path.join(process.cwd(), emp.photo_url.replace('/api/employees/', 'data/profile_pictures/'));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const relativePath = `/api/employees/${employeeId}/profile-picture/${req.file.filename}`;
    runExec(db, 'UPDATE employees SET photo_url = ? WHERE id = ?', [relativePath, employeeId]);

    addAuditLog(user.email, 'hr_admin', 'PROFILE_PICTURE_UPDATE', emp.name, `Updated profile picture for ${emp.employee_code}`);
    res.json({ success: true, photo_url: relativePath });
  });

  // Serve employee profile picture
  app.get('/api/employees/:id/profile-picture/:filename', (req: Request, res: Response) => {
    const filePath = path.join(process.cwd(), 'data', 'profile_pictures', req.params.filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'Profile picture not found' });
    }
  });

  // Delete employee profile picture
  app.delete('/api/employees/:id/profile-picture', authMiddleware, requirePermission('employees', 'edit'), (req: Request, res: Response) => {
    const emp = queryOne(db, 'SELECT * FROM employees WHERE id = ?', [req.params.id]);
    if (emp && emp.photo_url && emp.photo_url.startsWith('/api/employees/')) {
      const oldPath = path.join(process.cwd(), emp.photo_url.replace('/api/employees/', 'data/profile_pictures/'));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    runExec(db, 'UPDATE employees SET photo_url = ? WHERE id = ?', ['', req.params.id]);
    res.json({ success: true });
  });

  // Upload user profile picture
  app.post('/api/settings/users/:id/profile-picture', authMiddleware, requirePermission('settings', 'user_roles'), profilePicUpload.single('picture'), (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No picture file uploaded' });
    const userId = req.params.id;
    const user = (req as any).user as JWTPayload;

    const targetUser = queryOne(db, 'SELECT * FROM users WHERE id = ?', [userId]);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Delete old profile picture if exists
    if (targetUser.photo_url && targetUser.photo_url.startsWith('/api/settings/users/')) {
      const oldPath = path.join(process.cwd(), targetUser.photo_url.replace('/api/settings/users/', 'data/profile_pictures/'));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const relativePath = `/api/settings/users/${userId}/profile-picture/${req.file.filename}`;
    runExec(db, 'UPDATE users SET photo_url = ? WHERE id = ?', [relativePath, userId]);

    addAuditLog(user.email, 'super_admin', 'USER_PROFILE_PICTURE_UPDATE', targetUser.name, `Updated profile picture for user ${targetUser.email}`);
    res.json({ success: true, photo_url: relativePath });
  });

  // Serve user profile picture
  app.get('/api/settings/users/:id/profile-picture/:filename', (req: Request, res: Response) => {
    const filePath = path.join(process.cwd(), 'data', 'profile_pictures', req.params.filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'Profile picture not found' });
    }
  });

  // ==========================================
  // SHIFTS & RULES
  // ==========================================

  app.get('/api/shifts', authMiddleware, requirePermission('attendance', 'view'), (req: Request, res: Response) => {
    const shifts = queryAll(db, 'SELECT * FROM shifts');
    res.json(shifts);
  });

  app.post('/api/shifts', authMiddleware, requirePermission('attendance', 'manage_shifts'), validateBody(createShiftSchema), (req: Request, res: Response) => {
    const { name, check_in_time, check_out_time, grace_period_minutes, mark_absent_after_grace, work_days } = req.body;
    if (!name || !check_in_time || !check_out_time) {
      return res.status(400).json({ error: 'Shift name, check-in, and check-out times are required' });
    }
    const id = `shift_${Date.now()}`;
    runExec(db, `
      INSERT INTO shifts (id, name, check_in_time, check_out_time, grace_period_minutes, mark_absent_after_grace, work_days)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, name, check_in_time, check_out_time, grace_period_minutes || 30, mark_absent_after_grace ? 1 : 0, typeof work_days === 'string' ? work_days : JSON.stringify(work_days || [1, 2, 3, 4, 5, 6])]);

    addAuditLog('HR Admin', 'hr_admin', 'SHIFT_CREATE', name, `Created shift with grace ${grace_period_minutes} mins`);
    const created = queryOne(db, 'SELECT * FROM shifts WHERE id = ?', [id]);
    res.json(created);
  });

  app.put('/api/shifts/:id', authMiddleware, requirePermission('attendance', 'manage_shifts'), validateBody(updateShiftSchema), (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, check_in_time, check_out_time, grace_period_minutes, mark_absent_after_grace, work_days } = req.body;

    runExec(db, `
      UPDATE shifts SET
        name = ?, check_in_time = ?, check_out_time = ?, grace_period_minutes = ?,
        mark_absent_after_grace = ?, work_days = ?
      WHERE id = ?
    `, [name, check_in_time, check_out_time, grace_period_minutes, mark_absent_after_grace ? 1 : 0, typeof work_days === 'string' ? work_days : JSON.stringify(work_days), id]);

    addAuditLog('HR Admin', 'hr_admin', 'SHIFT_RULE_UPDATE', name, `Updated grace period to ${grace_period_minutes} mins`);
    res.json({ success: true });
  });

  // ==========================================
  // ATTENDANCE ENDPOINTS
  // ==========================================

  app.get('/api/attendance', authMiddleware, requirePermission('attendance', 'view'), (req: Request, res: Response) => {
    const date = req.query.date as string;
    const month = req.query.month as string; // YYYY-MM
    const all = req.query.all as string;
    const employeeId = req.query.employee_id as string; // optional: scope to one employee's full history

    if (all === 'true') {
      let sql = `
        SELECT a.*, COALESCE(e.name, 'Unknown Employee') as employee_name, COALESCE(e.employee_code, 'N/A') as employee_code, e.department, e.designation, e.employment_type
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
      `;
      const conditions: string[] = [];
      const params: any[] = [];
      if (employeeId) {
        conditions.push('a.employee_id = ?');
        params.push(employeeId);
      }
      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
      sql += ` ORDER BY a.date DESC, e.employee_code ASC`;
      const records = queryAll(db, sql, params);
      return res.json(records);
    }

    if (month) {
      let sql = `
        SELECT a.*, COALESCE(e.name, 'Unknown Employee') as employee_name, COALESCE(e.employee_code, 'N/A') as employee_code, e.department, e.designation, e.employment_type
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        WHERE a.date LIKE ?
      `;
      const params: any[] = [`${month}%`];
      if (employeeId) {
        sql += ` AND a.employee_id = ?`;
        params.push(employeeId);
      }
      sql += ` ORDER BY a.date DESC, e.employee_code ASC`;
      const records = queryAll(db, sql, params);
      return res.json(records);
    }

    if (employeeId && !date) {
      // Entire history for single employee
      const records = queryAll(db, `
        SELECT a.*, COALESCE(e.name, 'Unknown Employee') as employee_name, COALESCE(e.employee_code, 'N/A') as employee_code, e.department, e.designation, e.employment_type
        FROM attendance a
        LEFT JOIN employees e ON a.employee_id = e.id
        WHERE a.employee_id = ?
        ORDER BY a.date DESC
      `, [employeeId]);
      return res.json(records);
    }

    // Daily Roster View (targetDate = date or today)
    const targetDate = date || new Date().toISOString().split('T')[0];

    // 1. Fetch real recorded attendance for targetDate
    let recordedSql = `
      SELECT a.*, e.name as employee_name, e.employee_code, e.department, e.designation, e.employment_type
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.date = ?
    `;
    const recordedParams: any[] = [targetDate];
    if (employeeId) {
      recordedSql += ` AND a.employee_id = ?`;
      recordedParams.push(employeeId);
    }
    const realRecords = queryAll(db, recordedSql, recordedParams);
    const recordedEmpIds = new Set(realRecords.map((r: any) => r.employee_id));

    // 2. Fetch active employees to synthesize missing daily roster rows (Pre-joining floor fix)
    let empSql = `SELECT * FROM employees WHERE status = 'active' AND (joining_date IS NULL OR joining_date = '' OR joining_date <= ?)`;
    const empParams: any[] = [targetDate];
    if (employeeId) {
      empSql += ` AND id = ?`;
      empParams.push(employeeId);
    }
    const activeEmployees = queryAll(db, empSql, empParams);

    const targetDayOfWeek = new Date(targetDate + 'T12:00:00Z').getUTCDay();
    const synthesizedRecords: any[] = [];

    for (const emp of activeEmployees) {
      if (!recordedEmpIds.has(emp.id)) {
        const weeklyOffStr = String(emp.weekly_off_day || '').trim();
        const offDays = weeklyOffStr ? weeklyOffStr.split(',').map((s: string) => s.trim()).filter(Boolean).map(Number) : [];
        const customOffDates = new Set(
          (emp.custom_off_dates || '')
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
        );
        const isOffDay = customOffDates.has(targetDate) || offDays.includes(targetDayOfWeek);

        synthesizedRecords.push({
          id: `virtual_${emp.id}_${targetDate}`,
          employee_id: emp.id,
          employee_code: emp.employee_code,
          employee_name: emp.name,
          department: emp.department,
          designation: emp.designation,
          employment_type: emp.employment_type,
          date: targetDate,
          check_in_time: null,
          check_out_time: null,
          status: isOffDay ? 'weekly_off' : 'absent',
          hours_worked: 0,
          late_minutes: 0,
          is_manual_override: 0,
          override_reason: isOffDay ? 'Scheduled Off Day' : 'Unrecorded (Default Absent)',
          override_by: null,
          device_id: null
        });
      }
    }

    const allDailyRecords = [...realRecords, ...synthesizedRecords];
    allDailyRecords.sort((a, b) => String(a.employee_code).localeCompare(String(b.employee_code)));
    res.json(allDailyRecords);
  });

  // Helper function to calculate and update payroll for a given month
  function calculatePayrollForMonth(month: string, targetEmployeeIds?: string[]) {
    const [year, mStr] = month.split('-').map(Number);
    const daysInMonth = new Date(year, mStr, 0).getDate();
    const today = new Date().toISOString().split('T')[0];
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    let empSql = `
      SELECT DISTINCT e.* FROM employees e
      LEFT JOIN attendance a ON a.employee_id = e.id AND a.date LIKE ?
      LEFT JOIN payroll_adjustments adj ON adj.employee_id = e.id AND (adj.payroll_id LIKE ? OR (adj.payroll_id IS NULL AND adj.created_at LIKE ?))
      WHERE (e.status = 'active' OR a.id IS NOT NULL OR adj.id IS NOT NULL)
    `;
    const empParams: any[] = [`${month}%`, `%_${month}`, `${month}%`];

    if (targetEmployeeIds && targetEmployeeIds.length > 0) {
      const placeholders = targetEmployeeIds.map(() => '?').join(',');
      empSql += ` AND e.id IN (${placeholders})`;
      empParams.push(...targetEmployeeIds);
    }

    const employees = queryAll(db, empSql, empParams);
    const calculatedRecords: PayrollRecord[] = [];

    for (const emp of employees) {
      // 1. Pre-joining and Post-exit check:
      // If employee's joining_date is after this whole month, they were not employed in this month!
      if (emp.joining_date && emp.joining_date > monthEnd) {
        continue; // Skip employee for this month
      }

      // If employee's exit_date is before this whole month, they had already left the company!
      if (emp.exit_date && emp.exit_date < monthStart) {
        continue; // Skip employee for this month
      }

      // 2. Joining date day in this month (PB-14 Hybrid calculation for mid-month joiners):
      let empStartDay = 1;
      if (emp.joining_date && emp.joining_date >= monthStart && emp.joining_date <= monthEnd) {
        empStartDay = parseInt(emp.joining_date.split('-')[2], 10);
      }

      // 3. Exit date day in this month (mid-month leavers):
      let empEndDay = daysInMonth;
      if (emp.exit_date && emp.exit_date >= monthStart && emp.exit_date <= monthEnd) {
        empEndDay = parseInt(emp.exit_date.split('-')[2], 10);
      }

      // Off-days are specific calendar dates chosen per employee during onboarding/edit,
      // stored in custom_off_dates as a comma-separated list of ISO dates (e.g. "2026-09-06,2026-09-13").
      // Only the dates that fall inside the selected month count as this month's off-days.
      const empOffDates = new Set(
        String(emp.custom_off_dates ?? '')
          .split(',')
          .map(s => s.trim())
          .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
      );

      // If weekly_off_day is specified (e.g. '0' for Sunday or comma-separated weekdays), include in off-dates
      if (emp.weekly_off_day !== undefined && emp.weekly_off_day !== null && String(emp.weekly_off_day).trim() !== '') {
        const weeklyOffSet = new Set(
          String(emp.weekly_off_day)
            .split(',')
            .map(s => s.trim())
            .filter(s => s !== '' && !isNaN(Number(s)))
            .map(Number)
        );
        for (let d = 1; d <= daysInMonth; d++) {
          const dayOfWeek = new Date(year, mStr - 1, d).getDay();
          if (weeklyOffSet.has(dayOfWeek)) {
            empOffDates.add(`${month}-${String(d).padStart(2, '0')}`);
          }
        }
      }

      // Only count days that have actually elapsed. Past month → whole month; current month
      // → up to and including today; future month → nothing yet. This stops not-yet-occurred
      // days from being charged as absences mid-month.
      const [ty, tm, tdRaw] = today.split('-').map(Number);
      let daysToConsider: number;
      if (year < ty || (year === ty && mStr < tm)) {
        daysToConsider = daysInMonth;
      } else if (year === ty && mStr === tm) {
        daysToConsider = Math.min(tdRaw, daysInMonth);
      } else {
        daysToConsider = 0;
      }

      // Cap daysToConsider at employee exit date if they left mid-month
      daysToConsider = Math.min(daysToConsider, empEndDay);

      // Scheduled working days in the month during active tenure (from empStartDay to empEndDay minus off-dates)
      let totalWorkingDays = 0;
      for (let d = empStartDay; d <= empEndDay; d++) {
        const dateStr = `${month}-${String(d).padStart(2, '0')}`;
        if (!empOffDates.has(dateStr)) totalWorkingDays++;
      }

      // Fetch attendance logs for the month
      const attRecords = queryAll(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date LIKE ?', [emp.id, `${month}%`]);

      // Classify each elapsed day of active tenure.
      let daysPresent = 0;
      let halfDays = 0;
      let daysLate = 0;
      let daysOff = 0;
      let daysLeave = 0;
      let daysWorkedOnOff = 0;

      const elapsedActiveDays = Math.max(0, daysToConsider >= empStartDay ? (daysToConsider - empStartDay + 1) : 0);

      for (let d = empStartDay; d <= daysToConsider; d++) {
        const dateStr = `${month}-${String(d).padStart(2, '0')}`;
        const att = attRecords.find(a => a.date === dateStr);
        const workedOnOffDay = att && (att.status === 'present' || att.status === 'late' || att.status === 'half_day' || (att.hours_worked && att.hours_worked > 0));

        // Designated off-date
        if (empOffDates.has(dateStr)) {
          daysOff++;
          if (workedOnOffDay) {
            daysWorkedOnOff++;
            if (att.status === 'half_day' || (att.hours_worked && att.hours_worked < 4)) {
              halfDays++;
            } else {
              daysPresent++;
            }
          }
          continue;
        }

        if (!att) continue; // unrecorded working day → unexcused absence

        if (att.status === 'present') {
          daysPresent++;
          if ((att.late_minutes || 0) > 0) daysLate++;
        } else if (att.status === 'half_day') {
          halfDays++;
          if ((att.late_minutes || 0) > 0) daysLate++;
        } else if (att.status === 'late') {
          daysPresent++;
          daysLate++;
        } else if (att.status === 'leave') {
          daysLeave++;
        } else if (att.status === 'weekly_off') {
          daysOff++;
          if (workedOnOffDay) {
            daysWorkedOnOff++;
            if (att.hours_worked && att.hours_worked < 4) {
              halfDays++;
            } else {
              daysPresent++;
            }
          }
        }
      }

      // If weekly off days were explicitly logged in attendance, prefer explicit count
      const explicitOffDays = attRecords.filter(a => a.status === 'weekly_off').length;
      const explicitAbsentDays = attRecords.filter(a => a.status === 'absent').length;

      if (explicitOffDays > 0) {
        daysOff = explicitOffDays;
      } else if (daysOff === 0 && attRecords.length > 0) {
        // Infer off days within recorded attendance date span [minDate..maxDate]
        const dates = attRecords.map(r => r.date).filter(Boolean).sort();
        const minDate = dates[0];
        const maxDate = dates[dates.length - 1];
        const recordedSet = new Set(attRecords.map(r => r.date));
        const [sy, sm, sd] = minDate.split('-').map(Number);
        const [ey, em, ed] = maxDate.split('-').map(Number);
        const startDay = (sy === year && sm === mStr) ? sd : 1;
        const endDay = (ey === year && em === mStr) ? ed : daysToConsider;
        for (let d = startDay; d <= endDay; d++) {
          const dtStr = `${month}-${String(d).padStart(2, '0')}`;
          if (!recordedSet.has(dtStr) && empOffDates.has(dtStr)) {
            daysOff++;
          }
        }
      }

      // Absent days computed over elapsed active tenure days, never lower than explicit absent records
      let computedAbsent = elapsedActiveDays - (daysPresent - daysWorkedOnOff + (0.5 * halfDays) + daysOff + daysLeave);
      if (computedAbsent < 0) computedAbsent = 0;
      let daysAbsent = Math.max(explicitAbsentDays, computedAbsent);

      // Fetch adjustments targeting this payroll month
      const adjustments = queryAll(db, `
        SELECT * FROM payroll_adjustments 
        WHERE employee_id = ? AND (payroll_id = ? OR payroll_id LIKE ? OR (payroll_id IS NULL AND created_at LIKE ?))
      `, [emp.id, `pay_${emp.id}_${month}`, `%_${month}`, `${month}%`]);
      let totalBonuses = 0;
      let totalFines = 0;
      let advanceDeductions = 0;

      adjustments.forEach(adj => {
        if (adj.type === 'bonus') totalBonuses += adj.amount;
        if (adj.type === 'fine') totalFines += adj.amount;
        if (adj.type === 'advance_deduction') advanceDeductions += adj.amount;
      });

      let grossEarnings = 0;
      let absentDeductions = 0;
      let netPayout = 0;
      let baseRate = emp.base_salary;
      const perDayRate = daysInMonth > 0 ? Math.round(emp.base_salary / daysInMonth) : 0;

      if (emp.employment_type === 'daily_wage') {
        baseRate = emp.base_salary;
        grossEarnings = (baseRate * daysPresent) + (baseRate * 0.5 * halfDays);
        absentDeductions = 0;
        netPayout = grossEarnings + totalBonuses - totalFines - advanceDeductions;
      } else {
        // Monthly Salary: payable days include worked days + off days + leaves
        const payableDays = daysPresent + (0.5 * halfDays) + daysOff + daysLeave;
        if (daysToConsider === 0) {
          grossEarnings = 0;
          absentDeductions = 0;
          netPayout = totalBonuses - totalFines - advanceDeductions;
        } else if (empStartDay === 1 && empEndDay === daysInMonth) {
          // Full-tenure monthly employee: contractual monthly base salary minus actual absences
          grossEarnings = emp.base_salary;
          absentDeductions = Math.round(perDayRate * daysAbsent);
          netPayout = grossEarnings - absentDeductions + totalBonuses - totalFines - advanceDeductions;
        } else {
          // In-progress month or mid-month joiner/leaver: daily count according to salary (payableDays x perDayRate)
          const earnedSalary = Math.round(payableDays * perDayRate);
          absentDeductions = Math.round(perDayRate * daysAbsent);
          grossEarnings = Math.min(emp.base_salary, earnedSalary + absentDeductions);
          netPayout = earnedSalary + totalBonuses - totalFines - advanceDeductions;
        }
      }

      netPayout = Math.max(0, netPayout);
      const finalDaysPresent = daysPresent + (0.5 * halfDays);

      let totalHoursWorked = 0;
      for (const att of attRecords) {
        if (att.status === 'present' || att.status === 'late' || att.status === 'half_day') {
          if (att.hours_worked && att.hours_worked > 0) {
            totalHoursWorked += att.hours_worked;
          } else if (att.status === 'half_day') {
            totalHoursWorked += 4;
          } else {
            totalHoursWorked += 8;
          }
        }
      }
      if (totalHoursWorked === 0 && finalDaysPresent > 0) {
        totalHoursWorked = Math.round(finalDaysPresent * 8 * 10) / 10;
      }

      const payrollId = `pay_${emp.id}_${month}`;
      const now = new Date().toISOString();

      // Upsert into SQLite (P-01: Never mutate records with status 'paid' or 'approved')
      const existing = queryOne(db, 'SELECT * FROM payroll WHERE id = ?', [payrollId]);
      if (existing) {
        if (existing.status === 'paid' || existing.status === 'approved') {
          calculatedRecords.push({
            ...existing,
            employee_name: emp.name,
            employee_code: emp.employee_code,
            department: emp.department,
            designation: emp.designation,
            employment_type: emp.employment_type,
            total_hours_worked: totalHoursWorked
          });
          continue;
        }

        runExec(db, `
          UPDATE payroll SET
            base_rate = ?, working_days = ?, days_present = ?, days_absent = ?,
            days_late = ?, days_leave = ?, days_off = ?, gross_earnings = ?, absent_deductions = ?, total_bonuses = ?,
            total_fines = ?, advance_deductions = ?, net_payout = ?, generated_at = ?
          WHERE id = ?
        `, [
          baseRate, totalWorkingDays, finalDaysPresent, daysAbsent, daysLate, daysLeave, daysOff,
          grossEarnings, absentDeductions, totalBonuses, totalFines, advanceDeductions,
          netPayout, now, payrollId
        ], false);
      } else {
        runExec(db, `
          INSERT INTO payroll (
            id, employee_id, period_month, base_rate, working_days, days_present,
            days_absent, days_late, days_leave, days_off, gross_earnings, absent_deductions, total_bonuses,
            total_fines, advance_deductions, net_payout, status, generated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
        `, [
          payrollId, emp.id, month, baseRate, totalWorkingDays, finalDaysPresent,
          daysAbsent, daysLate, daysLeave, daysOff, grossEarnings, absentDeductions, totalBonuses,
          totalFines, advanceDeductions, netPayout, now
        ], false);
      }

      calculatedRecords.push({
        id: payrollId,
        employee_id: emp.id,
        employee_name: emp.name,
        employee_code: emp.employee_code,
        department: emp.department,
        designation: emp.designation,
        employment_type: emp.employment_type,
        period_month: month,
        base_rate: baseRate,
        working_days: totalWorkingDays,
        days_present: finalDaysPresent,
        days_absent: daysAbsent,
        days_late: daysLate,
        days_leave: daysLeave,
        days_off: daysOff,
        total_hours_worked: totalHoursWorked,
        gross_earnings: grossEarnings,
        absent_deductions: absentDeductions,
        total_bonuses: totalBonuses,
        total_fines: totalFines,
        advance_deductions: advanceDeductions,
        net_payout: netPayout,
        status: existing?.status || 'draft',
        generated_at: now
      });
    }

    saveDatabase();
    return calculatedRecords;
  }

  // Attendance Manual Override (single date) (P-01, P-04, P-10 fixes)
  app.post('/api/attendance/override', authMiddleware, requireRole('super_admin', 'hr_admin'), validateBody(attendanceOverrideSchema), (req: Request, res: Response) => {
    const { employee_id, date, check_in_time, check_out_time, status, reason } = req.body;
    const user = (req as any).user as JWTPayload;
    const override_by = user.email;

    const emp = queryOne(db, 'SELECT * FROM employees WHERE id = ?', [employee_id]);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    // Backdating Attendance: users are allowed to add or correct previous days freely.
    // If the attendance date precedes recorded joining date, adjust joining date to align employee tenure.
    if (emp.joining_date && date < emp.joining_date) {
      runExec(db, 'UPDATE employees SET joining_date = ? WHERE id = ?', [date, emp.id]);
    }

    // P-01: Cannot edit attendance in a locked/approved/paid payroll period
    const monthStr = date.substring(0, 7);
    const lockedPeriod = queryOne(db, 'SELECT status FROM payroll WHERE period_month = ? AND (status = "paid" OR status = "approved") LIMIT 1', [monthStr]);
    if (lockedPeriod) {
      return res.status(409).json({
        error: `Attendance for ${date} cannot be modified because payroll for period ${monthStr} is locked (${lockedPeriod.status}).`
      });
    }

    const shift = queryOne(db, 'SELECT * FROM shifts WHERE id = ?', [emp.shift_id]);
    const shiftIn = shift?.check_in_time || '09:00';
    const shiftOut = shift?.check_out_time || '17:00';

    let finalInTime = check_in_time;
    let finalOutTime = check_out_time;

    if (status === 'present' || status === 'late' || status === 'half_day') {
      if (!finalInTime) finalInTime = `${shiftIn}:00`.replace(/::/g, ':');
      if (!finalOutTime) finalOutTime = `${shiftOut}:00`.replace(/::/g, ':');
    } else if (status === 'weekly_off' || status === 'absent' || status === 'leave') {
      finalInTime = null;
      finalOutTime = null;
    }

    let hoursWorked = 0;
    let lateMinutes = 0;

    if (finalInTime && finalOutTime) {
      hoursWorked = calculateHoursWorked(finalInTime, finalOutTime);
    }

    if (finalInTime && (status === 'present' || status === 'late' || status === 'half_day')) {
      const [inH, inM] = finalInTime.split(':').map(Number);
      const [shiftH, shiftM] = shiftIn.split(':').map(Number);
      const diff = (inH * 60 + inM) - (shiftH * 60 + shiftM);
      if (diff > 0) {
        lateMinutes = diff;
      } else if (status === 'late') {
        lateMinutes = 15;
      }
    }

    const existing = queryOne(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [employee_id, date]);
    if (existing) {
      runExec(db, `
        UPDATE attendance SET
          check_in_time = ?, check_out_time = ?, status = ?, hours_worked = ?,
          late_minutes = ?, is_manual_override = 1, override_reason = ?, override_by = ?
        WHERE employee_id = ? AND date = ?
      `, [finalInTime, finalOutTime, status, hoursWorked, lateMinutes, reason, override_by, employee_id, date]);
    } else {
      const id = `att_${employee_id}_${date}`;
      runExec(db, `
        INSERT INTO attendance (
          id, employee_id, date, check_in_time, check_out_time, status, hours_worked,
          late_minutes, is_manual_override, override_reason, override_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `, [id, employee_id, date, finalInTime, finalOutTime, status, hoursWorked, lateMinutes, reason, override_by]);
    }

    calculatePayrollForMonth(monthStr);

    addAuditLog(override_by, user.role, 'ATTENDANCE_OVERRIDE', `Employee ${employee_id}`, `Overrode attendance for ${date} to status '${status}'. Reason: ${reason}`);
    res.json({ success: true });
  });

  // Bulk attendance override (multi-date) (P-01, P-04, P-10 fixes)
  app.post('/api/attendance/bulk-override', authMiddleware, requireRole('super_admin', 'hr_admin'), validateBody(bulkAttendanceSchema), (req: Request, res: Response) => {
    const { entries } = req.body;
    const user = (req as any).user as JWTPayload;
    const override_by = user.email;

    // Pre-validate all entries for joining date floor & period locks
    for (const entry of entries) {
      const emp = queryOne(db, 'SELECT id, name, employee_code, joining_date FROM employees WHERE id = ?', [entry.employee_id]);
      if (!emp) return res.status(404).json({ error: `Employee ${entry.employee_id} not found` });

      // Backdating Attendance: users are allowed to add or correct previous days freely
      if (emp.joining_date && entry.date < emp.joining_date) {
        runExec(db, 'UPDATE employees SET joining_date = ? WHERE id = ?', [entry.date, emp.id]);
      }

      // P-01: Locked period check
      const m = entry.date.substring(0, 7);
      const lockedPeriod = queryOne(db, 'SELECT status FROM payroll WHERE period_month = ? AND (status = "paid" OR status = "approved") LIMIT 1', [m]);
      if (lockedPeriod) {
        return res.status(409).json({
          error: `Attendance for ${entry.date} cannot be modified because payroll for period ${m} is locked (${lockedPeriod.status}).`
        });
      }
    }

    let processed = 0;
    const affectedMonths = new Set<string>();

    for (const entry of entries) {
      const { employee_id, date, check_in_time, check_out_time, status, reason } = entry;

      const emp = queryOne(db, 'SELECT * FROM employees WHERE id = ?', [employee_id]);
      const shift = emp ? queryOne(db, 'SELECT * FROM shifts WHERE id = ?', [emp.shift_id]) : null;
      const shiftIn = shift?.check_in_time || '09:00';
      const shiftOut = shift?.check_out_time || '17:00';

      let finalInTime = check_in_time;
      let finalOutTime = check_out_time;

      if (status === 'present' || status === 'late' || status === 'half_day') {
        if (!finalInTime) finalInTime = `${shiftIn}:00`.replace(/::/g, ':');
        if (!finalOutTime) finalOutTime = `${shiftOut}:00`.replace(/::/g, ':');
      } else if (status === 'weekly_off' || status === 'absent' || status === 'leave') {
        finalInTime = null;
        finalOutTime = null;
      }

      let hoursWorked = 0;
      let lateMinutes = 0;

      if (finalInTime && finalOutTime) {
        hoursWorked = calculateHoursWorked(finalInTime, finalOutTime);
      }

      if (finalInTime && (status === 'present' || status === 'late' || status === 'half_day')) {
        const [inH, inM] = finalInTime.split(':').map(Number);
        const [shiftH, shiftM] = shiftIn.split(':').map(Number);
        const diff = (inH * 60 + inM) - (shiftH * 60 + shiftM);
        if (diff > 0) {
          lateMinutes = diff;
        } else if (status === 'late') {
          lateMinutes = 15;
        }
      }

      const existing = queryOne(db, 'SELECT * FROM attendance WHERE employee_id = ? AND date = ?', [employee_id, date]);
      if (existing) {
        runExec(db, `
          UPDATE attendance SET
            check_in_time = ?, check_out_time = ?, status = ?, hours_worked = ?,
            late_minutes = ?, is_manual_override = 1, override_reason = ?, override_by = ?
          WHERE employee_id = ? AND date = ?
        `, [finalInTime, finalOutTime, status, hoursWorked, lateMinutes, reason || 'Bulk Manual Entry', override_by, employee_id, date], false);
      } else {
        const id = `att_${employee_id}_${date}`;
        runExec(db, `
          INSERT INTO attendance (
            id, employee_id, date, check_in_time, check_out_time, status, hours_worked,
            late_minutes, is_manual_override, override_reason, override_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        `, [id, employee_id, date, finalInTime, finalOutTime, status, hoursWorked, lateMinutes, reason || 'Bulk Manual Entry', override_by], false);
      }
      processed++;
      if (date && date.length >= 7) {
        affectedMonths.add(date.substring(0, 7));
      }
    }

    saveDatabase();

    for (const m of affectedMonths) {
      calculatePayrollForMonth(m);
    }

    addAuditLog(override_by, 'hr_admin', 'ATTENDANCE_BULK_OVERRIDE', `${processed} entries`, `Bulk overrode ${processed} attendance records`);
    res.json({ success: true, processed });
  });

  // Punch Simulator Endpoint (Simulate ZKTeco Biometric Push live from UI)
  app.post('/api/attendance/punch-simulate', authMiddleware, requirePermission('attendance', 'add'), (req: Request, res: Response) => {
    const { employee_id, punch_type, custom_time, device_sn } = req.body;

    const emp = queryOne(db, 'SELECT * FROM employees WHERE id = ? OR employee_code = ?', [employee_id, employee_id]);
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    let timeStr = custom_time || now.toTimeString().split(' ')[0];

    if (punch_type === 'on_time') {
      timeStr = '08:55:00';
    } else if (punch_type === 'late_grace') {
      timeStr = '09:20:00'; // within 30 min grace
    } else if (punch_type === 'late_absent') {
      timeStr = '09:45:00'; // past 30 min grace -> marked absent + salary cut
    } else if (punch_type === 'check_out') {
      timeStr = '17:05:00';
    }

    const fullTimestamp = `${dateStr} ${timeStr}`;
    processBiometricPunch(emp.employee_code, fullTimestamp, device_sn || 'ZK-882049102');

    addAuditLog('Punch Simulator', 'super_admin', 'SIMULATED_BIOMETRIC_PUNCH', emp.name, `Simulated punch at ${timeStr} (Type: ${punch_type})`);
    res.json({ success: true, message: `Punch logged for ${emp.name} at ${timeStr}` });
  });

  // ==========================================
  // DUAL COMPENSATION PAYROLL ENGINE
  // ==========================================

  app.post('/api/payroll/calculate', authMiddleware, requireRole('super_admin'), validateBody(z.object({ 
    month: z.string().regex(/^\d{4}-\d{2}$/),
    employee_ids: z.array(z.string()).optional()
  })), (req: Request, res: Response) => {
    const { month, employee_ids } = req.body; // 'YYYY-MM'
    if (!month) return res.status(400).json({ error: 'Month parameter is required (YYYY-MM)' });

    // P-01: Check if period is locked (paid or approved)
    const lockedRecord = queryOne(db, 'SELECT status FROM payroll WHERE period_month = ? AND (status = "paid" OR status = "approved") LIMIT 1', [month]);
    if (lockedRecord) {
      return res.status(409).json({
        error: `Payroll period ${month} is locked (${lockedRecord.status}). Recalculation is refused to preserve payment audit integrity.`
      });
    }

    const calculatedRecords = calculatePayrollForMonth(month, employee_ids);
    addAuditLog('Payroll Engine', 'super_admin', 'PAYROLL_GENERATE', month, `Calculated payroll for ${calculatedRecords.length} employees for ${month}`);
    res.json(calculatedRecords);
  });

  app.get('/api/payroll/records', authMiddleware, requirePermission('payroll', 'view'), (req: Request, res: Response) => {
    const month = (req.query.month as string) || new Date().toISOString().substring(0, 7);
    const records = queryAll(db, `
      SELECT p.*, e.name as employee_name, e.employee_code, e.department, e.designation, e.employment_type, e.bank_name, e.account_number,
        (SELECT COALESCE(
          NULLIF(SUM(CASE WHEN a.hours_worked > 0 THEN a.hours_worked WHEN a.status = 'half_day' THEN 4 WHEN a.status = 'present' OR a.status = 'late' THEN 8 ELSE 0 END), 0),
          ROUND(p.days_present * 8, 1)
        ) FROM attendance a WHERE a.employee_id = p.employee_id AND a.date LIKE p.period_month || '%') as total_hours_worked
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      WHERE p.period_month = ?
      ORDER BY e.employee_code ASC
    `, [month]);

    res.json(records);
  });

  // Monthly Payroll Summary over an ARBITRARY custom date window (from..to).
  // Unlike /api/payroll/records (which serves whole-calendar-month precomputed rows),
  // this RECOMPUTES each employee's counts and a prorated net pay for the exact window,
  // reusing the same classification + daily-rate rules as calculatePayrollForMonth.
  // It is READ-ONLY: it never writes to the payroll table, so it can't corrupt the
  // stored per-month payroll. Supports non-calendar-month salary cycles (e.g. 26 Jul -> 25 Aug).
  app.get('/api/payroll/range', authMiddleware, requirePermission('payroll', 'view'),
    validateQuery(z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    })),
    (req: Request, res: Response) => {
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (from > to) {
        return res.status(400).json({ error: 'from date must be on or before to date' });
      }

      const today = new Date().toISOString().split('T')[0];

      // Expand the window into ISO date strings (guarded to a sane maximum span).
      const windowDates: string[] = [];
      {
        let cur = new Date(`${from}T00:00:00Z`);
        const end = new Date(`${to}T00:00:00Z`);
        let guard = 0;
        while (cur <= end && guard < 3660) {
          windowDates.push(cur.toISOString().split('T')[0]);
          cur.setUTCDate(cur.getUTCDate() + 1);
          guard++;
        }
      }

      // Calendar days in the month that a given ISO date belongs to.
      const daysInMonthOf = (dateStr: string): number => {
        const [yy, mm] = dateStr.split('-').map(Number);
        return new Date(yy, mm, 0).getDate();
      };

      // Fetch all employees who are active OR have attendance in this range (P1-04 / DEFECT-ADV-05 fix)
      const employees = queryAll(db, `
        SELECT DISTINCT e.* FROM employees e
        LEFT JOIN attendance a ON a.employee_id = e.id AND a.date >= ? AND a.date <= ?
        WHERE e.status = 'active' OR a.id IS NOT NULL
      `, [from, to]);
      const results: PayrollRecord[] = [];

      for (const emp of employees) {
        // Specific per-employee off-dates (same model as calculatePayrollForMonth).
        const empOffDates = new Set(
          String(emp.custom_off_dates ?? '')
            .split(',')
            .map(s => s.trim())
            .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
        );

        if (emp.weekly_off_day !== undefined && emp.weekly_off_day !== null && String(emp.weekly_off_day).trim() !== '') {
          const weeklyOffSet = new Set(
            String(emp.weekly_off_day)
              .split(',')
              .map(s => s.trim())
              .filter(s => s !== '' && !isNaN(Number(s)))
              .map(Number)
          );
          for (const dateStr of windowDates) {
            const [yy, mm, dd] = dateStr.split('-').map(Number);
            const dayOfWeek = new Date(yy, mm - 1, dd).getDay();
            if (weeklyOffSet.has(dayOfWeek)) {
              empOffDates.add(dateStr);
            }
          }
        }

        // Pull the whole window's attendance in one query.
        const attRecords = queryAll(db,
          'SELECT * FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?',
          [emp.id, from, to]);

        let scheduledWorkingDays = 0; // full window minus off-dates (reporting only)
        let daysPresent = 0;
        let halfDays = 0;
        let daysLate = 0;
        let daysOff = 0;    // custom off-dates + explicit weekly_off
        let daysLeave = 0;  // approved leaves
        let daysAbsent = 0; // unexcused absences (elapsed days only)
        let grossAccum = 0;        // monthly: prorated base across the whole window
        let absentDeductAccum = 0; // monthly: prorated deduction for elapsed absent days

        for (const dateStr of windowDates) {
          const perDayRate = daysInMonthOf(dateStr) > 0 ? Math.round(emp.base_salary / daysInMonthOf(dateStr)) : 0;
          const isOff = empOffDates.has(dateStr);

          if (!isOff) scheduledWorkingDays++;

          // Gross accrues across EVERY calendar day in the window at that day's daily rate,
          // mirroring the month calc where gross = base = perDayRate x daysInMonth. For a
          // full calendar month this sums back to exactly one month's base salary.
          grossAccum += perDayRate;

          // Only elapsed days (on or before today) are classified and charged.
          if (dateStr > today) continue;

          const att = attRecords.find(a => a.date === dateStr);
          const workedOnOffDay = att && (att.status === 'present' || att.status === 'late' || att.status === 'half_day' || (att.hours_worked && att.hours_worked > 0));

          if (isOff) {
            if (!workedOnOffDay) {
              daysOff++;
              continue;
            }
          }

          if (!att) {
            // no record on a working day => unexcused absence
            daysAbsent++;
            absentDeductAccum += perDayRate;
            continue;
          }
          if (att.status === 'present') {
            daysPresent++;
            if ((att.late_minutes || 0) > 0) daysLate++; // count late even within grace
          } else if (att.status === 'half_day') {
            halfDays++;
            if ((att.late_minutes || 0) > 0) daysLate++;
            absentDeductAccum += perDayRate * 0.5;
          } else if (att.status === 'late') {
            daysPresent++;
            daysLate++;
          } else if (att.status === 'leave') {
            daysLeave++;
          } else if (att.status === 'weekly_off') {
            if (workedOnOffDay) {
              if (att.hours_worked && att.hours_worked < 4) {
                halfDays++;
                absentDeductAccum += perDayRate * 0.5;
              } else {
                daysPresent++;
              }
            } else {
              daysOff++;
            }
          } else {
            // 'absent' or any other status => unexcused absence
            daysAbsent++;
            absentDeductAccum += perDayRate;
          }
        }

        // Adjustments targeting a payroll month within this window, or created within this window if no payroll_id set
        const adjustments = queryAll(db, `
          SELECT * FROM payroll_adjustments 
          WHERE employee_id = ? AND (
            (payroll_id IS NOT NULL AND substr(payroll_id, -7) >= substr(?, 1, 7) AND substr(payroll_id, -7) <= substr(?, 1, 7))
            OR (payroll_id IS NULL AND substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?)
          )
        `, [emp.id, from, to, from, to]);
        let totalBonuses = 0;
        let totalFines = 0;
        let advanceDeductions = 0;
        adjustments.forEach(adj => {
          if (adj.type === 'bonus') totalBonuses += adj.amount;
          if (adj.type === 'fine') totalFines += adj.amount;
          if (adj.type === 'advance_deduction') advanceDeductions += adj.amount;
        });

        let grossEarnings = 0;
        let absentDeductions = 0;
        let netPayout = 0;
        let baseRate = emp.base_salary;

        if (emp.employment_type === 'daily_wage') {
          baseRate = emp.base_salary; // per-day rate
          grossEarnings = (baseRate * daysPresent) + (baseRate * 0.5 * halfDays);
          absentDeductions = Math.round(baseRate * daysAbsent); // informational
          netPayout = grossEarnings + totalBonuses - totalFines - advanceDeductions;
        } else {
          if (from > today) {
            // Entirely future window: unworked period earns 0 base salary
            grossEarnings = 0;
            absentDeductions = 0;
            netPayout = totalBonuses - totalFines - advanceDeductions;
          } else {
            grossEarnings = Math.round(grossAccum);
            absentDeductions = Math.round(absentDeductAccum);
            netPayout = grossEarnings - absentDeductions + totalBonuses - totalFines - advanceDeductions;
          }
        }
        netPayout = Math.max(0, netPayout);

        results.push({
          id: `range_${emp.id}`,
          employee_id: emp.id,
          employee_name: emp.name,
          employee_code: emp.employee_code,
          department: emp.department,
          designation: emp.designation,
          employment_type: emp.employment_type,
          period_month: `${from} → ${to}`,
          base_rate: baseRate,
          working_days: scheduledWorkingDays,
          days_present: daysPresent,
          days_absent: daysAbsent,
          days_late: daysLate,
          days_leave: daysLeave,
          days_off: daysOff,
          gross_earnings: grossEarnings,
          absent_deductions: absentDeductions,
          total_bonuses: totalBonuses,
          total_fines: totalFines,
          advance_deductions: advanceDeductions,
          net_payout: netPayout,
          status: 'draft',
          generated_at: new Date().toISOString()
        });
      }

      // Preserve employee_code ordering like the records endpoint.
      results.sort((a, b) => String(a.employee_code).localeCompare(String(b.employee_code)));
      res.json(results);
    });

  // Payroll Adjustments (Bonus/Fine/Advance) (P-01 & P-04 fixes)
  app.post('/api/payroll/adjustments', authMiddleware, requireRole('super_admin'), validateBody(payrollAdjustmentSchema), (req: Request, res: Response) => {
    const { employee_id, month, type, amount, description } = req.body;
    const user = (req as any).user as JWTPayload;

    // P-01: Check if target month is locked
    const lockedRecord = queryOne(db, 'SELECT status FROM payroll WHERE period_month = ? AND (status = "paid" OR status = "approved") LIMIT 1', [month]);
    if (lockedRecord) {
      return res.status(409).json({
        error: `Cannot add adjustments to locked payroll period ${month} (${lockedRecord.status}). Adjustments must be posted in an open Draft period.`
      });
    }

    const payrollId = `pay_${employee_id}_${month}`;
    const id = `adj_${Date.now()}`;
    const now = new Date().toISOString();

    runExec(db, `
      INSERT INTO payroll_adjustments (id, payroll_id, employee_id, type, amount, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, payrollId, employee_id, type, amount, description, now]);

    calculatePayrollForMonth(month);
    addAuditLog(user.email, 'super_admin', 'PAYROLL_ADJUSTMENT', employee_id, `Added ${type} of PKR ${amount}: ${description}`);
    res.json({ success: true });
  });

  // Payroll Period Status Transition Workflow (P-01 & P-04 fixes)
  app.post('/api/payroll/status', authMiddleware, validateBody(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
    status: z.enum(['draft', 'approved', 'paid'])
  })), (req: Request, res: Response) => {
    const { month, status } = req.body;
    const user = (req as any).user as JWTPayload;

    // Role-based status transition checks (P-04):
    // 1. Approving payroll (draft -> approved): Super Admin or Manager
    if (status === 'approved') {
      if (user.role !== 'super_admin' && user.role !== 'manager') {
        return res.status(403).json({ error: 'Only Managers or Super Administrators can approve payroll.' });
      }
    }
    // 2. Marking as paid (approved -> paid): Super Admin or Cashier
    else if (status === 'paid') {
      if (user.role !== 'super_admin' && user.role !== 'cashier') {
        return res.status(403).json({ error: 'Only Cashiers or Super Administrators can mark payroll as paid.' });
      }
    }
    // 3. Reverting to draft (unlocking): Super Admin only
    else if (status === 'draft') {
      if (user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only Super Administrators can unlock an approved or paid payroll period.' });
      }
    }

    const records = queryAll(db, 'SELECT id, status FROM payroll WHERE period_month = ?', [month]);
    if (records.length === 0) {
      return res.status(400).json({ error: `No payroll records exist for period ${month}. Run calculation first.` });
    }

    const currentStatus = records[0].status;

    if (status === 'paid' && currentStatus !== 'approved' && user.role !== 'super_admin') {
      return res.status(400).json({ error: 'Payroll period must be approved before marking as paid.' });
    }

    runExec(db, 'UPDATE payroll SET status = ? WHERE period_month = ?', [status, month]);
    addAuditLog(user.email, user.role, 'PAYROLL_STATUS_CHANGE', month, `Changed payroll status for period ${month} from '${currentStatus}' to '${status}'`);

    res.json({ success: true, month, status, message: `Payroll period ${month} status updated to '${status}'.` });
  });

  // Delete Draft/Unpaid Payroll Period (Resolves draft deadlock)
  app.delete('/api/payroll', authMiddleware, requireRole('super_admin'), validateQuery(z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/)
  })), (req: Request, res: Response) => {
    const month = req.query.month as string;
    const user = (req as any).user as JWTPayload;

    const existing = queryAll(db, 'SELECT status FROM payroll WHERE period_month = ?', [month]);
    if (existing.length === 0) {
      return res.status(404).json({ error: `No payroll records found for period ${month}.` });
    }

    const hasPaid = existing.some(r => r.status === 'paid');
    if (hasPaid) {
      return res.status(400).json({ error: `Cannot delete payroll for ${month} because it contains paid disbursements.` });
    }

    runExec(db, 'DELETE FROM payroll_adjustments WHERE payroll_id LIKE ?', [`%_${month}`], false);
    runExec(db, 'DELETE FROM payroll WHERE period_month = ?', [month], true);

    addAuditLog(user.email, 'super_admin', 'PAYROLL_DELETE', month, `Deleted payroll records for period ${month}`);
    res.json({ success: true, message: `Payroll draft for period ${month} deleted successfully.` });
  });

  // Get individual adjustments for a payslip or batch for the month (Bug #10 fix & batch payslips)
  app.get('/api/payroll/adjustments', authMiddleware, requirePermission('payroll', 'view'), validateQuery(z.object({ employee_id: z.string().optional(), month: z.string().regex(/^\d{4}-\d{2}$/) })), (req: Request, res: Response) => {
    const { employee_id, month } = req.query as { employee_id?: string; month: string };
    if (!month) {
      return res.status(400).json({ error: 'month is required' });
    }
    if (employee_id) {
      const adjustments = queryAll(db, `
        SELECT * FROM payroll_adjustments 
        WHERE employee_id = ? AND (payroll_id = ? OR payroll_id LIKE ? OR (payroll_id IS NULL AND created_at LIKE ?))
        ORDER BY created_at ASC
      `, [employee_id, `pay_${employee_id}_${month}`, `%_${month}`, `${month}%`]);
      return res.json(adjustments);
    } else {
      const adjustments = queryAll(db, `
        SELECT * FROM payroll_adjustments 
        WHERE (payroll_id LIKE ? OR (payroll_id IS NULL AND created_at LIKE ?))
        ORDER BY created_at ASC
      `, [`%_${month}`, `${month}%`]);
      return res.json(adjustments);
    }
  });

  // ==========================================
  // DEVICES CRUD
  // ==========================================

  app.get('/api/devices', authMiddleware, requirePermission('attendance', 'view'), (req: Request, res: Response) => {
    const devices = queryAll(db, 'SELECT * FROM devices');
    res.json(devices);
  });

  app.post('/api/devices', authMiddleware, requirePermission('attendance', 'manage_shifts'), validateBody(z.object({
    serial_number: z.string().min(1),
    name: z.string().min(1),
    location: z.string().min(1),
    ip_address: z.string().optional()
  })), (req: Request, res: Response) => {
    const { serial_number, name, location, ip_address } = req.body;
    const id = `dev_${Date.now()}`;
    const now = new Date().toISOString();

    runExec(db, `
      INSERT INTO devices (id, serial_number, name, location, ip_address, status, last_heartbeat, total_pushes)
      VALUES (?, ?, ?, ?, ?, 'online', ?, 0)
    `, [id, serial_number, name, location, ip_address || '192.168.1.100', now]);

    addAuditLog('Super Admin', 'super_admin', 'DEVICE_REGISTER', name, `Registered device SN: ${serial_number}`);
    res.json({ success: true });
  });

  // ==========================================
  // DASHBOARD METRICS
  // ==========================================

  app.get('/api/dashboard/metrics', authMiddleware, (req: Request, res: Response) => {
    const todayStr = (req.query.date as string) || new Date().toISOString().split('T')[0];

    const activeEmployees = queryAll(db, 'SELECT id, base_salary, employment_type, weekly_off_day, custom_off_dates FROM employees WHERE status = "active"');
    const totalEmps = activeEmployees.length;
    const activeDevices = queryOne(db, 'SELECT COUNT(*) as count FROM devices WHERE status = "online"')?.count || 0;

    const todayAttendance = queryAll(db, `
      SELECT a.employee_id, a.status, a.late_minutes
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.date = ? AND e.status = 'active'
    `, [todayStr]);

    const attByEmp = new Map<string, any>();
    for (const att of todayAttendance) {
      attByEmp.set(att.employee_id, att);
    }

    const [yearStr, monthStr, dayStr] = todayStr.split('-');
    const year = Number(yearStr);
    const monthNum = Number(monthStr);
    const currentDay = Number(dayStr);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const todayDow = new Date(todayStr + 'T12:00:00Z').getUTCDay();

    let presentToday = 0;
    let lateToday = 0;
    let absentToday = 0;
    let todayAccrual = 0;
    let totalDailyWage = 0;
    let totalMonthlySalary = 0;

    // Monthly baseline sum of all active monthly staff
    let monthlySalaryBaseline = 0;
    // Daily wage baseline (sum of per-day rates of all active daily workers)
    let dailyWageBaseline = 0;
    let dailyWageMonthlyEstimate = 0;

    for (const emp of activeEmployees) {
      const baseSalary = Number(emp.base_salary) || 0;
      const weeklyOffStr = String(emp.weekly_off_day || '').trim();
      const offDays = weeklyOffStr ? weeklyOffStr.split(',').map((s: string) => s.trim()).filter(Boolean).map(Number) : [];
      const customOffDates = new Set(
        (emp.custom_off_dates || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      );
      const isOffDay = customOffDates.has(todayStr) || offDays.includes(todayDow);

      if (emp.employment_type === 'monthly_salary') {
        totalMonthlySalary++;
        monthlySalaryBaseline += baseSalary;
      } else {
        totalDailyWage++;
        dailyWageBaseline += baseSalary;
        // Count scheduled working days in current calendar month for this daily worker
        let empWorkingDaysInMonth = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dStr = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
          const dow = new Date(year, monthNum - 1, d).getDay();
          if (!offDays.includes(dow) && !customOffDates.has(dStr)) {
            empWorkingDaysInMonth++;
          }
        }
        dailyWageMonthlyEstimate += (baseSalary * empWorkingDaysInMonth);
      }

      // Per-day rate prorated by actual calendar days in current month (not hardcoded 26 or 30)
      const perDayRate = emp.employment_type === 'daily_wage'
        ? baseSalary
        : (daysInMonth > 0 ? Math.round(baseSalary / daysInMonth) : 0);

      const att = attByEmp.get(emp.id);
      if (att) {
        if (att.status === 'present' || att.status === 'late' || att.status === 'half_day') {
          presentToday++;
          if (att.status === 'half_day') {
            todayAccrual += (perDayRate * 0.5);
          } else {
            todayAccrual += perDayRate;
          }
          if (att.status === 'late' || (att.late_minutes && att.late_minutes > 0)) {
            lateToday++;
          }
        } else if (att.status === 'leave') {
          // Approved paid leave for monthly salary staff
          if (emp.employment_type === 'monthly_salary') {
            todayAccrual += perDayRate;
          }
        } else if (att.status === 'weekly_off') {
          // Scheduled off day is a paid contract day for monthly staff
          if (emp.employment_type === 'monthly_salary') {
            todayAccrual += perDayRate;
          }
        } else if (att.status === 'absent') {
          absentToday++;
          // Absent: Rs. 0 accrual (absence deduction docks pay)
        }
      } else {
        // Unrecorded: check if today is an off day for this employee
        if (isOffDay) {
          if (emp.employment_type === 'monthly_salary') {
            todayAccrual += perDayRate;
          }
        } else {
          absentToday++;
          // Unrecorded on working day = absent (Rs. 0 accrual)
        }
      }
    }

    if (totalEmps === 0) {
      return res.json({
        total_employees: 0,
        total_daily_wage: 0,
        total_monthly_salary: 0,
        present_today: 0,
        late_today: 0,
        absent_today: 0,
        today_payroll_accrual: 0,
        month_to_date_accrual: 0,
        active_devices: activeDevices,
        monthly_payroll_estimate: 0,
        daily_wage_baseline: 0,
        monthly_salary_baseline: 0
      });
    }

    // Month-to-date (MTD) Accrual from 1st of current month up to today
    const monthStart = `${yearStr}-${monthStr}-01`;
    const mtdAttendance = queryAll(db, `
      SELECT a.employee_id, a.date, a.status
      FROM attendance a
      JOIN employees e ON a.employee_id = e.id
      WHERE a.date >= ? AND a.date <= ? AND e.status = 'active'
    `, [monthStart, todayStr]);

    const mtdMap = new Map<string, string>();
    for (const row of mtdAttendance) {
      mtdMap.set(`${row.employee_id}_${row.date}`, row.status);
    }

    let mtdAccrual = 0;
    for (const emp of activeEmployees) {
      const baseSalary = Number(emp.base_salary) || 0;
      const weeklyOffStr = String(emp.weekly_off_day || '').trim();
      const offDays = weeklyOffStr ? weeklyOffStr.split(',').map((s: string) => s.trim()).filter(Boolean).map(Number) : [];
      const customOffDates = new Set(
        (emp.custom_off_dates || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      );
      const perDayRate = emp.employment_type === 'daily_wage'
        ? baseSalary
        : (daysInMonth > 0 ? Math.round(baseSalary / daysInMonth) : 0);

      for (let d = 1; d <= currentDay; d++) {
        const dStr = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
        const dow = new Date(year, monthNum - 1, d).getDay();
        const isOff = customOffDates.has(dStr) || offDays.includes(dow);
        const status = mtdMap.get(`${emp.id}_${dStr}`);

        if (status) {
          if (status === 'present' || status === 'late') {
            mtdAccrual += perDayRate;
          } else if (status === 'half_day') {
            mtdAccrual += (perDayRate * 0.5);
          } else if (status === 'leave' || status === 'weekly_off') {
            if (emp.employment_type === 'monthly_salary') {
              mtdAccrual += perDayRate;
            }
          }
        } else {
          if (isOff && emp.employment_type === 'monthly_salary') {
            mtdAccrual += perDayRate;
          }
        }
      }
    }

    const monthlyPayrollEstimate = Math.round(monthlySalaryBaseline + dailyWageMonthlyEstimate);

    res.json({
      total_employees: totalEmps,
      total_daily_wage: totalDailyWage,
      total_monthly_salary: totalMonthlySalary,
      present_today: presentToday,
      late_today: lateToday,
      absent_today: absentToday,
      today_payroll_accrual: Math.round(todayAccrual),
      month_to_date_accrual: Math.round(mtdAccrual),
      active_devices: activeDevices,
      monthly_payroll_estimate: monthlyPayrollEstimate,
      daily_wage_baseline: Math.round(dailyWageBaseline),
      monthly_salary_baseline: Math.round(monthlySalaryBaseline)
    });
  });

  // ==========================================
  // AUDIT LOGS
  // ==========================================

  app.get('/api/audit-logs', authMiddleware, requirePermission('settings', 'view'), (req: Request, res: Response) => {
    const logs = queryAll(db, 'SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100');
    res.json(logs);
  });

  // ==========================================
  // COMPANY SETTINGS (Feature #11)
  // ==========================================

  // Multer for company logo uploads
  const companyLogoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), 'data', 'company');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, 'logo' + path.extname(file.originalname));
    }
  });

  const companyLogoUpload = multer({
    storage: companyLogoStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp'];
      allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only image files allowed'));
    }
  });

  app.get('/api/settings/company', authMiddleware, requirePermission('settings', 'view'), (req: Request, res: Response) => {
    const settings = queryOne(db, 'SELECT * FROM company_settings LIMIT 1');
    res.json(settings || { id: 'company_1', company_name: 'Mohsin & Co', contact: '', address: '', logo_url: '' });
  });

  // Upload logo - saves as 'logo.ext' in data/company/
  app.post('/api/settings/company/logo', authMiddleware, requirePermission('settings', 'company_setup'), companyLogoUpload.single('logo'), (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: 'No logo file uploaded' });
    const user = (req as any).user as JWTPayload;
    // Append a version token so each upload yields a unique URL. The file is always saved as
    // "logo.<ext>" (constant filename), so without this the browser would keep serving the
    // previously cached image and the new logo would never appear on the dashboard.
    const logoUrl = `/api/settings/company/logo/${req.file.filename}?v=${Date.now()}`;
    runExec(db, `UPDATE company_settings SET logo_url = ? WHERE id = 'company_1'`, [logoUrl]);
    addAuditLog(user.email, 'super_admin', 'COMPANY_LOGO_UPDATE', 'Company Settings', `Updated company logo`);
    res.json({ success: true, logo_url: logoUrl });
  });

  // Serve company logo
  app.get('/api/settings/company/logo/:filename', (req: Request, res: Response) => {
    const filePath = path.join(process.cwd(), 'data', 'company', req.params.filename);
    if (fs.existsSync(filePath)) {
      // Filename is reused across uploads, so prevent the browser from serving a stale logo.
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: 'Logo not found' });
    }
  });

  app.put('/api/settings/company', authMiddleware, requirePermission('settings', 'company_setup'), validateBody(companySettingsSchema), (req: Request, res: Response) => {
    const { company_name, contact, address, logo_url } = req.body;
    const user = (req as any).user as JWTPayload;
    runExec(db, `UPDATE company_settings SET company_name = ?, contact = ?, address = ?, logo_url = ? WHERE id = 'company_1'`, [company_name || 'Mohsin & Co', contact || '', address || '', logo_url || '']);
    addAuditLog(user.email, 'super_admin', 'COMPANY_SETTINGS_UPDATE', 'Company Settings', `Updated company profile`);
    res.json({ success: true });
  });

  // ==========================================
  // USER ROLE MANAGEMENT (Feature #11)
  // ==========================================

  app.get('/api/settings/users', authMiddleware, requirePermission('settings', 'user_roles'), (req: Request, res: Response) => {
    const users = queryAll(db, 'SELECT id, name, email, contact, role, department, permissions, photo_url FROM users ORDER BY name ASC');
    res.json(users.map(u => ({ ...u, permissions: typeof u.permissions === 'string' ? JSON.parse(u.permissions || '{}') : u.permissions })));
  });

  app.post('/api/settings/users', authMiddleware, requirePermission('settings', 'user_roles'), validateBody(createUserSchema), async (req: Request, res: Response) => {
    const { name, email, password, contact, role, department, permissions, photo_url } = req.body;
    const user = (req as any).user as JWTPayload;

    const existing = queryOne(db, 'SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already exists' });

    const passwordHash = await hashPassword(password);
    const id = `usr_${Date.now()}`;
    const roleDefaultPerms = ROLE_PERMISSIONS_TEMPLATES[role as UserRole] || {};
    const finalPermissions = permissions && Object.keys(permissions).length > 0 ? permissions : roleDefaultPerms;

    runExec(db, `
      INSERT INTO users (id, name, email, password, contact, role, department, permissions, photo_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, name, email, passwordHash, contact || '', role, department || '', JSON.stringify(finalPermissions), photo_url || '']);

    addAuditLog(user.email, 'super_admin', 'USER_CREATE', name, `Created user with role ${role}`);
    const created = queryOne(db, 'SELECT id, name, email, contact, role, department, permissions, photo_url FROM users WHERE id = ?', [id]);
    res.json({ ...created, permissions: JSON.parse(created?.permissions || '{}') });
  });

  app.put('/api/settings/users/:id', authMiddleware, requirePermission('settings', 'user_roles'), validateBody(updateUserSchema), async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, email, contact, role, department, permissions, password, photo_url } = req.body;
    const user = (req as any).user as JWTPayload;

    const existing = queryOne(db, 'SELECT * FROM users WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    try {
      const updatedName = name !== undefined ? name : existing.name;
      const updatedEmail = email !== undefined ? email : existing.email;
      const updatedContact = contact !== undefined ? contact : (existing.contact || '');
      const updatedRole = role !== undefined ? role : existing.role;
      const updatedDept = department !== undefined ? department : (existing.department || '');
      const updatedPerms = permissions !== undefined ? JSON.stringify(permissions || {}) : (typeof existing.permissions === 'string' ? existing.permissions : JSON.stringify(existing.permissions || {}));
      const updatedPhoto = photo_url !== undefined ? photo_url : (existing.photo_url || '');

      if (password) {
        const passwordHash = await hashPassword(password);
        runExec(db, `
          UPDATE users SET name = ?, email = ?, contact = ?, role = ?, department = ?, permissions = ?, password = ?, photo_url = ?
          WHERE id = ?
        `, [updatedName, updatedEmail, updatedContact, updatedRole, updatedDept, updatedPerms, passwordHash, updatedPhoto, id]);
      } else {
        runExec(db, `
          UPDATE users SET name = ?, email = ?, contact = ?, role = ?, department = ?, permissions = ?, photo_url = ?
          WHERE id = ?
        `, [updatedName, updatedEmail, updatedContact, updatedRole, updatedDept, updatedPerms, updatedPhoto, id]);
      }

      addAuditLog(user.email, 'super_admin', 'USER_UPDATE', updatedName, `Updated user ${id} role: ${updatedRole}`);
      const updatedUser = queryOne(db, 'SELECT id, name, email, contact, role, department, permissions, photo_url FROM users WHERE id = ?', [id]);
      res.json({ success: true, ...(updatedUser || {}) });
    } catch (err: any) {
      console.error('Error updating user:', err);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });

  app.delete('/api/settings/users/:id', authMiddleware, requireRole('super_admin'), (req: Request, res: Response) => {
    const user = (req as any).user as JWTPayload;

    // Prevent deleting yourself
    if (req.params.id === user.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const targetUser = queryOne(db, 'SELECT id, name, email, role FROM users WHERE id = ?', [req.params.id]);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting yourself by email
    if (targetUser.email.toLowerCase() === user.email.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Prevent deleting the last super administrator
    const superAdminCount = queryOne(db, "SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'")?.count || 0;
    if (targetUser.role === 'super_admin' && superAdminCount <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last Super Administrator account.' });
    }

    runExec(db, 'DELETE FROM users WHERE id = ?', [req.params.id]);
    addAuditLog(user.email, 'super_admin', 'USER_DELETE', targetUser.name || req.params.id, `Deleted system user ${targetUser.email}`);
    res.json({ success: true, message: `System user ${targetUser.name} (${targetUser.email}) removed successfully.` });
  });

  // ==========================================
  // DATABASE RESET & TESTING TOOLS (Temporary)
  // ==========================================
  app.get('/api/settings/database-stats', authMiddleware, (req: Request, res: Response) => {
    try {
      const employeesCount = (queryOne(db, 'SELECT COUNT(*) as count FROM employees') as any)?.count || 0;
      const attendanceCount = (queryOne(db, 'SELECT COUNT(*) as count FROM attendance') as any)?.count || 0;
      const payrollCount = (queryOne(db, 'SELECT COUNT(*) as count FROM payroll') as any)?.count || 0;
      const adjustmentsCount = (queryOne(db, 'SELECT COUNT(*) as count FROM payroll_adjustments') as any)?.count || 0;
      const documentsCount = (queryOne(db, 'SELECT COUNT(*) as count FROM employee_documents') as any)?.count || 0;
      res.json({
        employeesCount,
        attendanceCount,
        payrollCount,
        adjustmentsCount,
        documentsCount
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to query database stats: ' + (err.message || String(err)) });
    }
  });

  app.post('/api/settings/reset-database', authMiddleware, requireRole('super_admin', 'hr_admin'), (req: Request, res: Response) => {
    const user = (req as any).user as JWTPayload;
    try {
      runExec(db, 'DELETE FROM employee_documents', [], false);
      runExec(db, 'DELETE FROM payroll_adjustments', [], false);
      runExec(db, 'DELETE FROM payroll', [], false);
      runExec(db, 'DELETE FROM attendance', [], false);
      runExec(db, 'DELETE FROM employees', [], false);

      // Clean uploaded employee documents if directory exists
      const docsDir = path.join(process.cwd(), 'data', 'documents');
      if (fs.existsSync(docsDir)) {
        try {
          const files = fs.readdirSync(docsDir);
          for (const file of files) {
            try {
              fs.unlinkSync(path.join(docsDir, file));
            } catch (e) {
              console.warn('Could not delete doc file:', file, e);
            }
          }
        } catch (e) {
          console.warn('Could not read docsDir:', e);
        }
      }

      saveDatabase();
      addAuditLog(user.email, user.role, 'DATABASE_RESET', 'System Database', 'Reset all employee, attendance, and payroll records to clean scratch state');
      
      res.json({
        success: true,
        message: 'Database reset successfully. All employee, attendance, and payroll records have been removed.'
      });
    } catch (err: any) {
      console.error('Reset database failed:', err);
      res.status(500).json({ error: 'Failed to reset database: ' + (err.message || String(err)) });
    }
  });

  // 404 for unhandled API routes (P-09 fix)
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({ error: `API route ${req.method} ${req.path} not found` });
  });

  // ==========================================
  // VITE / STATIC HOSTING
  // ==========================================

  // Mount Vite or static file serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global JSON error handler so HTML is never returned on unhandled errors
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Internal Server Error'
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Payroll & Attendance Management System running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
