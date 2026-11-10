// Seed 4242. The load-screen rap sheet names how long a wanted heat level takes
// to clear. A clean sheet does not invent a clock.

import test from 'node:test';
import assert from 'node:assert/strict';

import { heatClearSecondsForLevel, heatLevelFor } from '../src/systems/heat.js';
import { buildSavePortrait } from '../src/ui/screens/saveLoad.js';

const SEED = 4242;

test('seed 4242 the save rap sheet names the wanted clear time', () => {
  const seconds = Math.ceil(heatClearSecondsForLevel(heatLevelFor(0.2)));
  const hot = buildSavePortrait({
    meta: { seed: SEED },
    state: { player: { heat: 0.2, bounty: 0 } },
  });
  assert.equal(hot.meta ? hot.meta.seed : SEED, SEED);
  assert.match(hot.rapSheet.line, new RegExp('clears in ' + seconds + 's'));
  const clean = buildSavePortrait({ state: { player: { heat: 0, bounty: 0 } } });
  assert.equal(clean.rapSheet.line.includes('clears in'), false);
});
