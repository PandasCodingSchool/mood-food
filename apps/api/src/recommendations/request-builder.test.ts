import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fallbackRecommendations } from './fallback.js';
import { istParts } from '../common/ist.js';
import { buildAiRequest, extractQuizData } from './request-builder.js';

// 2026-10-07 is a Wednesday; IST = UTC+5:30.
const atIst = (hh: number, mm = 0) => new Date(Date.UTC(2026, 9, 7, hh, mm) - 5.5 * 3600_000);

test('maps camelCase app context to the snake_case contract', () => {
  const req = buildAiRequest(
    {
      userContext: {
        mood: { primary: 'tired', socialContext: 'alone', energyLevel: 2 },
        preferences: { cuisineTypes: ['thai'], spiceTolerance: 'high' },
        situational: { timeOfDay: 'evening', budget: { max: 400, currency: 'INR' } },
        gameData: { type: 'craving_radar', cravingTags: ['spicy', 'brothy'], duelResults: [{ dimensionA: 'a', dimensionB: 'b', winner: 'a' }] },
      },
      recommendationConfig: { count: 5 },
    },
    'user-1',
    'req-1',
    atIst(20, 30),
  );
  assert.deepEqual(req.user_context.mood, { primary: 'tired', social_context: 'solo', energy_level: 2 });
  assert.equal(req.user_context.situational?.time_of_day, 'dinner');
  assert.deepEqual(req.user_context.preferences?.cuisine_types, ['thai']);
  assert.deepEqual(req.user_context.game_data?.craving_tags, ['spicy', 'brothy']);
  assert.deepEqual(req.user_context.game_data?.duel_results, [{ dimension_a: 'a', dimension_b: 'b', winner: 'a' }]);
  assert.equal(req.recommendation_config.count, 5);
  assert.equal(req.user_id, 'user-1');
  assert.equal(req.request_id, 'req-1');
});

test('empty request still produces a valid contract', () => {
  const req = buildAiRequest({}, undefined, 'r', atIst(13));
  assert.deepEqual(req.user_context, {
    mood: { primary: 'happy' },
    situational: { time_of_day: 'lunch', day_of_week: 'wednesday' },
  });
  assert.equal('user_id' in req, false);
});

test('server IST bucket overrides the client (mobile sends "night" from 19:00)', () => {
  const body = { userContext: { situational: { timeOfDay: 'night', deliveryPreferred: true } } };
  assert.equal(buildAiRequest(body, undefined, 'r', atIst(19, 30)).user_context.situational.time_of_day, 'dinner');
  assert.equal(buildAiRequest(body, undefined, 'r', atIst(22, 30)).user_context.situational.time_of_day, 'late_night');
});

test('istParts buckets every hour, overnight is late_night', () => {
  const expected: Record<number, string> = { 0: 'late_night', 4: 'late_night', 5: 'breakfast', 10: 'breakfast', 11: 'lunch', 15: 'lunch', 16: 'dinner', 21: 'dinner', 22: 'late_night', 23: 'late_night' };
  for (const [hour, bucket] of Object.entries(expected)) {
    assert.equal(istParts(atIst(Number(hour))).time_of_day, bucket, `hour ${hour}`);
  }
  assert.equal(istParts(atIst(12)).day_of_week, 'wednesday');
});

test('unknown gameData keys are kept under raw instead of dropped', () => {
  const req = buildAiRequest(
    { userContext: { gameData: { type: 'roulette', segment: 'spicy', likedCount: 4, raw: { swipes: [] } } } },
    undefined,
    'r',
  );
  assert.deepEqual(req.user_context.game_data?.raw, { segment: 'spicy', likedCount: 4, swipes: [] });
});

test('fallback returns three distinct dishes for the mood/craving', () => {
  const q = extractQuizData({ userContext: { mood: { primary: 'stressed' }, gameData: { cravings: ['sweet'] } } });
  assert.deepEqual(q, { mood: 'stressed', craving: 'sweet', budget: 'budget', preference: 'no-preference', allergies: [] });
  const recs = fallbackRecommendations(q);
  assert.equal(recs.length, 3);
  assert.equal(new Set(recs.map((r) => r.dish.name)).size, 3);
  assert.deepEqual(recs.map((r) => r.rank), [1, 2, 3]);
});

test('fallback serves real priced catalog dishes, never ₹0 placeholders', () => {
  for (const mood of ['happy', 'tired', 'stressed', 'adventurous', 'celebrating', 'relaxed', 'unknown']) {
    const recs = fallbackRecommendations({ mood, craving: 'comfort', budget: 'splurge', preference: 'no-preference' });
    assert.equal(recs.length, 3, mood);
    for (const r of recs) {
      assert.ok(r.practical_details.estimated_price > 0, `${mood}: ${r.dish.name}`);
      assert.ok(r.image_url, `${mood}: ${r.dish.name} image`);
      assert.match(r.dish.id, /^[a-z]{2}_\d{3}$/);
    }
  }
});

test('fallback never relaxes diet or allergies', () => {
  for (let i = 0; i < 20; i++) {
    const vegan = fallbackRecommendations({ mood: 'happy', craving: 'comfort', budget: 'budget', preference: 'vegan', allergies: ['peanuts'] });
    for (const r of vegan) {
      assert.ok(r.dish.tags.includes('vegan'), r.dish.name);
    }
    const veg = fallbackRecommendations({ mood: 'stressed', craving: 'comfort', budget: 'budget', preference: 'vegetarian', allergies: ['dairy'] });
    for (const r of veg) {
      assert.ok(!r.dish.tags.includes('non_veg'), r.dish.name);
    }
  }
});
