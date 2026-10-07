import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameSignals } from './games.controller.js';

test('game signals get stable, per-answer identities', () => {
  const out = gameSignals('s1', 3, [{ type: 'swipe', payload: { dish_id: 'in_002', liked: true } }, { type: 'game_signals', payload: {} }]);
  assert.deepEqual(out.map((s) => s.clientEventId), ['game:s1:3:0:swipe', 'game:s1:3:1:game_signals']);
  assert.equal(out[0].context.source, 'game_engine');
  assert.deepEqual(gameSignals('s1', 0), []);
});
