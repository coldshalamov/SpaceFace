/**
 * Primary KPI: quiet classifyWorld rock-visit retain after parked observe.
 * Before = player vel keeps retain disarmed (full rock visit every tick).
 * After  = parked retain armed (republish stamp; skip classify+stamp+ctx).
 * Soft-GPU fps not claimed. Picture ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync, renameSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';

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
  const entityList = [player, ...rocks];
  return {
    tick: 1,
    simTime: 1,
    playerId: 1,
    entities,
    entityList,
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

function warm(state) {
  ensureActivityClassified(state);
  state.tick++;
  state.simTime += 1 / 60;
  ensureActivityClassified(state);
}

function benchPair() {
  const pairs = [];
  for (let r = 0; r < RUNS; r++) {
    const sBefore = makeState();
    warm(sBefore);
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      sBefore.tick++;
      sBefore.simTime += 1 / 60;
      // Keep retain disarmed: non-zero player speed fails globals match.
      sBefore._player.vel.x = 1;
      ensureActivityClassified(sBefore);
    }
    sBefore._player.vel.x = 0;
    const beforeMs = performance.now() - t0;

    const sAfter = makeState();
    warm(sAfter);
    sAfter._player.vel.x = 0;
    sAfter._player.vel.z = 0;
    sAfter.tick++;
    sAfter.simTime += 1 / 60;
    ensureActivityClassified(sAfter); // arm retain
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
  const speedups = pairs.map((p) => p.speedup);
  return {
    name: 'classify-rock-visit-quiet-retain',
    rocks: ROCKS,
    iters: ITERS,
    runs: RUNS,
    medianSpeedup: median(speedups),
    floorMinSpeedup: Math.min(...speedups),
    pairs,
  };
}

function dirtyWakeProof() {
  const state = makeState();
  warm(state);
  state.tick++; state.simTime += 1 / 60;
  ensureActivityClassified(state);
  const glassParked = state.activityRuntime.glassCount;
  state._rocks[0].pos.x += 60;
  state.tick++; state.simTime += 1 / 60;
  ensureActivityClassified(state);
  const afterPoseTier = state._rocks[0].activity && state._rocks[0].activity.presentationTier;
  state._rocks[0].pos.x -= 60;
  state._player.vel.x = 50;
  state.tick++; state.simTime += 1 / 60;
  ensureActivityClassified(state);
  state._player.vel.x = 0;
  state.tick++; state.simTime += 1 / 60;
  ensureActivityClassified(state);
  state._player.data.miningTargetId = state._rocks[1].id;
  state.tick++; state.simTime += 1 / 60;
  ensureActivityClassified(state);
  const miningPins = (state._rocks[1].activity && state._rocks[1].activity.pins) || [];
  const miningPinned = miningPins.includes('PLAYER_MINING_TARGET')
    || miningPins.includes('PLAYER_MINING_TARGET');
  return { glassParked, afterPoseTier, miningPinned, miningPins };
}

if (mode === 'worker') {
  writeFileSync(process.argv[3], JSON.stringify(benchPair()));
  process.exit(0);
}

const primary = benchPair();
const wake = dirtyWakeProof();
console.log(JSON.stringify({ primary, wake }, null, 2));
writeFileSync(join(__dirname, 'classify-rock-visit-quiet-retain-microbench.json'), JSON.stringify({ primary, wake }, null, 2));

if (mode === 'all') {
  const floors = [];
  for (let i = 1; i <= 5; i++) {
    const out = join(__dirname, `classify-rock-visit-quiet-retain-rebench${i}.json`);
    const tmp = `${out}.tmp`;
    const run = spawnSync(process.execPath, [SELF, 'worker', tmp], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    if (run.status !== 0) {
      console.error(run.stderr || run.stdout);
      process.exit(run.status || 1);
    }
    renameSync(tmp, out);
    const body = JSON.parse(readFileSync(out, 'utf8'));
    floors.push({ run: i, median: body.medianSpeedup, min: body.floorMinSpeedup });
    console.log(`rebench${i}`, body.medianSpeedup, body.floorMinSpeedup);
  }
  const summary = {
    medians: floors.map((f) => f.median),
    mins: floors.map((f) => f.min),
    floorMinSpeedup: Math.min(...floors.map((f) => f.min)),
    primaryMedian: primary.medianSpeedup,
  };
  writeFileSync(join(__dirname, 'classify-rock-visit-quiet-retain-floor-summary.json'), JSON.stringify(summary, null, 2));
  console.log('FLOOR', summary);
}
