/**
 * Primary KPI: requestDecodeRunwayPromote on quiet empty-far flight.
 * Before = latch OFF (empty grid walk + prefetch every tick).
 * After  = latch ON (early empty return + quiet latch; wake on version/move/rescan).
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
  setDecodeRunwayEmptyFarQuietForBench,
  ensureFarActorTable,
  insertFarActor,
} from '../src/world/farActorTable.js';
import { requestDecodeRunwayPromote } from '../src/world/presentationSources.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] || 'all';

const ITERS = 60000;
const RUNS = 11;

function boot(withFarRows = false) {
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
  ensureFarActorTable(state);
  if (withFarRows) {
    for (let i = 0; i < 24; i++) {
      const ghost = helpers.spawnEntity({
        type: 'ship',
        pos: { x: 5000 + (i % 6) * 80, z: 4800 + Math.floor(i / 6) * 80 },
        vel: { x: 0, z: 0 },
        radius: 10,
        mass: 20,
        hull: 80,
        hullMax: 80,
        collides: true,
        data: { trafficRole: 'hauler', homeSectorId: 'sector_ceres_belt' },
      });
      insertFarActor(state, ghost, 0);
      helpers.removeEntity(ghost.id, { immediate: true, reason: 'virtualize' });
    }
  }
  return { state, helpers };
}

function walk(latchOn, withFarRows = false) {
  setDecodeRunwayEmptyFarQuietForBench(latchOn);
  requestDecodeRunwayPromote._quiet = null;
  const { state, helpers } = boot(withFarRows);
  for (let i = 0; i < 5; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + 1 / 60;
    requestDecodeRunwayPromote(state, helpers);
  }
  const t0 = performance.now();
  let farSeen = 0;
  let farPromoted = 0;
  for (let i = 0; i < ITERS; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + 1 / 60;
    const r = requestDecodeRunwayPromote(state, helpers);
    farSeen += r.farSeen;
    farPromoted += r.farPromoted;
  }
  const ms = performance.now() - t0;
  return {
    ms,
    farSeen,
    farPromoted,
    latched: !!(state.world && state.world.decodeRunwayRuntime && state.world.decodeRunwayRuntime.quietLatched),
    farRows: state.world.farActors.rows.length,
  };
}

function bench(which, withFarRows = false) {
  const latchOn = which === 'after';
  const times = [];
  let last = null;
  for (let r = 0; r < RUNS; r++) {
    last = walk(latchOn, withFarRows);
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

function isolated(which, withFarRows = false) {
  const args = [fileURLToPath(import.meta.url), which];
  if (withFarRows) args.push('with-far');
  const res = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    cwd: join(__dirname, '..'),
    env: process.env,
  });
  if (res.status !== 0) {
    throw new Error(`isolated ${which} failed: ${res.stderr || res.stdout}`);
  }
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

function pair(label, withFarRows = false) {
  const before = isolated('before', withFarRows);
  const after = isolated('after', withFarRows);
  const speedup = before.med / Math.max(1e-9, after.med);
  const pairMins = [];
  for (let i = 0; i < Math.min(before.times.length, after.times.length); i++) {
    pairMins.push(before.times[i] / Math.max(1e-9, after.times[i]));
  }
  pairMins.sort((a, b) => a - b);
  return {
    label,
    beforeMed: +before.med.toFixed(3),
    afterMed: +after.med.toFixed(3),
    medianSpeedup: +speedup.toFixed(3),
    minSpeedup: +Math.min(...pairMins).toFixed(3),
    maxSpeedup: +Math.max(...pairMins).toFixed(3),
    beforeLatched: before.last.latched,
    afterLatched: after.last.latched,
    afterFarRows: after.last.farRows,
  };
}

if (mode === 'before' || mode === 'after') {
  const withFar = process.argv[3] === 'with-far';
  const b = bench(mode, withFar);
  process.stdout.write(JSON.stringify(b) + '\n');
} else {
  const empty = pair('empty-far-decode-runway');
  const withFar = pair('with-far-rows', true);
  const out = { empty, withFar, iters: ITERS, runs: RUNS };
  console.log(JSON.stringify(out, null, 2));
  writeFileSync(join(__dirname, 'decode-runway-empty-far-quiet-latch-microbench.json'), JSON.stringify(out, null, 2));
}
