// NXI-170 — polling one shortage reuses the open request, and a later shortage may still seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seedEscalationFromAct } from '../src/systems/encounterDirector.js';

const state = { meta: { seed: 4242 }, simTime: 10, world: { currentSectorId: 'sector_ceres_belt' } };
const act = { playerCaused: true, intentId: 'lot-4242', sectorId: 'sector_ceres_belt' };

test('an open unmet need is the same seed, and an arrived need does not block the next one', () => {
  const dir = { escalationSeeds: [] };
  const first = seedEscalationFromAct(dir, state, 'spill', act);
  const second = seedEscalationFromAct(dir, state, 'spill', act);
  assert.equal(second.id, first.id);
  assert.equal(dir.escalationSeeds.length, 1);
  first.arrived = true;
  const later = seedEscalationFromAct(dir, state, 'spill', { ...act, playerCaused: true });
  assert.notEqual(later.id, first.id);
  assert.ok(later.id.endsWith(':g1'));
  assert.equal(dir.escalationSeeds.length, 2);
});
