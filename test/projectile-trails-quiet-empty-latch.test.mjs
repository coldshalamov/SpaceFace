/**
 * #122 projectile-trails-quiet-empty-latch — quiet empty projectile bag skips
 * indexedTypeScan + diag reset; dirty-wake on entityIndexVersion / cache dirty.
 * Soft-GPU fps not claimed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { vfx } from '../src/render/vfx.js';

const PLAYER_ID = 1;
const DT = 1 / 60;

function makeHarness() {
  const scene = new THREE.Scene();
  const player = {
    id: PLAYER_ID,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
  };
  const state = {
    playerId: PLAYER_ID,
    mode: 'flight',
    entities: new Map([[PLAYER_ID, player]]),
    entityList: [player],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: 1,
      projectiles: [],
      ships: [player],
    },
    simTime: 0,
    tick: 0,
    camera: { focus: { x: 0, z: 0 } },
    world: { frameOrigin: { x: 0, z: 0 } },
    settings: {
      video: { particleQuality: 'low', motionReduce: false, engineTrails: false },
      accessibility: { flashReduce: false },
    },
    render: {
      scene,
      camera: new THREE.PerspectiveCamera(),
      viewport: { height: 720 },
      interpolationAlpha: 1,
    },
    player: {},
    fields: { active: [] },
    combat: { entities: {}, statusNextPendingSeq: 0 },
  };
  const bus = createBus();
  const system = Object.create(vfx);
  system.init({
    state,
    bus,
    helpers: {
      player: () => player,
    },
  });
  return { system, state, bus, player };
}

test('projectile-trails quiet-latches on empty projectile bag', () => {
  const { system, state } = makeHarness();
  assert.equal(system._projectileTrailsRelevant(), false);
  assert.equal(system._projectileTrailsQuietEmpty, true, 'empty bag must latch');
  assert.equal(system._projectileTrailsQuietIndexVersion, 1);

  let refreshCalls = 0;
  const orig = system._refreshProjectileCandidates.bind(system);
  system._refreshProjectileCandidates = (...args) => {
    refreshCalls += 1;
    return orig(...args);
  };

  for (let i = 0; i < 40; i++) {
    assert.equal(system._projectileTrailsRelevant(), false);
  }
  assert.equal(refreshCalls, 0, 'latched ticks must skip candidate refresh');
  assert.equal(system._projectileTrailsQuietEmpty, true);
  assert.equal(system._projectileTrailsQuietIndexVersion, state.entityIndex.version);
});

test('entityIndexVersion dirty-wake resumes then re-latches when empty', () => {
  const { system, state, player } = makeHarness();
  assert.equal(system._projectileTrailsRelevant(), false);
  assert.equal(system._projectileTrailsQuietEmpty, true);

  const proj = {
    id: 77,
    type: 'projectile',
    alive: true,
    pos: { x: 10, z: 0 },
    vel: { x: 200, z: 0 },
    prevPos: { x: 8, z: 0 },
    data: { weaponId: 'pulse-bolt' },
  };
  state.entityIndex.version = 2;
  state.entityIndex.projectiles = [proj];
  state.entityList = [player, proj];

  assert.equal(system._projectileTrailsRelevant(), true, 'must wake and see projectile');
  assert.equal(system._projectileTrailsQuietEmpty, false);
  assert.equal(system._projectileCandidates.length, 1);

  state.entityIndex.version = 3;
  state.entityIndex.projectiles = [];
  state.entityList = [player];
  assert.equal(system._projectileTrailsRelevant(), false);
  assert.equal(system._projectileTrailsQuietEmpty, true);
  assert.equal(system._projectileTrailsQuietIndexVersion, 3);
});

test('projectile cache dirty-wake resumes without version bump', () => {
  const { system, state, player } = makeHarness();
  assert.equal(system._projectileTrailsRelevant(), false);
  assert.equal(system._projectileTrailsQuietEmpty, true);

  const proj = {
    id: 88,
    type: 'projectile',
    alive: true,
    pos: { x: 12, z: 0 },
    vel: { x: 180, z: 0 },
    prevPos: { x: 10, z: 0 },
    data: { weaponId: 'pulse-bolt' },
  };
  // Same version; explicit dirty mark (spawn path) must wake.
  state.entityIndex.projectiles = [proj];
  state.entityList = [player, proj];
  system._markProjectileCacheDirty();

  assert.equal(system._projectileTrailsRelevant(), true, 'cache dirty must wake');
  assert.equal(system._projectileTrailsQuietEmpty, false);
});

test('frame update keeps latch across quiet ticks', () => {
  const { system } = makeHarness();
  assert.equal(system._projectileTrailsRelevant(), false);
  assert.equal(system._projectileTrailsQuietEmpty, true);

  let refreshCalls = 0;
  const orig = system._refreshProjectileCandidates.bind(system);
  system._refreshProjectileCandidates = (...args) => {
    refreshCalls += 1;
    return orig(...args);
  };

  system.update(DT);
  system.update(DT);
  system.update(DT);
  assert.equal(system._projectileTrailsQuietEmpty, true);
  assert.equal(refreshCalls, 0, 'quiet update must not refresh candidates');
});
