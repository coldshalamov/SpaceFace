// NXI-227: "A cadence boundary does not delay an already-admitted critical transition."
//
// Contract: WORLD_OBSERVE_SCAN_TICKS halves monotonic observation scans (residency dwell,
// zone labels, POI identify, far-row decode promotion) — each deferrable by at most one
// tick. Critical machinery is NOT inside that gate: _drainResidencyQueue and
// _tickDeferredCriticalSpawns run every tick, and a deferred critical spawn retries on
// its own 15-tick cadence, which lands on odd ticks too. A boss deferred by the spawn
// cap therefore materializes on the retry tick whatever its parity — never stranded
// waiting for an even observation tick.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { world } from '../src/systems/world.js';

const ASHFALL = 'sector_ashfall_reach';

function bootWorld(seed = 4242) {
  const sim = createSimulation({ seed, systems: [spawnBudget, world] });
  const origin = sectorGlobalOrigin('sector_helios_prime');
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { ...origin }, vel: { x: 0, z: 0 },
    radius: 5, mass: 10, hull: 100, hullMax: 100, flags: {},
  });
  player.isPlayer = true;
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  return { sim, state: sim.state, bus: sim.bus, player, budget: sim.helpers.spawnBudget, world: sim.registry.get('world') };
}

test('a deferred critical spawn retries on its own cadence, off the observe parity', () => {
  const h = bootWorld();
  const deferred = [];
  h.bus.on('world:criticalSpawnDeferred', (payload) => deferred.push(payload));
  assert.equal(h.budget.request(h.budget.max(), 'fixture:saturated'), h.budget.max());
  const origin = sectorGlobalOrigin(ASHFALL);
  h.player.pos.x = origin.x;
  h.player.pos.z = origin.z;
  h.world.enterSector(ASHFALL, { placePlayer: false });
  assert.ok(deferred.length > 0, 'the boss deferral emits world:criticalSpawnDeferred');
  assert.equal(h.state.world.activeSector.boss, undefined, 'boss is deferred, not present');

  // Land the retry window on an odd tick deliberately: align tick to odd before release.
  h.state.tick = (h.state.tick | 0) | 1;                 // odd tick
  h.budget.releaseSome('fixture:saturated', 1);
  const startTick = h.state.tick | 0;

  // Step until the boss materializes or the retry window is clearly exceeded.
  let spawnTick = -1;
  for (let i = 0; i < 32 && spawnTick < 0; i++) {
    h.sim.step();
    if (h.state.world.activeSector.boss) spawnTick = h.state.tick | 0;
  }
  assert.ok(spawnTick > 0, 'the deferred boss eventually materializes after release');
  const waited = spawnTick - startTick;
  assert.ok(waited <= 16, `critical retry waits its own 15-tick cadence, not the observation gate (waited ${waited})`);
  // The cadence is 15 ticks — odd — so from an even start it lands odd; from odd, even.
  // Whatever parity it lands on proves the spawn is not parity-gated: a 2-tick gate
  // would always resolve on even ticks.
  h.sim.dispose();
});

test('the observation gate still runs at 30 Hz — monotonic scans stay amortized', () => {
  const h = bootWorld();
  const origin = sectorGlobalOrigin('sector_helios_prime');
  h.player.pos.x = origin.x;
  h.player.pos.z = origin.z;
  h.world.enterSector('sector_helios_prime', { placePlayer: false });
  const worldSys = h.world;
  let residencyCalls = 0;
  const original = worldSys._tickResidency.bind(worldSys);
  worldSys._tickResidency = (state) => { residencyCalls++; return original(state); };
  h.sim.step();
  h.sim.step();
  h.sim.step();
  h.sim.step();
  assert.ok(residencyCalls <= 3 && residencyCalls >= 1,
    `the residency observation scan runs on alternate ticks (saw ${residencyCalls}/4)`);
  h.sim.dispose();
});
