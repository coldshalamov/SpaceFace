import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { vfx } from '../src/render/vfx.js';
import { createShipMicroMotionTracker } from '../src/render/shipMicroMotion.js';
import { resetFrameCostSwitchesForTest } from '../src/render/frameCostSwitches.js';

// rfx socketPoseCache — view-owned socket world-pose memoization. Validity keys on the renderer's
// pose-write stamp (root.userData.sfPoseWriteSeq, the signal _applyPresentationPose sets on every
// application) plus the socket's own composed matrixWorld, so parked emitters pay no ancestor
// walks while a reposed hull still recomputes that same frame.

function makeCtx() {
  return {
    _socketWorldPos: new THREE.Vector3(),
    _socketWorldQuat: new THREE.Quaternion(),
    _socketWorldScale: new THREE.Vector3(),
    _socketForward: new THREE.Vector3(),
    _entityLocalXZ: { x: 0, z: 0 },
    _spawnLocalXZ: { x: 0, z: 0 },
    _frameMembrane: null,
    _vfxFrameSeq: 1,
    _socketWorldPoseCached: vfx._socketWorldPoseCached,
    _socketPoseCacheFor: vfx._socketPoseCacheFor,
    _toLocalXZ(x, z, out) { out.x = x; out.z = z; return out; },
    _writeTrailSocketPose(x, y, z, fx, fy, fz) { return { x, y, z, fx, fy, fz }; },
  };
}

function makeRig() {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  const socket = new THREE.Object3D();
  socket.userData.forward = [0, 0, -1];
  hull.add(socket);
  root.add(hull);
  root.updateMatrixWorld(true);
  const view = { root };
  root.userData = { sfPoseWriteSeq: 7 };
  return { root, hull, socket, view };
}

test('a stamped socket pose is reused until the renderer pose-write seq or the composed matrix moves', () => {
  const ctx = makeCtx();
  const { root, socket, view } = makeRig();
  let walks = 0;
  const original = socket.updateWorldMatrix.bind(socket);
  socket.updateWorldMatrix = (parents, children) => { walks++; return original(parents, children); };

  const first = vfx._trailSocketPoseFromObject.call(ctx, socket, view);
  assert.equal(walks, 1, 'first read composes the world pose');
  assert.ok(first && Number.isFinite(first.x));

  const second = vfx._trailSocketPoseFromObject.call(ctx, socket, view);
  assert.equal(walks, 1, 'unchanged pose and seq reuse the memoized world pose');
  assert.deepEqual(second, first);

  root.userData.sfPoseWriteSeq = 8;
  vfx._trailSocketPoseFromObject.call(ctx, socket, view);
  assert.equal(walks, 2, 'a new pose application invalidates the entry');

  // An out-of-band transform compose (authored motion, manual hull write) also invalidates via
  // the matrix fingerprint even when the renderer never stamped a new pose.
  socket.position.x = 2;
  root.updateMatrixWorld(true);
  vfx._trailSocketPoseFromObject.call(ctx, socket, view);
  assert.equal(walks, 3, 'a composed matrix change invalidates without a new stamp');
});

test('sibling sockets on one view share a single ancestor walk per vfx pass', () => {
  const ctx = makeCtx();
  const { root, hull, socket, view } = makeRig();
  const sibling = new THREE.Object3D();
  sibling.userData.forward = [1, 0, 0];
  sibling.position.set(0.5, 0, 0.5);
  hull.add(sibling);
  root.updateMatrixWorld(true);
  root.userData.sfPoseWriteSeq = 9;

  let ancestorWalks = 0;
  const wrap = (o) => {
    const original = o.updateWorldMatrix.bind(o);
    o.updateWorldMatrix = (parents, children) => {
      if (parents) ancestorWalks++;
      return original(parents, children);
    };
  };
  wrap(socket);
  wrap(sibling);

  vfx._trailSocketPoseFromObject.call(ctx, socket, view);
  assert.equal(ancestorWalks, 1);
  vfx._trailSocketPoseFromObject.call(ctx, sibling, view);
  assert.equal(ancestorWalks, 1, 'the second socket composes only its own leaf');
});

test('the rfx off switch restores an unconditional ancestor walk', () => {
  const ctx = makeCtx();
  const { socket, view } = makeRig();
  let walks = 0;
  const original = socket.updateWorldMatrix.bind(socket);
  socket.updateWorldMatrix = (parents, children) => { walks++; return original(parents, children); };
  globalThis.__sfRfx = { socketPoseCache: false };
  try {
    vfx._trailSocketPoseFromObject.call(ctx, socket, view);
    vfx._trailSocketPoseFromObject.call(ctx, socket, view);
    assert.equal(walks, 2, 'cache disabled -> every read walks');
  } finally {
    delete globalThis.__sfRfx;
    resetFrameCostSwitchesForTest();
  }
});

// rfx cosmeticCadence — craftCombatHot gates the staggered enrichment path: combat-live channels
// (flinch, recoil, tumbles, dock clamps, actuators) force per-frame updates; a fully settled
// record is the only cadence-able case.
test('craftCombatHot holds combat-critical channels per-frame and frees only settled craft', () => {
  const tracker = createShipMicroMotionTracker();
  const entity = { id: 4242, vel: { x: 0, z: 0 }, flags: {}, pos: { x: 0, z: 0 }, rot: 0, alive: true };
  assert.equal(tracker.craftCombatHot(entity, 10), true, 'an unrecorded craft still runs');

  const rec = tracker.getRecord(entity.id);
  rec.frameSim = 10;
  assert.equal(tracker.craftCombatHot(entity, 10), false, 'a settled craft cadences down');

  rec.flinchX = 0.4;
  assert.equal(tracker.craftCombatHot(entity, 10), true, 'a live flinch spring stays per-frame');
  rec.flinchX = 0;

  rec.recoilX = 0.2;
  assert.equal(tracker.craftCombatHot(entity, 10), true, 'a live recoil stays per-frame');
  rec.recoilX = 0;

  rec.subTumbleT = 0.5;
  assert.equal(tracker.craftCombatHot(entity, 10), true, 'a sub-tumble stays per-frame');
  rec.subTumbleT = -1;

  entity.vel.x = 13;
  assert.equal(tracker.craftCombatHot(entity, 10), true, 'motion above the settled speed stays per-frame');
});
