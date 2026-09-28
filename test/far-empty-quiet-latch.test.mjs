import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { SIM_TIER, NEAR_EXIT_PAD_WU } from '../src/world/activityClassification.js';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';
import {
  tickFarActors,
  setFarEmptyQuietLatchForBench,
  getFarEmptyQuietLatchForBench,
  insertFarActor,
  ensureFarActorTable,
  getFarActor,
  farActorCensus,
} from '../src/world/farActorTable.js';

function boot(opts = {}) {
  const state = createGameState(opts.seed || 21);
  state.mode = 'flight';
  state.meta.seed = opts.seed || 21;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.activity = { simTier: SIM_TIER.S0_EXACT, pinnedExact: true };
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    if (!Number.isFinite(state.entityIndex.version)) state.entityIndex.version = 1;
  }
  return { state, bus, helpers, player };
}

function step(state, helpers, bus) {
  state.tick = (state.tick | 0) + 1;
  state.simTime = (state.simTime || 0) + 1 / 60;
  return tickFarActors(state, helpers, bus);
}

test('quiet latch engages when far empty and no virt candidates', () => {
  setFarEmptyQuietLatchForBench(true);
  assert.equal(getFarEmptyQuietLatchForBench(), true);
  const { state, helpers, bus } = boot();
  // Nearby S1 ships only — not virtualizable.
  for (let i = 0; i < 6; i++) {
    const e = helpers.spawnEntity({
      type: 'ship',
      pos: { x: 40 + i * 20, z: 10 },
      radius: 8, mass: 20, hull: 80, hullMax: 80, collides: true,
      data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
    });
    e.activity = { simTier: SIM_TIER.S1_NEAR, pinnedExact: false };
  }
  ensureActivityClassified(state);
  const r1 = step(state, helpers, bus);
  assert.equal(r1.shelved, 0);
  assert.equal(state.world.farActorsRuntime.quietLatched, true);
  assert.ok(tickFarActors._quiet);
  const r2 = step(state, helpers, bus);
  assert.equal(r2.shelved, 0);
  assert.equal(state.world.farActorsRuntime.quietLatched, true);
});

test('membership bump wakes empty quiet latch', () => {
  setFarEmptyQuietLatchForBench(true);
  const { state, helpers, bus } = boot();
  step(state, helpers, bus);
  assert.equal(state.world.farActorsRuntime.quietLatched, true);
  const armed = tickFarActors._quiet.armedTick;
  state.entityIndex.version++;
  step(state, helpers, bus);
  assert.equal(state.world.farActorsRuntime.quietLatched, true);
  assert.notEqual(tickFarActors._quiet.armedTick, armed);
  assert.equal(tickFarActors._quiet.membership, state.entityIndex.version);
});

test('bench toggle off refuses latch', () => {
  setFarEmptyQuietLatchForBench(false);
  const { state, helpers, bus } = boot();
  step(state, helpers, bus);
  assert.equal(!!(state.world && state.world.farActorsRuntime && state.world.farActorsRuntime.quietLatched), false);
  assert.equal(tickFarActors._quiet, null);
  setFarEmptyQuietLatchForBench(true);
});

test('far rows present never skip restore path', () => {
  setFarEmptyQuietLatchForBench(true);
  const { state, helpers, bus, player } = boot();
  // Seed a shelved far row far away, then move player onto it.
  const ghost = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 8000, z: 0 },
    radius: 8, mass: 20, hull: 80, hullMax: 80, collides: true,
    data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
  });
  ghost.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  ensureFarActorTable(state);
  const rec = insertFarActor(state, ghost, state.simTime || 0);
  helpers.removeEntity(ghost.id, { immediate: true, reason: 'virtualize' });
  assert.ok(getFarActor(state, rec.id));

  // Latch must not arm while rows exist.
  step(state, helpers, bus);
  assert.equal(!!(state.world.farActorsRuntime && state.world.farActorsRuntime.quietLatched), false);
  assert.equal(tickFarActors._quiet, null);

  // Approach — restore must fire.
  player.pos.x = 8000;
  player.pos.z = 0;
  const before = farActorCensus(state).farActors;
  assert.ok(before >= 1);
  const result = step(state, helpers, bus);
  assert.ok(result.restored >= 1, `expected restore, got ${JSON.stringify(result)}`);
  assert.equal(getFarActor(state, rec.id), null);
});

test('dormant far ship still shelves when latch off-window', () => {
  setFarEmptyQuietLatchForBench(true);
  const { state, helpers, bus, player } = boot();
  const exit = NEAR_EXIT_PAD_WU + 4000;
  const ship = helpers.spawnEntity({
    type: 'ship',
    pos: { x: exit, z: 0 },
    radius: 8, mass: 20, hull: 80, hullMax: 80, collides: true,
    data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
  });
  ship.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  ensureActivityClassified(state);
  // First tick probes and shelves (virtSeen > 0 → no latch).
  const r = step(state, helpers, bus);
  assert.ok(r.shelved >= 1);
  assert.equal(!!(state.world.farActorsRuntime && state.world.farActorsRuntime.quietLatched), false);
  assert.ok(getFarActor(state, ship.id));
  void player;
});

test('rescan clears latch after window', () => {
  setFarEmptyQuietLatchForBench(true);
  const { state, helpers, bus } = boot();
  step(state, helpers, bus);
  assert.equal(state.world.farActorsRuntime.quietLatched, true);
  const armed = tickFarActors._quiet.armedTick;
  // Advance past 30-tick rescan without membership bump.
  for (let i = 0; i < 31; i++) step(state, helpers, bus);
  assert.equal(state.world.farActorsRuntime.quietLatched, true);
  assert.notEqual(tickFarActors._quiet.armedTick, armed);
});
