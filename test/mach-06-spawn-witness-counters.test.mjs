// INFERENCE MACH-06: "Deferred or limited spawns are counted in the runtime witness."
//
// Contract: `world:spawnLimited` and `world:criticalSpawnDeferred` each increment a cumulative
// counter on state.world.spawnWitness; the runtime witness samples both and the report prints
// them. A saturated seed-4242 scene shows non-zero limited / zero critical; a saturated boss
// sector shows the critical counter move. No spawn limits raised, no per-event logging.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { world } from '../src/systems/world.js';
import {
  collectRuntimeWitnessSample,
  createRuntimeWitness,
  formatRuntimeWitnessReport,
} from '../src/core/runtimeWitness.js';

const IO_REACH = 'sector_io_reach';
const ASHFALL = 'sector_ashfall_reach';

function bootWorld(seed = 4242, sectorId = 'sector_helios_prime') {
  const sim = createSimulation({ seed, systems: [spawnBudget, world] });
  const origin = sectorGlobalOrigin(sectorId);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { ...origin }, vel: { x: 0, z: 0 },
    radius: 5, mass: 10, hull: 100, hullMax: 100, flags: {},
  });
  player.isPlayer = true;
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  return {
    sim,
    state: sim.state,
    bus: sim.bus,
    player,
    budget: sim.helpers.spawnBudget,
    world: sim.registry.get('world'),
  };
}

test('a saturated bounty entry increments the limited counter, not the critical one', () => {
  const h = bootWorld(4242, IO_REACH);
  h.state.player.heat = 1;
  const limited = [];
  h.bus.on('world:spawnLimited', (payload) => limited.push(payload));
  assert.equal(h.budget.request(h.budget.max(), 'fixture:saturated'), h.budget.max());
  const origin = sectorGlobalOrigin(IO_REACH);
  h.player.pos.x = origin.x + 2800;
  h.player.pos.z = origin.z + 2400;
  h.world.enterSector(IO_REACH, { placePlayer: false });
  assert.ok(limited.length > 0, 'the saturated scene still emits world:spawnLimited');
  const witness = h.state.world.spawnWitness;
  assert.ok(witness, 'the emit stamped the witness bag');
  assert.equal(witness.limited, limited.length, 'every emit increments the limited counter');
  assert.equal(witness.criticalDeferred, 0, 'a limited clamp is not a critical deferral');

  const sample = collectRuntimeWitnessSample(h.state);
  assert.equal(sample.worldSpawnLimited, limited.length);
  assert.equal(sample.worldSpawnCriticalDeferred, 0);
  h.sim.dispose();
});

test('a saturated boss sector increments the critical deferral counter', () => {
  const h = bootWorld(4242, ASHFALL);
  const deferred = [];
  h.bus.on('world:criticalSpawnDeferred', (payload) => deferred.push(payload));
  assert.equal(h.budget.request(h.budget.max(), 'fixture:saturated'), h.budget.max());
  const origin = sectorGlobalOrigin(ASHFALL);
  h.player.pos.x = origin.x;
  h.player.pos.z = origin.z;
  h.world.enterSector(ASHFALL, { placePlayer: false });
  assert.ok(deferred.length > 0, 'the boss deferral still emits world:criticalSpawnDeferred');
  const witness = h.state.world.spawnWitness;
  assert.equal(witness.criticalDeferred, deferred.length);
  assert.equal(witness.limited, 0, 'nothing limited in the boss-only scene');

  const sample = collectRuntimeWitnessSample(h.state);
  assert.equal(sample.worldSpawnCriticalDeferred, deferred.length);
  h.sim.dispose();
});

test('the witness report prints both counters with the window delta', () => {
  const h = bootWorld(4242, IO_REACH);
  const witness = createRuntimeWitness();
  witness.observe(h.state, { wallMs: 0 });                        // baseline sample, counters 0
  h.state.player.heat = 1;
  assert.equal(h.budget.request(h.budget.max(), 'fixture:saturated'), h.budget.max());
  const origin = sectorGlobalOrigin(IO_REACH);
  h.player.pos.x = origin.x + 2800;
  h.player.pos.z = origin.z + 2400;
  h.world.enterSector(IO_REACH, { placePlayer: false });
  witness.observe(h.state, { wallMs: 1200 });                     // past the 1 Hz period
  const report = witness.explain();
  const line = report.split('\n').find((row) => row.includes('world spawn limited'));
  assert.ok(line, 'the report carries the spawn line');
  assert.match(line, /limited [1-9]\d* \(\+[1-9]\d*\)/, 'non-zero limited with a positive window delta');
  assert.match(line, /critical deferred 0 \(\+0\)/, 'dense scene keeps the critical line at zero');
  h.sim.dispose();
});
