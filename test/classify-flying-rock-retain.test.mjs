/**
 * Flying rock / frame retain under #138 residual.
 * Soft-GPU fps not claimed. Picture contract ON.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureActivityClassified,
  setClassifyFrameQuietRetainForBench,
  setClassifyEarlyQuietLatchForBench,
  setClassifyFlyingRockRetainForBench,
  getClassifyFlyingRockRetainForBench,
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
    vel: { x: 40, z: 0 },
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

function flyStep(state) {
  state.player.pos.x += 40 / 60;
  state.tick++;
  state.simTime += 1 / 60;
  return ensureActivityClassified(state);
}

test('flying retain arms after warm flying ticks', () => {
  setClassifyFrameQuietRetainForBench(true);
  setClassifyEarlyQuietLatchForBench(true);
  setClassifyFlyingRockRetainForBench(true);
  assert.equal(getClassifyFlyingRockRetainForBench(), true);
  const state = makeWorld();
  let saw = false;
  for (let i = 0; i < 12; i++) {
    const rt = flyStep(state);
    if (rt.classifyMode === 'flying-frame-retain') saw = true;
  }
  assert.equal(saw, true, 'expected flying-frame-retain mode while cruising');
});

test('bench toggle OFF forces every-tick classify visits while flying', () => {
  setClassifyFlyingRockRetainForBench(false);
  const state = makeWorld();
  for (let i = 0; i < 8; i++) {
    const rt = flyStep(state);
    assert.notEqual(rt.classifyMode, 'flying-frame-retain');
    assert.ok((rt.classifyVisits | 0) > 0);
  }
  setClassifyFlyingRockRetainForBench(true);
});

test('flying retain wakes on rock pose jump', () => {
  setClassifyFlyingRockRetainForBench(true);
  const state = makeWorld();
  for (let i = 0; i < 6; i++) flyStep(state);
  const rock = state.rocks[0];
  const before = rock.activity && rock.activity.presentationTier;
  rock.pos.x += 500;
  const rt = flyStep(state);
  assert.notEqual(rt.classifyMode, 'flying-frame-retain', 'pose jump must force a visit');
  const after = rock.activity && rock.activity.presentationTier;
  assert.notEqual(after, before, 'pose jump must reclassify presentation tier');
});

test('flying retain wakes on mining pin fact', () => {
  setClassifyFlyingRockRetainForBench(true);
  const state = makeWorld();
  for (let i = 0; i < 6; i++) flyStep(state);
  const rock = state.rocks[3];
  state.player.data.miningTargetId = rock.id;
  flyStep(state);
  const pins = (rock.activity && rock.activity.pins) || [];
  assert.ok(
    pins.includes('PLAYER_MINING_TARGET'),
    `expected mining pin, got ${JSON.stringify(pins)}`,
  );
});

test('flying retain does not keep stale glass when player leaves the ring', () => {
  setClassifyFlyingRockRetainForBench(true);
  const state = makeWorld();
  // Cruise far past the rock ring so rocks leave the glass.
  for (let i = 0; i < 4000; i++) flyStep(state);
  const rock = state.rocks[0];
  const rt = ensureActivityClassified(state);
  const origin = state.player.pos;
  const dx = rock.pos.x - origin.x;
  const dz = rock.pos.z - origin.z;
  const onGlass = Math.abs(dx) <= rt.glassHalfX + rock.radius
    && Math.abs(dz) <= rt.glassHalfZ + rock.radius;
  assert.equal(onGlass, false, 'rock should be off glass after long cruise');
  const pres = rock.activity && rock.activity.presentationTier;
  assert.notEqual(pres, 'R0_GLASS', `stale glass stamp leaked: ${pres}`);
});
