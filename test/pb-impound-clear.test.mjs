// Seed 4242. The station fine card names how long this wanted heat takes to clear.
// A clean heat value does not invent a clock. The deck does not boot.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { heatClearSecondsForLevel, heatLevelFor } from '../src/systems/heat.js';
import { fineWarrantDetail } from '../src/ui/impoundPayPrompt.js';

const SEED = 4242;

function state(heat) {
  return {
    meta: { seed: SEED },
    player: { heat, credits: 1000 },
  };
}

test('seed 4242 the fine card names how long this wanted heat takes to clear', () => {
  assert.equal(SEED, 4242);
  const heat = 0.2;
  const seconds = Math.ceil(heatClearSecondsForLevel(heatLevelFor(heat)));
  assert.equal(seconds, 5);
  const offer = { amount: 400, stationId: 'station_helios', status: 'open' };
  const detail = fineWarrantDetail(offer, state(heat));
  assert.ok(detail.includes(`clears in ${seconds}s`));
  assert.ok(detail.includes('clears in 5s'));
  assert.match(detail, /Wire the 400 cr/);
  const clean = fineWarrantDetail(offer, state(0));
  assert.equal(clean.includes('clears in'), false);
  assert.match(clean, /Wire the 400 cr/);
  const below = fineWarrantDetail(offer, state(0.14));
  assert.equal(below.includes('clears in'), false);
  const src = readFileSync(new URL('../src/ui/impoundPayPrompt.js', import.meta.url), 'utf8');
  assert.match(src, /detail:\s*fineWarrantDetail\(offer,\s*state\)/);
  assert.match(src, /wantedClearClause\(/);
});
