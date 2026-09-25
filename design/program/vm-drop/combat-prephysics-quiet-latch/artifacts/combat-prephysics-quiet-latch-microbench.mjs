/**
 * Primary KPI: quiet combat kernel prePhysics (actions.update) on idle roster.
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
import { actions } from './src/systems/actions.js';
import {
  setCombatPrePhysicsQuietLatchForBench,
} from './src/combat/kernel.js';

const ITERS = ${ITERS};
const SHIP_N = ${SHIP_N};
const mode = ${JSON.stringify(mode)};

const state = createGameState(1544);
state.mode = 'flight';
state.tick = 0;
state.simTime = 0;
state.meta = { seed: 1544 };
state.runtime = { profileId: 'production' };
const bus = createBus();
const helpers = {};
core.init({ state, bus, helpers, registry: null });
const player = helpers.spawnEntity({
  type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 80, z: 0 },
  radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
});
state.playerId = player.id;
player.isPlayer = true;
const ships = [player];
for (let i = 0; i < SHIP_N; i++) {
  const e = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 600 + i * 35, z: (i % 7) * 40 },
    vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 0,
    data: { ai: { passive: true } },
  });
  e.physicsSleeping = true;
  ships.push(e);
}
if (state.entityIndex) {
  state.entityIndex.ready = true;
  state.entityIndex.__spacefaceEntityIndexV1 = true;
  state.entityIndex.ships = ships;
  state.entityIndex.shipLike = ships;
  state.entityIndex.version = 1;
}
const system = Object.assign({}, actions);
system.init({ state, bus, helpers, registry: null });
setCombatPrePhysicsQuietLatchForBench(mode === 'after');

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
  const beforeLatched = !!state.combatRuntime?.quietLatched;
  system.update(1 / 60, state);
  if (mode === 'after' && beforeLatched && state.combatRuntime?.quietLatched) skips++;
}
const ms = performance.now() - t0;
const us = (ms * 1000) / ITERS;
console.log(JSON.stringify({
  mode,
  ms: +ms.toFixed(3),
  usPerCall: +us.toFixed(4),
  skips,
  latched: !!state.combatRuntime?.quietLatched,
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
  const line = (r.stdout || '').trim().split('\\n').filter(Boolean).pop();
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

const wakeScript = `
import { createGameState } from './src/core/gameState.js';
import { createBus } from './src/core/eventBus.js';
import { core } from './src/core/coreSystem.js';
import { actions } from './src/systems/actions.js';
import { setCombatPrePhysicsQuietLatchForBench } from './src/combat/kernel.js';

const state = createGameState(1545);
state.mode = 'flight';
state.tick = 0;
state.simTime = 0;
state.meta = { seed: 1545 };
state.runtime = { profileId: 'production' };
const bus = createBus();
const helpers = {};
core.init({ state, bus, helpers, registry: null });
const player = helpers.spawnEntity({
  type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 0, data: {},
});
state.playerId = player.id;
const target = helpers.spawnEntity({
  type: 'ship', pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 },
  radius: 8, mass: 12, hull: 80, hullMax: 80, collides: true, team: 2,
  data: { ai: { passive: true } },
});
if (state.entityIndex) {
  state.entityIndex.ready = true;
  state.entityIndex.__spacefaceEntityIndexV1 = true;
  state.entityIndex.ships = [player, target];
  state.entityIndex.shipLike = [player, target];
  state.entityIndex.version = 1;
}
const system = Object.assign({}, actions);
system.init({ state, bus, helpers, registry: null });
setCombatPrePhysicsQuietLatchForBench(true);
for (let i = 0; i < 30; i++) {
  state.tick++; state.simTime += 1/60; system.update(1/60, state);
}
const latchedBefore = !!state.combatRuntime?.quietLatched;
helpers.routeCombatDamage({
  attackerId: player.id,
  targetId: target.id,
  packet: { channels: { kinetic: 5 }, heat: 8 },
});
const latchedAfterDamage = !!state.combatRuntime?.quietLatched;
state.tick++; state.simTime += 1/60; system.update(1/60, state);
const latchedAfterStep = !!state.combatRuntime?.quietLatched;
const key = String(target.id);
const rt = state.combat?.entities?.[key];
const heat = rt ? rt.heat : null;
console.log(JSON.stringify({
  dirtyWakeOk: latchedBefore === true && latchedAfterDamage === false && heat > 0,
  latchedBefore, latchedAfterDamage, latchedAfterStep, heat,
}));
`;

const wake = spawnSync(process.execPath, ['--expose-gc'], {
  input: wakeScript,
  encoding: 'utf8',
  cwd: process.cwd(),
  env: process.env,
  maxBuffer: 10 * 1024 * 1024,
});
if (wake.status !== 0) throw new Error(`wake failed: ${wake.stderr || wake.stdout}`);
const wakeLine = (wake.stdout || '').trim().split('\\n').filter(Boolean).pop();
const wakeResult = JSON.parse(wakeLine);

const out = {
  name: 'combat-prephysics-quiet-latch',
  iters: ITERS,
  runs: RUNS,
  shipN: SHIP_N,
  medianSpeedup: +median(pairs).toFixed(3),
  minSpeedup: +Math.min(...pairs).toFixed(3),
  maxSpeedup: +Math.max(...pairs).toFixed(3),
  absBeforeUs: +median(befores).toFixed(3),
  absAfterUs: +median(afters).toFixed(3),
  pairs,
  befores,
  afters,
  dirtyWake: wakeResult,
};
writeFileSync('artifacts/combat-prephysics-quiet-latch-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
