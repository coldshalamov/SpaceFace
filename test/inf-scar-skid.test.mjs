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
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';
import { createDynamicBufferCoordinator, disposeDynamicBufferCoordinator } from '../src/render/dynamicBufferRanges.js';

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

for (const managed of [false, true]) {
  test(`reused scar slots publish changed skid through the ${managed ? 'managed' : 'fallback'} upload boundary`, () => {
    const scene = managed ? new THREE.Scene() : null;
    const coordinator = scene ? createDynamicBufferCoordinator(scene) : null;
    const camera = new THREE.PerspectiveCamera();
    const pool = new HullScorchPool(scene, { capacity: 1 });
    // Exercise the real scene publication hook and acknowledge its CPU-side upload records.
    // No WebGL upload or rendered-picture assertion is made here.
    const publish = () => {
      if (!coordinator) return;
      const epoch = coordinator.arm();
      try {
        scene.onBeforeRender({}, scene, camera, null);
        for (const { attribute } of pool.dynamicBufferOwner.bindings) {
          attribute.clearUpdateRanges();
          attribute.onUploadCallback();
        }
      } finally {
        coordinator.disarm(epoch);
      }
    };
    try {
      const spec = { targetId: 'same-hull', nx: 0, ny: 1, nz: 0,
        width: 2, height: 1, life: 30, persistent: true, stretch: 2 };
      const slot = pool.spawn({ ...spec, skidX: 1 });
      pool.update(0);
      publish();
      const version = pool.skid.version;
      const normal = Array.from(pool.normal.array);
      const size = Array.from(pool.size.array);
      assert.equal(pool.spawn({ ...spec, skidZ: -1 }), slot, 'the occupied slot is reused');
      pool.update(0);
      assert.equal(pool.skid.getZ(0), -1, 'the reused slot writes the new skid');
      assert.deepEqual(Array.from(pool.normal.array), normal, 'the surface normal is unchanged');
      assert.deepEqual(Array.from(pool.size.array), size, 'the mark size and heat are unchanged');
      if (managed) {
        const binding = pool.dynamicBufferOwner.bindings.find(({ attribute }) => attribute === pool.skid);
        assert.equal(binding.forceFull, false, 'initial publication cannot mask a missing dirty mark');
        assert.deepEqual([binding.pending.start, binding.pending.end], [0, 4],
          'the changed skid owns a four-component pending upload');
        publish();
        assert.equal(pool.dynamicBufferOwner.invalid, false);
      }
      assert.equal(pool.skid.version, version + 1, 'skid advances its own upload version');
    } finally {
      pool.dispose();
      disposeDynamicBufferCoordinator(coordinator);
    }
  });
}

test('production scar capture preserves distinct normal and skid through hull rotation', () => {
  const root = new THREE.Object3D();
  const hull = new THREE.Object3D();
  root.add(hull); root.userData.hull = hull; root.userData.sfStableEntityKey = 'hull-life-7';
  root.position.set(30, 0, -20); root.rotation.y = -Math.PI / 2;
  hull.position.set(1, 0.3, -0.7); hull.rotation.set(0.13, 0, -0.08);
  root.updateMatrixWorld(true);
  // Use the actual presenter methods without allocating its GPU effects.
  const presenter = Object.create(WeaponVfxPresenter.prototype);
  presenter.state = { render: { meshes: new Map([[7, root]]) } };
  presenter._targetScratch = {}; presenter._scorchPoseScratch = {};
  const point = new THREE.Vector3(32, 0.4, -21);
  const normal = new THREE.Vector3(1, 0.08, 0).normalize();
  const skid = resolveScarSkid(normal.x, normal.y, normal.z, 0, 0, -1, {});
  const captured = { ...presenter._captureTargetLocal(7, point.x, point.y, point.z,
    normal.x, normal.y, normal.z, skid.skidX, skid.skidY, skid.skidZ) };
  const slot = { ...captured, targetId: 7, localX: captured.x, localY: captured.y, localZ: captured.z };
  assert.equal(captured.attached, true); assert.equal(captured.boundKey, 'hull-life-7');
  const vector = (pose, prefix = '') => prefix
    ? new THREE.Vector3(pose.skidX, pose.skidY, pose.skidZ)
    : new THREE.Vector3(pose.nx, pose.ny, pose.nz);
  const worldSkid = new THREE.Vector3(skid.skidX, skid.skidY, skid.skidZ);
  const resolved = { ...presenter._worldFromTargetLocal(slot) };
  assert.ok(new THREE.Vector3(resolved.x, resolved.y, resolved.z).distanceTo(point) < 1e-6);
  assert.ok(vector(resolved).distanceTo(normal) < 1e-6, 'capture must not replace the surface normal with the skid');
  assert.ok(vector(resolved, 'skid').distanceTo(worldSkid) < 1e-6);
  assert.ok(Math.abs(vector(resolved).dot(vector(resolved, 'skid'))) < 1e-6,
    'the shader receives a nondegenerate in-surface skid');
  const turn = 0.4, up = new THREE.Vector3(0, 1, 0);
  root.rotation.y += turn; root.updateMatrixWorld(true);
  const turned = presenter._worldFromTargetLocal(slot);
  assert.ok(vector(turned).distanceTo(normal.clone().applyAxisAngle(up, turn)) < 1e-6);
  assert.ok(vector(turned, 'skid').distanceTo(worldSkid.clone().applyAxisAngle(up, turn)) < 1e-6);
  const round = presenter._captureTargetLocal(7, point.x, point.y, point.z, normal.x, normal.y, normal.z);
  const roundPose = presenter._worldFromTargetLocal({ ...round, targetId: 7, localX: round.x, localY: round.y, localZ: round.z });
  assert.ok(vector(roundPose).distanceTo(normal) < 1e-6, 'round marks retain the same normal');
  assert.equal(vector(roundPose, 'skid').length(), 0, 'round marks clear the retained skid scratch');
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
