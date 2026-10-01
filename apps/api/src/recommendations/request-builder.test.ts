import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fallbackRecommendations } from './fallback.js';
import { buildAiRequest, extractQuizData, mapTimeOfDay } from './request-builder.js';

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
  const req = buildAiRequest({}, undefined, 'r');
  assert.deepEqual(req.user_context, { mood: { primary: 'happy' } });
  assert.equal('user_id' in req, false);
  assert.equal(mapTimeOfDay('weird'), 'dinner');
});

test('fallback returns three distinct dishes for the mood/craving', () => {
  const q = extractQuizData({ userContext: { mood: { primary: 'stressed' }, gameData: { cravings: ['sweet'] } } });
  assert.deepEqual(q, { mood: 'stressed', craving: 'sweet', budget: 'budget', preference: 'no-preference' });
  const recs = fallbackRecommendations(q);
  assert.equal(recs.length, 3);
  assert.equal(new Set(recs.map((r) => r.dish.name)).size, 3);
  assert.deepEqual(recs.map((r) => r.rank), [1, 2, 3]);
});
