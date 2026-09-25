/**
 * Primary KPI: quiet combat kernel postPhysics residual after #154 prePhysics latch.
 * Before = postPhysics skip OFF (still walks ensure+sync); After = skip ON.
 * PrePhysics latch stays ON both arms (fair residual after #154).
 * Soft-GPU fps not claimed.
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
  getCombatKernel,
  setCombatPrePhysicsQuietLatchForBench,
  setCombatPostPhysicsQuietSkipForBench,
} from './src/combat/kernel.js';

const ITERS = ${ITERS};
const SHIP_N = ${SHIP_N};
const mode = ${JSON.stringify(mode)};

const state = createGameState(1554);
state.mode = 'flight';
state.tick = 0;
state.simTime = 0;
state.meta = { seed: 1554 };
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
const ctx = { state, bus, helpers, registry: null };
const system = Object.assign({}, actions);
system.init(ctx);
const kernel = getCombatKernel(ctx);
setCombatPrePhysicsQuietLatchForBench(true);
setCombatPostPhysicsQuietSkipForBench(mode === 'after');

for (let i = 0; i < 2000; i++) {
  state.tick++;
  state.simTime += 1 / 60;
  system.update(1 / 60, state);
  kernel.postPhysics();
}
if (global.gc) global.gc();

let skips = 0;
const t0 = performance.now();
for (let i = 0; i < ITERS; i++) {
  state.tick++;
  state.simTime += 1 / 60;
  system.update(1 / 60, state);
  const beforeSkip = !!state.combatRuntime?.postPhysicsQuietSkipped;
  kernel.postPhysics();
  if (mode === 'after' && state.combatRuntime?.postPhysicsQuietSkipped) skips++;
}
const ms = performance.now() - t0;
const us = (ms * 1000) / ITERS;

// dirty wake check (after mode only)
let dirtyWakeOk = null;
if (mode === 'after') {
  const target = ships[1];
  helpers.routeCombatDamage({
    attackerId: state.playerId,
    targetId: target.id,
    packet: { channels: { kinetic: 1 }, heat: 3 },
  });
  dirtyWakeOk = state.combatRuntime?.postPhysicsQuietSkipped === false
    && state.combatRuntime?.quietLatched === false;
}

console.log(JSON.stringify({
  mode,
  ms,
  usPerCall: us,
  skips,
  latched: !!state.combatRuntime?.quietLatched,
  postSkip: !!state.combatRuntime?.postPhysicsQuietSkipped,
  dirtyWakeOk,
}));
`;
  const r = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`child failed (${mode}): ${r.stderr || r.stdout}`);
  }
  const line = r.stdout.trim().split('\n').filter(Boolean).pop();
  return JSON.parse(line);
}

const pairs = [];
let dirtyWakeOk = null;
for (let i = 0; i < RUNS; i++) {
  const before = runOnce('before');
  const after = runOnce('after');
  if (after.dirtyWakeOk != null) dirtyWakeOk = after.dirtyWakeOk;
  const speedup = before.usPerCall / after.usPerCall;
  pairs.push({
    beforeMs: before.ms,
    afterMs: after.ms,
    beforeUs: before.usPerCall,
    afterUs: after.usPerCall,
    speedup,
    skips: after.skips,
  });
  console.error(`pair ${i + 1}: ${speedup.toFixed(3)}×  before=${before.usPerCall.toFixed(3)}µs after=${after.usPerCall.toFixed(3)}µs`);
}

const speedups = pairs.map((p) => p.speedup).sort((a, b) => a - b);
const mid = speedups[Math.floor(speedups.length / 2)];
const absBefore = pairs.map((p) => p.beforeUs).sort((a, b) => a - b);
const absAfter = pairs.map((p) => p.afterUs).sort((a, b) => a - b);
const out = {
  label: 'combat-postphysics-quiet-skip',
  primary: 'quiet-48-combatant-postphysics-residual-after-154',
  iterations: ITERS,
  runs: RUNS,
  ships: SHIP_N + 1,
  pairs,
  medianSpeedup: mid,
  minSpeedup: speedups[0],
  maxSpeedup: speedups[speedups.length - 1],
  absBeforeUsMedian: absBefore[Math.floor(absBefore.length / 2)],
  absAfterUsMedian: absAfter[Math.floor(absAfter.length / 2)],
  dirtyWakeOk,
  note: 'Before=postPhysics ensure+sync walk every tick (prePhysics latch ON). After=skip walk while quiet latch armed. Soft-GPU fps not claimed.',
};
writeFileSync('artifacts/combat-postphysics-quiet-skip-microbench.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  medianSpeedup: out.medianSpeedup,
  minSpeedup: out.minSpeedup,
  maxSpeedup: out.maxSpeedup,
  absBeforeUsMedian: out.absBeforeUsMedian,
  absAfterUsMedian: out.absAfterUsMedian,
  dirtyWakeOk: out.dirtyWakeOk,
}, null, 2));
