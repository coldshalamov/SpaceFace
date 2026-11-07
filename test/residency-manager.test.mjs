// E6 residency manager: one ready-verdict for every drawable.
//
// Contract under test:
//  - a stamped geometry draws immediately (proof hit);
//  - a small unstamped geometry uploads inline, is stamped by its own draw, and never
//    waits a frame;
//  - an over-budget unstamped geometry is refused, held invisible, queued once, and only
//    released when the off-screen residency pass reports it resident;
//  - the pop-in counter (`visibleUnready`) counts drawables that were visible before their
//    data existed, and never counts one that was held while already hidden;
//  - liveness: upload errors, a full queue and TTL expiry retry or fail open, so a held
//    drawable never stays invisible with nothing queued; dispose releases every hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import {
  createResidencyManager,
  residencyGeometryBytes,
  RESIDENCY_FRAME_UPLOAD_BYTES,
  RESIDENCY_HELD,
  RESIDENCY_INLINE_UPLOAD_BYTES,
} from '../src/render/residencyManager.js';
import { hasUnresidentGeometry } from '../src/render/startupGpuResidency.js';
import { render } from '../src/render/renderer.js';

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
    const mesh = drawable();
    const geometry = geometryWith(chunk);
    assert.equal(manager.admitGeometry(mesh, geometry), true, `inline ${i + 1}`);
    assert.equal(manager.noteDrawn(mesh, geometry), true, 'the drawn upload charges the wallet');
  }
  const overflow = geometryWith(chunk);
  const overflowMesh = drawable();
  assert.equal(manager.admitGeometry(overflowMesh, overflow), false, 'frame wallet is spent');
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

test('an on-glass hold jumps ahead of a bind-time hold in the drain queue', () => {
  const batches = [];
  const manager = createResidencyManager({ requestRoots: (roots) => { batches.push(roots.slice()); } });
  manager.beginFrame();
  const bindRoot = drawable();
  manager.holdRoot(bindRoot, 'bind');
  const glassRoot = drawable();
  manager.holdRoot(glassRoot, 'over-budget');
  assert.equal(manager.drainUploads(1), 1);
  assert.equal(batches.length, 1);
  assert.equal(batches[0][0], glassRoot, 'the drawable the camera is trying to draw goes first');
});

test('a manager with no driver fails open instead of refusing a draw it cannot resolve', () => {
  const manager = createResidencyManager();
  const mesh = drawable();
  const geometry = geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8);
  manager.beginFrame(0);
  assert.equal(manager.admitGeometry(mesh, geometry), true);
  assert.equal(manager.snapshot().admittedFailOpen, 1);
  assert.equal(manager.snapshot().residencyFailOpen, 0, 'no hold was released');
  assert.equal(manager.noteDrawn(mesh, geometry), true);
});

test('a failed upload retries with backoff, then fails open instead of hiding forever', () => {
  let now = 0;
  let attempts = 0;
  const manager = createResidencyManager({
    now: () => now,
    requestRoots: () => { attempts += 1; throw new Error('decode failed'); },
    onError: () => {},
  });
  const geometry = geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8);
  const mesh = drawable({ parent: {} });
  manager.beginFrame(0);
  assert.equal(manager.admitGeometry(mesh, geometry), false);
  assert.equal(mesh.visible, false, 'held fail-closed');

  now = 300;
  assert.equal(manager.drainUploads(), 1, 'first attempt');
  assert.equal(attempts, 1);
  assert.equal(mesh.visible, false, 'a failed upload never appears unready');
  assert.equal(manager.pendingCount(), 1, 'the error re-queues instead of dropping the request');
  let snap = manager.snapshot();
  assert.equal(snap.uploadFailures, 1);
  assert.equal(snap.uploadRetries, 1);

  now = 400;
  assert.equal(manager.drainUploads(), 0, 'the 4 Hz ceiling still bounds the scheduler');
  now = 560;
  assert.equal(manager.drainUploads(), 1, 'second attempt after the backoff');
  assert.equal(attempts, 2);
  assert.equal(mesh.visible, false);

  now = 1065;
  assert.equal(manager.drainUploads(), 1, 'third attempt');
  assert.equal(attempts, 3);
  snap = manager.snapshot();
  assert.equal(snap.failOpenReleases, 1, 'the bounded window released the hold');
  assert.equal(snap.pending, 0);
  assert.equal(mesh.visible, true, 'a body whose upload keeps failing is not invisible forever');
  assert.equal(manager.isHeld(mesh), false);

  // The one-shot bypass lets the next presented draw upload inline and prove itself.
  assert.equal(manager.admitGeometry(mesh, geometry), true);
  assert.equal(manager.snapshot().admittedFailOpen, 1);
  assert.equal(manager.noteDrawn(mesh, geometry), true);
  assert.equal(geometry.userData.spacefaceGpuResident, true);
});

test('a root over the pending cap waits in heldUnqueued and is re-admitted when space frees', () => {
  let now = 0;
  const batches = [];
  const manager = createResidencyManager({
    now: () => now,
    requestRoots: (roots) => {
      batches.push(roots.slice());
      for (const root of roots) root.userData.sfResidencyGeometry.userData.spacefaceGpuResident = true;
    },
  });
  const roots = [];
  for (let i = 0; i < 64; i++) {
    const root = drawable({ parent: {} });
    manager.holdRoot(root, 'geometry', geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8));
    roots.push(root);
  }
  const overflow = drawable({ parent: {} });
  manager.holdRoot(overflow, 'geometry', geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8));
  let snap = manager.snapshot();
  assert.equal(snap.heldUnqueued, 1, 'the cap spill is visible, not dropped');
  assert.equal(snap.pending, 65, 'heldUnqueued counts as pending work');
  assert.equal(overflow.visible, false, 'still held fail-closed while it waits');

  now = 300;
  assert.equal(manager.drainUploads(2), 2);
  snap = manager.snapshot();
  assert.equal(snap.heldUnqueued, 0, 'space freed, the overflow is re-admitted');
  assert.equal(overflow.visible, false, 're-admission is not a release');

  let guard = 0;
  while (manager.isHeld(overflow) && guard++ < 40) {
    now += 205;
    manager.drainUploads();
  }
  assert.ok(guard < 40, 'the overflow drains');
  assert.equal(overflow.visible, true, 'the re-admitted root releases when its stamp lands');
  assert.equal(manager.pendingCount(), 0);
});

test('a TTL expiry retries an attached request and releases a detached one', () => {
  let now = 0;
  const detached = createResidencyManager({
    now: () => now,
    requestRoots: () => new Promise(() => {}),
  });
  const orphan = drawable({ parent: null });
  detached.holdRoot(orphan, 'geometry', geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8));
  now = 1300;
  assert.equal(detached.drainUploads(), 0, 'nothing is uploaded for a detached root');
  assert.equal(orphan.visible, true, 'a detached request is not left held');
  assert.equal(detached.isHeld(orphan), false);
  assert.equal(detached.pendingCount(), 0);

  now = 0;
  let attempts = 0;
  const attached = createResidencyManager({
    now: () => now,
    requestRoots: () => { attempts += 1; throw new Error('still not ready'); },
  });
  const root = drawable({ parent: {} });
  attached.holdRoot(root, 'geometry', geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8));
  now = 1300;
  assert.equal(attached.drainUploads(), 1, 'the first expiry retries instead of hiding forever');
  assert.equal(attempts, 1);
  assert.equal(attached.snapshot().expiredRetries, 1);
  assert.equal(root.visible, false, 'the retry keeps the fail-closed hold');
  assert.equal(attached.pendingCount(), 1, 'the request is re-queued');

  now = 2600;
  assert.equal(attached.drainUploads(), 0, 'the bounded hold deadline releases rather than stranding');
  const snap = attached.snapshot();
  assert.equal(snap.failOpenReleases, 1);
  assert.equal(snap.pending, 0);
  assert.equal(root.visible, true);
});

test('dispose releases every hold, clears the queues, and freezes the counters', () => {
  let now = 0;
  const manager = createResidencyManager({
    now: () => now,
    requestRoots: () => new Promise(() => {}),
  });
  const a = drawable({ parent: {} });
  const b = drawable({ parent: {} });
  manager.holdRoot(a, 'geometry', geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8));
  manager.holdRoot(b, 'geometry', geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8));
  now = 300;
  assert.equal(manager.drainUploads(1), 1);
  const before = manager.snapshot();
  assert.equal(before.pending, 2, 'one in flight, one queued');

  assert.equal(manager.dispose(), true);
  assert.equal(manager.dispose(), false, 'dispose is idempotent');
  assert.equal(a.visible, true, 'in-flight hold released');
  assert.equal(b.visible, true, 'queued hold released');
  assert.equal(manager.pendingCount(), 0);
  assert.equal(manager.drainUploads(), 0);
  const frozen = manager.snapshot();
  assert.equal(frozen.disposed, true);
  assert.equal(frozen.pending, 0);
  assert.equal(frozen.uploadRequests, before.uploadRequests);
  assert.equal(frozen.draws, before.draws);

  // A disposed manager is inert: the draw path fails open and no counter moves.
  assert.equal(manager.admitGeometry(a, geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8)), true);
  assert.equal(manager.noteRefusedDraw(a, 'geometry-not-resident'), false);
  assert.equal(manager.holdRoot(drawable({ parent: {} }), 'geometry'), false);
  const after = manager.snapshot();
  assert.equal(after.draws, frozen.draws, 'counters are frozen after dispose');
  assert.equal(after.refusedDraws, frozen.refusedDraws);
});

test('an empty InstancedMesh root releases through the same census the manager uses', () => {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.InstancedMesh(geometry, material, 1);
  mesh.count = 0;
  const manager = createResidencyManager({
    hasUnresidentGeometry,
    requestRoots: (roots) => {
      // includeEmpty: the drain uploads a dormant pool's buffers as real work.
      for (const root of roots) root.geometry.userData.spacefaceGpuResident = true;
    },
  });
  try {
    assert.equal(hasUnresidentGeometry(mesh), true, 'count-0 pools are unready until their buffers land');
    assert.equal(manager.holdRoot(mesh, 'bind'), true);
    assert.equal(mesh.visible, false);
    assert.equal(manager.drainUploads(), 1);
    assert.equal(mesh.visible, true, 'the empty pool must not stay held forever');
    assert.equal(manager.isHeld(mesh), false);
    assert.equal(manager.pendingCount(), 0);
    assert.equal(geometry.userData.spacefaceGpuResident, true);
  } finally {
    geometry.dispose();
    material.dispose();
  }
});

test('the renderer drain admits empty geometry with the same census stillPending uses', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const start = source.indexOf('_installResidencyManager() {');
  assert.ok(start >= 0, 'the renderer owns residency manager installation');
  const wiring = source.slice(start, start + 1600);
  assert.match(wiring, /prepareStartupGeometryResidency\(this\.renderer, roots, \{[\s\S]*?includeEmpty: true/,
    'the upload driver must admit the empty geometry the release predicate counts');
  assert.match(wiring, /hasUnresidentGeometry,/,
    'the manager and the driver share one census');
});

test('renderer teardown disposes the residency manager and drops its references', () => {
  const manager = createResidencyManager({ requestRoots: () => {} });
  const root = drawable({ parent: {} });
  manager.holdRoot(root, 'geometry', geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8));
  const owner = {
    _residencyManager: manager,
    _residencyDrainTimer: null,
    renderer: { userData: { sfResidencyManager: manager }, __sfResidencyManager: manager },
  };
  assert.equal(render._releaseResidencyManager.call(owner), true);
  assert.equal(owner._residencyManager, null);
  assert.equal(owner.renderer.__sfResidencyManager, null);
  assert.equal(owner.renderer.userData.sfResidencyManager, null);
  assert.equal(root.visible, true, 'teardown releases the hold');
  assert.equal(manager.snapshot().disposed, true);
});

test('draw-point refusals count every refused drawable, including previously presented ones', () => {
  const manager = createResidencyManager({ requestRoots: () => {} });
  manager.beginFrame(0);
  const first = geometryWith(1024);
  const mesh = drawable();
  assert.equal(manager.admitGeometry(mesh, first), true);
  manager.noteDrawn(mesh, first);

  const replacement = geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8);
  assert.equal(manager.admitGeometry(mesh, replacement), false);
  manager.noteRefusedDraw(mesh, 'geometry-not-resident');
  manager.noteRefusedDraw(mesh, 'geometry-not-resident');

  const fresh = drawable();
  assert.equal(manager.admitGeometry(fresh, geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8)), false);
  manager.noteRefusedDraw(fresh, 'geometry-not-resident');

  const snap = manager.snapshot();
  assert.equal(snap.refusedDraws, 3, 'every refused draw is visible at the draw point');
  assert.equal(snap.visibleUnreadyDraws, 2, 'only the already-presented drawable is a blink');
  assert.equal(snap.visibleUnready, 1, 'the existing hold counter stays for compatibility');
});

test('a hold past the 2 s deadline fails open even while its upload is still pending', () => {
  let now = 0;
  const manager = createResidencyManager({
    now: () => now,
    requestRoots: () => new Promise(() => {}),
  });
  const geometry = geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8);
  const mesh = drawable({ parent: {} });
  manager.beginFrame(0);
  assert.equal(manager.admitGeometry(mesh, geometry), false);
  now = 300;
  assert.equal(manager.drainUploads(), 1);
  assert.equal(manager.isHeld(mesh), true, 'still held while the upload is in flight');
  now = 2100;
  manager.beginFrame(2100);
  assert.equal(mesh.visible, true, 'the bounded hold deadline releases the body');
  assert.equal(manager.isHeld(mesh), false);
  assert.equal(manager.snapshot().failOpenReleases, 1);
  assert.equal(manager.admitGeometry(mesh, geometry), true, 'the next draw takes the pre-E6 inline path');
  assert.equal(manager.snapshot().admittedFailOpen, 1);
});

test('cancelRoot releases a pooled mesh hold and queue entry before reuse', () => {
  const manager = createResidencyManager({
    now: () => 0,
    requestRoots: () => new Promise(() => {}),
  });
  const mesh = drawable({ parent: {} });
  mesh.__sfPresentedOnce = true;
  mesh.__sfInstanceResidentCount = 4;
  manager.holdRoot(mesh, 'bind', geometryWith(RESIDENCY_INLINE_UPLOAD_BYTES * 8));
  assert.equal(manager.drainUploads(), 1);
  assert.equal(manager.isHeld(mesh), true);
  assert.equal(manager.cancelRoot(mesh), true);
  assert.equal(mesh.visible, true);
  assert.equal(manager.isHeld(mesh), false);
  assert.equal(manager.pendingCount(), 0, 'the queue entry is gone with the hold');
  assert.equal(mesh.__sfPresentedOnce, false, 'the next binding is not pre-classified presented');
  assert.equal(mesh.__sfInstanceResidentCount, 0, 'no stale instance proof crosses a pool reuse');
  assert.equal(mesh.userData[RESIDENCY_HELD], false);
});
