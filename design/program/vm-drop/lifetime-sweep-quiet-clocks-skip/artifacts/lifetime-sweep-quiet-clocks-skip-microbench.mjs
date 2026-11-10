/**
 * Primary KPI: lifetimeSweep quiet short-lived-lane clocks skip (isolated).
 * Before = skip OFF. After = skip ON.
 * Soft-GPU fps not claimed. Picture ON.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import {
  core,
  setLifetimeSweepQuietClocksSkipForBench,
} from '../src/core/coreSystem.js';
import { beginDirtyTick, markDirty, DIRTY } from '../src/core/dirtyJournal.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);
const mode = process.argv[2] || 'all';

const ITERS = 80000;
const RUNS = 11;
const NPC = 36;
const ROCKS = 48;

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[(s.length - 1) >> 1];
}

function boot() {
  const state = createGameState(143);
  state.mode = 'flight';
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  core._publishPresentation = () => {};
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 1,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.ttl = Infinity;
  for (let i = 0; i < NPC; i++) {
    const e = helpers.spawnEntity({
      type: 'ship', pos: { x: 200 + i * 20, z: 150 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 10, hull: 80, hullMax: 80, collides: true, team: 2,
      data: { ai: true },
    });
    e.physicsSleeping = true;
    e.ttl = Infinity;
  }
  for (let i = 0; i < ROCKS; i++) {
    const ang = (i / ROCKS) * Math.PI * 2;
    const e = helpers.spawnEntity({
      type: 'asteroid', pos: { x: Math.cos(ang) * 90, z: Math.sin(ang) * 90 },
      vel: { x: 0, z: 0 }, radius: 10, mass: 500, hull: 50, hullMax: 50, collides: true,
    });
    e.ttl = Infinity;
  }
  if (state.entityIndex) state.entityIndex.ready = true;
  return { state, player, helpers };
}

function bench(which) {
  setLifetimeSweepQuietClocksSkipForBench(which === 'after');
  const { state, player } = boot();
  for (let i = 0; i < 60; i++) {
    beginDirtyTick(state, state.tick++);
    markDirty(state, player.id, DIRTY.POSE);
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
    player.pos.x += 40 / 60;
  }
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    beginDirtyTick(state, state.tick++);
    markDirty(state, player.id, DIRTY.POSE);
    core.lifetimeSweep(1 / 60, state);
  }
  return { mode: which, ms: performance.now() - t0 };
}

function dirtyWakeOk() {
  setLifetimeSweepQuietClocksSkipForBench(true);
  const { state, helpers } = boot();
  for (let i = 0; i < 30; i++) {
    beginDirtyTick(state, state.tick++);
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const proj = helpers.spawnEntity({
    type: 'projectile', pos: { x: 1, z: 0 }, vel: { x: 100, z: 0 },
    radius: 1, mass: 1, hull: 1, hullMax: 1, collides: true, team: 1,
  });
  proj.ttl = 0.25;
  for (let i = 0; i < 40; i++) {
    beginDirtyTick(state, state.tick++);
    state.simTime += 1 / 60;
    core.preStep(1 / 60, state);
    core.lifetimeSweep(1 / 60, state);
  }
  const still = state.entities.get(proj.id);
  const ttlExpired = !still || still.alive === false;

  // shipLike despawnAt fail-open: must expire even when short-lived lanes empty
  const { state: s2, helpers: h2 } = boot();
  for (let i = 0; i < 10; i++) {
    beginDirtyTick(s2, s2.tick++);
    core.preStep(1 / 60, s2);
    core.lifetimeSweep(1 / 60, s2);
  }
  const npc = [...s2.entities.values()].find((e) => e.type === 'ship' && e.id !== s2.playerId);
  npc.data = npc.data || {};
  npc.data.despawnAt = s2.simTime + 0.05;
  for (let i = 0; i < 20; i++) {
    beginDirtyTick(s2, s2.tick++);
    s2.simTime += 1 / 60;
    core.preStep(1 / 60, s2);
    core.lifetimeSweep(1 / 60, s2);
  }
  const npcStill = s2.entities.get(npc.id);
  const despawnOk = !npcStill || npcStill.alive === false;
  return { ok: ttlExpired && despawnOk, ttlExpired, despawnOk };
}

function isolated(which) {
  const res = spawnSync(process.execPath, [SELF, which], {
    cwd: ROOT, encoding: 'utf8', env: process.env,
  });
  if (res.status !== 0) throw new Error(`isolated ${which}: ${res.stderr || res.stdout}`);
  return JSON.parse(res.stdout.trim().split('\n').pop());
}

if (mode === 'before' || mode === 'after') {
  console.log(JSON.stringify(bench(mode)));
  process.exit(0);
}

const pairs = [];
for (let i = 0; i < RUNS; i++) {
  const b = isolated('before');
  const a = isolated('after');
  pairs.push({
    beforeMs: +b.ms.toFixed(3),
    afterMs: +a.ms.toFixed(3),
    speedup: +(b.ms / Math.max(1e-9, a.ms)).toFixed(3),
  });
}
const speedups = pairs.map((p) => p.speedup);
const wake = dirtyWakeOk();
const out = {
  label: 'lifetime-sweep-quiet-clocks-skip',
  primary: 'quiet-short-lived-lanes-empty-clocks-skip',
  iters: ITERS,
  npc: NPC,
  rocks: ROCKS,
  medianSpeedup: +median(speedups).toFixed(3),
  minSpeedup: +Math.min(...speedups).toFixed(3),
  maxSpeedup: +Math.max(...speedups).toFixed(3),
  pairs,
  dirtyWake: wake,
  note: 'Picture unchanged: preStep still owns POSE; skip only redundant Infinity-ttl clock walk.',
};
writeFileSync(join(ROOT, 'artifacts/lifetime-sweep-quiet-clocks-skip-microbench.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
