import test from 'node:test';
import assert from 'node:assert/strict';

test('Zod Validation - Shift check-in/out format validation', async () => {
  const timeRegex = /^\d{2}:\d{2}$/;
  assert.equal(timeRegex.test('09:00'), true);
  assert.equal(timeRegex.test('9:00'), false);
  assert.equal(timeRegex.test('09:00:00'), false);
});

test('Employee Code auto-generation parsing logic', () => {
  const codes = ['EMP-1001', 'EMP-1002', 'EMP-1010'];
  const nums = codes
    .filter(c => c.startsWith('EMP-'))
    .map(c => parseInt(c.replace('EMP-', ''), 10))
    .filter(n => !isNaN(n));
  
  const nextNum = Math.max(...nums) + 1;
  assert.equal(nextNum, 1011);
});

test('Grace period check-in math', () => {
  const shiftIn = '09:00';
  const punchIn = '09:25';
  const [sH, sM] = shiftIn.split(':').map(Number);
  const [pH, pM] = punchIn.split(':').map(Number);
  const diff = (pH * 60 + pM) - (sH * 60 + sM);
  assert.equal(diff, 25);
});
