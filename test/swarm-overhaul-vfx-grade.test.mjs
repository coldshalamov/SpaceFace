import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { swarmCombatShieldRadius } from '../src/render/weapons/shieldBubblePresentation.js';
import {
  SelectionSigil,
  SIGIL_RADIUS_SCALE,
  SIGIL_TIGHT_GAIN,
  SIGIL_TIGHT_SCALE,
  sigilRadius,
} from '../src/render/selectionSigil.js';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';

test('a swarm shield shell stays a fraction of the threat box', () => {
  assert.equal(swarmCombatShieldRadius(12), 12 * 0.42);
  assert.equal(swarmCombatShieldRadius(2), 1.5);
  assert.ok((Math.PI * (12 * 0.42) ** 2) / (24 ** 2) < 0.5);
});

test('a tight sigil shrinks onto the hull and a normal sigil keeps its instrument', () => {
  const scene = new THREE.Scene();
  const sigil = new SelectionSigil(scene);
  const body = { id: 4, radius: 12, klass: 'hostile' };
  try {
    sigil.setSubject(body, 0, 0, 1 / 60, null);
    assert.equal(sigil.mesh.scale.x, sigilRadius(12));
    assert.equal(sigil.mesh.scale.x, 12 * SIGIL_RADIUS_SCALE);
    assert.equal(sigil.mesh.material.uniforms.uGain.value, 0.36);
    sigil.setSubject({ ...body, tight: true }, 0, 0, 1 / 60, null);
    assert.equal(sigil.mesh.scale.x, sigilRadius(12, SIGIL_TIGHT_SCALE));
    assert.equal(sigil.mesh.material.uniforms.uGain.value, SIGIL_TIGHT_GAIN);
    assert.ok(sigil.mesh.scale.x < 12 * SIGIL_RADIUS_SCALE);
  } finally {
    sigil.dispose();
  }
});

test('survival energy rounds grow an opaque read core; other modes do not', () => {
  const scene = new THREE.Scene();
  const state = { run: { kind: 'survival' }, entities: { get() { return null; } }, playerId: 1 };
  const presenter = new WeaponVfxPresenter({ scene, state });
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  cam.position.set(0, 30, 30);
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  const entity = {
    id: 9, alive: true, type: 'projectile', team: 1, radius: 0.8,
    pos: { x: 0, z: 0 }, prevPos: { x: 0, z: 0 }, vel: { x: 1, z: 0 },
    data: { weaponId: 'wpn_pulse_laser_s', damageType: 'energy' },
  };
  try {
    presenter._syncBolts([entity], 1, cam, 1 / 60);
    const mesh = presenter.readCores.mesh;
    assert.equal(mesh.count, 1);
    assert.equal(mesh.material.transparent, false);
    assert.equal(mesh.material.depthWrite, true);
    assert.equal(mesh.material.isMeshBasicMaterial, true);
    assert.notEqual(mesh.material.blending, THREE.AdditiveBlending);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    mesh.getMatrixAt(0, m);
    m.decompose(pos, quat, scl);
    assert.ok(Math.abs(scl.x - 0.8) < 1e-3, `core radius ${scl.x}`);
    const camQ = new THREE.Quaternion();
    cam.getWorldQuaternion(camQ);
    assert.ok(quat.dot(camQ) > 0.999, 'the disk faces the camera');

    presenter.state = { run: { kind: 'adventure' }, entities: state.entities, playerId: 1 };
    presenter._syncBolts([entity], 1, cam, 1 / 60);
    assert.equal(presenter.readCores.mesh.count, 0);
  } finally {
    presenter.dispose();
    assert.equal(presenter.readCores.mesh.parent, null);
  }
});
