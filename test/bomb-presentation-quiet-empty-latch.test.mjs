import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BombPresentationBatch,
  updateBombPresentation,
  releaseBombPresentation,
  bombPresentationStats,
} from '../src/render/bombPresentation.js';

function bomb(id = 1, kind = 'bomb_singularity') {
  return {
    id,
    alive: true,
    type: 'bomb',
    pos: { x: 1000, z: 2000 },
    prevPos: { x: 1000, z: 2000 },
    vel: { x: 80, z: 0 },
    data: {
      bombId: kind,
      phase: 'field',
      fieldStartedAt: 0,
      fieldEndsAt: 5,
      spawnedAt: 0,
      armed: true,
    },
  };
}

function world(bombs = [], version = 1) {
  const list = bombs.slice();
  return {
    mode: 'flight',
    simTime: 1,
    entityList: list,
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version,
      bombs: list,
    },
    world: { frameOrigin: { x: 1000, z: 2000 } },
    settings: { video: {}, accessibility: { id: 'full' } },
    render: {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
    },
  };
}

test('quiet empty latch skips after first empty publish and wakes on entityIndexVersion', () => {
  const s = world([bomb()]);
  updateBombPresentation(s);
  // Current master draws telegraph + flow parcels + particles through separate
  // pools — the contract is "the live bomb produced draws", not a draw count.
  assert.ok(bombPresentationStats(s).drawCalls >= 1);
  const owner = s.render.scene.children[0];
  assert.ok(owner);
  // Kill the bomb without bumping version first — one empty publish latches.
  s.entityIndex.bombs[0].alive = false;
  updateBombPresentation(s);
  assert.equal(bombPresentationStats(s).drawCalls, 0);
  assert.equal(bombPresentationStats(s).vertices, 0);
  // Grab the batch via a second empty update that should skip (still version=1).
  // Re-fetch owner through WeakMap by running another empty tick.
  const batch = new BombPresentationBatch(new THREE.Scene());
  // Use the live owner path: drain bombs array and keep version.
  s.entityIndex.bombs.length = 0;
  updateBombPresentation(s); // empty publish → latch
  updateBombPresentation(s); // quiet skip
  updateBombPresentation(s); // quiet skip
  assert.equal(bombPresentationStats(s).drawCalls, 0);

  // Dirty wake: membership version bumps + new bomb.
  s.entityIndex.version = 2;
  s.entityIndex.bombs.push(bomb(9));
  s.entityList = s.entityIndex.bombs;
  updateBombPresentation(s);
  assert.ok(bombPresentationStats(s).drawCalls >= 1);
  assert.ok(bombPresentationStats(s).vertices > 0);

  // Drain again → re-latch.
  s.entityIndex.bombs.length = 0;
  s.entityIndex.version = 3;
  updateBombPresentation(s);
  updateBombPresentation(s);
  assert.equal(bombPresentationStats(s).drawCalls, 0);
  releaseBombPresentation(s);
  batch.dispose();
});

test('quiet latch refuses without entity index version (entityList fallback stays live)', () => {
  // No camera → cull off, so the telegraph is not frustum-dependent.
  const s = {
    mode: 'flight',
    simTime: 1,
    entityList: [],
    world: { frameOrigin: { x: 1000, z: 2000 } },
    settings: { video: {} },
    render: { scene: new THREE.Scene() },
  };
  // Force an owner into existence, then empty without an index.
  s.entityList.push(bomb());
  updateBombPresentation(s);
  assert.ok(bombPresentationStats(s).drawCalls >= 1);
  assert.ok(s.render.scene.children.length >= 1);
  s.entityList.length = 0;
  updateBombPresentation(s);
  assert.equal(bombPresentationStats(s).drawCalls, 0);
  // Without a versioned index the latch must not stick — another empty tick still
  // runs the publish path. Picture stays empty; no throw.
  updateBombPresentation(s);
  assert.equal(bombPresentationStats(s).vertices, 0);
  assert.ok(s.render.scene.children.length >= 1);
  releaseBombPresentation(s);
});
