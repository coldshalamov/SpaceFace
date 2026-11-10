/**
 * Portable A/B: farActor careful empty-far+no-virt quiet latch.
 * Soft-GPU fps not claimed. Picture contract ON (unchanged).
 *
 * Before = latch OFF (always shelve-candidate walk).
 * After  = latch ON (skip walk when far empty + no virt after probe).
 * Dirty-wake: membership bump clears latch window.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { SIM_TIER } from '../src/world/activityClassification.js';
import {
  tickFarActors,
  setFarEmptyQuietLatchForBench,
  getFarEmptyQuietLatchForBench,
  insertFarActor,
  ensureFarActorTable,
} from '../src/world/farActorTable.js';

const ITERS = 60000;
const RUNS = 11;
const WARM = 2000;

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[(s.length - 1) >> 1];
}

function bootQuietFleet(opts = {}) {
  const state = createGameState(42);
  state.mode = 'flight';
  state.meta.seed = 42;
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

  const n = opts.ships || 48;
  for (let i = 1; i < n; i++) {
    const far = !!opts.farTier && i > 8;
    const ent = helpers.spawnEntity({
      type: i % 13 === 0 ? 'wreck' : 'ship',
      pos: { x: 80 + i * 40, z: i * 17 },
      radius: 8,
      mass: 20,
      hull: 80,
      hullMax: 80,
      collides: true,
      data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
    });
    ent.activity = {
      simTier: far ? SIM_TIER.S3_DORMANT : (i < 4 ? SIM_TIER.S0_EXACT : SIM_TIER.S1_NEAR),
      pinnedExact: i < 2,
    };
  }

  if (opts.seedFarRows) {
    ensureFarActorTable(state);
    const ghost = helpers.spawnEntity({
      type: 'ship',
      pos: { x: 5000, z: 5000 },
      radius: 8,
      mass: 20,
      hull: 80,
      hullMax: 80,
      collides: true,
      data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
    });
    ghost.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
    insertFarActor(state, ghost, state.simTime || 0);
    helpers.removeEntity(ghost.id, { immediate: true, reason: 'virtualize' });
  }

  // Ensure typed index ready so membership versioning works.
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    if (!Number.isFinite(state.entityIndex.version)) state.entityIndex.version = 1;
  }
  return { state, helpers, bus };
}

function benchPair(label, build) {
  const pairs = [];
  for (let r = 0; r < RUNS; r++) {
    // OFF
    setFarEmptyQuietLatchForBench(false);
    const off = build();
    for (let i = 0; i < WARM; i++) {
      off.state.tick++;
      tickFarActors(off.state, off.helpers, off.bus);
    }
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      off.state.tick++;
      tickFarActors(off.state, off.helpers, off.bus);
    }
    const b = performance.now() - t0;

    // ON
    setFarEmptyQuietLatchForBench(true);
    const on = build();
    for (let i = 0; i < WARM; i++) {
      on.state.tick++;
      tickFarActors(on.state, on.helpers, on.bus);
    }
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      on.state.tick++;
      tickFarActors(on.state, on.helpers, on.bus);
    }
    const a = performance.now() - t1;
    pairs.push(b / Math.max(1e-9, a));
  }
  return {
    label,
    medianSpeedup: +median(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
    pairs: pairs.map((x) => +x.toFixed(3)),
  };
}

function dirtyWakeProof() {
  setFarEmptyQuietLatchForBench(true);
  const { state, helpers, bus } = bootQuietFleet({ ships: 32 });
  for (let i = 0; i < 5; i++) {
    state.tick++;
    tickFarActors(state, helpers, bus);
  }
  const latched = !!(state.world && state.world.farActorsRuntime && state.world.farActorsRuntime.quietLatched);
  const armed = tickFarActors._quiet && tickFarActors._quiet.armedTick;
  state.entityIndex.version++;
  state.tick++;
  tickFarActors(state, helpers, bus);
  const after = tickFarActors._quiet && tickFarActors._quiet.armedTick;
  return {
    latchedBeforeBump: latched,
    armedBefore: armed,
    armedAfterBump: after,
    woke: after !== armed,
    membershipAfter: tickFarActors._quiet && tickFarActors._quiet.membership,
  };
}

const result = {
  latchDefault: getFarEmptyQuietLatchForBench(),
  quietEmptyFarNoVirt: benchPair('quiet-empty-far-no-virt', () => bootQuietFleet({ ships: 48 })),
  withFarRows: benchPair('with-far-rows-restore-live', () => bootQuietFleet({ ships: 48, seedFarRows: true })),
  hasVirtCandidates: benchPair('has-virt-candidates', () => bootQuietFleet({ ships: 48, farTier: true })),
  dirtyWake: dirtyWakeProof(),
  iters: ITERS,
  runs: RUNS,
};
console.log(JSON.stringify(result, null, 2));
writeFileSync('artifacts/far-empty-quiet-latch-microbench.json', JSON.stringify(result, null, 2));
