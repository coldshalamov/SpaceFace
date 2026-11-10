/**
 * Primary KPI: pirateParley.update quiet path.
 * Before = latch OFF (shipLike eligiblePlan/robberyEligibility census every tick).
 * After  = latch ON (skip when no toll squads / unresolved records).
 * Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const ITERS = 60000;
const RUNS = 11;
const SHIP_N = 48;

function runOnce(mode) {
  const script = `
import { performance } from 'node:perf_hooks';
import { createGameState } from './src/core/gameState.js';
import { createBus } from './src/core/eventBus.js';
import { core } from './src/core/coreSystem.js';
import {
  pirateParley,
  setPirateParleyEmptyQuietLatchForBench,
} from './src/systems/pirateParley.js';

const ITERS = ${ITERS};
const SHIP_N = ${SHIP_N};
const mode = ${JSON.stringify(mode)};

const state = createGameState(1511);
state.mode = 'flight';
state.tick = 0;
state.simTime = 0;
const bus = createBus();
const helpers = {};
core.init({ state, bus, helpers, registry: null });
const player = helpers.spawnEntity({
  type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
});
state.playerId = player.id;
const ships = [player];
for (let i = 0; i < SHIP_N; i++) {
  ships.push(helpers.spawnEntity({
    type: 'ship', pos: { x: 80 + i * 15, z: 40 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
    data: { ai: { passive: true } },
  }));
}
if (state.entityIndex) {
  state.entityIndex.ready = true;
  state.entityIndex.__spacefaceEntityIndexV1 = true;
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  state.entityIndex.version = 1;
}
pirateParley.init({ state, bus, helpers, registry: null });
setPirateParleyEmptyQuietLatchForBench(mode === 'after');

for (let i = 0; i < 60; i++) {
  state.tick++;
  pirateParley.update(1 / 60, state);
}
if (global.gc) global.gc();

const t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  state.tick++;
  if (mode === 'after' && pirateParley._parleyQuiet) {
    pirateParley._parleyQuiet.armedTick = state.tick;
  }
  pirateParley.update(1 / 60, state);
}
const ms = performance.now() - t0;
const quiet = !!(state.pirateParleyRuntime && state.pirateParleyRuntime.emptyQuietLatched);
console.log(JSON.stringify({
  ms, mode, quiet, hasQuiet: !!pirateParley._parleyQuiet,
  absUsPerCall: (ms * 1000) / ITERS,
}));
`;
  const r = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout.trim().split('\\n').pop());
}

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

function dirtyWakeProof() {
  const script = `
import { createGameState } from './src/core/gameState.js';
import { createBus } from './src/core/eventBus.js';
import { core } from './src/core/coreSystem.js';
import {
  pirateParley,
  setPirateParleyEmptyQuietLatchForBench,
} from './src/systems/pirateParley.js';

const state = createGameState(1512);
state.mode = 'flight';
state.tick = 0;
state.simTime = 0;
state.player = { cargo: { items: { cmdty_refined_metals: 12 } } };
const bus = createBus();
const helpers = {};
core.init({ state, bus, helpers, registry: null });
const player = helpers.spawnEntity({
  type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
});
state.playerId = player.id;
const ships = [player];
for (let i = 0; i < 24; i++) {
  ships.push(helpers.spawnEntity({
    type: 'ship', pos: { x: 80 + i * 15, z: 40 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
    data: { ai: { passive: true } },
  }));
}
if (state.entityIndex) {
  state.entityIndex.ready = true;
  state.entityIndex.__spacefaceEntityIndexV1 = true;
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  state.entityIndex.version = 1;
}
pirateParley.init({ state, bus, helpers, registry: null });
setPirateParleyEmptyQuietLatchForBench(true);
for (let i = 0; i < 5; i++) {
  state.tick++;
  pirateParley.update(1 / 60, state);
}
const latched = !!(state.pirateParleyRuntime && state.pirateParleyRuntime.emptyQuietLatched);

const toll = helpers.spawnEntity({
  type: 'ship', pos: { x: 400, z: 400 }, vel: { x: 0, z: 0 },
  radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 1,
  factionId: 'faction_reach',
  data: {
    ai: {
      doctrine: 'toll',
      motive: 'cargo_extortion',
      squadId: 'sq-toll-wake',
      passive: false,
    },
  },
});
ships.push(toll);
if (state.entityIndex) {
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  state.entityIndex.version = (state.entityIndex.version | 0) + 1;
}
pirateParley.noteParleyWake();
state.tick++;
pirateParley.update(1 / 60, state);
const afterLatched = !!(state.pirateParleyRuntime && state.pirateParleyRuntime.emptyQuietLatched);
const squads = state.pirateParley && state.pirateParley.squads || {};
const started = Object.keys(squads).some((id) => squads[id] && squads[id].phase === 'scan');
console.log(JSON.stringify({
  ok: latched && !afterLatched && started,
  latched, afterLatched, started,
  squadIds: Object.keys(squads),
}));
`;
  const r = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout.trim().split('\\n').pop());
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    speedup: before.ms / after.ms,
    beforeAbsUs: before.absUsPerCall,
    afterAbsUs: after.absUsPerCall,
    afterQuiet: after.quiet,
  });
}
const speedups = pairs.map((p) => p.speedup);
const dirtyWake = dirtyWakeProof();
const out = {
  name: 'pirate-parley-empty-quiet-latch',
  primary: 'quiet-pirate-parley-empty-shipLike-census',
  iterations: ITERS,
  shipN: SHIP_N,
  runs: RUNS,
  medianSpeedup: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
  medianBeforeAbsUs: median(pairs.map((p) => p.beforeAbsUs)),
  medianAfterAbsUs: median(pairs.map((p) => p.afterAbsUs)),
  dirtyWake,
  pairs,
};
writeFileSync(process.argv[2] || 'pirate-parley-empty-quiet-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  medianSpeedup: out.medianSpeedup,
  minSpeedup: out.minSpeedup,
  medianBeforeAbsUs: out.medianBeforeAbsUs,
  dirtyWakeOk: dirtyWake.ok,
}, null, 2));
