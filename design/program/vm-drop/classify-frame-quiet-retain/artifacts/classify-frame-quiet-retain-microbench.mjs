/**
 * Primary KPI: quiet classifyWorld full-frame retain after #127 rock-visit retain.
 * Before = #127 per-entity republish (bench frame-retain OFF).
 * After  = full-frame retain ON (skip clear+visit when visit stamp+pose stable).
 * Soft-GPU fps not claimed. Picture ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, renameSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ensureActivityClassified,
  setClassifyFrameQuietRetainForBench,
} from '../src/world/activityRuntime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);
const mode = process.argv[2] || 'all';

const ROCKS = 48;
const ITERS = 8000;
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
  ensureActivityClassified(state);
  state.tick++;
  state.simTime += 1 / 60;
  ensureActivityClassified(state); // arm rock + frame
  state.tick++;
  state.simTime += 1 / 60;
  ensureActivityClassified(state); // first frame-retain opportunity
}

function benchPair() {
  const pairs = [];
  for (let r = 0; r < RUNS; r++) {
    const sBefore = makeState();
    warmParked(sBefore);
    setClassifyFrameQuietRetainForBench(false); // #127 per-entity only
    // Re-arm rock retain under OFF so before path is pure #127
    sBefore.tick++;
    sBefore.simTime += 1 / 60;
    ensureActivityClassified(sBefore);
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      sBefore.tick++;
      sBefore.simTime += 1 / 60;
      ensureActivityClassified(sBefore);
    }
    const beforeMs = performance.now() - t0;

    const sAfter = makeState();
    warmParked(sAfter);
    setClassifyFrameQuietRetainForBench(true);
    sAfter.tick++;
    sAfter.simTime += 1 / 60;
    ensureActivityClassified(sAfter);
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      sAfter.tick++;
      sAfter.simTime += 1 / 60;
      ensureActivityClassified(sAfter);
    }
    const afterMs = performance.now() - t1;
    pairs.push({
      before: beforeMs,
      after: afterMs,
      speedup: beforeMs / Math.max(1e-9, afterMs),
    });
  }
  setClassifyFrameQuietRetainForBench(true);
  const speedups = pairs.map((p) => p.speedup);
  return {
    name: 'classify-frame-quiet-retain',
    rocks: ROCKS,
    iters: ITERS,
    runs: RUNS,
    medianSpeedup: median(speedups),
    floorMinSpeedup: Math.min(...speedups),
    maxSpeedup: Math.max(...speedups),
    pairs,
    note: 'Before=#127 per-rock republish (frame OFF). After=full-frame retain ON. Soft-GPU fps not claimed.',
  };
}

function dirtyWakeOracle() {
  setClassifyFrameQuietRetainForBench(true);
  const state = makeState();
  warmParked(state);
  state.tick++;
  state.simTime += 1 / 60;
  const r1 = ensureActivityClassified(state);
  const mode1 = r1.classifyMode;
  // Pose wake
  state._rocks[0].pos.x += 5;
  state.tick++;
  state.simTime += 1 / 60;
  const r2 = ensureActivityClassified(state);
  const mode2 = r2.classifyMode;
  // Re-arm
  state.tick++;
  state.simTime += 1 / 60;
  ensureActivityClassified(state);
  state.tick++;
  state.simTime += 1 / 60;
  ensureActivityClassified(state);
  // Speed wake
  state._player.vel.x = 2;
  state.tick++;
  state.simTime += 1 / 60;
  const r3 = ensureActivityClassified(state);
  const mode3 = r3.classifyMode;
  return { modeParked: mode1, modeAfterPose: mode2, modeAfterSpeed: mode3 };
}

if (mode === 'worker') {
  const result = benchPair();
  writeFileSync(process.argv[3], JSON.stringify(result));
  process.exit(0);
}

if (mode === 'wake') {
  console.log(JSON.stringify(dirtyWakeOracle(), null, 2));
  process.exit(0);
}

// Isolated child process for clean A/B
const outPath = join(ROOT, 'artifacts/classify-frame-quiet-retain-microbench.json.tmp');
const finalPath = join(ROOT, 'artifacts/classify-frame-quiet-retain-microbench.json');
const child = spawnSync(process.execPath, [SELF, 'worker', outPath], {
  cwd: ROOT,
  encoding: 'utf8',
  timeout: 120000,
});
if (child.status !== 0) {
  console.error(child.stderr || child.stdout);
  process.exit(child.status || 1);
}
import { readFileSync as _rfs } from 'node:fs';
const result = JSON.parse(_rfs(outPath, 'utf8'));
const wake = dirtyWakeOracle();
result.dirtyWake = wake;
renameSync(outPath, finalPath);
console.log(JSON.stringify({
  medianSpeedup: +result.medianSpeedup.toFixed(3),
  floorMinSpeedup: +result.floorMinSpeedup.toFixed(3),
  maxSpeedup: +result.maxSpeedup.toFixed(3),
  dirtyWake: wake,
}, null, 2));
