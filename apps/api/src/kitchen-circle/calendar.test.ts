import assert from 'node:assert/strict';
import test from 'node:test';
import { mondayOf, nextWeekPeriod, periodForStart } from './calendar.js';

test('current KitchenCircle plan starts on the selected day and ends Sunday', () => {
  assert.deepEqual(periodForStart('2026-06-17'), {
    weekStart: '2026-06-15',
    startsOn: '2026-06-17',
    weekEnd: '2026-06-21',
    days: ['2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21'],
  });
});

test('Monday and Sunday resolve to the same Monday week start', () => {
  assert.equal(mondayOf('2026-06-15'), '2026-06-15');
  assert.equal(mondayOf('2026-06-21'), '2026-06-15');
});

test('next KitchenCircle plan is a full Monday–Sunday week', () => {
  assert.deepEqual(nextWeekPeriod('2026-06-17'), {
    weekStart: '2026-06-22',
    startsOn: '2026-06-22',
    weekEnd: '2026-06-28',
    days: ['2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28'],
  });
});

test('invalid date-only values are rejected', () => {
  assert.throws(() => periodForStart('2026-02-30'), /Invalid calendar date/);
  assert.throws(() => periodForStart('17-06-2026'), /Expected YYYY-MM-DD/);
});
