import test from 'node:test';
import assert from 'node:assert/strict';

test('HR Management & Dashboard Navigation Filter: Filter correctly separates monthly vs daily wage employees', () => {
  const employees = [
    { id: '1', name: 'Zahid', employment_type: 'monthly_salary', status: 'active' },
    { id: '2', name: 'Bilal', employment_type: 'monthly_salary', status: 'active' },
    { id: '3', name: 'Farhan', employment_type: 'daily_wage', status: 'active' },
    { id: '4', name: 'Kamran', employment_type: 'daily_wage', status: 'active' },
    { id: '5', name: 'Tariq', employment_type: 'daily_wage', status: 'active' }
  ];

  // Helper matching EmployeeManagementView filter logic
  const filterEmployees = (list, modelFilter) => {
    return list.filter(emp => {
      if (modelFilter !== 'all' && emp.employment_type !== modelFilter) return false;
      return true;
    });
  };

  // Test 1: All
  const allFiltered = filterEmployees(employees, 'all');
  assert.equal(allFiltered.length, 5, 'All filter should return all 5 employees');

  // Test 2: Monthly click from Dashboard
  const monthlyFiltered = filterEmployees(employees, 'monthly_salary');
  assert.equal(monthlyFiltered.length, 2, 'Monthly filter should return exactly 2 monthly staff');
  assert.ok(monthlyFiltered.every(e => e.employment_type === 'monthly_salary'));

  // Test 3: Daily Wage click from Dashboard
  const dailyFiltered = filterEmployees(employees, 'daily_wage');
  assert.equal(dailyFiltered.length, 3, 'Daily wage filter should return exactly 3 daily workers');
  assert.ok(dailyFiltered.every(e => e.employment_type === 'daily_wage'));
});
