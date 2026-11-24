import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import jwt from '../mohsin-&-co-payroll-&-attendance/node_modules/jsonwebtoken/index.js';

const appDir = path.resolve('mohsin-&-co-payroll-&-attendance');
const envPath = path.join(appDir, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envSecretMatch = envContent.match(/JWT_SECRET\s*=\s*(.+)/);
const JWT_SECRET = envSecretMatch ? envSecretMatch[1].trim() : 'development_super_secret_jwt_key_2026';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

function createToken(role, email = `${role}@test.com`, userId = `usr_${role}_${Date.now()}`) {
  return jwt.sign(
    {
      userId,
      email,
      role,
      permissions: {
        employees: { view: true, add: role === 'super_admin' || role === 'hr_admin', edit: role === 'super_admin' || role === 'hr_admin', delete: role === 'super_admin' },
        attendance: { view: true, add: role === 'super_admin' || role === 'hr_admin', override: role === 'super_admin' || role === 'hr_admin' },
        payroll: { view: true, calculate: role === 'super_admin', approve: role === 'super_admin' || role === 'manager', adjustments: role === 'super_admin' }
      }
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

const adminToken = createToken('super_admin', 'superadmin@mohsinco.com', 'admin_1');
const hrToken = createToken('hr_admin', 'hr@test.com', 'hr_1');
const managerToken = createToken('manager', 'manager@test.com', 'mgr_1');
const cashierToken = createToken('cashier', 'cashier@test.com', 'csh_1');

async function runTests() {
  console.log('--- STARTING UAT V2 REGRESSION VERIFICATION ---');

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  try {
    // 1. P-09: 404 for unknown API routes
    await check('P-09: Unknown API route returns 404 JSON', async () => {
      const res = await fetch(`${BASE_URL}/api/non_existent_endpoint_xyz`);
      if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
      const data = await res.json();
      if (!data.error) throw new Error('Expected JSON error message');
    });

    // 2. P-04: Non-admin roles restrictions (HR Admin, Manager, Cashier cannot calculate payroll)
    await check('P-04: HR Admin, Manager, Cashier CANNOT recalculate payroll (403 Forbidden)', async () => {
      for (const [rName, token] of [['HR Admin', hrToken], ['Manager', managerToken], ['Cashier', cashierToken]]) {
        const res = await fetch(`${BASE_URL}/api/payroll/calculate`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: '2026-11' })
        });
        if (res.status !== 403) throw new Error(`${rName} received status ${res.status} instead of 403`);
      }
    });

    // 3. P-04: Non-admin roles restrictions on adjustments
    await check('P-04: HR Admin, Manager, Cashier CANNOT add adjustments (403 Forbidden)', async () => {
      for (const [rName, token] of [['HR Admin', hrToken], ['Manager', managerToken], ['Cashier', cashierToken]]) {
        const res = await fetch(`${BASE_URL}/api/payroll/adjustments`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: 'emp_any', month: '2026-11', type: 'bonus', amount: 1000 })
        });
        if (res.status !== 403) throw new Error(`${rName} received status ${res.status} instead of 403`);
      }
    });

    // 4. P-04: Status transition permissions:
    // HR cannot approve or pay
    // Manager can approve, but cannot mark as paid
    // Cashier cannot approve, can mark paid
    await check('P-04: Status transition role matrix enforcement', async () => {
      // HR attempting approval -> 403
      const hrApprove = await fetch(`${BASE_URL}/api/payroll/status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hrToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: '2026-11', status: 'approved' })
      });
      if (hrApprove.status !== 403) throw new Error(`HR Admin expected 403 on approve, got ${hrApprove.status}`);

      // Manager attempting mark as paid -> 403
      const mgrPay = await fetch(`${BASE_URL}/api/payroll/status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${managerToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: '2026-11', status: 'paid' })
      });
      if (mgrPay.status !== 403) throw new Error(`Manager expected 403 on mark paid, got ${mgrPay.status}`);

      // Cashier attempting approve -> 403
      const cshApprove = await fetch(`${BASE_URL}/api/payroll/status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cashierToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: '2026-11', status: 'approved' })
      });
      if (cshApprove.status !== 403) throw new Error(`Cashier expected 403 on approve, got ${cshApprove.status}`);
    });

    let sharedEmpId = '';

    // 5. P-10: Attendance Manual Entry joining-date floor check
    await check('P-10: Attendance backdating before employee joining date is freely allowed (auto-adjusts joining_date)', async () => {
      // Create test employee with joining date 2025-06-01
      const empRes = await fetch(`${BASE_URL}/api/employees`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'P10 Floor Test Emp',
          email: `p10_${Date.now()}@test.com`,
          phone: '03001234567',
          cnic: '42101-1234567-1',
          department: 'Quality',
          designation: 'Tester',
          joining_date: '2025-06-01',
          employment_type: 'monthly_salary',
          base_salary: 50000,
          shift_id: 'shift_gen'
        })
      });
      if (!empRes.ok) throw new Error('Failed to create test employee');
      const emp = await empRes.json();
      sharedEmpId = emp.id;

      // Attendance before joining date: 2025-05-15 (now allowed freely per user requirement)
      const attRes = await fetch(`${BASE_URL}/api/attendance/override`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: emp.id,
          date: '2025-05-15',
          status: 'present',
          reason: 'Testing date floor'
        })
      });
      if (attRes.status !== 200) throw new Error(`Expected 200 for backdating, got ${attRes.status}`);

      // Verify joining_date was automatically adjusted to 2025-05-15
      const checkEmpRes = await fetch(`${BASE_URL}/api/employees/${emp.id}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      const checkEmp = await checkEmpRes.json();
      if (checkEmp.joining_date > '2025-05-15') {
        throw new Error(`Expected joining date <= 2025-05-15, got: ${checkEmp.joining_date}`);
      }
    });

    // 6. P-01: Period locking on Paid and Approved periods
    await check('P-01: Paid and Approved periods reject recalculate, adjustments, and attendance changes (409 Conflict)', async () => {
      const lockMonth = '2025-07';

      // Reset to draft if exists
      await fetch(`${BASE_URL}/api/payroll/status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: lockMonth, status: 'draft' })
      }).catch(() => {});

      // First calculate payroll as draft
      const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: lockMonth })
      });
      if (!calcRes.ok) throw new Error(`Calculate failed: ${calcRes.status}`);

      // Transition to Paid
      const lockRes = await fetch(`${BASE_URL}/api/payroll/status`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: lockMonth, status: 'paid' })
      });
      if (!lockRes.ok) throw new Error(`Lock to paid failed: ${lockRes.status}`);

      // Attempt recalculate on Paid period -> 409
      const recCalc = await fetch(`${BASE_URL}/api/payroll/calculate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: lockMonth })
      });
      if (recCalc.status !== 409) throw new Error(`Expected 409 on recalculate paid period, got ${recCalc.status}`);

      // Attempt add adjustment on Paid period -> 409
      const recAdj = await fetch(`${BASE_URL}/api/payroll/adjustments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: sharedEmpId, month: lockMonth, type: 'bonus', amount: 5000, description: 'Performance bonus' })
      });
      if (recAdj.status !== 409) throw new Error(`Expected 409 on adjustment on paid period, got ${recAdj.status}`);

      // Attempt attendance override inside Paid month -> 409
      const recAtt = await fetch(`${BASE_URL}/api/attendance/override`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: sharedEmpId, date: `${lockMonth}-15`, status: 'present', reason: 'Test edit' })
      });
      if (recAtt.status !== 409) throw new Error(`Expected 409 on attendance override in locked month, got ${recAtt.status}`);
    });

    // 7. P-02: Employee delete cascade rules
    await check('P-02: Employee delete cascade (no history = hard delete; with history = soft-delete deactivate)', async () => {
      // 1. Employee with no history
      const freshEmpRes = await fetch(`${BASE_URL}/api/employees`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'P02 Clean Delete Test',
          email: `clean_del_${Date.now()}@test.com`,
          phone: '03009988776',
          cnic: '42101-9988776-1',
          department: 'Clean',
          designation: 'Tester',
          joining_date: '2026-01-01',
          employment_type: 'monthly_salary',
          base_salary: 40000,
          shift_id: 'shift_gen'
        })
      });
      const freshEmp = await freshEmpRes.json();
      const delFresh = await fetch(`${BASE_URL}/api/employees/${freshEmp.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (!delFresh.ok) throw new Error(`Hard delete failed: ${delFresh.status}`);
      const delFreshData = await delFresh.json();
      if (delFreshData.action !== 'deleted') throw new Error(`Expected action 'deleted', got: ${delFreshData.action}`);

      // 2. Employee with attendance history
      const histEmpRes = await fetch(`${BASE_URL}/api/employees`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'P02 Soft Delete Test',
          email: `soft_del_${Date.now()}@test.com`,
          phone: '03009988775',
          cnic: '42101-9988775-1',
          department: 'History',
          designation: 'Tester',
          joining_date: '2026-01-01',
          employment_type: 'monthly_salary',
          base_salary: 40000,
          shift_id: 'shift_gen'
        })
      });
      const histEmp = await histEmpRes.json();
      // Add attendance record in an open month
      await fetch(`${BASE_URL}/api/attendance/override`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: histEmp.id, date: '2026-12-10', status: 'present', reason: 'Testing history' })
      });

      // Now delete employee with history
      const delHist = await fetch(`${BASE_URL}/api/employees/${histEmp.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (!delHist.ok) throw new Error(`Soft delete failed: ${delHist.status}`);
      const delHistData = await delHist.json();
      if (delHistData.action !== 'deactivated') throw new Error(`Expected action 'deactivated', got: ${delHistData.action}`);
    });

    // 8. P-02: User delete guards (self-deletion guard and role check)
    await check('P-02: Self-deletion guard and non-admin user deletion guard', async () => {
      // Non-admin attempting user delete -> 403
      const nonAdminDel = await fetch(`${BASE_URL}/api/settings/users/any_user`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${hrToken}` }
      });
      if (nonAdminDel.status !== 403) throw new Error(`Expected 403 for non-admin user delete, got ${nonAdminDel.status}`);

      // Super admin attempting self-deletion -> 400
      const selfDel = await fetch(`${BASE_URL}/api/settings/users/admin_1`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      if (selfDel.status !== 400) throw new Error(`Expected 400 for self-deletion, got ${selfDel.status}`);
      const selfDelData = await selfDel.json();
      if (!selfDelData.error || !selfDelData.error.toLowerCase().includes('own account')) {
        throw new Error(`Expected self-deletion error, got: ${selfDelData.error}`);
      }
    });

    // 9. Owner Pay-Rule Spec arithmetic verification (Section 6)
    await check('Owner pay-rule arithmetic verification (Daily wage present only; monthly absence cut; advance clamping)', async () => {
      const specMonth = '2026-08'; // 31 days in August

      // 1. Daily wage employee: Rs. 2,000/day
      const dailyEmpRes = await fetch(`${BASE_URL}/api/employees`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Daily Spec Emp',
          email: `daily_spec_${Date.now()}@test.com`,
          phone: '03001112244',
          cnic: '42101-1112244-1',
          department: 'Ops',
          designation: 'Worker',
          joining_date: '2026-08-01',
          employment_type: 'daily_wage',
          base_salary: 2000,
          shift_id: 'shift_gen'
        })
      });
      const dailyEmp = await dailyEmpRes.json();

      // Add 4 present days (2026-08-03, 2026-08-04, 2026-08-05, 2026-08-06)
      for (const d of ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06']) {
        await fetch(`${BASE_URL}/api/attendance/override`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: dailyEmp.id, date: d, status: 'present', reason: 'Spec test' })
        });
      }

      // 2. Monthly salary employee: Rs. 60,000/month, 3 days absent in 31-day month
      const monthlyEmpRes = await fetch(`${BASE_URL}/api/employees`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Monthly Spec Emp',
          email: `monthly_spec_${Date.now()}@test.com`,
          phone: '03001112255',
          cnic: '42101-1112255-1',
          department: 'Accounts',
          designation: 'Officer',
          joining_date: '2026-08-01',
          employment_type: 'monthly_salary',
          base_salary: 60000,
          weekly_off_day: '0',
          shift_id: 'shift_gen'
        })
      });
      const monthlyEmp = await monthlyEmpRes.json();

      // Add August attendance: exactly 3 absent days (10, 11, 12) and present on all other working days
      for (let day = 1; day <= 31; day++) {
        const dStr = `2026-08-${String(day).padStart(2, '0')}`;
        const dayOfWeek = new Date(2026, 7, day).getDay();
        if (dayOfWeek === 0) continue; // Sunday off
        const status = (day === 10 || day === 11 || day === 12) ? 'absent' : 'present';
        await fetch(`${BASE_URL}/api/attendance/override`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ employee_id: monthlyEmp.id, date: dStr, status, reason: status === 'absent' ? 'Spec absence test' : 'Spec present' })
        });
      }

      // Run payroll calculation
      const calcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: specMonth })
      });
      const records = await calcRes.json();

      // Verify Daily wage record
      const dailyRec = records.find(r => r.employee_id === dailyEmp.id);
      if (!dailyRec) throw new Error('Daily employee payroll record not found');
      // 4 days present * 2000 = 8000 gross and 8000 net
      if (dailyRec.gross_earnings !== 8000) {
        throw new Error(`Daily gross earnings expected 8000, got ${dailyRec.gross_earnings}`);
      }
      if (dailyRec.net_payout !== 8000) {
        throw new Error(`Daily net payout expected 8000, got ${dailyRec.net_payout}`);
      }

      // Verify Monthly salary record
      const monthlyRec = records.find(r => r.employee_id === monthlyEmp.id);
      if (!monthlyRec) throw new Error('Monthly employee payroll record not found');
      // Cut = Math.round(60000 / 31) * 3 = 1935 * 3 = 5805
      const expectedDailyRate = Math.round(60000 / 31);
      const expectedCut = expectedDailyRate * 3; // 5805
      if (monthlyRec.absent_deductions !== expectedCut) {
        throw new Error(`Monthly absent cut expected ${expectedCut}, got ${monthlyRec.absent_deductions}`);
      }
      const expectedNet = 60000 - expectedCut; // 54195
      if (monthlyRec.net_payout !== expectedNet) {
        throw new Error(`Monthly net payout expected ${expectedNet}, got ${monthlyRec.net_payout}`);
      }

      // Verify excess advance clamp to 0
      await fetch(`${BASE_URL}/api/payroll/adjustments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: dailyEmp.id,
          month: specMonth,
          type: 'advance_deduction',
          amount: 50000, // exceeds earnings of 8000
          description: 'Large loan recovery'
        })
      });

      const recalcRes = await fetch(`${BASE_URL}/api/payroll/calculate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: specMonth })
      });
      const updatedRecords = await recalcRes.json();
      const clampedRec = updatedRecords.find(r => r.employee_id === dailyEmp.id);
      if (clampedRec.net_payout !== 0) {
        throw new Error(`Expected net payout clamped to 0, got ${clampedRec.net_payout}`);
      }
    });

  } catch (e) {
    console.error('Unexpected test error:', e);
  }

  console.log(`\n--- TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
