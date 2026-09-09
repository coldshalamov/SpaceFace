import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { addCargo } from '../src/systems/cargo.js';
import { economy as economyBase } from '../src/systems/economy.js';
import { factions as factionsBase } from '../src/systems/factions.js';

function bootScan() {
  const bus = createBus();
  const state = {
    meta: { seed: 1 },
    simTime: 10,
    playerId: 1,
    player: {
      credits: 5000,
      debt: 0,
      bounty: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 },
      stats: {},
    },
    factions: {},
    conflicts: {},
    entities: new Map(),
    world: { currentSectorId: 'sector_helios_prime' },
    economy: { markets: {}, cycles: {}, econEvents: [], econClock: { accumulator: 0, lastTickT: 0, ticksElapsed: 0 }, marketIntel: {} },
  };
  addCargo(state, 'cmdty_narcotics', 1);
  const economySys = { ...economyBase };
  const factionsSys = { ...factionsBase };
  economySys.init({ state, bus, helpers: {}, registry: null });
  factionsSys.init({ state, bus, helpers: {}, registry: null });
  factionsSys.newGame();
  economySys._rng = () => 0;
  return { state, bus, economySys, factionsSys };
}

test('a contraband bust applies the factions standing hit once, not stacked with a second economy delta', () => {
  const { state, bus, economySys } = bootScan();
  const reasons = [];
  bus.on('faction:repChanged', (p) => {
    if (p.factionId === 'faction_scn') reasons.push(p.reason);
  });

  const before = state.factions.faction_scn.rep;
  const result = economySys.runScan({ security: 1, scannerCloak: 0, factionId: 'faction_scn' });
  assert.equal(result.found, true);
  assert.equal(state.player.cargo.items.cmdty_narcotics, undefined);

  const after = state.factions.faction_scn.rep;
  assert.equal(after - before, -40, 'spec caught_contraband is -40 on the first strike');
  assert.deepEqual(reasons, ['contraband']);
  assert.equal(state.factions.faction_scn.knownContrabandStrikes, 1);

  addCargo(state, 'cmdty_narcotics', 1);
  economySys.runScan({ security: 1, scannerCloak: 0, factionId: 'faction_scn' });
  assert.equal(state.factions.faction_scn.rep - after, -60, 'second strike is 1.5× the base hit, not a stacked pair');
  assert.equal(state.factions.faction_scn.knownContrabandStrikes, 2);
});
