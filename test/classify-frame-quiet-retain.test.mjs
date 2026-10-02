import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureActivityClassified,
  setClassifyFrameQuietRetainForBench,
  getClassifyFrameQuietRetainForBench,
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
  state.tick++;
  state.simTime += 1 / 60;
  return ensureActivityClassified(state);
}

test('frame quiet retain keeps glass/runway and reports frame-retain mode', () => {
  setClassifyFrameQuietRetainForBench(true);
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state); // arm
  step(state); // first retain opportunity
  const rt = step(state);
  assert.ok(rt.classifyMode === 'frame-retain' || rt.classifyMode === 'early-quiet-latch',
    `expected frame-retain or early-quiet-latch, got ${rt.classifyMode}`);
  const glassA = state.activityRuntime.glassCount;
  const runwayA = state.activityRuntime.runwayCount;
  assert.ok(glassA + runwayA > 0, 'expected rocks on glass/runway');
  step(state);
  step(state);
  assert.equal(state.activityRuntime.glassCount, glassA);
  assert.equal(state.activityRuntime.runwayCount, runwayA);
  assert.equal(getClassifyFrameQuietRetainForBench(), true);
});

test('frame quiet retain wakes on rock pose change', () => {
  setClassifyFrameQuietRetainForBench(true);
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  step(state);
  step(state);
  assert.equal(state.activityRuntime && ensureActivityClassified(state), ensureActivityClassified(state));
  // force a fresh tick then pose-wake
  const rock = state.rocks[0];
  rock.pos.x += 12;
  const rt = step(state);
  assert.ok(rt.classifyMode !== 'frame-retain' && rt.classifyMode !== 'early-quiet-latch',
    `pose jump must leave quiet retain, got ${rt.classifyMode}`);
});

test('frame quiet retain wakes on player speed', () => {
  setClassifyFrameQuietRetainForBench(true);
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  step(state);
  step(state);
  state.player.vel.x = 3;
  const rt = step(state);
  assert.notEqual(rt.classifyMode, 'frame-retain');
});

test('frame quiet retain wakes on mining pinFacts', () => {
  setClassifyFrameQuietRetainForBench(true);
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  step(state);
  step(state);
  state.player.data.miningTargetId = state.rocks[0].id;
  const rt = step(state);
  assert.notEqual(rt.classifyMode, 'frame-retain');
});

test('bench toggle off restores per-entity #127 path', () => {
  setClassifyFrameQuietRetainForBench(false);
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  step(state);
  step(state);
  const rt = step(state);
  assert.equal(rt.classifyMode, 'incremental');
  setClassifyFrameQuietRetainForBench(true);
});
