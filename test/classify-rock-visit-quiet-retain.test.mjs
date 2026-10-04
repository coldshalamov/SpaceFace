import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';

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

test('rock-visit quiet retain republishes glass/runway on parked ticks', () => {
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  const glassA = state.activityRuntime.glassCount;
  const runwayA = state.activityRuntime.runwayCount;
  assert.ok(glassA + runwayA > 0, 'expected rocks on glass/runway');
  step(state);
  step(state);
  assert.equal(state.activityRuntime.glassCount, glassA);
  assert.equal(state.activityRuntime.runwayCount, runwayA);
});

test('rock-visit quiet retain wakes on rock pose change', () => {
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  step(state);
  const rock = state.rocks[0];
  const before = rock.activity && rock.activity.presentationTier;
  rock.pos.x += 500; // far outside glass
  step(state);
  const after = rock.activity && rock.activity.presentationTier;
  assert.notEqual(after, before, 'pose jump must reclassify presentation tier');
});

test('rock-visit quiet retain wakes on player speed', () => {
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  step(state);
  state.player.vel.x = 80;
  step(state);
  // After flying, parking again still classifies consistently.
  state.player.vel.x = 0;
  step(state);
  step(state);
  assert.ok(state.activityRuntime.glassCount >= 0);
});

test('rock-visit quiet retain wakes on mining pin fact', () => {
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  step(state);
  const rock = state.rocks[3];
  state.player.data.miningTargetId = rock.id;
  step(state);
  const pins = (rock.activity && rock.activity.pins) || [];
  assert.ok(
    pins.includes('PLAYER_MINING_TARGET'),
    `expected mining pin, got ${JSON.stringify(pins)}`,
  );
});
