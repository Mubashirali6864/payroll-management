import test from 'node:test';
import assert from 'node:assert/strict';

test('Payroll Register & Summary Totals: Monthly staff full-month base salary with integer absent cuts and daily wage cash isolation', () => {
  const records = [
    {
      id: 'pay_monthly',
      employee_id: 'emp_01',
      employee_name: 'aaaa',
      employee_code: 'EMP-1001',
      employment_type: 'monthly_salary',
      base_rate: 30000,
      gross_earnings: 30000,
      absent_deductions: 1936,
      net_payout: 28064
    },
    {
      id: 'pay_daily',
      employee_id: 'emp_02',
      employee_name: 'Zain Khan',
      employee_code: 'EMP-1002',
      employment_type: 'daily_wage',
      base_rate: 1000,
      gross_earnings: 0,
      absent_deductions: 0,
      net_payout: 0
    }
  ];

  // Logic: For daily wage, month-end net payout due is 0 because they are cleared daily in cash
  const getRecordPendingMonthEndPayout = (rec) => {
    return rec.employment_type === 'daily_wage' ? 0 : rec.net_payout;
  };

  const totalGross = records.reduce((sum, r) => sum + r.gross_earnings, 0);
  const totalPayout = records.reduce((sum, r) => sum + getRecordPendingMonthEndPayout(r), 0);
  const totalDeductions = records.reduce((sum, r) => sum + (r.employment_type === 'monthly_salary' ? r.absent_deductions : 0), 0);

  // 1. Gross Earnings should be 30,000
  assert.equal(totalGross, 30000, 'Gross earnings should be 30,000');

  // 2. Absent deductions should be 1,936
  assert.equal(totalDeductions, 1936, 'Absent deductions should be 1,936');

  // 3. Net Month-End Payout is 28,064 (30,000 - 1,936 = 28,064)
  assert.equal(totalPayout, 28064, 'Month-end bank transfer net payout should be 28,064');
  assert.equal(totalGross - totalDeductions, totalPayout, 'Gross - Deductions must equal Net Payout (30,000 - 1,936 = 28,064)');

  // 4. For Zain Khan, month-end pending payout is 0
  assert.equal(getRecordPendingMonthEndPayout(records[1]), 0, 'Daily wage employee has 0 pending month-end payout');
});
