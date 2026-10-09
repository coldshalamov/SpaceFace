/**
 * Chase lookAt retain: settled eye+target restores cached base quat; quiet chase
 * drift retains inside a 0.25 WU cell (#79); moving cell-cross and bench-off paths
 * still match Three lookAt. Soft-GPU fps not claimed.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  applyChaseLookAt,
  setChaseLookAtRetainForBench,
  getChaseLookAtRetainForBench,
  setChaseLookAtRetainPosQuantizeForBench,
  getChaseLookAtRetainPosQuantizeForBench,
} from '../src/render/camera.js';

function freshCache() {
  return {
    eyeX: NaN, eyeY: NaN, eyeZ: NaN, targetX: NaN, targetZ: NaN, baseQuat: null,
  };
}

function quatDelta(a, b) {
  return 1 - Math.abs(a.dot(b));
}

test('retain is on by default and bench toggle restores always-lookAt', () => {
  assert.equal(getChaseLookAtRetainForBench(), true);
  setChaseLookAtRetainForBench(false);
  assert.equal(getChaseLookAtRetainForBench(), false);
  setChaseLookAtRetainForBench(true);
  assert.equal(getChaseLookAtRetainForBench(), true);
});

test('retain-key pos quantize is on by default and bench toggle restores bit-identical keys', () => {
  assert.equal(getChaseLookAtRetainPosQuantizeForBench(), true);
  setChaseLookAtRetainPosQuantizeForBench(false);
  assert.equal(getChaseLookAtRetainPosQuantizeForBench(), false);
  setChaseLookAtRetainPosQuantizeForBench(true);
  assert.equal(getChaseLookAtRetainPosQuantizeForBench(), true);
});

test('settled eye+target retains after the first lookAt', () => {
  setChaseLookAtRetainForBench(true);
  setChaseLookAtRetainPosQuantizeForBench(true);
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const cache = freshCache();
  cam.position.set(10, 80, -40);
  assert.equal(applyChaseLookAt(cam, 10, 80, -40, 1, -2, cache), true);
  const first = cam.quaternion.clone();
  cam.position.set(10, 80, -40);
  assert.equal(applyChaseLookAt(cam, 10, 80, -40, 1, -2, cache), false);
  assert.ok(quatDelta(first, cam.quaternion) < 1e-12);
});

test('eye change across a retain cell forces a fresh lookAt', () => {
  setChaseLookAtRetainForBench(true);
  setChaseLookAtRetainPosQuantizeForBench(true);
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const cache = freshCache();
  cam.position.set(10, 80, -40);
  applyChaseLookAt(cam, 10, 80, -40, 1, -2, cache);
  cam.position.set(11, 80, -40);
  assert.equal(applyChaseLookAt(cam, 11, 80, -40, 1, -2, cache), true);
});

test('retain-key pos quantize holds quiet chase drift inside a 0.25 WU cell', () => {
  setChaseLookAtRetainForBench(true);
  setChaseLookAtRetainPosQuantizeForBench(true);
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const cache = freshCache();
  const base = { x: 12, y: 90, z: -50, tx: 3, tz: -2 };
  cam.position.set(base.x, base.y, base.z);
  assert.equal(
    applyChaseLookAt(cam, base.x, base.y, base.z, base.tx, base.tz, cache),
    true,
  );
  const first = cam.quaternion.clone();
  let retained = 0;
  for (let i = 1; i <= 40; i++) {
    const ex = base.x + ((i * 0.011) % 0.12);
    const ey = base.y + ((i * 0.003) % 0.12);
    const ez = base.z + ((i * 0.007) % 0.12);
    const tx = base.tx + ((i * 0.005) % 0.12);
    const tz = base.tz + ((i * 0.009) % 0.12);
    cam.position.set(ex, ey, ez);
    if (!applyChaseLookAt(cam, ex, ey, ez, tx, tz, cache)) retained += 1;
  }
  assert.equal(retained, 40);
  assert.ok(quatDelta(first, cam.quaternion) < 1e-12);
});

test('bench toggle disables retain-key pos quantize (drift misses retain)', () => {
  setChaseLookAtRetainForBench(true);
  setChaseLookAtRetainPosQuantizeForBench(false);
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const cache = freshCache();
  const base = { x: 12, y: 90, z: -50, tx: 3, tz: -2 };
  cam.position.set(base.x, base.y, base.z);
  applyChaseLookAt(cam, base.x, base.y, base.z, base.tx, base.tz, cache);
  let ran = 0;
  for (let i = 1; i <= 20; i++) {
    const ex = base.x + i * 0.01;
    const ez = base.z + i * 0.01;
    cam.position.set(ex, base.y, ez);
    if (applyChaseLookAt(cam, ex, base.y, ez, base.tx, base.tz, cache)) ran += 1;
  }
  assert.equal(ran, 20);
  setChaseLookAtRetainPosQuantizeForBench(true);
});

test('retain on/off agree on settled and cell-crossing sequences (quantize off)', () => {
  // Bit-identical oracle: disable key quantize so retain only hits exact repeats.
  setChaseLookAtRetainPosQuantizeForBench(false);
  const camOff = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const camOn = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const cacheOff = freshCache();
  const cacheOn = freshCache();
  const _rollQ = new THREE.Quaternion();
  const forward = new THREE.Vector3(0, 0, -1);

  for (let i = 0; i < 60; i++) {
    const settled = i % 4 !== 0;
    const t = i * 0.11;
    const ex = settled ? 12 : 12 + Math.sin(t);
    const ey = 90;
    const ez = settled ? -50 : -50 + Math.cos(t);
    const tx = settled ? 3 : 3 + Math.sin(t * 0.25);
    const tz = settled ? -2 : -2 + Math.cos(t * 0.25);
    const roll = settled ? 0 : Math.sin(t) * 0.04;

    setChaseLookAtRetainForBench(false);
    camOff.position.set(ex, ey, ez);
    applyChaseLookAt(camOff, ex, ey, ez, tx, tz, cacheOff);
    _rollQ.setFromAxisAngle(forward, roll);
    camOff.quaternion.multiply(_rollQ);

    setChaseLookAtRetainForBench(true);
    camOn.position.set(ex, ey, ez);
    applyChaseLookAt(camOn, ex, ey, ez, tx, tz, cacheOn);
    _rollQ.setFromAxisAngle(forward, roll);
    camOn.quaternion.multiply(_rollQ);

    assert.ok(
      quatDelta(camOff.quaternion, camOn.quaternion) < 1e-9,
      `quat drift at i=${i}`,
    );
  }
  setChaseLookAtRetainForBench(true);
  setChaseLookAtRetainPosQuantizeForBench(true);
});

test('bench-off never retains', () => {
  setChaseLookAtRetainForBench(false);
  setChaseLookAtRetainPosQuantizeForBench(true);
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const cache = freshCache();
  cam.position.set(10, 80, -40);
  assert.equal(applyChaseLookAt(cam, 10, 80, -40, 0, 0, cache), true);
  cam.position.set(10, 80, -40);
  assert.equal(applyChaseLookAt(cam, 10, 80, -40, 0, 0, cache), true);
  setChaseLookAtRetainForBench(true);
});
