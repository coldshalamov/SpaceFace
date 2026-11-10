/**
 * Primary KPI: quiet barkDirector.update (no eligible bark/hail/near-miss/stunt).
 * Before = latch OFF; After = latch ON. Soft-GPU fps not claimed.
 */
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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
  barkDirector,
  setBarkDirectorQuietLatchForBench,
} from './src/systems/barkDirector.js';

const ITERS = ${ITERS};
const SHIP_N = ${SHIP_N};
const mode = ${JSON.stringify(mode)};

const state = createGameState(1534);
state.mode = 'flight';
state.tick = 0;
state.simTime = 0;
state.meta = state.meta || {};
state.meta.seed = 1534;
const bus = createBus();
const helpers = { voice: { say() { return false; } } };
core.init({ state, bus, helpers, registry: null });
const player = helpers.spawnEntity({
  type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 80, z: 0 },
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
    data: { ai: { passive: true, fsm: 'idle' } },
  }));
}
if (state.entityIndex) {
  state.entityIndex.ready = true;
  state.entityIndex.__spacefaceEntityIndexV1 = true;
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  state.entityIndex.version = 1;
}
const system = Object.assign({}, barkDirector);
system.init({ state, bus, helpers, registry: null });
setBarkDirectorQuietLatchForBench(mode === 'after');

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
  const beforeLatched = !!state.barkDirectorRuntime?.quietLatched;
  system.update(1 / 60, state);
  if (mode === 'after' && beforeLatched && state.barkDirectorRuntime?.quietLatched) skips++;
}
const ms = performance.now() - t0;
const us = (ms * 1000) / ITERS;
console.log(JSON.stringify({
  mode,
  ms: +ms.toFixed(3),
  usPerCall: +us.toFixed(4),
  skips,
  latched: !!state.barkDirectorRuntime?.quietLatched,
}));
`;
  const r = spawnSync(process.execPath, ['--expose-gc'], {
    input: script,
    encoding: 'utf8',
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`child failed (${mode}): ${r.stderr || r.stdout}`);
  }
  const line = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[(s.length - 1) >> 1];
}

const pairs = [];
const befores = [];
const afters = [];
for (let i = 0; i < RUNS; i++) {
  const b = runOnce('before');
  const a = runOnce('after');
  befores.push(b.usPerCall);
  afters.push(a.usPerCall);
  pairs.push(b.usPerCall / Math.max(1e-9, a.usPerCall));
  console.error(`run ${i}: before=${b.usPerCall} after=${a.usPerCall} x=${(b.usPerCall / a.usPerCall).toFixed(3)} latched=${a.latched} skips=${a.skips}`);
}

// Dirty-wake check in-process
const wakeScript = `
import { createGameState } from './src/core/gameState.js';
import { createBus } from './src/core/eventBus.js';
import { core } from './src/core/coreSystem.js';
import { barkDirector, setBarkDirectorQuietLatchForBench } from './src/systems/barkDirector.js';
const state = createGameState(1535);
state.mode = 'flight'; state.tick = 0; state.simTime = 0;
state.meta = { seed: 1535 };
const bus = createBus();
let said = 0;
const helpers = { voice: { say() { said++; return true; } } };
core.init({ state, bus, helpers, registry: null });
const player = helpers.spawnEntity({
  type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 80, z: 0 },
  radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
});
state.playerId = player.id;
const ships = [player];
for (let i = 0; i < 24; i++) {
  ships.push(helpers.spawnEntity({
    type: 'ship', pos: { x: 800 + i * 40, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 0,
    data: { ai: { passive: true, fsm: 'idle' } },
  }));
}
if (state.entityIndex) {
  state.entityIndex.ready = true;
  state.entityIndex.__spacefaceEntityIndexV1 = true;
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  state.entityIndex.version = 1;
}
const system = Object.assign({}, barkDirector);
system.init({ state, bus, helpers, registry: null });
setBarkDirectorQuietLatchForBench(true);
for (let i = 0; i < 10; i++) { state.tick++; state.simTime += 1/60; system.update(1/60, state); }
const armed = !!state.barkDirectorRuntime?.quietLatched;
const foe = helpers.spawnEntity({
  type: 'ship', pos: { x: 120, z: 0 }, vel: { x: -10, z: 0 },
  radius: 12, mass: 60, hull: 80, hullMax: 80, collides: true, team: 1,
  data: {
    ai: { fsm: 'attack', forcePlayerTarget: true },
    combat: { targetId: player.id, lockTarget: player.id },
    factionId: 'faction_reach',
  },
});
ships.push(foe);
state.entityIndex.ships = ships;
state.entityIndex.shipLike = ships;
state.entityIndex.version++;
system.noteBarkWake();
state.tick++; state.simTime += 1/60; system.update(1/60, state);
console.log(JSON.stringify({
  dirtyWakeOk: armed && state.barkDirectorRuntime?.quietLatched === false && said > 0,
  armed, said, latchedAfter: !!state.barkDirectorRuntime?.quietLatched,
}));
`;
const wake = spawnSync(process.execPath, ['--expose-gc'], {
  input: wakeScript, encoding: 'utf8', cwd: process.cwd(), env: process.env,
});
if (wake.status !== 0) throw new Error(wake.stderr || wake.stdout);
const dirty = JSON.parse((wake.stdout || '').trim().split('\n').filter(Boolean).pop());

const out = {
  name: 'bark-director-quiet-latch',
  iters: ITERS,
  runs: RUNS,
  medianSpeedup: +median(pairs).toFixed(3),
  minSpeedup: +Math.min(...pairs).toFixed(3),
  maxSpeedup: +Math.max(...pairs).toFixed(3),
  medianBeforeUs: +median(befores).toFixed(3),
  medianAfterUs: +median(afters).toFixed(3),
  pairs: pairs.map((x) => +x.toFixed(3)),
  dirtyWake: dirty,
};
writeFileSync('artifacts/bark-director-quiet-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
