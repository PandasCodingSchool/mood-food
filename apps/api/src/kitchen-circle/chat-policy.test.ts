import assert from 'node:assert/strict';
import test from 'node:test';
import { decide, messageShape, type ChatAction } from './chat-policy.js';

const action = (type: ChatAction['type']): ChatAction => ({ type, slot_id: 's1' });
const open = { slotLocked: false, dayEditsInMessage: 1 };

test('clear low-risk edits to an unlocked day apply straight away', () => {
  for (const type of ['SET_MEAL', 'CLEAR_DAY', 'SET_DAY_STATUS', 'SET_SERVINGS', 'LOCK_SLOT'] as const) {
    assert.equal(decide(action(type), open).decision, 'apply', type);
  }
  assert.deepEqual(decide(action('SET_ATTENDANCE'), { slotLocked: true, dayEditsInMessage: 5 }).policy, 'self_attendance');
});

test('locked days, bulk changes, rules, and grocery actions need confirmation', () => {
  assert.equal(decide(action('SET_MEAL'), { slotLocked: true, dayEditsInMessage: 1 }).policy, 'locked_day');
  assert.equal(decide(action('UNLOCK_SLOT'), { slotLocked: true, dayEditsInMessage: 1 }).decision, 'confirm');
  assert.equal(decide(action('SET_DAY_STATUS'), { slotLocked: false, dayEditsInMessage: 3 }).policy, 'bulk_change');
  assert.equal(decide(action('SET_DAY_STATUS'), { slotLocked: false, dayEditsInMessage: 2 }).decision, 'apply');
  assert.equal(decide(action('CREATE_RECURRING_RULE'), open).policy, 'recurring_rule');
  assert.equal(decide(action('UPDATE_RECURRING_RULE'), open).decision, 'confirm');
  assert.equal(decide(action('CREATE_GROCERY_SNAPSHOT'), open).policy, 'order_action');
});

test('auto-fill only creates a reviewable proposal, so it applies', () => {
  assert.deepEqual(decide(action('REQUEST_AUTOFILL'), open).policy, 'review_proposal');
});

test('asking the assistant to write a recipe applies straight away as an AI draft', () => {
  const decision = decide({ type: 'CREATE_RECIPE', dish: 'Thalipeeth' }, open);
  assert.equal(decision.decision, 'apply');
  assert.equal(decision.policy, 'ai_recipe_draft');
});

test('the bulk rule counts different days, and several meals for one day need a pick', () => {
  const meal = (slot: string): ChatAction => ({ type: 'SET_MEAL', slot_id: slot });
  const voiceMuddle = [meal('fri'), meal('fri'), meal('fri'), meal('sat'), meal('sat'), meal('sat'), meal('sat')];
  const shape = messageShape(voiceMuddle);
  assert.equal(shape.dayEditsInMessage, 2);
  const friday = decide(meal('fri'), { slotLocked: false, dayEditsInMessage: shape.dayEditsInMessage, mealsOnSameDay: shape.mealsOnSameDay(meal('fri')) });
  assert.deepEqual([friday.decision, friday.note], ['confirm', '3 meals were suggested for this day. Confirm the one you want.']);
  const week = [meal('mon'), meal('tue'), meal('wed')];
  const three = messageShape(week);
  assert.equal(decide(meal('mon'), { slotLocked: false, dayEditsInMessage: three.dayEditsInMessage, mealsOnSameDay: three.mealsOnSameDay(meal('mon')) }).note,
    'This message changes 3 days, so please review it first.');
  const two = messageShape([meal('mon'), { type: 'SET_SERVINGS', slot_id: 'mon' }]);
  assert.equal(decide(meal('mon'), { slotLocked: false, dayEditsInMessage: two.dayEditsInMessage, mealsOnSameDay: two.mealsOnSameDay(meal('mon')) }).decision, 'apply');
});
