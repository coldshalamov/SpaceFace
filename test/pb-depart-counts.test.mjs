// Seed 4242. Departure fuel and hull chips name the counts, not only the percent.

import test from 'node:test';
import assert from 'node:assert/strict';

import { departureReadinessChips } from '../src/ui/station/stationDepartureModel.js';

const SEED = 4242;

test('seed 4242 departure fuel and hull chips name the counts', () => {
  const ship = { id: 1, hull: 40, hullMax: 100 };
  const state = {
    meta: { seed: SEED },
    playerId: 1,
    player: { heat: 0, cargo: { capVolume: 20, usedVolume: 0, items: {} } },
    entities: new Map([[1, ship]]),
    fuel: { current: 8, max: 20 },
    missions: { active: [] },
  };
  assert.equal(state.meta.seed, SEED);
  const chips = departureReadinessChips(state);
  const fuel = chips.find((row) => row.label === 'Fuel');
  const hull = chips.find((row) => row.label === 'Hull');
  assert.equal(fuel.text, '40% · 8 of 20');
  assert.equal(hull.text, '40% · 40 of 100');
});
