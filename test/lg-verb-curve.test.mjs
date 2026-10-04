// Row 283 LG-VERB-CURVE, after the hour-label review.
// Seed 4242. Each listed verb is unbuyable at the end of the previous hour and
// buyable by the end of its own hour, on the opening station route (Helios
// offers and ungated modules count as hour 0; salvage-only gear does not).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  HOUR_VERB_CURVE,
  hourVerbCurveGaps,
  hourVerbCurveLine,
  verbKeyFirstHour,
} from '../src/data/techVerbLadder.js';

const SEED = 4242;

test('seed 4242 ten-hour route meets each verb in the hour it first opens', () => {
  const state = createGameState(SEED);
  assert.equal(state.meta.seed, SEED);
  assert.equal(HOUR_VERB_CURVE.length, 10);
  const gaps = hourVerbCurveGaps();
  assert.deepEqual(gaps, [], gaps.join('; '));
  const keys = new Set();
  for (const row of HOUR_VERB_CURVE) {
    keys.add(row.verbKey);
    const first = verbKeyFirstHour(row.verbKey);
    assert.ok(first > row.hour - 1 && first <= row.hour,
      `${row.verbKey} first opens at ${first}, labeled hour ${row.hour}`);
  }
  assert.equal(keys.size, 10);
  const line = hourVerbCurveLine();
  for (const row of HOUR_VERB_CURVE) {
    assert.ok(line.includes(`${row.hour} ${row.label}`), line);
  }
});
