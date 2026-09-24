/**
 * Primary KPI: quiet flybyFocus.update when no closing hostiles (full path).
 * Before = latch OFF (shipLike + pickFlybyTarget every tick).
 * After  = latch ON (short-circuit after arm).
 * Soft-GPU fps not claimed. Isolated Node --expose-gc children.
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
  flybyFocus,
  setFlybyFocusEmptyQuietLatchForBench,
} from './src/systems/flybyFocus.js';

const ITERS = ${ITERS};
const SHIP_N = ${SHIP_N};
const mode = ${JSON.stringify(mode)};

const state = createGameState(1524);
state.mode = 'flight';
state.tick = 0;
state.simTime = 0;
const bus = createBus();
const helpers = {};
core.init({ state, bus, helpers, registry: null });
const player = helpers.spawnEntity({
  type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 },
  radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
});
state.playerId = player.id;
const ships = [player];
for (let i = 0; i < SHIP_N; i++) {
  ships.push(helpers.spawnEntity({
    type: 'ship',
    pos: { x: 800 + i * 40, z: i * 20 },
    vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 0,
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
const system = Object.assign({}, flybyFocus);
system.init({ state, bus, helpers, registry: null });
setFlybyFocusEmptyQuietLatchForBench(mode === 'after');

// Warm + arm latch (after) / steady state (before)
for (let i = 0; i < 2000; i++) {
  state.tick++;
  state.simTime += 1 / 60;
  system.update(1 / 60, state);
}
if (global.gc) global.gc();

let skips = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  state.tick++;
  state.simTime += 1 / 60;
  const beforeLatched = !!state.flybyFocusRuntime?.emptyQuietLatched;
  system.update(1 / 60, state);
  if (mode === 'after' && beforeLatched && state.flybyFocusRuntime?.emptyQuietLatched) skips++;
}
const ms = performance.now() - t0;
console.log(JSON.stringify({
  ms,
  usPerCall: ms * 1000 / ITERS,
  skips,
  latched: !!state.flybyFocusRuntime?.emptyQuietLatched,
  active: !!state.player?.flybyFocus?.active,
  mode,
}));
`;
  const r = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'child failed');
  const line = r.stdout.trim().split('\n').pop();
  return JSON.parse(line);
}

function median(xs) {
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
}

function dirtyWake() {
  const script = `
import { createGameState } from './src/core/gameState.js';
import { createBus } from './src/core/eventBus.js';
import { core } from './src/core/coreSystem.js';
import {
  flybyFocus,
  setFlybyFocusEmptyQuietLatchForBench,
} from './src/systems/flybyFocus.js';

const state = createGameState(1525);
state.mode = 'flight'; state.tick = 0; state.simTime = 0;
const bus = createBus(); const helpers = {};
core.init({ state, bus, helpers, registry: null });
const player = helpers.spawnEntity({
  type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 },
  radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
});
state.playerId = player.id;
const ships = [player];
for (let i = 0; i < 24; i++) {
  ships.push(helpers.spawnEntity({
    type: 'ship', pos: { x: 900 + i * 30, z: 40 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 0,
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
const system = Object.assign({}, flybyFocus);
system.init({ state, bus, helpers, registry: null });
setFlybyFocusEmptyQuietLatchForBench(true);
for (let i = 0; i < 10; i++) {
  state.tick++; state.simTime += 1/60; system.update(1/60, state);
}
const armed = !!state.flybyFocusRuntime?.emptyQuietLatched;
const foe = helpers.spawnEntity({
  type: 'ship', pos: { x: 160, z: 0 }, vel: { x: -20, z: 0 },
  radius: 12, mass: 60, hull: 80, hullMax: 80, collides: true, team: 1,
  data: {
    ai: { archetype: 'pirate' },
    combat: { targetId: player.id },
    weapons: [{ id: 'wpn_test' }],
  },
});
ships.push(foe);
if (state.entityIndex) {
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  state.entityIndex.version = (state.entityIndex.version | 0) + 1;
}
system.noteFlybyWake();
state.tick++; state.simTime += 1/60; system.update(1/60, state);
console.log(JSON.stringify({
  ok: armed && state.flybyFocusRuntime?.emptyQuietLatched === false && state.player.flybyFocus.active === true
    && state.player.flybyFocus.targetId === foe.id,
  armed,
  afterLatched: !!state.flybyFocusRuntime?.emptyQuietLatched,
  active: !!state.player.flybyFocus.active,
  targetId: state.player.flybyFocus.targetId,
  foeId: foe.id,
}));
`;
  const r = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'wake failed');
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = runOnce('before');
  const a = runOnce('after');
  pairs.push({
    beforeMs: b.ms,
    afterMs: a.ms,
    speedup: b.ms / a.ms,
    beforeUs: b.usPerCall,
    afterUs: a.usPerCall,
    afterSkips: a.skips,
  });
}
const speedups = pairs.map((p) => p.speedup);
const beforeUs = pairs.map((p) => p.beforeUs);
const out = {
  name: 'flyby-focus-empty-quiet-latch',
  primary: 'quiet-flybyFocus-update-no-closing-hostiles',
  iterations: ITERS,
  shipN: SHIP_N,
  runs: RUNS,
  pairs,
  median: median(speedups),
  minSpeedup: Math.min(...speedups),
  maxSpeedup: Math.max(...speedups),
  absBeforeUsMedian: median(beforeUs),
  dirtyWake: dirtyWake(),
};
writeFileSync('artifacts/flyby-focus-empty-quiet-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  median: out.median,
  min: out.minSpeedup,
  max: out.maxSpeedup,
  absBeforeUsMedian: out.absBeforeUsMedian,
  dirtyWake: out.dirtyWake,
}, null, 2));
