/**
 * Primary KPI: weapons.update NPC-idle quiet latch (isolated).
 * Before = latch OFF. After = latch ON.
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
  weapons,
  setWeaponsNpcQuietLatchForBench,
} from '../src/systems/weapons.js';
import { core } from '../src/core/coreSystem.js';
import { beginDirtyTick, markDirty, DIRTY } from '../src/core/dirtyJournal.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);
const mode = process.argv[2] || 'all';

const ITERS = 80000;
const RUNS = 11;
const NPC = 36;

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[(s.length - 1) >> 1];
}

function boot() {
  const state = createGameState(143);
  state.mode = 'flight';
  state.input = { fire: false, aimAngle: 0, actions: {} };
  state.player = state.player || {};
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  core._publishPresentation = () => {};
  helpers.getEntity = (id) => state.entities.get(id);
  weapons.init({ state, bus, helpers, registry: null });

  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 1,
    data: { weapons: [{ defId: 'wpn_pulse', _cooldown: 0, _heat: 0 }] },
  });
  state.playerId = player.id;
  player.isPlayer = true;
  player.ttl = Infinity;
  player.flags = player.flags || {};

  for (let i = 0; i < NPC; i++) {
    const e = helpers.spawnEntity({
      type: 'ship', pos: { x: 200 + i * 20, z: 150 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 10, hull: 80, hullMax: 80, collides: true, team: 2,
      data: {
        ai: true,
        weapons: [{ defId: 'wpn_pulse', _cooldown: 0, _heat: 0 }],
        intent: { fire: false, moveX: 0, moveZ: 0, turnIntent: 0 },
      },
    });
    e.physicsSleeping = true;
    e.ttl = Infinity;
  }
  if (state.entityIndex) {
    state.entityIndex.ready = true;
    if (!Array.isArray(state.entityIndex.projectiles)) state.entityIndex.projectiles = [];
    if (!Array.isArray(state.entityIndex.vectorMines)) state.entityIndex.vectorMines = [];
  }
  for (let i = 0; i < 60; i++) {
    beginDirtyTick(state, state.tick++);
    markDirty(state, player.id, DIRTY.POSE);
    core.preStep(1 / 60, state);
    weapons.update(1 / 60, state);
    player.pos.x += 40 / 60;
  }
  return { state, player, helpers };
}

function bench(which) {
  setWeaponsNpcQuietLatchForBench(which === 'after');
  const { state, player } = boot();
  // confirm latch armed on after
  let latched = false;
  for (let i = 0; i < 40; i++) {
    beginDirtyTick(state, state.tick++);
    markDirty(state, player.id, DIRTY.POSE);
    weapons.update(1 / 60, state);
    player.pos.x += 40 / 60;
    if (state.weaponRuntime && state.weaponRuntime.quietLatched) latched = true;
  }
  if (typeof globalThis.gc === 'function') globalThis.gc();
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) {
    beginDirtyTick(state, state.tick++);
    markDirty(state, player.id, DIRTY.POSE);
    weapons.update(1 / 60, state);
    player.pos.x += 40 / 60;
  }
  return {
    mode: which,
    ms: performance.now() - t0,
    latched,
    quietLatchedEnd: !!(state.weaponRuntime && state.weaponRuntime.quietLatched),
  };
}

function dirtyWakeOk() {
  setWeaponsNpcQuietLatchForBench(true);
  const { state, helpers, player } = boot();
  for (let i = 0; i < 40; i++) {
    beginDirtyTick(state, state.tick++);
    weapons.update(1 / 60, state);
  }
  if (!(state.weaponRuntime && state.weaponRuntime.quietLatched)) {
    return { ok: false, reason: 'failed-to-latch' };
  }
  // Wake A: tactical AI leaves quiet (same-tick fire intent writers).
  state.tacticalAiRuntime = { quietLatched: false };
  beginDirtyTick(state, state.tick++);
  weapons.update(1 / 60, state);
  if (state.weaponRuntime && state.weaponRuntime.quietLatched) {
    return { ok: false, reason: 'still-latched-after-tactical-wake' };
  }
  // Re-arm with tactical quiet again.
  state.tacticalAiRuntime.quietLatched = true;
  for (let i = 0; i < 10; i++) {
    beginDirtyTick(state, state.tick++);
    weapons.update(1 / 60, state);
  }
  if (!(state.weaponRuntime && state.weaponRuntime.quietLatched)) {
    return { ok: false, reason: 'failed-to-relatch' };
  }
  // Wake B: membership via new live projectile on typed lane.
  const proj = helpers.spawnEntity({
    type: 'projectile', pos: { x: 1, z: 0 }, vel: { x: 100, z: 0 },
    radius: 1, mass: 1, hull: 1, hullMax: 1, collides: true, team: 1,
  });
  proj.ttl = 0.5;
  if (state.entityIndex) state.entityIndex.ready = true;
  beginDirtyTick(state, state.tick++);
  weapons.update(1 / 60, state);
  if (state.weaponRuntime && state.weaponRuntime.quietLatched) {
    return { ok: false, reason: 'still-latched-after-projectile', projId: proj.id };
  }
  return { ok: true, projId: proj.id, playerId: player.id };
}

function runPairs() {
  const pairs = [];
  for (let i = 0; i < RUNS; i++) {
    const before = bench('before');
    const after = bench('after');
    pairs.push({
      beforeMs: before.ms,
      afterMs: after.ms,
      speedup: before.ms / Math.max(1e-9, after.ms),
      afterLatched: after.latched,
      quietLatchedEnd: after.quietLatchedEnd,
    });
  }
  const speedups = pairs.map((p) => p.speedup);
  return {
    name: 'weapons-npc-quiet-latch',
    iterations: ITERS,
    runs: RUNS,
    npc: NPC,
    pairs,
    medianSpeedup: median(speedups),
    minSpeedup: Math.min(...speedups),
    dirtyWake: dirtyWakeOk(),
  };
}

if (mode === 'child-before') {
  console.log(JSON.stringify(bench('before')));
  process.exit(0);
}
if (mode === 'child-after') {
  console.log(JSON.stringify(bench('after')));
  process.exit(0);
}
if (mode === 'child-wake') {
  console.log(JSON.stringify(dirtyWakeOk()));
  process.exit(0);
}

if (mode === 'isolated' || mode === 'all') {
  const pairs = [];
  for (let i = 0; i < RUNS; i++) {
    const before = spawnSync(process.execPath, ['--expose-gc', SELF, 'child-before'], {
      cwd: ROOT, encoding: 'utf8',
    });
    const after = spawnSync(process.execPath, ['--expose-gc', SELF, 'child-after'], {
      cwd: ROOT, encoding: 'utf8',
    });
    if (before.status !== 0 || after.status !== 0) {
      console.error(before.stderr || after.stderr);
      process.exit(1);
    }
    const b = JSON.parse(before.stdout.trim().split('\n').pop());
    const a = JSON.parse(after.stdout.trim().split('\n').pop());
    pairs.push({
      beforeMs: b.ms,
      afterMs: a.ms,
      speedup: b.ms / Math.max(1e-9, a.ms),
      afterLatched: a.latched,
      quietLatchedEnd: a.quietLatchedEnd,
    });
  }
  const wake = spawnSync(process.execPath, [SELF, 'child-wake'], {
    cwd: ROOT, encoding: 'utf8',
  });
  const dirtyWake = JSON.parse(wake.stdout.trim().split('\n').pop());
  const speedups = pairs.map((p) => p.speedup);
  const out = {
    name: 'weapons-npc-quiet-latch',
    note: 'isolated child; before=latch OFF after=latch ON; player service stays live',
    iterations: ITERS,
    runs: RUNS,
    npc: NPC,
    pairs,
    medianSpeedup: median(speedups),
    minSpeedup: Math.min(...speedups),
    dirtyWake,
  };
  writeFileSync(join(__dirname, 'weapons-npc-quiet-latch-microbench.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
} else {
  const out = runPairs();
  writeFileSync(join(__dirname, 'weapons-npc-quiet-latch-microbench.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}
