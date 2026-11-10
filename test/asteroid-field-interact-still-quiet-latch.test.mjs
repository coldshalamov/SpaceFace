import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  world,
  setAsteroidFieldInteractStillQuietForBench,
  getAsteroidFieldInteractStillQuietForBench,
} from '../src/systems/world.js';
import {
  ensureAsteroidField,
  insertAsteroidFieldRock,
  getAsteroidFieldRock,
} from '../src/world/asteroidField.js';

function boot() {
  const state = createGameState(21);
  state.mode = 'flight';
  state.meta.seed = 21;
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  world.init({ state, bus, helpers, registry: null });
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

function step(state) {
  state.tick = (state.tick | 0) + 1;
  state.simTime = (state.simTime || 0) + 1 / 60;
  world._tickAsteroidFieldInteractions(state);
}

test('still-player latch engages with nearby non-touching rocks', () => {
  setAsteroidFieldInteractStillQuietForBench(true);
  assert.equal(getAsteroidFieldInteractStillQuietForBench(), true);
  const { state, player } = boot();
  for (let i = 0; i < 24; i++) {
    const ang = (i / 24) * Math.PI * 2;
    insertAsteroidFieldRock(state, {
      pos: { x: Math.cos(ang) * 30, z: Math.sin(ang) * 30 },
      radius: 8,
    });
  }
  step(state);
  assert.equal(state.world.asteroidFieldInteractRuntime.quietLatched, true);
  assert.ok(world._fieldInteractQuiet);
  const armed = world._fieldInteractQuiet.armedTick;
  step(state);
  assert.equal(state.world.asteroidFieldInteractRuntime.quietLatched, true);
  assert.equal(world._fieldInteractQuiet.armedTick, armed);
  assert.equal(player.vel.x, 0);
});

test('asteroidField.version bump wakes still-player latch', () => {
  setAsteroidFieldInteractStillQuietForBench(true);
  const { state } = boot();
  step(state);
  assert.equal(state.world.asteroidFieldInteractRuntime.quietLatched, true);
  const armed = world._fieldInteractQuiet.armedTick;
  insertAsteroidFieldRock(state, { pos: { x: 40, z: 0 }, radius: 8 });
  step(state);
  assert.ok(world._fieldInteractQuiet);
  assert.notEqual(world._fieldInteractQuiet.armedTick, armed);
});

test('player move beyond wake radius re-probes', () => {
  setAsteroidFieldInteractStillQuietForBench(true);
  const { state, player } = boot();
  step(state);
  assert.equal(state.world.asteroidFieldInteractRuntime.quietLatched, true);
  const wake2 = world._fieldInteractQuiet.wakeMove2;
  player.pos.x += Math.sqrt(wake2) + 4;
  step(state);
  assert.ok(world._fieldInteractQuiet);
  assert.ok(Math.abs(world._fieldInteractQuiet.x - player.pos.x) < 1e-9);
});

test('player unpark (speed) clears latch and re-queries', () => {
  setAsteroidFieldInteractStillQuietForBench(true);
  const { state, player } = boot();
  step(state);
  assert.equal(state.world.asteroidFieldInteractRuntime.quietLatched, true);
  player.vel.x = 10;
  player.vel.z = 0;
  step(state);
  assert.equal(state.world.asteroidFieldInteractRuntime.quietLatched, false);
  assert.equal(world._fieldInteractQuiet, null);
});

test('touching rock promotes on first probe before latch', () => {
  setAsteroidFieldInteractStillQuietForBench(true);
  const { state, helpers } = boot();
  const rec = insertAsteroidFieldRock(state, {
    pos: { x: 10, z: 0 },
    radius: 8,
  });
  assert.equal(rec.liveEntityId, null);
  step(state);
  const after = getAsteroidFieldRock(state, rec.id);
  // promote removes/marks live — either liveEntityId set or rock gone from field
  const live = state.entities.get(rec.id) || (after && after.liveEntityId != null
    ? state.entities.get(after.liveEntityId)
    : null);
  assert.ok(live || (after && after.liveEntityId != null), 'ram promote should fire on first probe');
  assert.equal(state.world.asteroidFieldInteractRuntime.quietLatched, true);
});

test('bench toggle off restores always-query (no latch)', () => {
  setAsteroidFieldInteractStillQuietForBench(false);
  assert.equal(getAsteroidFieldInteractStillQuietForBench(), false);
  const { state } = boot();
  step(state);
  assert.equal(state.world.asteroidFieldInteractRuntime.quietLatched, false);
  assert.equal(world._fieldInteractQuiet, null);
  setAsteroidFieldInteractStillQuietForBench(true);
});
