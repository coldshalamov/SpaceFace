import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  enqueueSpawnedEntityMesh,
  render,
  spawnedEntityNeedsImmediateMesh,
} from '../src/render/renderer.js';

function stateFor(player = null) {
  const pilot = player || {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
  };
  return {
    mode: 'flight',
    playerId: pilot.id,
    player: { targetId: null },
    entities: new Map([[pilot.id, pilot]]),
    camera: { zoom: 144, fov: 50, aspect: 16 / 9, tilt: 60 },
    settings: { video: {} },
    render: {},
  };
}

test('spawned mesh admission accelerates only picture-owed contacts', () => {
  const state = stateFor();
  const runway = {
    id: 8,
    type: 'ship',
    alive: true,
    pos: { x: 60, z: 0 },
    radius: 18,
    data: {},
  };
  const ambient = {
    id: 9,
    type: 'ship',
    alive: true,
    pos: { x: 5000, z: 0 },
    radius: 18,
    data: {},
  };

  assert.equal(spawnedEntityNeedsImmediateMesh(runway, state), true,
    'a contact spawned into the readable runway cannot wait for the residency poll');
  assert.equal(spawnedEntityNeedsImmediateMesh(ambient, state), false,
    'an ambient spawn keeps the paced residency cadence');

  const owner = {
    state,
    _meshes: new Map(),
    _meshBuildQueue: [],
    _meshBuildQueuedIds: new Set(),
  };
  assert.equal(enqueueSpawnedEntityMesh(owner, runway), true,
    'the event fast path reserves the normal bounded mesh-build drain');
  assert.deepEqual(owner._meshBuildQueue, [runway.id]);
  assert.equal(enqueueSpawnedEntityMesh(owner, runway), false,
    'duplicate spawn notifications do not duplicate a queued build');
  assert.deepEqual(owner._meshBuildQueue, [runway.id]);
  assert.equal(enqueueSpawnedEntityMesh(owner, ambient), false,
    'ambient spawns stay out of the event fast path');
});

test('protected and focused spawns get the same immediate mesh path even outside the glass', () => {
  const state = stateFor();
  const rescue = {
    id: 12,
    type: 'asteroid',
    alive: true,
    pos: { x: 5000, z: 0 },
    radius: 20,
    data: { rescue: true },
  };
  assert.equal(spawnedEntityNeedsImmediateMesh(rescue, state), true,
    'the opening rescue set piece is owed before the normal poll');

  const focused = {
    id: 13,
    type: 'ship',
    alive: true,
    pos: { x: 5000, z: 0 },
    radius: 18,
    data: {},
  };
  state.player.targetId = focused.id;
  assert.equal(spawnedEntityNeedsImmediateMesh(focused, state), true,
    'an explicit render focus is owed even when it is outside the geometric glass');
});

test('a newly built runway asteroid uses the urgent pipeline lane', async () => {
  const frames = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousScheduler = globalThis.scheduler;
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.scheduler = { postTask: (callback) => Promise.resolve().then(callback) };

  try {
    const calls = [];
    const player = {
      id: 'player', type: 'ship', alive: true,
      pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    };
    const asteroid = {
      id: 'runway-asteroid', type: 'asteroid', alive: true,
      pos: { x: 0, z: 130 }, radius: 13, rot: 0, data: {},
    };
    const state = {
      mode: 'flight', simTime: 10, playerId: player.id,
      entities: new Map([[player.id, player], [asteroid.id, asteroid]]),
      entityList: [player, asteroid],
      camera: { zoom: 144, fov: 50, aspect: 16 / 9, tilt: 60 },
      settings: { video: {} },
      render: {
        firstPlayableFrameAt: 1, lastPresentDtMs: 0,
        compileObjectPipelines: (root, options) => calls.push({ root, options }),
      },
    };
    const owner = {
      state,
      scene: new THREE.Scene(),
      _initialMeshReconcileComplete: true,
      _meshBuildLateSkips: 0,
      _meshBuildQueue: [asteroid.id],
      _meshBuildQueueHead: 0,
      _meshBuildQueuedIds: new Set([asteroid.id]),
      _meshes: new Map(),
      _meshesVersion: 0,
      vf: { build: () => new THREE.Group() },
      _bindPresentationMesh() {},
      _frameMembrane: { toLocal: (pos, out) => Object.assign(out, pos) },
    };

    assert.equal(render._drainMeshBuildQueue.call(owner, 1), 1,
      'the runway asteroid is admitted by the mesh-build drain');
    assert.equal(calls.length, 0,
      'the runway pipeline link remains post-present work');
    assert.equal(typeof frames[0], 'function');
    frames.shift()(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options?.urgent, true,
      'a readable runway asteroid must not wait behind ambient pipeline admissions');
  } finally {
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousScheduler === undefined) delete globalThis.scheduler;
    else globalThis.scheduler = previousScheduler;
  }
});
