import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureActivityClassified,
  setClassifyFrameQuietRetainForBench,
  setClassifyEarlyQuietLatchForBench,
  getClassifyEarlyQuietLatchForBench,
} from '../src/world/activityRuntime.js';

function makeWorld(rockCount = 24) {
  const rocks = [];
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * Math.PI * 2;
    const r = 80 + (i % 7) * 30;
    rocks.push({
      id: 200 + i,
      type: 'asteroid',
      alive: true,
      pos: { x: Math.cos(a) * r, z: Math.sin(a) * r },
      vel: { x: 0, z: 0 },
      radius: 10,
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
    rocks,
    player,
  };
}

function step(state) {
  state.tick = (state.tick | 0) + 1;
  state.simTime = (state.simTime || 0) + 1 / 60;
  return ensureActivityClassified(state);
}

function warmQuiet(state) {
  setClassifyFrameQuietRetainForBench(true);
  setClassifyEarlyQuietLatchForBench(true);
  let mode = null;
  for (let i = 0; i < 12; i++) mode = step(state).classifyMode;
  return mode;
}

test('early quiet latch arms after frame-retain on parked disc', () => {
  const state = makeWorld();
  const mode = warmQuiet(state);
  assert.equal(mode, 'early-quiet-latch');
  assert.equal(getClassifyEarlyQuietLatchForBench(), true);
  const glass = state.activityRuntime && state.activityRuntime.glassCount;
  assert.ok(Number.isFinite(glass));
});

test('early quiet latch skips visit work while keys hold', () => {
  const state = makeWorld();
  warmQuiet(state);
  const rt = step(state);
  assert.equal(rt.classifyMode, 'early-quiet-latch');
  assert.equal(rt.classifyVisits, 0);
});

test('player move wakes early quiet latch', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  state.player.pos.x += 40;
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
});

test('membership bump wakes early quiet latch', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  state.entityIndex.version += 1;
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
});

test('mining pin intent wakes early quiet latch', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  state.player.data.miningTargetId = state.rocks[0].id;
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
});

test('bench toggle disables early quiet latch', () => {
  const state = makeWorld();
  setClassifyFrameQuietRetainForBench(true);
  setClassifyEarlyQuietLatchForBench(false);
  let mode = null;
  for (let i = 0; i < 12; i++) mode = step(state).classifyMode;
  assert.notEqual(mode, 'early-quiet-latch');
  // frame-retain may still arm
  assert.ok(mode === 'frame-retain' || mode === 'incremental' || mode === 'full');
  setClassifyEarlyQuietLatchForBench(true);
});

test('flying player never early-latches', () => {
  const state = makeWorld();
  state.player.vel.x = 40;
  setClassifyFrameQuietRetainForBench(true);
  setClassifyEarlyQuietLatchForBench(true);
  let sawEarly = false;
  for (let i = 0; i < 20; i++) {
    if (step(state).classifyMode === 'early-quiet-latch') sawEarly = true;
  }
  assert.equal(sawEarly, false);
});

test('rock pose jump wakes early quiet latch', () => {
  const state = makeWorld();
  warmQuiet(state);
  assert.equal(step(state).classifyMode, 'early-quiet-latch');
  const rock = state.rocks[0];
  const before = rock.activity && rock.activity.presentationTier;
  rock.pos.x += 500;
  const woke = step(state);
  assert.notEqual(woke.classifyMode, 'early-quiet-latch');
  const after = rock.activity && rock.activity.presentationTier;
  assert.notEqual(after, before, 'pose jump must reclassify presentation tier');
});
