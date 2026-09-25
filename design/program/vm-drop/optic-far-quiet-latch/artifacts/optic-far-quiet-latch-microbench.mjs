/**
 * Primary KPI: tickOpticFieldRocks on quiet Ceres-shaped field with far optic gallery.
 * Before = latch OFF (query + entityList optic scan every tick).
 * After  = latch ON (skip after empty-interest probe; wake on version/membership/move/rescan).
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  tickOpticFieldRocks,
  setOpticFarQuietLatchForBench,
  insertAsteroidFieldRock,
  ensureAsteroidField,
} from '../src/world/asteroidField.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const mode = process.argv[2] || 'all';

const ITERS = 60000;
const RUNS = 11;
const NON_OPTIC = 280;
const FAR_OPTIC = 40;

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.meta.seed = 4242;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 8,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.maxSpeed = 160;
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    if (!Number.isFinite(state.entityIndex.version)) state.entityIndex.version = 1;
  }
  ensureAsteroidField(state);
  for (let i = 0; i < NON_OPTIC; i++) {
    const a = (i / NON_OPTIC) * Math.PI * 2;
    const r = 80 + (i % 17) * 55;
    insertAsteroidFieldRock(state, {
      pos: { x: Math.cos(a) * r, z: Math.sin(a) * r },
      radius: 10 + (i % 5),
      data: { typeId: 'ast_common_rock', fieldId: 'f_quiet' },
    });
  }
  for (let i = 0; i < FAR_OPTIC; i++) {
    insertAsteroidFieldRock(state, {
      pos: { x: 4800 + (i % 8) * 40, z: 4600 + Math.floor(i / 8) * 40 },
      radius: 14,
      data: { opticMaterial: 'diamond', opticStructureId: 'far_gallery' },
    });
  }
  return { state, helpers };
}

function walk(latchOn) {
  setOpticFarQuietLatchForBench(latchOn);
  tickOpticFieldRocks._quiet = null;
  const { state, helpers } = boot();
  for (let i = 0; i < 5; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + 1 / 60;
    tickOpticFieldRocks(state, helpers);
  }
  const t0 = performance.now();
  let promoted = 0;
  for (let i = 0; i < ITERS; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + 1 / 60;
    const r = tickOpticFieldRocks(state, helpers);
    promoted += r.promoted;
  }
  const ms = performance.now() - t0;
  return {
    ms,
    promoted,
    latched: !!(state.world && state.world.opticFieldRuntime && state.world.opticFieldRuntime.quietLatched),
    fieldRocks: state.world.asteroidField.rocks.length,
  };
}

function bench(which) {
  const latchOn = which === 'after';
  const times = [];
  let last = null;
  for (let r = 0; r < RUNS; r++) {
    last = walk(latchOn);
    times.push(last.ms);
  }
  times.sort((a, b) => a - b);
  return {
    med: times[(times.length / 2) | 0],
    min: times[0],
    max: times[times.length - 1],
    times,
    last,
  };
}

function isolated(which) {
  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url), which], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`isolated ${which} failed: ${res.stderr || res.stdout}`);
  }
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

if (mode === 'before' || mode === 'after') {
  const r = bench(mode);
  console.log(JSON.stringify({
    which: mode,
    med: r.med,
    min: r.min,
    max: r.max,
    times: r.times,
    last: r.last,
  }));
  process.exit(0);
}

const pairs = [];
for (let i = 0; i < 11; i++) {
  const before = isolated('before');
  const after = isolated('after');
  const speedup = before.med / Math.max(1e-9, after.med);
  pairs.push({ before: before.med, after: after.med, speedup });
  console.error(`pair ${i}: ${speedup.toFixed(3)}× (before ${before.med.toFixed(1)} / after ${after.med.toFixed(1)}) latched=${after.last?.latched}`);
}
pairs.sort((a, b) => a.speedup - b.speedup);
const med = pairs[(pairs.length / 2) | 0];
const minSpeedup = pairs[0].speedup;
const maxSpeedup = pairs[pairs.length - 1].speedup;
const out = {
  label: 'optic-far-quiet-latch',
  ITERS,
  RUNS,
  isolatedPairs: pairs.length,
  NON_OPTIC,
  FAR_OPTIC,
  medianSpeedup: med.speedup,
  minSpeedup,
  maxSpeedup,
  pairs: pairs.map((p) => +p.speedup.toFixed(4)),
  primary: `~${med.speedup.toFixed(2)}×`,
  ship_bar: 1.5,
  clears_bar: med.speedup >= 1.5 && minSpeedup >= 1.5,
  note: 'Quiet tickOpticFieldRocks far-from-optic latch. Soft-GPU fps not claimed.',
};
writeFileSync(join(__dirname, 'optic-far-quiet-latch-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
