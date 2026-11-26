// Seed 4242. The load-screen rap sheet names how long a wanted heat level takes
// to clear. A clean sheet does not invent a clock.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSavePortrait } from '../src/ui/screens/saveLoad.js';

const SEED = 4242;

test('seed 4242 the save rap sheet pauses the wanted clock instead of inventing a live countdown', () => {
  const hot = buildSavePortrait({
    meta: { seed: SEED },
    state: { player: { heat: 0.2, bounty: 0 } },
  });
  assert.equal(hot.meta ? hot.meta.seed : SEED, SEED);
  assert.match(hot.rapSheet.line, /paused in save/);
  assert.equal(hot.rapSheet.line.includes('clears in'), false);
  const clean = buildSavePortrait({ state: { player: { heat: 0, bounty: 0 } } });
  assert.equal(clean.rapSheet.line.includes('clears in'), false);
});
