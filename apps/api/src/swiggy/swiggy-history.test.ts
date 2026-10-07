import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planImport } from './swiggy-history.service.js';

const orders = [
  {
    order_id: 'o1',
    ordered_at: '2026-10-01T20:15:00+05:30',
    restaurant_id: 'r1',
    restaurant_name: 'Paradise',
    items: [
      { name: 'Chicken Biryani', dish_id: 'in_004', dish_name: 'Chicken Biryani', confidence: 1 },
      { name: 'Mystery Platter', dish_id: null },
    ],
  },
  { order_id: 'o2', ordered_at: 'not a date', items: [{ name: 'Dal Makhani', dish_id: 'in_002', dish_name: 'Dal Makhani' }] },
];

test('only mapped dishes become order signals, deduped per order + dish', () => {
  const { signals } = planImport(orders);
  assert.equal(signals.length, 2);
  assert.deepEqual(signals.map((s) => s.clientEventId), ['swiggy:o1:in_004', 'swiggy:o2:in_002']);
  assert.equal(signals[0].type, 'order');
  assert.equal((signals[0].payload as Record<string, unknown>).source, 'swiggy_history');
  assert.equal(signals[0].context?.ordered_at, new Date('2026-10-01T20:15:00+05:30').toISOString());
  assert.equal('ordered_at' in (signals[1].context ?? {}), false); // bad date dropped
});

test('order_history rows carry the catalog dish name and real order time', () => {
  const { rows } = planImport(orders);
  assert.deepEqual(rows.map((r) => [r.swiggyOrderId, r.dishName]), [['o1', 'Chicken Biryani'], ['o2', 'Dal Makhani']]);
  assert.ok(rows[0].createdAt instanceof Date);
  assert.equal(rows[1].createdAt, null);
});
