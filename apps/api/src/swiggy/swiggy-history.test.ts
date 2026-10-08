import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planGroceryImport, planImport } from './swiggy-history.service.js';

const orders = [
  {
    order_id: 'o1',
    ordered_at: '2026-10-01T20:15:00+05:30',
    meal_slot: 'dinner',
    weekday: 'thursday',
    is_weekend: false,
    restaurant_id: 'r1',
    restaurant_name: 'Paradise',
    total: 649.5,
    items: [
      { name: 'Chicken Biryani', quantity: 2, price: 299, veg: false, dish_id: 'in_004', dish_name: 'Chicken Biryani', map_confidence: 1,
        profile: { cuisine: 'south_indian', protein: 'chicken', form: 'rice_biryani' } },
      { name: 'Mystery Platter', dish_id: null, profile: { cuisine: 'other', protein: 'none' } },
    ],
  },
  { order_id: 'o2', ordered_at: 'not a date', items: [{ name: 'Dal Makhani', dish_id: 'in_002', dish_name: 'Dal Makhani' }] },
];

test('every item becomes an order signal; mapped items keep the earlier dedupe key', () => {
  const { signals } = planImport(orders);
  assert.deepEqual(signals.map((s) => s.clientEventId), ['swiggy:o1:in_004', 'swiggy:o1:item1', 'swiggy:o2:in_002']);
  const p = signals[0].payload as Record<string, unknown>;
  assert.equal(p.source, 'swiggy_history');
  assert.equal(p.quantity, 2);
  assert.equal(p.meal_slot, 'dinner'); // the order's own time, not the import's
  assert.equal(p.ordered_at, new Date('2026-10-01T20:15:00+05:30').toISOString());
  assert.deepEqual((p.profile as Record<string, unknown>).form, 'rice_biryani');
  assert.equal((signals[1].payload as Record<string, unknown>).dish_id, null); // unmapped items still teach the brain
  assert.equal((signals[2].payload as Record<string, unknown>).ordered_at, null); // bad date dropped
  assert.deepEqual(signals[0].context, { source: 'swiggy_history' });
});

test('swiggy_orders rows keep the whole order; order_history only mapped dishes', () => {
  const { orderRows, history } = planImport(orders);
  assert.deepEqual(orderRows.map((r) => [r.swiggyOrderId, r.totalInr, r.items.length]), [['o1', 650, 2], ['o2', null, 1]]);
  assert.ok(orderRows[0].orderedAt instanceof Date);
  assert.equal(orderRows[1].orderedAt, null);
  assert.deepEqual(history.map((r) => [r.swiggyOrderId, r.dishName, r.priceInr]), [['o1', 'Chicken Biryani', 299], ['o2', 'Dal Makhani', 0]]);
});

test('no personal fields are carried', () => {
  const blob = JSON.stringify(planImport(orders));
  for (const k of ['address', 'phone', 'payment', 'latitude']) assert.equal(blob.includes(k), false);
});

test('grocery import: one signal per order plus a go-to snapshot keyed by its contents', () => {
  const goTo = [{ name: 'Amul Butter', product_id: 'p1' }, { name: 'Brown Rice Cakes', product_id: 'p2' }];
  const { orderRows, signals } = planGroceryImport(
    [{ order_id: 'g1', ordered_at: '2026-10-01T09:15:00+05:30', order_type: 'INSTAMART', total: 412.4,
       items: [{ name: 'Milk 1L', quantity: 2, profile: { category: 'dairy', cooking_role: 'scratch_ingredient' } }] }],
    goTo,
  );
  assert.deepEqual(orderRows.map((r) => [r.swiggyOrderId, r.totalInr, r.orderType]), [['g1', 412, 'INSTAMART']]);
  assert.deepEqual(signals.map((s) => s.type), ['grocery_order', 'grocery_go_to']);
  assert.equal(signals[0].clientEventId, 'instamart:g1');
  assert.equal((signals[0].payload as Record<string, unknown>).source, 'instamart_history');
  const again = planGroceryImport([], [...goTo]).signals[0].clientEventId;
  assert.equal(again, signals[1].clientEventId); // unchanged list -> same key -> deduped
  assert.notEqual(planGroceryImport([], [goTo[0]]).signals[0].clientEventId, again);
});
