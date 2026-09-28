import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  tickOpticFieldRocks,
  setOpticFarQuietLatchForBench,
  getOpticFarQuietLatchForBench,
  insertAsteroidFieldRock,
  ensureAsteroidField,
} from '../src/world/asteroidField.js';

function boot(opts = {}) {
  const state = createGameState(opts.seed || 21);
  state.mode = 'flight';
  state.meta.seed = opts.seed || 21;
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
  return { state, bus, helpers, player };
}

function step(state, helpers) {
  state.tick = (state.tick | 0) + 1;
  state.simTime = (state.simTime || 0) + 1 / 60;
  return tickOpticFieldRocks(state, helpers);
}

test('quiet latch engages when no optic interest nearby', () => {
  setOpticFarQuietLatchForBench(true);
  assert.equal(getOpticFarQuietLatchForBench(), true);
  const { state, helpers } = boot();
  // Dense non-optic field near player + far optic gallery.
  for (let i = 0; i < 40; i++) {
    insertAsteroidFieldRock(state, {
      pos: { x: (i % 8) * 40, z: Math.floor(i / 8) * 40 },
      radius: 12,
      data: { typeId: 'ast_common_rock' },
    });
  }
  for (let i = 0; i < 8; i++) {
    insertAsteroidFieldRock(state, {
      pos: { x: 5000 + i * 30, z: 5000 },
      radius: 14,
      data: { opticMaterial: 'diamond', opticStructureId: 'gallery_far' },
    });
  }
  const r1 = step(state, helpers);
  assert.equal(r1.promoted, 0);
  assert.equal(r1.shelved, 0);
  assert.equal(state.world.opticFieldRuntime.quietLatched, true);
  assert.ok(tickOpticFieldRocks._quiet);
  const r2 = step(state, helpers);
  assert.equal(r2.promoted, 0);
  assert.equal(state.world.opticFieldRuntime.quietLatched, true);
});

test('field.version bump wakes optic quiet latch', () => {
  setOpticFarQuietLatchForBench(true);
  const { state, helpers } = boot();
  step(state, helpers);
  assert.equal(state.world.opticFieldRuntime.quietLatched, true);
  const armed = tickOpticFieldRocks._quiet.armedTick;
  insertAsteroidFieldRock(state, {
    pos: { x: 10, z: 10 },
    radius: 10,
    data: { typeId: 'ast_common_rock' },
  });
  const r = step(state, helpers);
  // Fresh probe after version bump; still no optic interest → re-arms.
  assert.equal(r.promoted, 0);
  assert.ok(tickOpticFieldRocks._quiet);
  assert.notEqual(tickOpticFieldRocks._quiet.armedTick, armed);
});

test('membership bump wakes optic quiet latch', () => {
  setOpticFarQuietLatchForBench(true);
  const { state, helpers } = boot();
  step(state, helpers);
  assert.equal(state.world.opticFieldRuntime.quietLatched, true);
  const armed = tickOpticFieldRocks._quiet.armedTick;
  state.entityIndex.version++;
  step(state, helpers);
  assert.ok(tickOpticFieldRocks._quiet);
  assert.notEqual(tickOpticFieldRocks._quiet.armedTick, armed);
});

test('player move beyond wake radius clears optic quiet latch path', () => {
  setOpticFarQuietLatchForBench(true);
  const { state, helpers, player } = boot();
  step(state, helpers);
  assert.equal(state.world.opticFieldRuntime.quietLatched, true);
  // Jump far enough that wakeMove2 fails closed and full path runs.
  player.pos.x = 4000;
  player.pos.z = 0;
  step(state, helpers);
  // Full path ran; if still no optic interest at new pos it re-arms at new coords.
  assert.ok(tickOpticFieldRocks._quiet);
  assert.equal(tickOpticFieldRocks._quiet.x, 4000);
});

test('nearby optic field rock prevents latch and promotes on approach', () => {
  setOpticFarQuietLatchForBench(true);
  const { state, helpers, player } = boot();
  insertAsteroidFieldRock(state, {
    pos: { x: 80, z: 0 },
    radius: 14,
    data: { opticMaterial: 'diamond', opticStructureId: 'near_gallery' },
  });
  const r = step(state, helpers);
  assert.ok(r.promoted >= 1);
  assert.equal(state.world.opticFieldRuntime.quietLatched, false);
  assert.equal(tickOpticFieldRocks._quiet, null);
  // Keep player near so live optic stays in exit disc — still no latch.
  player.pos.x = 80;
  const r2 = step(state, helpers);
  assert.equal(r2.promoted, 0);
  assert.equal(state.world.opticFieldRuntime.quietLatched, false);
});

test('bench toggle off restores always-walk', () => {
  setOpticFarQuietLatchForBench(false);
  assert.equal(getOpticFarQuietLatchForBench(), false);
  const { state, helpers } = boot();
  step(state, helpers);
  assert.equal(tickOpticFieldRocks._quiet, null);
  assert.equal(state.world.opticFieldRuntime?.quietLatched, false);
  setOpticFarQuietLatchForBench(true);
});
