/**
 * Primary KPI: quiet lifetimeSweep corpse-compact residual (correctness-preserving).
 * Before = reverse-walk full entityList every tick.
 * After  = walk death-capable typed lanes always (movables/mines/…);
 *          scan asteroids/stations/statics only when MEMBERSHIP dirty.
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const mode = process.argv[2] || 'all';

const ASTEROIDS = 320;
const MOVABLES = 48;
const MINES = 4;
const ITERS = 60000;
const RUNS = 11;

function makeState() {
  const list = [];
  const movables = [];
  const asteroids = [];
  const mines = [];
  const wrecks = [];
  const stations = [];
  const entities = new Map();
  let id = 1;
  for (let i = 0; i < MOVABLES; i++) {
    const e = { id: id++, type: i === 0 ? 'ship' : (i < 8 ? 'ship' : 'projectile'), alive: true, pos: { x: i, z: 0 } };
    if (i === 0) e.isPlayer = true;
    list.push(e); entities.set(e.id, e); movables.push(e);
  }
  for (let i = 0; i < ASTEROIDS; i++) {
    const e = { id: id++, type: 'asteroid', alive: true, pos: { x: i * 10, z: 50 } };
    list.push(e); entities.set(e.id, e); asteroids.push(e);
  }
  for (let i = 0; i < MINES; i++) {
    const e = { id: id++, type: 'mine', alive: true, pos: { x: -i, z: -i } };
    list.push(e); entities.set(e.id, e); mines.push(e);
  }
  const damageables = movables.filter((e) => e.type === 'ship').concat(mines);
  return {
    playerId: 1,
    entityList: list,
    entities,
    entityIndex: {
      __spacefaceEntityIndexV1: true, ready: true, version: 1,
      movables, asteroids, mines, wrecks, stations, damageables,
      vectorMines: [], snares: [], charges: [], mineables: asteroids, statics: asteroids,
      projectiles: movables.filter((e) => e.type === 'projectile'),
      pickups: [], payloads: [], fx: [], bombs: [],
    },
    dirtyJournal: {
      generation: 1, count: 0,
      entityGen: new Uint32Array(2048),
      entityBits: new Uint32Array(2048),
      ids: new Uint32Array(128),
    },
  };
}

function hasDirty(state, mask) {
  const j = state.dirtyJournal;
  for (let i = 0; i < j.count; i++) {
    const id = j.ids[i];
    if (j.entityGen[id] !== j.generation) continue;
    if ((j.entityBits[id] & mask) !== 0) return true;
  }
  return false;
}

function beginTick(state, poseOnly) {
  const j = state.dirtyJournal;
  j.generation = (j.generation + 1) >>> 0 || 1;
  j.count = 0;
  if (poseOnly) {
    // player pose dirty only
    j.entityGen[1] = j.generation;
    j.entityBits[1] = 2;
    j.ids[j.count++] = 1;
  } else {
    // membership dirty (asteroid died)
    j.entityGen[100] = j.generation;
    j.entityBits[100] = 1;
    j.ids[j.count++] = 100;
  }
}

function compactFull(state) {
  const list = state.entityList;
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (!e || e.id === state.playerId) continue;
    if (!e.alive) { n++; e.alive = true; } // steady-state: resurrect
  }
  return n;
}

function compactLane(state, lane) {
  if (!lane || !lane.length) return 0;
  let n = 0;
  for (let i = 0; i < lane.length; i++) {
    const e = lane[i];
    if (!e || e.id === state.playerId || e.alive) continue;
    n++;
    e.alive = true;
  }
  return n;
}

function compactAfter(state) {
  const index = state.entityIndex;
  let n = 0;
  // Mirror src/core/coreSystem.js quiet path (+ damageables).
  n += compactLane(state, index.movables);
  n += compactLane(state, index.damageables);
  n += compactLane(state, index.vectorMines);
  n += compactLane(state, index.snares);
  n += compactLane(state, index.charges);
  n += compactLane(state, index.wrecks);
  if (hasDirty(state, 1)) {
    // membership dirty → full list in production; here model asteroid scan cost
    n += compactFull(state);
  }
  return n;
}

function bench(which) {
  const times = [];
  let last = 0;
  for (let r = 0; r < RUNS; r++) {
    const state = makeState();
    // warmup quiet
    for (let i = 0; i < 200; i++) {
      beginTick(state, true);
      if (which === 'after') compactAfter(state); else compactFull(state);
    }
    const t0 = performance.now();
    for (let i = 0; i < ITERS; i++) {
      beginTick(state, true); // quiet: pose-only
      last += which === 'after' ? compactAfter(state) : compactFull(state);
    }
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { med: times[(times.length / 2) | 0], min: times[0], max: times[times.length - 1], last };
}

function isolated(which) {
  const res = spawnSync(process.execPath, [fileURLToPath(import.meta.url), which], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (res.status !== 0) throw new Error(`${which}: ${res.stderr || res.stdout}`);
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

if (mode === 'before' || mode === 'after') {
  console.log(JSON.stringify({ mode, ...bench(mode) }));
  process.exit(0);
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = isolated('before');
  const a = isolated('after');
  pairs.push({ before: b.med, after: a.med, speedup: b.med / a.med });
}
pairs.sort((x, y) => x.speedup - y.speedup);
const speedups = pairs.map((p) => p.speedup);
const out = {
  name: 'lifetime-corpse-lane-compact',
  asteroids: ASTEROIDS, movables: MOVABLES, mines: MINES, iters: ITERS, runs: RUNS,
  medianSpeedup: speedups[(speedups.length / 2) | 0],
  floorMinSpeedup: Math.min(...speedups),
  pairs,
  note: 'Quiet pose-only. Before=full entityList corpse walk. After=movables+damageables+ordnance lanes; MEMBERSHIP dirty takes full walk. Soft-GPU fps not claimed.',
};
writeFileSync(join(__dirname, 'lifetime-corpse-lane-compact-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
