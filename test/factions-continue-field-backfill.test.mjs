import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { factions as factionsBase } from '../src/systems/factions.js';

const PAIR = 'faction_reach:faction_scn';
const CONTESTED = 'sector_helios_prime';

function bootOldSave() {
  const bus = createBus();
  const state = {
    meta: { seed: 1 },
    simTime: 0,
    playerId: 1,
    player: { credits: 0 },
    factions: {},
    conflicts: {},
    world: {
      currentSectorId: CONTESTED,
      sectors: {
        [CONTESTED]: { owner: 'faction_reach' },
        sector_old_reach_hold_a: { owner: 'faction_reach' },
        sector_old_reach_hold_b: { owner: 'faction_reach' },
        sector_old_reach_hold_c: { owner: 'faction_reach' },
      },
    },
    entityList: [],
  };
  const sys = { ...factionsBase };
  sys.init({ state, bus, helpers: {}, registry: null });
  // v1-era Continue payload: reputations only. No power, no derived flags.
  sys.deserialize({
    factions: {
      faction_reach: { rep: -50 },
      faction_scn: { rep: 0 },
    },
    conflicts: {
      [PAIR]: { tension: 90, state: 'war', playerLean: 0, momentum: 0 },
    },
  });
  return { state, bus, sys };
}

test('Continue backfills missing faction fields so daily wars keep a finite power and progress', () => {
  const { state, bus } = bootOldSave();
  const before = state.conflicts[PAIR].momentum;

  bus.emit('day:tick', { elapsed: 1 });

  const reach = state.factions.faction_reach;
  const scn = state.factions.faction_scn;
  assert.equal(Number.isFinite(reach.power), true, 'reach power must be a finite number after Continue + a day');
  assert.equal(Number.isFinite(scn.power), true, 'scn power must be a finite number after Continue + a day');
  assert.notEqual(reach.power, before);
  assert.notEqual(
    state.conflicts[PAIR].momentum,
    before,
    'NPC war momentum must move from a power imbalance, not stall at 0',
  );
  assert.equal(Number.isFinite(state.conflicts[PAIR].momentum), true);
});
