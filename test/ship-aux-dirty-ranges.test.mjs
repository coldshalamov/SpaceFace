import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createDynamicBufferCoordinator,
  unregisterDynamicBufferOwner,
} from '../src/render/dynamicBufferRanges.js';
import { createShipAuxPool, syncShipAuxPools } from '../src/render/renderer.js';

function createShipFixture(id) {
  const root = new THREE.Group();
  root.position.set(id * 3, 0, id * -2);

  const bubbleGeometry = new THREE.SphereGeometry(1, 6, 4);
  const bubbleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x5fd0ff) },
      uFlash: { value: 0.25 },
      uBase: { value: 0.22 },
    },
  });
  const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
  bubble.position.set(0.5, 0, 0.25);
  root.add(bubble);
  root.userData.shieldBubble = bubble;

  const navGeometry = new THREE.SphereGeometry(0.025, 4, 3);
  const navMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x88eeff,
    emissiveIntensity: 1.5,
    opacity: 0.8,
  });
  const nav = new THREE.InstancedMesh(navGeometry, navMaterial, 2);
  nav.name = 'GLTFKit_Nav_Lights';
  nav.userData.damageRole = 'navLight';
  const transform = new THREE.Object3D();
  transform.position.set(1, 0.2, 0.5);
  transform.updateMatrix();
  nav.setMatrixAt(0, transform.matrix);
  transform.position.z = -0.5;
  transform.updateMatrix();
  nav.setMatrixAt(1, transform.matrix);
  root.add(nav);
  root.updateMatrixWorld(true);

  return {
    entity: { id, alive: true, type: 'ship', shield: 100 },
    root,
    bubble,
    nav,
    dispose() {
      bubbleGeometry.dispose();
      bubbleMaterial.dispose();
      navGeometry.dispose();
      navMaterial.dispose();
      nav.dispose();
    },
  };
}

function poolAttributes(pool) {
  return [
    ['shieldMatrix', pool.shield.mesh.instanceMatrix],
    ['shieldColor', pool.shield.mesh.instanceColor],
    ['shieldFlash', pool.shield.mesh.geometry.getAttribute('instanceFlash')],
    ['shieldBase', pool.shield.mesh.geometry.getAttribute('instanceBase')],
    ['navMatrix', pool.nav.mesh.instanceMatrix],
    ['navColor', pool.nav.mesh.instanceColor],
  ];
}

function publish(coordinator, scene, camera, attributes, { initial = false } = {}) {
  const epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  const ranges = Object.fromEntries(attributes.map(([name, attribute]) => [
    name,
    attribute.updateRanges.map(({ start, count }) => ({ start, count })),
  ]));
  for (const [, attribute] of attributes) {
    if (attribute.updateRanges.length === 0) continue;
    if (!initial) attribute.clearUpdateRanges();
    attribute.onUploadCallback();
  }
  coordinator.disarm(epoch);
  return ranges;
}

function sumRequested(pool) {
  return pool.shield.dynamicBufferOwner.diagnostics.requestedUploadBytes
    + pool.nav.dynamicBufferOwner.diagnostics.requestedUploadBytes;
}

function sumLogical(pool) {
  return pool.shield.dynamicBufferOwner.diagnostics.logicalBytesChanged
    + pool.nav.dynamicBufferOwner.diagnostics.logicalBytesChanged;
}

test('ship auxiliary pools publish active prefixes and retain exactly two owners through growth', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const camera = new THREE.PerspectiveCamera();
  const pool = createShipAuxPool(scene);
  const fixtures = [createShipFixture(1), createShipFixture(2)];
  const meshes = new Map(fixtures.map(({ entity, root }) => [entity.id, root]));

  assert.ok(pool.shield.dynamicBufferOwner);
  assert.ok(pool.nav.dynamicBufferOwner);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 2);

  syncShipAuxPools(pool, fixtures.map(({ entity }) => entity), meshes);
  assert.equal(pool.shield.mesh.count, 2);
  assert.equal(pool.nav.mesh.count, 4);
  const initialAttributes = poolAttributes(pool);
  const initialRanges = publish(coordinator, scene, camera, initialAttributes, { initial: true });
  for (const [name, attribute] of initialAttributes) {
    assert.deepEqual(initialRanges[name], [{ start: 0, count: attribute.array.length }],
      `${name} initializes its final GPU allocation exactly once`);
  }

  const versionsBeforeStatic = Object.fromEntries(initialAttributes.map(([name, attribute]) => [name, attribute.version]));
  syncShipAuxPools(pool, fixtures.map(({ entity }) => entity), meshes);
  assert.deepEqual(publish(coordinator, scene, camera, initialAttributes), Object.fromEntries(
    initialAttributes.map(([name]) => [name, []]),
  ), 'an unchanged auxiliary frame publishes no ranges');
  assert.deepEqual(
    Object.fromEntries(initialAttributes.map(([name, attribute]) => [name, attribute.version])),
    versionsBeforeStatic,
    'an unchanged auxiliary frame increments no upload versions',
  );

  for (const fixture of fixtures) {
    fixture.root.position.x += 7;
    fixture.bubble.material.uniforms.uColor.value.set(0xff8844);
    fixture.bubble.material.uniforms.uFlash.value = 0.4;
    fixture.bubble.material.uniforms.uBase.value = 0.3;
    fixture.nav.material.emissive.set(0x66ff99);
    fixture.nav.material.emissiveIntensity = 2;
  }
  const rangedRequestedBefore = sumRequested(pool);
  const rangedLogicalBefore = sumLogical(pool);
  syncShipAuxPools(pool, fixtures.map(({ entity }) => entity), meshes);
  const rangedAttributes = poolAttributes(pool);
  const ranged = publish(coordinator, scene, camera, rangedAttributes);
  assert.deepEqual(ranged, {
    shieldMatrix: [{ start: 0, count: 2 * 16 }],
    shieldColor: [{ start: 0, count: 2 * 3 }],
    shieldFlash: [{ start: 0, count: 2 }],
    shieldBase: [{ start: 0, count: 2 }],
    navMatrix: [{ start: 0, count: 4 * 16 }],
    navColor: [{ start: 0, count: 4 * 3 }],
  });
  const rangedRequested = sumRequested(pool) - rangedRequestedBefore;
  const rangedLogical = sumLogical(pool) - rangedLogicalBefore;
  assert.equal(rangedRequested, 472);
  assert.equal(rangedLogical, rangedRequested,
    'active-prefix publication requests exactly the components changed by the two visible ships');

  coordinator.getDiagnostics().setProbeForceFullUploads(true);
  for (const fixture of fixtures) {
    fixture.root.position.z -= 5;
    fixture.bubble.material.uniforms.uColor.value.set(0x77aaff);
    fixture.bubble.material.uniforms.uFlash.value = 0.55;
    fixture.bubble.material.uniforms.uBase.value = 0.36;
    fixture.nav.material.emissive.set(0xffcc66);
    fixture.nav.material.emissiveIntensity = 2.5;
  }
  const fullRequestedBefore = sumRequested(pool);
  const fullLogicalBefore = sumLogical(pool);
  syncShipAuxPools(pool, fixtures.map(({ entity }) => entity), meshes);
  const fullAttributes = poolAttributes(pool);
  const full = publish(coordinator, scene, camera, fullAttributes);
  for (const [name, attribute] of fullAttributes) {
    assert.deepEqual(full[name], [{ start: 0, count: attribute.array.length }],
      `${name} obeys the existing diagnostic full-span control`);
  }
  coordinator.getDiagnostics().setProbeForceFullUploads(false);
  const fullRequested = sumRequested(pool) - fullRequestedBefore;
  const fullLogical = sumLogical(pool) - fullLogicalBefore;
  assert.equal(fullLogical, rangedLogical, 'the ranged and full-span variants perform identical logical writes');
  assert.equal(fullRequested, 7_552);
  assert.ok(1 - (rangedRequested / fullRequested) >= 0.25,
    'the exact two-ship workload clears the existing 25% requested-byte keep threshold');

  const oldShieldOwner = pool.shield.dynamicBufferOwner;
  const oldNavOwner = pool.nav.dynamicBufferOwner;
  const oldShieldAttribute = pool.shield.mesh.instanceMatrix;
  const oldNavAttribute = pool.nav.mesh.instanceMatrix;
  for (let id = 3; id <= 40; id++) {
    const fixture = createShipFixture(id);
    fixtures.push(fixture);
    meshes.set(id, fixture.root);
  }
  syncShipAuxPools(pool, fixtures.map(({ entity }) => entity), meshes);
  assert.equal(pool.shield.mesh.count, 40);
  assert.equal(pool.nav.mesh.count, 80);
  assert.notEqual(pool.shield.dynamicBufferOwner, oldShieldOwner);
  assert.notEqual(pool.nav.dynamicBufferOwner, oldNavOwner);
  assert.equal(oldShieldOwner.coordinator, null);
  assert.equal(oldNavOwner.coordinator, null);
  assert.equal(Object.hasOwn(oldShieldAttribute, 'onUploadCallback'), false);
  assert.equal(Object.hasOwn(oldNavAttribute, 'onUploadCallback'), false);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 2,
    'capacity growth retires both old owners instead of accumulating upload callbacks');
  const grownAttributes = poolAttributes(pool);
  const grown = publish(coordinator, scene, camera, grownAttributes, { initial: true });
  for (const [name, attribute] of grownAttributes) {
    assert.deepEqual(grown[name], [{ start: 0, count: attribute.array.length }],
      `${name} force-publishes the copied replacement allocation once`);
  }

  assert.equal(unregisterDynamicBufferOwner(pool.shield.dynamicBufferOwner), true);
  assert.equal(unregisterDynamicBufferOwner(pool.nav.dynamicBufferOwner), true);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 0);
  for (const fixture of fixtures) fixture.dispose();
  pool.shield.mesh.geometry.dispose();
  pool.shield.material.dispose();
  pool.shield.mesh.dispose();
  pool.nav.material.dispose();
  pool.nav.mesh.dispose();
});

test('ship auxiliary range validation fails before mutating tracked bytes', () => {
  const scene = new THREE.Scene();
  const coordinator = createDynamicBufferCoordinator(scene);
  const pool = createShipAuxPool(scene);
  const fixture = createShipFixture(1);
  const meshes = new Map([[fixture.entity.id, fixture.root]]);
  const matrixBefore = pool.shield.mesh.instanceMatrix.array.slice();

  const shieldBindings = pool.shield.dynamicBufferOwner.bindings;
  pool.shield.dynamicBufferOwner.bindings = [];
  assert.throws(
    () => syncShipAuxPools(pool, [fixture.entity], meshes),
    /has no tracked attribute 0/,
  );
  assert.deepEqual(pool.shield.mesh.instanceMatrix.array, matrixBefore,
    'a rejected range cannot leave an unpublishable matrix write behind');
  pool.shield.dynamicBufferOwner.bindings = shieldBindings;

  assert.equal(unregisterDynamicBufferOwner(pool.shield.dynamicBufferOwner), true);
  assert.equal(unregisterDynamicBufferOwner(pool.nav.dynamicBufferOwner), true);
  assert.equal(coordinator.getDiagnostics().registeredOwners, 0);
  fixture.dispose();
  pool.shield.mesh.geometry.dispose();
  pool.shield.material.dispose();
  pool.shield.mesh.dispose();
  pool.nav.material.dispose();
  pool.nav.mesh.dispose();
});
