// E6 residency manager: one ready-verdict for every drawable.
//
// Contract under test:
//  - a stamped geometry draws immediately (proof hit);
//  - a small unstamped geometry uploads inline, is stamped by its own draw, and never
//    waits a frame;
//  - an over-budget unstamped geometry is refused, held invisible, queued once, and only
//    released when the off-screen residency pass reports it resident;
//  - the pop-in counter (`visibleUnready`) counts drawables that were visible before their
//    data existed, and never counts one that was held while already hidden.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createResidencyManager,
  residencyGeometryBytes,
  RESIDENCY_FRAME_UPLOAD_BYTES,
  RESIDENCY_HELD,
  RESIDENCY_INLINE_UPLOAD_BYTES,
} from '../src/render/residencyManager.js';

function geometryWith(bytes, extra = {}) {
  return {
    userData: {},
    attributes: { position: { array: new Float32Array(bytes / 4) } },
    ...extra,
  };
}

function drawable(extra = {}) {
  return { visible: true, userData: {}, isMesh: true, parent: null, ...extra };
}

test('geometry bytes are summed once and cached on the geometry', () => {
  const geometry = {
    userData: {},
    attributes: {
      position: { array: new Float32Array(64) },
      normal: { array: new Float32Array(32) },
    },
    index: { array: new Uint16Array(16) },
  };
  const expected = 64 * 4 + 32 * 4 + 16 * 2;
  assert.equal(residencyGeometryBytes(geometry), expected);
  assert.equal(geometry.userData.sfResidencyBytes, expected);
  // A second census does not re-walk the attributes: poison them and read the cache.
  geometry.attributes = null;
  assert.equal(residencyGeometryBytes(geometry), expected);
});

test('a resident geometry is admitted and never queued', () => {
  const requests = [];
  const manager = createResidencyManager({ requestRoots: (roots) => requests.push(roots) });
  const geometry = geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 4);
  geometry.userData.spacefaceGpuResident = true;
  const mesh = drawable();
  assert.equal(manager.admitGeometry(mesh, geometry), true);
  assert.equal(manager.pendingCount(), 0);
  assert.equal(manager.snapshot().admittedResident, 1);
  assert.equal(mesh.visible, true);
  assert.equal(requests.length, 0);
});

test('a small unstamped geometry uploads inline and is stamped by its own draw', () => {
  const manager = createResidencyManager({ requestRoots: () => {} });
  manager.beginFrame();
  const geometry = geometryWith(1024);
  const mesh = drawable();
  assert.equal(manager.admitGeometry(mesh, geometry), true, 'inline budget admits it');
  assert.equal(manager.noteDrawn(mesh, geometry), true, 'the draw records the proof');
  assert.equal(geometry.userData.spacefaceGpuResident, true);
  manager.beginFrame();
  assert.equal(manager.admitGeometry(mesh, geometry), true);
  assert.equal(manager.snapshot().admittedInline, 1);
  assert.equal(manager.snapshot().heldDraws, 0);
});

test('the inline wallet is per frame: once spent, the next upload waits', () => {
  const requests = [];
  const manager = createResidencyManager({ requestRoots: (roots) => requests.push(roots) });
  manager.beginFrame();
  const chunk = RESIDENCY_INLINE_UPLOAD_BYTES;
  const perFrame = Math.floor(RESIDENCY_FRAME_UPLOAD_BYTES / chunk);
  for (let i = 0; i < perFrame; i++) {
    assert.equal(manager.admitGeometry(drawable(), geometryWith(chunk)), true, `inline ${i + 1}`);
  }
  const overflow = geometryWith(chunk);
  assert.equal(manager.admitGeometry(drawable(), overflow), false, 'frame wallet is spent');
  assert.equal(manager.pendingCount(), 1, 'the overflow is queued once');
  manager.beginFrame();
  assert.equal(manager.admitGeometry(drawable(), overflow), true, 'next frame the wallet resets');
});

test('an over-budget geometry is held invisible, queued once, and counted as pre-admission', async () => {
  const batches = [];
  let release = null;
  const manager = createResidencyManager({
    requestRoots: (roots) => {
      batches.push(roots.slice());
      return new Promise((resolve) => { release = resolve; });
    },
  });
  manager.beginFrame();
  const geometry = geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8);
  const mesh = drawable();
  for (let i = 0; i < 3; i++) {
    assert.equal(manager.admitGeometry(mesh, geometry), false, 'never submits an unready drawable');
  }
  assert.equal(mesh.visible, false, 'held fail-closed');
  assert.equal(mesh.userData[RESIDENCY_HELD], true);
  assert.equal(manager.snapshot().uploadRequests, 1, 'requests dedupe across refused draws');
  assert.equal(manager.snapshot().preAdmittedHolds, 1, 'held before its first presentation');
  assert.equal(manager.snapshot().visibleUnready, 0, 'it was never on screen, so it is not a blink');
  // Drain hands the drawable to the off-screen driver exactly once.
  assert.equal(manager.drainUploads(), 1);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 1);
  assert.equal(manager.drainUploads(), 0, 'in-flight work is not re-queued');
  // The driver's residency pass stamps the geometry; the settle releases the hold.
  geometry.userData.spacefaceGpuResident = true;
  release();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(mesh.visible, true, 'released once resident');
  assert.equal(mesh.userData[RESIDENCY_HELD], false);
  const snap = manager.snapshot();
  assert.equal(snap.releasedRoots, 1);
  assert.equal(snap.firstResidentDelaySamples, 1);
  assert.equal(snap.pending, 0);
});

test('a root that still holds unresident geometry stays held after a batch', async () => {
  let release = null;
  const manager = createResidencyManager({
    requestRoots: () => new Promise((resolve) => { release = resolve; }),
    hasUnresidentGeometry: () => true,
  });
  manager.beginFrame();
  const geometry = geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8);
  const mesh = drawable();
  manager.admitGeometry(mesh, geometry);
  manager.drainUploads();
  release();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(mesh.visible, false, 'a partial upload never reveals the drawable');
  assert.equal(manager.isHeld(mesh), true);
  assert.equal(manager.pendingCount(), 1, 'a partial upload is re-queued, not stranded');
});

test('a failed upload keeps the drawable held and records the failure', async () => {
  const failures = [];
  const manager = createResidencyManager({
    requestRoots: () => Promise.reject(new Error('decode failed')),
    onError: (message) => failures.push(message),
  });
  manager.beginFrame();
  const geometry = geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8);
  const mesh = drawable();
  manager.admitGeometry(mesh, geometry);
  manager.drainUploads();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(mesh.visible, false, 'a failed body never appears unready');
  assert.equal(manager.snapshot().uploadFailures, 1);
  assert.equal(failures.length, 1);
});

test('a drawable that was already presented and becomes unready again is a blink', () => {
  const manager = createResidencyManager({ requestRoots: () => {} });
  // First life: a small resident draw, so the drawable has been presented.
  manager.beginFrame();
  const first = geometryWith(1024);
  const mesh = drawable();
  assert.equal(manager.admitGeometry(mesh, first), true);
  manager.noteDrawn(mesh, first);
  // Second life: a new, over-budget geometry replaces it.
  manager.beginFrame();
  const replacement = geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8);
  assert.equal(manager.admitGeometry(mesh, replacement), false);
  const snap = manager.snapshot();
  assert.equal(snap.visibleUnready, 1, 'drawn before, unready now: the blink class');
  assert.equal(snap.preAdmittedHolds, 0);
});

test('a drawable hidden before its first presentation stays hidden and is not a blink', () => {
  const manager = createResidencyManager({ requestRoots: () => {} });
  manager.beginFrame();
  const geometry = geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8);
  const mesh = drawable({ visible: false });
  manager.admitGeometry(mesh, geometry);
  assert.equal(mesh.visible, false);
  assert.equal(manager.snapshot().visibleUnready, 0, 'never appeared, so it is not a pop-in');
  geometry.userData.spacefaceGpuResident = true;
  manager.releaseRoot(mesh);
  assert.equal(mesh.visible, false, 'authored hidden state is preserved');
});

test('BatchedMesh owns its own residency and is never gated here', () => {
  const manager = createResidencyManager({ requestRoots: () => { throw new Error('must not queue'); } });
  manager.beginFrame();
  const batched = { isBatchedMesh: true, visible: true, userData: {} };
  assert.equal(manager.admitGeometry(batched, geometryWith(1)), true);
  assert.equal(manager.snapshot().heldDraws, 0);
});
