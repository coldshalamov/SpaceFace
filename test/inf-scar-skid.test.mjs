// inf-scar-skid — the lasting scar says which way the shot was travelling.
//
// Every lasting hull scar used to be the same round splat regardless of how the shot arrived: a
// railgun slug raking across a hull at a shallow angle left the same mark as a dead-center
// strike. Now the lasting mark carries the incoming shot's surface-projected skid: a grazing
// hit stretches downrange into a gouge pointing where the shot was travelling, a head-on strike
// keeps the round blast seat, the skid is stored hull-local so it turns with the hull, and the
// pool's shader aligns the card frame with it. Degenerate truth fails closed to the legacy mark.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import {
  SCAR_SKID_HEAD_ON_DOT,
  SCAR_SKID_STRETCH_MAX,
  resolveScarSkid,
  scarSkidSize,
} from '../src/render/weapons/scarDirection.js';
import { HullScorchPool } from '../src/render/weapons/contactMarks.js';

test('a grazing rake stretches the mark downrange along the shot path', () => {
  // Outward normal +X, shot raking across the surface along −Z: a pure side graze.
  const skid = resolveScarSkid(1, 0, 0, 0, 0, -1, {});
  assert.ok(skid.stretch > 1 + SCAR_SKID_STRETCH_MAX * 0.9, `a pure graze stretches fully (${skid.stretch.toFixed(2)})`);
  assert.ok(Math.hypot(skid.skidX, skid.skidY, skid.skidZ) > 0.99, 'the skid axis is unit');
  // The skid points downrange: along the approach, not back along it.
  assert.ok(skid.skidZ < 0, 'the skid points where the shot was travelling');
  // The skid lies in the surface plane: perpendicular to the outward normal.
  assert.ok(Math.abs(skid.skidX) < 1e-6, `skid is in-plane (x ${skid.skidX.toExponential(1)})`);
});

test('a head-on strike keeps the round blast seat', () => {
  // Approach straight into the surface (≈ −normal): no skid, no stretch, exactly the legacy mark.
  const skid = resolveScarSkid(1, 0, 0, -1, 0, 0, {});
  assert.equal(skid.skidX, 0);
  assert.equal(skid.skidZ, 0);
  assert.equal(skid.stretch, 1);
});

test('oblique hits land on a continuous scale between round and fully stretched', () => {
  const sizes = [];
  for (const [nx, nz, ax, az] of [
    [1, 0, -1, 0],      // head-on
    [1, 0, -0.9, -0.436], // slight rake
    [1, 0, -0.5, -0.866], // strong rake
    [1, 0, 0, -1],      // pure graze
  ]) {
    const skid = resolveScarSkid(nx, 0, nz, ax, 0, az, {});
    sizes.push(skid.stretch);
  }
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i] > sizes[i - 1], `stretch grows with the rake angle (${sizes.map((s) => s.toFixed(2)).join(' < ')} )`);
  }
  assert.equal(sizes[0], 1);
  assert.ok(sizes[sizes.length - 1] <= 1 + SCAR_SKID_STRETCH_MAX + 1e-9);
});

test('degenerate truth fails closed to the legacy round mark', () => {
  const zero = resolveScarSkid(0, 0, 0, 0, 0, -1, {});
  assert.equal(zero.stretch, 1, 'a zero normal cannot orient a mark');
  assert.equal(resolveScarSkid(1, 0, 0, 0, 0, 0, {}).stretch, 1, 'a zero approach cannot either');
  assert.equal(resolveScarSkid(1, 0, 0, NaN, 0, NaN, {}).stretch, 1);
  assert.equal(resolveScarSkid(1, 0, 0, 0, 0, -1, {}).grazing > 0.9, true);
});

test('scarSkidSize stretches the width along the skid only', () => {
  const out = scarSkidSize(1.8, 1.15, 2.2, {});
  assert.ok(Math.abs(out.width - 1.8 * 2.2) < 1e-9);
  assert.equal(out.height, 1.15, 'height is untouched');
  const legacy = scarSkidSize(1.8, 1.15, 1, {});
  assert.equal(legacy.width, 1.8, 'a round mark keeps the authored size exactly');
  assert.equal(scarSkidSize(1.8, 1.15, NaN, {}).width, 1.8, 'unknown stretch is the legacy mark');
});

test('the pool carries the skid through spawn and writes it with the rotated pose', () => {
  const pool = new HullScorchPool(null);
  const slot = pool.spawn({
    targetId: 'hull-1',
    localX: 3, localY: 0.08, localZ: -4,
    nx: 0.8, ny: 0.08, nz: 0.6,
    width: 1.8, height: 1.15,
    skidX: 0, skidY: 0, skidZ: -1,
    stretch: 2.1,
    life: 30,
  });
  assert.ok(slot >= 0);
  const s = pool.slots[slot];
  assert.equal(s.skidZ, -1);
  assert.equal(s.stretch, 2.1);
  // A pose callback that reports the hull-turned skid must land in the attribute; the mark
  // without skid keeps the round frame (zeros + 1).
  pool.spawn({ targetId: 'hull-2', width: 1.6, height: 1.1, life: 2 });
  pool.update(0.016, (p) => {
    if (p.targetId === 'hull-1') {
      return { x: 10, y: 0, z: 12, nx: 1, ny: 0, nz: 0, skidX: 0, skidY: 0, skidZ: -1 };
    }
    return { x: -10, y: 0, z: -12, nx: 1, ny: 0, nz: 0, skidX: 0, skidY: 0, skidZ: 0 };
  });
  assert.ok(Math.abs(pool.skid.array[slot * 4 + 2] + 1) < 1e-5, 'the skid axis reaches the shader attribute');
  assert.ok(Math.abs(pool.skid.array[slot * 4 + 3] - 2.1) < 1e-5, 'the stretch reaches the shader attribute');
  const other = (slot + 1) % pool.capacity;
  assert.equal(pool.skid.array[other * 4 + 3], 1, 'a mark without skid stays round');
  pool.dispose();
});

test('a turned hull carries its skid with it (local storage round-trips through a quaternion)', () => {
  // Mirror the presenter's contract: world skid at capture → local via inverse quaternion →
  // world via the hull's live quaternion. The round trip lands on the same world bearing, and
  // the SAME local skid on a differently-yawed hull smears along that hull's own new bearing.
  const hull = new THREE.Object3D();
  hull.rotation.y = -Math.PI / 2; // the renderer's hull yaw convention
  hull.updateMatrixWorld(true);
  const worldQuat = new THREE.Quaternion();
  hull.getWorldQuaternion(worldQuat);
  const axis = new THREE.Vector3();
  axis.set(0, 0, -1).applyQuaternion(worldQuat.clone().invert()); // capture to hull-local
  const local = { x: axis.x, y: axis.y, z: axis.z };
  axis.set(local.x, local.y, local.z).applyQuaternion(worldQuat); // resolve on the same hull
  assert.ok(Math.abs(axis.x) < 1e-6 && Math.abs(axis.z + 1) < 1e-6,
    'the stored skid points the same world way on the hull that carries it');
  // A hull yawed differently smears the same hull-local scar along ITS new bearing.
  const turned = new THREE.Object3D();
  turned.rotation.y = Math.PI / 4;
  turned.updateMatrixWorld(true);
  const quat = new THREE.Quaternion();
  turned.getWorldQuaternion(quat);
  axis.set(local.x, local.y, local.z).applyQuaternion(quat);
  assert.ok(Math.abs(Math.hypot(axis.x, axis.y, axis.z) - 1) < 1e-6, 'the skid stays unit');
  assert.ok(Math.abs(axis.z + 1) > 0.01, `the smear turns with the hull (z ${axis.z.toFixed(3)})`);
});

test('the live owner is wired: the presenter resolves the skid from the impact payload', () => {
  const presenter = readFileSync(new URL('../src/render/weapons/presenter.js', import.meta.url), 'utf8');
  assert.match(presenter, /import \{ resolveScarSkid, scarSkidSize \} from '\.\/scarDirection\.js';/);
  assert.match(presenter, /resolveScarSkid\(nx, 0\.08, nz, ax, 0, az,/,
    'the skid resolves from the same normal + approach the discharge fan slants with');
  assert.match(presenter, /skidX: captured\.skidX,/, 'the stored hull-local skid reaches the spawn');
  const marks = readFileSync(new URL('../src/render/weapons/contactMarks.js', import.meta.url), 'utf8');
  assert.match(marks, /attribute vec4 aSkid;/, 'the shader reads the skid attribute');
  assert.match(marks, /if \(dot\(skid, skid\) > 0\.01\)/,
    'the card frame aligns with the skid; a zero skid keeps the legacy frame');
});
