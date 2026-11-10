/**
 * Primary KPI: classify flying rock retain vs #138 early-latch baseline under motion.
 * Before = flying retain OFF (early latch + frame/rock retain still ON; early latch
 *          does not fire while player.vel² > 0.25).
 * After  = flying retain ON.
 * Soft-GPU fps not claimed. Picture ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ensureActivityClassified,
  setClassifyFrameQuietRetainForBench,
  setClassifyEarlyQuietLatchForBench,
  setClassifyFlyingRockRetainForBench,
  getClassifyFlyingRockRetainForBench,
} from '../src/world/activityRuntime.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);
const mode = process.argv[2] || 'all';

const ROCKS = 48;
const ITERS = 20000;
const RUNS = 11;
const FLY_SPEED = 40; // vel.x — well above parked threshold (0.5)

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
    vel: { x: FLY_SPEED, z: 0 },
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

function flyStep(state) {
  // Advance player along +X so origin moves every tick (realistic flying residual).
  state._player.pos.x += FLY_SPEED / 60;
  state.tick++;
  state.simTime += 1 / 60;
  return ensureActivityClassified(state);
}

function warmFlying(state, flyingRetain) {
  setClassifyFrameQuietRetainForBench(true);
  setClassifyEarlyQuietLatchForBench(true);
  setClassifyFlyingRockRetainForBench(flyingRetain);
  for (let i = 0; i < 12; i++) flyStep(state);
}

function benchPair() {
  const pairs = [];
  const modes = [];
  let retained = 0;
  for (let r = 0; r < RUNS; r++) {
    const sBefore = makeState();
    warmFlying(sBefore, false);
    setClassifyFlyingRockRetainForBench(false);
    for (let i = 0; i < 200; i++) flyStep(sBefore);
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) flyStep(sBefore);
    const beforeMs = performance.now() - t0;

    const sAfter = makeState();
    warmFlying(sAfter, true);
    setClassifyFlyingRockRetainForBench(true);
    for (let i = 0; i < 200; i++) {
      const rt = flyStep(sAfter);
      if (i === 199) {
        modes.push(rt && rt.classifyMode);
        retained = rt && rt.classifyVisits;
      }
    }
    const t1 = performance.now();
    for (let i = 0; i < ITERS; i++) flyStep(sAfter);
    const afterMs = performance.now() - t1;
    pairs.push(beforeMs / Math.max(1e-9, afterMs));
  }
  return {
    name: 'classify-flying-rock-retain',
    medianSpeedup: +median(pairs).toFixed(3),
    minSpeedup: +Math.min(...pairs).toFixed(3),
    maxSpeedup: +Math.max(...pairs).toFixed(3),
    pairs: pairs.map((x) => +x.toFixed(3)),
    lastModes: modes,
    lastClassifyVisits: retained,
    flyingEnabled: getClassifyFlyingRockRetainForBench(),
    iters: ITERS,
    rocks: ROCKS,
    runs: RUNS,
    flySpeed: FLY_SPEED,
  };
}

function dirtyWakeOk() {
  setClassifyFlyingRockRetainForBench(true);
  const state = makeState();
  warmFlying(state, true);
  for (let i = 0; i < 5; i++) flyStep(state);
  const rock = state._rocks[0];
  const before = rock.activity && rock.activity.presentationTier;
  rock.pos.x += 800;
  flyStep(state);
  const after = rock.activity && rock.activity.presentationTier;
  // Mining pin wake
  const state2 = makeState();
  warmFlying(state2, true);
  for (let i = 0; i < 5; i++) flyStep(state2);
  const rock2 = state2._rocks[2];
  state2._player.data.miningTargetId = rock2.id;
  flyStep(state2);
  const pins = (rock2.activity && rock2.activity.pins) || [];
  const miningOk = pins.includes('PLAYER_MINING_TARGET');
  return {
    dirtyWakeOk: before !== after && miningOk,
    poseWake: before !== after,
    miningWake: miningOk,
  };
}

if (mode === 'before' || mode === 'after') {
  // unused — pair mode only
  console.log(JSON.stringify({ mode }));
} else if (mode === 'wake') {
  console.log(JSON.stringify(dirtyWakeOk()));
} else {
  const result = { ...benchPair(), ...dirtyWakeOk() };
  const out = join(__dirname, 'classify-flying-rock-retain-microbench.json');
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
