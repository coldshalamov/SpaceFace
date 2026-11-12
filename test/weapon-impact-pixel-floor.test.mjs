import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';
import { worldSizeForPixels } from '../src/render/weapons/pixelFloor.js';
import { clearShieldContacts } from '../src/render/weapons/shieldContacts.js';

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);
}

function closePoint(actual, expected, message) {
  for (const axis of ['x', 'y', 'z']) close(actual[axis], expected[axis], `${message}.${axis}`);
}

function fixture(t, { x = 0, z = 0, attached = true } = {}) {
  const scene = new THREE.Scene();
  const target = new THREE.Group();
  target.position.set(x, 0, z);
  if (attached) scene.add(target);
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 4000);
  camera.position.set(x, 160, z + 130);
  camera.lookAt(x, 0, z);
  const state = {
    playerId: 99, simTime: 0,
    settings: { video: { particleQuality: 'low' } },
    entities: new Map([[1, { id: 1, type: 'ship', alive: true, radius: 12 }]]),
    render: { meshes: new Map(attached ? [[1, target]] : []) },
  };
  const presenter = new WeaponVfxPresenter({ scene, state });
  presenter.update(0, { state, camera, viewportHeight: 720 });
  t.after(() => {
    presenter.dispose();
    clearShieldContacts();
  });
  const hit = () => {
    scene.updateMatrixWorld(true);
    presenter.handleHit({
      weaponId: 'wpn_pulse_laser_s', targetId: 1,
      pos: { x: x + 10, z: z + 5 },
      normal: { x: -1, z: 0 }, approach: { x: 1, z: 0 },
    }, true);
    const slot = presenter.discharges.slots.find((entry) => entry.alive);
    assert.ok(slot, 'normal shield hit creates its retained contact surface');
    return slot;
  };
  return { scene, target, camera, presenter, hit, point: new THREE.Vector3(x + 10, 0.35, z + 5) };
}

test('attached impact pixel floor is invariant under translation of the whole scene', (t) => {
  const near = fixture(t);
  const far = fixture(t, { x: -1900, z: -2200 });
  const a = near.hit();
  const b = far.hit();
  for (const key of ['pxw', 'width', 'length', 'lx', 'ly', 'lz']) {
    close(a[key], b[key], `same relative camera/contact preserves ${key}`);
  }
  assert.equal(a.attached, true);
  assert.equal(b.attached, true);
  near.presenter.discharges.update(0, near.presenter._dischargePoseResolver, near.presenter._a11y());
  far.presenter.discharges.update(0, far.presenter._dischargePoseResolver, far.presenter._a11y());
  closePoint(a, near.point, 'near contact resolves to its scene position');
  closePoint(b, far.point, 'translated contact resolves to its scene position');
});

test('rotated and scaled hull anchors calibrate in scene space without losing the local contact', (t) => {
  const f = fixture(t, { x: 1700, z: -2100 });
  f.target.rotation.y = 0.65;
  f.target.scale.set(1.2, 1.3, 0.9);
  const hull = new THREE.Group();
  hull.position.set(3, 1, -2);
  hull.rotation.set(0.3, 0.4, -0.2);
  hull.scale.set(1.7, 0.8, 2.2);
  f.target.add(hull);
  f.target.userData.hull = hull;
  f.scene.updateMatrixWorld(true);
  const localContact = hull.worldToLocal(f.point.clone());
  const slot = f.hit();
  closePoint({ x: slot.lx, y: slot.ly, z: slot.lz }, localContact, 'contact stays on the hull anchor');
  close(slot.pxw, worldSizeForPixels(f.camera.position.distanceTo(f.point), 1, f.camera.fov, 720),
    'pixel floor measures the actual scene contact');
  const dimensions = [slot.width, slot.length];
  f.target.position.x += 17;
  hull.rotation.z += 0.1;
  f.scene.updateMatrixWorld(true);
  const movedContact = hull.localToWorld(localContact.clone());
  f.presenter.discharges.update(0, f.presenter._dischargePoseResolver, f.presenter._a11y());
  closePoint(slot, movedContact, 'retained surface follows the current hull pose');
  closePoint({ x: slot.lx, y: slot.ly, z: slot.lz }, localContact, 'stored local anchor is unchanged');
  assert.deepEqual([slot.width, slot.length], dimensions, 'calibration does not change the retained lifecycle dimensions');
});

test('unattached impact already in scene space keeps correct calibration and pose', (t) => {
  const f = fixture(t, { x: -1900, z: -2200, attached: false });
  const slot = f.hit();
  assert.equal(slot.attached, false);
  close(slot.pxw, worldSizeForPixels(f.camera.position.distanceTo(f.point), 1, f.camera.fov, 720),
    'unattached pixel floor uses the scene contact directly');
  closePoint(slot, f.point, 'unattached pose remains in scene space');
  f.presenter.discharges.update(0, f.presenter._dischargePoseResolver, f.presenter._a11y());
  closePoint(slot, f.point, 'unattached contact does not undergo an anchor transform');
});
