import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAiRequest } from './request-builder.js';
import { applyServerContext, type ServerContext } from './user-context.js';

const sc: ServerContext = {
  recentOrders: [{ dish: 'Pav Bhaji', rating: 5, date: '2026-10-06T14:00:00.000Z' }],
  vetoed: ['Caesar Salad'],
  budgetMax: 300,
};
// What mobile's generic default query sends (budget placeholder "medium").
const defaultQuery = {
  userContext: {
    situational: { budget: { min: 200, max: 500, currency: 'INR' } },
    gameData: { type: 'quiz', mood: 'happy', craving: 'comfort', budget: 'medium', preference: 'both' },
  },
};

test('history and vetoes reach intelligence', () => {
  const req = applyServerContext(buildAiRequest(defaultQuery, 'u', 'r'), sc);
  assert.deepEqual(req.user_context.history, { recent_orders: sc.recentOrders, avoid_these: ['Caesar Salad'] });
});

test('saved budget replaces the placeholder default', () => {
  const req = applyServerContext(buildAiRequest(defaultQuery, 'u', 'r'), sc);
  assert.deepEqual(req.user_context.situational.budget, { max: 300, currency: 'INR' });
});

test('"no limit" saved budget drops the placeholder budget', () => {
  const req = applyServerContext(buildAiRequest(defaultQuery, 'u', 'r'), { ...sc, budgetMax: null });
  assert.equal('budget' in req.user_context.situational, false);
});

test('an explicit budget choice from a game wins over the saved one', () => {
  const body = {
    userContext: {
      situational: { budget: { max: 2000, currency: 'INR' } },
      gameData: { type: 'quiz', budget: 'splurge' },
    },
  };
  const req = applyServerContext(buildAiRequest(body, 'u', 'r'), sc);
  assert.equal(req.user_context.situational.budget.max, 2000);
});

test('nothing known → request unchanged', () => {
  const built = buildAiRequest({}, 'u', 'r');
  const req = applyServerContext(built, { recentOrders: [], vetoed: [] });
  assert.deepEqual(req, built);
});
