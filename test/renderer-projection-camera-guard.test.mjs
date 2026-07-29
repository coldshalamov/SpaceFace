// PERF: worldToScreen used to call THREE.Camera#updateMatrixWorld — a decompose plus a 4x4 invert —
// on every projection, and the flight HUD projects ~7 points per frame against a chase camera that
// moves exactly once per frame. These tests pin the self-validating guard in render._syncProjectionCamera:
// a stationary camera refreshes once and returns bit-identical numbers, while position, reparenting,
// or THREE's own dirty flag each force a refresh. They also pin the optional out-parameter.
//
// The assertions are exact (strictEqual, not epsilon) because the guard is a pure cache: a projection
// must never differ in the last bit from the unconditional-refresh behavior it replaced.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { render } from '../src/render/renderer.js';

function installWindowShim() {
  if (globalThis.window && globalThis.window.innerWidth) return;
  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  };
}

// Instruments the camera so we can count the expensive refresh. The wrapper CALLS THROUGH — without
// that, matrixWorldInverse would never be built and every projection would be self-consistent garbage.
function makeHarness() {
  installWindowShim();
  const cam = new THREE.PerspectiveCamera(50, 1920 / 1080, 1, 14000);
  cam.position.set(0, 62, -36);
  cam.lookAt(0, 0, 0);
  const original = cam.updateMatrixWorld.bind(cam);
  const counter = { refreshes: 0 };
  cam.updateMatrixWorld = function countedUpdateMatrixWorld(force) {
    counter.refreshes += 1;
    return original(force);
  };
  // `this` for render.* methods, mirroring the render._updateShadowFollow.call(harness) pattern.
  // Prototype-linked to `render` so worldToScreen can reach its own _syncProjectionCamera helper,
  // while the per-instance cache and frame membrane stay own properties of the harness.
  const host = Object.assign(Object.create(render), {
    cam: { obj: cam },
    _frameMembrane: null,
    _w2sCamCache: null,
  });
  return { host, cam, counter };
}

const POINT = Object.freeze({ x: 140, y: 0, z: 95 });

test('a stationary camera refreshes its matrices once and reprojects bit-identically', () => {
  const { host, counter } = makeHarness();

  const first = render.worldToScreen.call(host, POINT);
  assert.equal(counter.refreshes, 1, 'the first projection must build the camera matrices');

  const second = render.worldToScreen.call(host, POINT);
  const third = render.worldToScreen.call(host, { x: 40, y: 0, z: -20 });

  assert.equal(counter.refreshes, 1, 'an unmoved camera must not redo the matrix inverse');
  assert.strictEqual(second.x, first.x);
  assert.strictEqual(second.y, first.y);
  assert.strictEqual(second.onScreen, first.onScreen);
  assert.ok(Number.isFinite(third.x) && Number.isFinite(third.y), 'cached camera still projects sanely');
  assert.notStrictEqual(third.x, first.x, 'a different world point must still move on screen');
});

test('moving the camera refreshes the matrices and changes the projection', () => {
  const { host, cam, counter } = makeHarness();

  const before = render.worldToScreen.call(host, POINT);
  assert.equal(counter.refreshes, 1);

  // Lateral move with an off-centre point: the result is guaranteed to change (a move along the view
  // axis with an on-axis point could leave x untouched and make the assertion vacuous).
  cam.position.x += 240;
  const after = render.worldToScreen.call(host, POINT);

  assert.equal(counter.refreshes, 2, 'a moved camera must refresh');
  assert.notStrictEqual(after.x, before.x, 'the projection must follow the camera');

  // Rotation alone (quaternion, position untouched) must also be caught.
  const held = render.worldToScreen.call(host, POINT);
  assert.equal(counter.refreshes, 2, 'still stationary between those two calls');
  cam.rotateZ(0.25);
  const rotated = render.worldToScreen.call(host, POINT);
  assert.equal(counter.refreshes, 3, 'a rotated camera must refresh');
  assert.notStrictEqual(rotated.x, held.x, 'the projection must follow camera rotation');
});

test('reparenting refreshes even though the local transform is untouched', () => {
  const { host, cam, counter } = makeHarness();

  const before = render.worldToScreen.call(host, POINT);
  assert.equal(counter.refreshes, 1);

  // Object3D#add does NOT set matrixWorldNeedsUpdate on the child and leaves cam.position alone, so a
  // position/quaternion/scale-only guard would skip here and return a stale, wrong projection.
  const rig = new THREE.Object3D();
  rig.position.set(600, 0, 0);
  rig.updateMatrixWorld(true);
  rig.add(cam);
  cam.matrixWorldNeedsUpdate = false; // worst case: nothing flagged the child dirty

  const after = render.worldToScreen.call(host, POINT);
  assert.equal(counter.refreshes, 2, 'a reparented camera must refresh');
  assert.notStrictEqual(after.x, before.x, 'the projection must reflect the new parent transform');
});

test("THREE's own dirty flag forces a refresh", () => {
  const { host, cam, counter } = makeHarness();

  render.worldToScreen.call(host, POINT);
  assert.equal(counter.refreshes, 1);

  render.worldToScreen.call(host, POINT);
  assert.equal(counter.refreshes, 1, 'clean camera stays cached');

  cam.matrixWorldNeedsUpdate = true;
  render.worldToScreen.call(host, POINT);
  assert.equal(counter.refreshes, 2, 'an externally flagged camera must refresh');
});

test('hand-driven matrix modes fall back to the unconditional refresh', () => {
  const { host, cam, counter } = makeHarness();

  render.worldToScreen.call(host, POINT);
  cam.matrixAutoUpdate = false;
  render.worldToScreen.call(host, POINT);
  render.worldToScreen.call(host, POINT);
  assert.equal(counter.refreshes, 3, 'matrixAutoUpdate:false never takes the cached path');

  cam.matrixAutoUpdate = true;
  cam.matrixWorldAutoUpdate = false;
  render.worldToScreen.call(host, POINT);
  render.worldToScreen.call(host, POINT);
  assert.equal(counter.refreshes, 5, 'matrixWorldAutoUpdate:false never takes the cached path');
});

test('the out-parameter writes in place and matches the allocating form exactly', () => {
  const { host, counter } = makeHarness();

  const allocated = render.worldToScreen.call(host, POINT);
  const sink = { x: -1, y: -1, onScreen: null, marker: 'reused' };
  const returned = render.worldToScreen.call(host, POINT, sink);

  assert.equal(counter.refreshes, 1, 'the out-param form shares the camera cache');
  assert.strictEqual(returned, sink, 'the supplied object is returned, not a copy');
  assert.strictEqual(sink.x, allocated.x);
  assert.strictEqual(sink.y, allocated.y);
  assert.strictEqual(sink.onScreen, allocated.onScreen);
  assert.equal(sink.marker, 'reused', 'unrelated fields on the sink are left alone');
  assert.notStrictEqual(returned, allocated, 'the allocating form must not be handed the same object');

  // A stray non-object second argument (e.g. an index from .map) must not be written through.
  const strayed = render.worldToScreen.call(host, POINT, 2);
  assert.strictEqual(strayed.x, allocated.x);
  assert.strictEqual(strayed.y, allocated.y);
  assert.strictEqual(strayed.onScreen, allocated.onScreen);
});

test('the guard reproduces the unconditional-refresh result on a moving camera path', () => {
  // Ground truth: project the same sequence with an always-refreshing camera, then with the guard.
  // Any divergence in any bit fails.
  const poses = [
    { x: 0, y: 62, z: -36 },
    { x: 0, y: 62, z: -36 },
    { x: 18, y: 62, z: -36 },
    { x: 18, y: 62, z: -36 },
    { x: 18, y: 90, z: -120 },
  ];
  const points = [POINT, { x: -320, y: 4, z: 700 }, { x: 12, y: 0, z: 6 }];

  const truth = [];
  const baseline = makeHarness();
  for (const pose of poses) {
    baseline.cam.position.set(pose.x, pose.y, pose.z);
    for (const p of points) {
      baseline.cam.updateMatrixWorld(); // the pre-guard behavior: refresh before every projection
      const v = new THREE.Vector3(p.x, p.y || 0, p.z).project(baseline.cam);
      truth.push({
        x: (v.x * 0.5 + 0.5) * window.innerWidth,
        y: (-v.y * 0.5 + 0.5) * window.innerHeight,
        onScreen: v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1,
      });
    }
  }

  const guarded = makeHarness();
  let i = 0;
  for (const pose of poses) {
    guarded.cam.position.set(pose.x, pose.y, pose.z);
    for (const p of points) {
      const got = render.worldToScreen.call(guarded.host, p);
      assert.strictEqual(got.x, truth[i].x, `x diverged at sample ${i}`);
      assert.strictEqual(got.y, truth[i].y, `y diverged at sample ${i}`);
      assert.strictEqual(got.onScreen, truth[i].onScreen, `onScreen diverged at sample ${i}`);
      i += 1;
    }
  }
  assert.ok(guarded.counter.refreshes < i, `guard must skip work: ${guarded.counter.refreshes} of ${i}`);
  assert.equal(guarded.counter.refreshes, 3, 'one refresh per distinct camera pose (3 of 5 are repeats)');
});
