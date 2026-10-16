import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dedupeKey } from './signals.service.js';

test('same signal re-sent → same key; payload key order does not matter', () => {
  const a = dedupeKey({ type: 'swipe', payload: { dish: 'x', liked: true }, clientTs: '2026-10-07T10:00:00.000Z' });
  const b = dedupeKey({ type: 'swipe', payload: { liked: true, dish: 'x' }, clientTs: '2026-10-07T10:00:00.000Z' });
  assert.ok(a && /^[0-9a-f]{64}$/.test(a));
  assert.equal(a, b);
});

test('different time, type or payload → different key', () => {
  const base = { type: 'swipe', payload: { dish: 'x' }, clientTs: '2026-10-07T10:00:00.000Z' };
  const k = dedupeKey(base);
  assert.notEqual(k, dedupeKey({ ...base, clientTs: '2026-10-07T10:00:01.000Z' }));
  assert.notEqual(k, dedupeKey({ ...base, type: 'veto' }));
  assert.notEqual(k, dedupeKey({ ...base, payload: { dish: 'y' } }));
});

test('client event id wins; nothing to go on → no dedupe', () => {
  assert.equal(
    dedupeKey({ type: 'a', payload: 1, clientEventId: 'e1', clientTs: 't1' }),
    dedupeKey({ type: 'b', payload: 2, clientEventId: 'e1', clientTs: 't2' }),
  );
  assert.equal(dedupeKey({ type: 'a', payload: { x: 1 } }), null);
});
