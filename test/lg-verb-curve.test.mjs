// Row 283 LG-VERB-CURVE. A fixed ten-hour reference route on the authored ladder.
// Seed 4242: the curve does not read rng. Each hour names a distinct PQ-208 verb
// key that the named tech node unlocks, and that node's honest hour is at or
// before the route hour, so the verb is usable when the hour arrives.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  HOUR_VERB_CURVE,
  hourVerbCurveGaps,
  hourVerbCurveLine,
} from '../src/data/techVerbLadder.js';

const SEED = 4242;

test('seed 4242 ten-hour route meets ten distinct usable verbs', () => {
  const state = createGameState(SEED);
  assert.equal(state.meta.seed, SEED);
  assert.equal(HOUR_VERB_CURVE.length, 10);
  const gaps = hourVerbCurveGaps();
  assert.deepEqual(gaps, [], gaps.join('; '));
  const keys = new Set(HOUR_VERB_CURVE.map((row) => row.verbKey));
  assert.equal(keys.size, 10);
  for (const row of HOUR_VERB_CURVE) {
    assert.equal(row.hour, HOUR_VERB_CURVE.indexOf(row) + 1);
  }
  const line = hourVerbCurveLine();
  for (const row of HOUR_VERB_CURVE) {
    assert.ok(line.includes(`${row.hour} ${row.label}`), line);
  }
});
