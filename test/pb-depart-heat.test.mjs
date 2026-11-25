// Seed 4242. The departure check names wanted heat honestly while docked (paused while docked,
// or settle at yard for impound) rather than claiming a frozen countdown. Lawful heat adds no chip.

import test from 'node:test';
import assert from 'node:assert/strict';

import { departureReadinessChips } from '../src/ui/station/stationDepartureModel.js';

const SEED = 4242;

function state(heat) {
  return {
    meta: { seed: SEED },
    player: { heat, cargo: { capVolume: 20, usedVolume: 0, items: {} } },
    fuel: { current: 10, max: 10 },
    missions: { active: [] },
  };
}

test('seed 4242 departure check reports honest docked hold for wanted heat', () => {
  const hot = state(0.2);
  assert.equal(hot.meta.seed, SEED);
  const chip = departureReadinessChips(hot).find((row) => row.label === 'Heat');
  assert.ok(chip);
  assert.equal(chip.kind, 'bad');
  assert.equal(chip.text, 'WANTED · paused while docked');
  const impoundChip = departureReadinessChips(state(0.95)).find((row) => row.label === 'Heat');
  assert.equal(impoundChip?.text, 'WANTED · settle at yard');
  assert.equal(departureReadinessChips(state(0)).some((row) => row.label === 'Heat'), false);
});
