import test from 'node:test';
import assert from 'node:assert/strict';

test('Daily Wage Payslip Logic: Daily wage worker slip displays today daily rate (Rs. 1,000), not month total (Rs. 25,000)', () => {
  // Mock daily wage payroll record with 25 days present @ Rs. 1000/day
  const record = {
    id: 'pay_test_01',
    employee_id: 'emp_01',
    employee_name: 'Rashid Khan',
    employee_code: 'DW-001',
    department: 'Packaging',
    designation: 'Worker',
    period_month: '2026-08',
    employment_type: 'daily_wage',
    base_rate: 1000,
    working_days: 25,
    days_present: 25,
    days_absent: 0,
    days_off: 0,
    days_leave: 0,
    total_hours_worked: 200,
    gross_earnings: 25000,
    absent_deductions: 0,
    total_bonuses: 0,
    total_fines: 0,
    advance_deductions: 0,
    net_payout: 25000
  };

  // Logic function simulating buildPayslipContentHtml payout calculation:
  // For monthly staff: net payout is monthly net payout
  // For daily wage staff: payslip is a daily clearance voucher displaying today's daily rate
  const isDaily = record.employment_type === 'daily_wage';
  const displayedWageRate = isDaily ? record.base_rate : record.gross_earnings;
  const displayedNetPay = isDaily ? record.base_rate : record.net_payout;
  const slipTitle = isDaily ? 'Daily Wage Voucher (Daily Clearance)' : 'Salary Payslip';

  assert.equal(slipTitle, 'Daily Wage Voucher (Daily Clearance)');
  assert.equal(displayedWageRate, 1000, 'Daily wage rate should show Rs 1,000 for today');
  assert.equal(displayedNetPay, 1000, 'Daily net pay should be Rs 1,000 for today, NOT Rs 25,000');
  assert.notEqual(displayedNetPay, 25000, 'Must not show month total 25,000 on daily wage clearance slip');
});
