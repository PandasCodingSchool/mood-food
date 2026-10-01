import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextProgress, yesterdayOf } from './quests.js';

test('yesterdayOf crosses month and year boundaries', () => {
  assert.equal(yesterdayOf('2026-03-01'), '2026-02-28');
  assert.equal(yesterdayOf('2026-01-01'), '2025-12-31');
});

test('counting quests add the increment', () => {
  assert.equal(nextProgress('try_3_cuisines', null, 1, '2026-01-01').count, 1);
  assert.equal(nextProgress('try_3_cuisines', { progress: { count: 2 }, streakCount: 0 }, 1, '2026-01-01').count, 3);
});

test('mood streak: same day holds, next day grows, a gap resets', () => {
  const day1 = nextProgress('mood_streak_7', null, 1, '2026-01-01');
  assert.deepEqual([day1.count, day1.streak], [1, 1]);
  const at = (streak: number, last: string) => ({ progress: { count: streak, lastCheckinDate: last }, streakCount: streak });
  assert.equal(nextProgress('mood_streak_7', at(3, '2026-01-05'), 1, '2026-01-05').streak, 3);
  assert.equal(nextProgress('mood_streak_7', at(3, '2026-01-05'), 1, '2026-01-06').streak, 4);
  assert.equal(nextProgress('mood_streak_7', at(3, '2026-01-05'), 1, '2026-01-08').streak, 1);
});

test('mood streak: legacy rows without a date seed from their count', () => {
  assert.equal(nextProgress('mood_streak_7', { progress: { count: 4 }, streakCount: 0 }, 1, '2026-01-01').streak, 4);
});
