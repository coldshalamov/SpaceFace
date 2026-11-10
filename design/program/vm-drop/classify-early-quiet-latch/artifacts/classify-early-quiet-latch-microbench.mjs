/**
 * Primary KPI: classify early quiet latch vs current #128 frame-retain baseline.
 * Before = early latch OFF (frame-retain still ON).
 * After  = early latch ON.
 * Soft-GPU fps not claimed. Picture ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ensureActivityClassified,
  setClassifyFrameQuietRetainForBench,
  setClassifyEarlyQuietLatchForBench,
  getClassifyEarlyQuietLatchForBench,
} from '../src/world/activityRuntime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);
const mode = process.argv[2] || 'all';

const ROCKS = 48;
const ITERS = 20000;
const RUNS = 11;

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[(s.length - 1) >> 1];
}

function makeState() {
  const rocks = [];
  for (let i = 0; i < ROCKS; i++) {
    const a = (i / ROCKS) * Math.PI * 2;
    const r = 70 + (i % 9) * 35;
    rocks.push({
      id: 100 + i,
      type: 'asteroid',
      alive: true,
      pos: { x: Math.cos(a) * r, z: Math.sin(a) * r },
      vel: { x: 0, z: 0 },
      radius: 8 + (i % 5),
      data: {},
      flags: {},
    });
  }
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    maxSpeed: 120,
    data: { combat: {} },
    flags: {},
  };
  const entities = new Map([[1, player], ...rocks.map((r) => [r.id, r])]);
  return {
    tick: 1,
    simTime: 1,
    playerId: 1,
    entities,
    entityList: [player, ...rocks],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: 1,
      physicsStaticVersion: 1,
      projectiles: [],
      closedFormMovers: [],
    },
    camera: { zoom: 144, tilt: 60 },
    settings: { video: { fov: 50 } },
    runtime: { profileId: 'production' },
    _rocks: rocks,
    _player: player,
  };
}

function warmParked(state) {
  setClassifyFrameQuietRetainForBench(true);
  setClassifyEarlyQuietLatchForBench(true);
  for (let i = 0; i < 8; i++) {
    ensureActivityClassified(state);
    state.tick++;
    state.simTime += 1 / 60;
  }
}

function benchPair() {
  const pairs = [];
  const modes = [];
  for (let r = 0; r < RUNS; r++) {
    // BEFORE: early OFF, frame-retain ON
    const sBefore = makeState();
    setClassifyEarlyQuietLatchForBench(false);
    warmParked(sBefore);
    setClassifyEarlyQuietLatchForBench(false);
    setClassifyFrameQuietRetainForBench(true);
    for (let i = 0; i < 200; i++) {
      sBefore.tick++;
      sBefore.simTime += 1 / 60;
      ensureActivityClassified(sBefore);
    }
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      sBefore.tick++;
      sBefore.simTime += 1 / 60;
      ensureActivityClassified(sBefore);
    }
    const beforeMs = performance.now() - t0;

    // AFTER: early ON
    const sAfter = makeState();
    setClassifyEarlyQuietLatchForBench(true);
    warmParked(sAfter);
    setClassifyEarlyQuietLatchForBench(true);
    setClassifyFrameQuietRetainForBench(true);
    for (let i = 0; i < 200; i++) {
      sAfter.tick++;
      sAfter.simTime += 1 / 60;
      const rt = ensureActivityClassified(sAfter);
      if (i === 199) modes.push(rt && rt.classifyMode);
    }
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      sAfter.tick++;
      sAfter.simTime += 1 / 60;
      ensureActivityClassified(sAfter);
    }
    const afterMs = performance.now() - t1;
    pairs.push(beforeMs / Math.max(1e-9, afterMs));
  }
  return {
    medianSpeedup: +median(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
    pairs: pairs.map((x) => +x.toFixed(3)),
    lastModes: modes,
    earlyEnabled: getClassifyEarlyQuietLatchForBench(),
    iters: ITERS,
    rocks: ROCKS,
    runs: RUNS,
  };
}

function dirtyWake() {
  const state = makeState();
  setClassifyEarlyQuietLatchForBench(true);
  setClassifyFrameQuietRetainForBench(true);
  warmParked(state);
  let latchedMode = null;
  for (let i = 0; i < 40; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    latchedMode = ensureActivityClassified(state).classifyMode;
  }
  // Move player — must wake
  state._player.pos.x += 50;
  state.tick++;
  state.simTime += 1 / 60;
  const afterMoveMode = ensureActivityClassified(state).classifyMode;
  // Re-park and re-arm, then bump membership
  state._player.pos.x -= 50;
  for (let i = 0; i < 40; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    ensureActivityClassified(state);
  }
  const beforeMem = ensureActivityClassified(state).classifyMode;
  state.entityIndex.version += 1;
  state.tick++;
  state.simTime += 1 / 60;
  const afterMem = ensureActivityClassified(state).classifyMode;
  // Mining pin intent must wake
  for (let i = 0; i < 40; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    ensureActivityClassified(state);
  }
  const beforeMine = ensureActivityClassified(state).classifyMode;
  state._player.data.miningTargetId = 100;
  state.tick++;
  state.simTime += 1 / 60;
  const afterMine = ensureActivityClassified(state).classifyMode;
  return {
    latchedMode,
    afterMoveMode,
    beforeMem,
    afterMem,
    beforeMine,
    afterMine,
    dirtyWakeOk: latchedMode === 'early-quiet-latch'
      && afterMoveMode !== 'early-quiet-latch'
      && beforeMem === 'early-quiet-latch'
      && afterMem !== 'early-quiet-latch'
      && beforeMine === 'early-quiet-latch'
      && afterMine !== 'early-quiet-latch',
  };
}

function writeAtomic(path, obj) {
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(obj, null, 2));
  renameSync(tmp, path);
}

if (mode === 'primary') {
  const primary = benchPair();
  const wake = dirtyWake();
  const out = { primary, wake };
  writeAtomic(join(ROOT, 'artifacts/classify-early-quiet-latch-microbench.json'), out);
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (mode.startsWith('rebench')) {
  const primary = benchPair();
  writeAtomic(join(ROOT, `artifacts/classify-early-quiet-latch-${mode}.json`), { primary });
  console.log(JSON.stringify({ primary }, null, 2));
  process.exit(0);
}

// Default: primary in-process + 5 isolated child rebenches
const primary = benchPair();
const wake = dirtyWake();
const floors = [];
for (let i = 1; i <= 5; i++) {
  const res = spawnSync(process.execPath, [SELF, `rebench${i}`], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    process.exit(res.status || 1);
  }
  const parsed = JSON.parse(res.stdout);
  floors.push(parsed.primary);
  writeAtomic(join(ROOT, `artifacts/classify-early-quiet-latch-rebench${i}.json`), parsed);
}
const out = {
  primary,
  wake,
  floors,
  packageMedianRange: [
    +Math.min(...floors.map((f) => f.medianSpeedup)).toFixed(3),
    +Math.max(...floors.map((f) => f.medianSpeedup)).toFixed(3),
  ],
  packageFloorMin: +Math.min(...floors.map((f) => f.minSpeedup)).toFixed(3),
};
writeAtomic(join(ROOT, 'artifacts/classify-early-quiet-latch-microbench.json'), out);
writeAtomic(join(ROOT, 'artifacts/classify-early-quiet-latch-floor-summary.json'), {
  packageMedianRange: out.packageMedianRange,
  packageFloorMin: out.packageFloorMin,
  wake: out.wake,
});
console.log(JSON.stringify(out, null, 2));
