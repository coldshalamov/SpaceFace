// G11-04 — a deferred neighbor drain superseded mid-materialize must stop before it can
// spawn, write a tier/metadata, publish its bag, or emit a residency receipt. The
// replacement enter's bag stays FULL and authoritative; everything the stale pass minted
// is released.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { RESIDENCY_TIER } from '../src/data/sectorCoordinates.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_belt';

function bootWorld(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    radius: 4,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.vel = player.vel || { x: 0, z: 0 };
  player.flags = player.flags || { boosting: false, docked: false, invuln: false, noInterp: false };
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, bus, helpers, world, player };
}

function aliveIds(state) {
  return state.entityList.filter((e) => e && e.alive !== false).map((e) => e.id);
}

test('a superseded queued-neighbor drain stops before spawn, tier write, publish, and receipt', () => {
  const { state, bus, world } = bootWorld();
  // The arrival slice defers non-membership neighbors onto _pendingResidency — the exact
  // queue the interrupted drain consumed in the repro.
  state.world.sliceArrival = true;
  const residencyEvents = [];
  bus.on('world:residency', (p) => residencyEvents.push(p));

  world.enterSector(HELIOS);
  assert.equal(state.world.residentSectors[HELIOS].tier, RESIDENCY_TIER.FULL);
  assert.ok(world._pendingResidency.length >= 1, 'neighbors deferred onto the residency queue');

  // Drive the deferred drain into the queued neighbor's materialize: spawn phases mint
  // live entities across yields while the bag is not yet published.
  const aliveBeforeDrain = new Set(aliveIds(state));
  const drain = world._drainResidencyQueueChunks();
  let staleSpawned = [];
  for (let i = 0; i < 8 && staleSpawned.length === 0; i++) {
    const step = drain.next();
    assert.equal(step.done, false, 'drain suspends inside materialization');
    staleSpawned = aliveIds(state).filter((id) => !aliveBeforeDrain.has(id));
  }
  assert.ok(staleSpawned.length > 0, 'materialize phase spawned bodies before the yield');

  // Supersede: a new sector entry mints a fresh epoch and a fresh residency queue while the
  // old generator is parked at the yield — the repro's exact interleaving.
  world.enterSector(CERES);
  const newBag = state.world.sectorContents[CERES];
  const recAfterEnter = state.world.residentSectors[CERES];
  assert.ok(newBag, 'replacement enter published the membership bag');
  assert.equal(recAfterEnter.tier, RESIDENCY_TIER.FULL);
  assert.notEqual(world._pendingResidency.length, 0, 'replacement plan minted its own queue');
  const aliveAfterEnter = new Set(aliveIds(state));

  // Resume the stale generator to completion. Every check it now meets must refuse.
  while (!drain.next().done) { /* drain to completion */ }

  // The replacement bag is untouched — same object, still FULL.
  assert.equal(state.world.sectorContents[CERES], newBag,
    'stale drain must not overwrite the active bag');
  assert.equal(state.world.residentSectors[CERES], recAfterEnter,
    'stale drain must not write resident metadata (rec object is replaced on write)');
  assert.equal(state.world.residentSectors[CERES].tier, RESIDENCY_TIER.FULL,
    'stale drain must not downgrade the active tier');

  // Everything the stale pass minted is released; nothing else was added or lost.
  const staleSpawnedSet = new Set(staleSpawned);
  const expectedAlive = [...aliveAfterEnter].filter((id) => !staleSpawnedSet.has(id)).sort((a, b) => a - b);
  assert.deepEqual(aliveIds(state).sort((a, b) => a - b), expectedAlive,
    'stale partials reclaimed and no extra bodies left behind');

  // No stale residency receipt: arrival-slice only fires when a live queue empties.
  assert.equal(residencyEvents.filter((p) => p.reason === 'arrival-slice').length, 0,
    'superseded drain must not emit the stale residency receipt');

  // The replacement queue is still pending for the live drain — its jobs were not stolen.
  assert.ok(world._pendingResidency.length >= 1);
  for (const job of world._pendingResidency) {
    assert.equal(job.world, state.world);
    assert.equal(job.enterEpoch, state.world.enterSerial);
  }
});

test('the live drain still runs a legitimate queue end to end', () => {
  const { state, bus, world } = bootWorld(777);
  state.world.sliceArrival = true;
  const residencyEvents = [];
  bus.on('world:residency', (p) => residencyEvents.push(p));

  world.enterSector(HELIOS);
  assert.ok(world._pendingResidency.length >= 1);
  const queued = world._pendingResidency.map((job) => job.sectorId);

  // Uninterrupted: drain one job per update tick exactly like the flight loop.
  while (world._pendingResidency.length) world.update(1 / 60, state);

  for (const sectorId of queued) {
    assert.equal(state.world.residentSectors[sectorId].tier, RESIDENCY_TIER.REDUCED);
    assert.ok(state.world.sectorContents[sectorId], 'neighbor bag materialized');
  }
  assert.equal(residencyEvents.filter((p) => p.reason === 'arrival-slice').length, 1,
    'a live queue emits its arrival-slice receipt exactly once');
});
