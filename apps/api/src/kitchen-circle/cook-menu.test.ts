import assert from 'node:assert/strict';
import test from 'node:test';
import { cookFor, cookMenuMessage } from './planner-notifier.service.js';

const member = (userId: string, role: 'owner' | 'member' | 'cook', joined: number) =>
  ({ householdId: 'h', userId, role, language: 'en', joinedAt: new Date(joined) }) as never;

test('the menu goes to the designated cook, else the first cook; nobody when auto-send is off', () => {
  const members = [member('owner', 'owner', 1), member('cook-b', 'cook', 3), member('cook-a', 'cook', 2)];
  assert.equal(cookFor({ cookAutoSend: true, designatedCookUserId: null }, members)?.userId, 'cook-a');
  assert.equal(cookFor({ cookAutoSend: true, designatedCookUserId: 'cook-b' }, members)?.userId, 'cook-b');
  assert.equal(cookFor({ cookAutoSend: true, designatedCookUserId: 'owner' }, members)?.userId, 'cook-a'); // not a cook any more
  assert.equal(cookFor({ cookAutoSend: false, designatedCookUserId: null }, members), null);
  assert.equal(cookFor({ cookAutoSend: false, designatedCookUserId: null }, members, true)?.userId, 'cook-a'); // "send now"
  assert.equal(cookFor({ cookAutoSend: true, designatedCookUserId: null }, [member('owner', 'owner', 1)]), null);
});

test('the cook message says what to cook, for how many, and that the recipe is in their language', () => {
  const slot = { plannedFor: '2026-11-06', state: 'planned', mealTitle: 'Rajma Chawal', servings: 4, recipeVersionId: 'v1' } as const;
  assert.deepEqual(cookMenuMessage('tomorrow', slot), { title: 'Tomorrow: Rajma Chawal', body: 'Friday: Rajma Chawal for 4. The recipe is ready in your language — tap to open.' });
  assert.equal(cookMenuMessage('today', slot).title, 'Today: Rajma Chawal');
  assert.deepEqual(cookMenuMessage('changed', { ...slot, state: 'household_out', mealTitle: null }), { title: 'Change for Friday', body: 'Now: no cooking — everyone is eating out.' });
  assert.equal(cookMenuMessage('today', { ...slot, recipeVersionId: null }).body, 'Friday: Rajma Chawal for 4. Tap to see the week.');
});
