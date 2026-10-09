// Seed 4242. The departure check names wanted heat and how long that level
// takes to clear. Lawful heat does not add a Heat chip.

import test from 'node:test';
import assert from 'node:assert/strict';

import { heatClearSecondsForLevel, heatLevelFor } from '../src/systems/heat.js';
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

test('seed 4242 departure check names wanted heat clear time', () => {
  const hot = state(0.2);
  assert.equal(hot.meta.seed, SEED);
  const seconds = Math.ceil(heatClearSecondsForLevel(heatLevelFor(0.2)));
  const chip = departureReadinessChips(hot).find((row) => row.label === 'Heat');
  assert.ok(chip);
  assert.equal(chip.kind, 'bad');
  assert.equal(chip.text, `WANTED · clears in ${seconds}s`);
  assert.equal(departureReadinessChips(state(0)).some((row) => row.label === 'Heat'), false);
});
