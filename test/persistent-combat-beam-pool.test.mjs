import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { PersistentCombatBeamPool } from '../src/render/combat/persistentBeams.js';
import { createDynamicBufferCoordinator } from '../src/render/dynamicBufferRanges.js';

const identityLocal = (x, z, out) => {
  out.x = x;
  out.z = z;
  return out;
};

function acknowledgePublished(attributes) {
  for (const attribute of attributes) {
    if (attribute.updateRanges.length === 0) continue;
    attribute.clearUpdateRanges();
    attribute.onUploadCallback();
  }
}

test('persistent combat beams update in place with a bounded two-draw pool', () => {
  const pool = new PersistentCombatBeamPool(THREE, { maxBeams: 4, timeoutS: 0.2 });
  assert.equal(pool.group.children.length, 2);
  assert.ok(pool.group.children.every((child) => child.isMesh));
  assert.equal(pool.geometry.type, 'BufferGeometry');
  assert.equal(pool.geometry.name, 'sf-combat-beam-core-batch',
    'beam pool must use a directly authored XZ quad batch');
  assert.equal(pool.coreMaterial.side, THREE.DoubleSide);
  assert.equal(pool.coreMaterial.blending, THREE.NormalBlending,
    'sustained beam must retain a stable non-bloom core over black space');
  assert.equal(pool.coreMaterial.transparent, true,
    'core belongs in the late transparent pass so opaque background layers cannot erase it');
  assert.equal(pool.haloMaterial.blending, THREE.AdditiveBlending,
    'only the beam sheath should use additive energy blending');

  pool.upsert({
    beamKey: 'ship:0', ownerId: 'ship', weaponId: 'beam', phase: 'begin',
    from: { x: 1, z: 2 }, to: { x: 11, z: 2 },
  }, 1, { coreColor: '#ffffff', accentColor: '#55ccff' });
  pool.update(1, identityLocal);
  assert.equal(pool.activeCount, 1);
  assert.equal(pool.startCount, 1);
  assert.ok(Array.from(pool.geometry.attributes.position.array.slice(0, 12)).some((value) => value !== 0),
    'active beam must write non-degenerate gameplay-plane vertices');
  const stablePositionBuffer = pool.geometry.attributes.position.array;
  assert.equal(pool.retarget({ attackerId: 'ship', weaponId: 'beam', pos: { x: 8, z: 2 } }, 1.02), 1);
  assert.equal(pool._byKey.get('ship:0').toX, 8);

  pool.upsert({
    beamKey: 'ship:0', phase: 'update', from: { x: 2, z: 4 }, to: { x: 22, z: 4 },
  }, 1.05, { coreColor: '#ffffff', accentColor: '#55ccff' });
  pool.update(1.05, identityLocal);
  assert.equal(pool.activeCount, 1);
  assert.equal(pool.startCount, 1, 'updates must not respawn a beam');
  assert.equal(pool.geometry.attributes.position.array, stablePositionBuffer,
    'beam updates must reuse the preallocated geometry buffer');

  pool.stop({ beamKey: 'ship:0' });
  assert.equal(pool.activeCount, 0);
  assert.equal(pool.group.visible, false);
  assert.deepEqual(Array.from(pool.geometry.attributes.position.array.slice(0, 12)), Array(12).fill(0),
    'released beam slot must collapse without allocating or leaving stale pixels');
  pool.dispose();
});

test('persistent combat beams retire on bounded timeout if a stop event is lost', () => {
  const pool = new PersistentCombatBeamPool(THREE, { maxBeams: 2, timeoutS: 0.1 });
  pool.upsert({ beamKey: 'npc:1', from: { x: 0, z: 0 }, to: { x: 5, z: 5 } }, 2);
  pool.update(2.2, identityLocal);
  assert.equal(pool.activeCount, 0);
  pool.dispose();
});

test('persistent beam pool rejects ownerless updates instead of aliasing them under an undefined key', () => {
  const pool = new PersistentCombatBeamPool(THREE, { maxBeams: 2, timeoutS: 0.1 });
  assert.equal(pool.upsert({ from: { x: 0, z: 0 }, to: { x: 5, z: 5 } }, 1), false);
  assert.equal(pool.activeCount, 0);
  assert.equal(pool._byKey.size, 0);
  pool.dispose();
});

test('persistent beam uploads retain sparse slots and publish only the changed quads', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const coordinator = createDynamicBufferCoordinator(scene);
  const pool = new PersistentCombatBeamPool(THREE, {
    maxBeams: 16,
    timeoutS: 1,
    scene,
  });
  scene.add(pool.group);
  const attributes = [
    pool._coreBatch.position,
    pool._coreBatch.color,
    pool._haloBatch.position,
    pool._haloBatch.color,
  ];

  for (let slot = 0; slot < 16; slot++) {
    pool.upsert({
      beamKey: `ship:${slot}`,
      ownerId: 'ship',
      weaponId: `beam-${slot}`,
      from: { x: slot, z: 0 },
      to: { x: slot + 8, z: 2 },
    }, 1, { coreColor: '#ffffff', accentColor: '#55ccff' });
  }
  pool.update(1, identityLocal);
  let epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  assert.ok(attributes.every((attribute) => attribute.updateRanges[0]?.count === attribute.array.length),
    'initial residency must still upload each complete bounded buffer');
  acknowledgePublished(attributes);
  coordinator.disarm(epoch);

  for (let slot = 0; slot < 15; slot++) pool.stop({ beamKey: `ship:${slot}` });
  pool.update(1.01, identityLocal);
  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  acknowledgePublished(attributes);
  coordinator.disarm(epoch);
  assert.equal(pool.activeCount, 1, 'the highest sparse slot remains the sole live beam');

  const requestedBefore = coordinator.getDiagnostics().owners
    .reduce((sum, owner) => sum + owner.requestedUploadBytes, 0);
  pool.upsert({
    beamKey: 'ship:15',
    ownerId: 'ship',
    weaponId: 'beam-15',
    from: { x: 16, z: 1 },
    to: { x: 28, z: 3 },
  }, 1.02, { coreColor: '#ffffff', accentColor: '#55ccff' });
  pool.update(1.02, identityLocal);
  assert.ok(attributes.every((attribute) => attribute.updateRanges.length === 0),
    'logical writes must remain private until the renderer-owned publication point');

  epoch = coordinator.arm();
  scene.onBeforeRender({}, scene, camera, null);
  for (const attribute of attributes) {
    assert.deepEqual(attribute.updateRanges, [{ start: 15 * 12, count: 12 }],
      'one sparse beam rewrite must upload one four-vertex quad, not the full pool');
  }
  const requestedAfter = coordinator.getDiagnostics().owners
    .reduce((sum, owner) => sum + owner.requestedUploadBytes, 0);
  const fullUploadBytes = attributes.reduce((sum, attribute) => sum + attribute.array.byteLength, 0);
  assert.equal(requestedAfter - requestedBefore, 4 * 12 * Float32Array.BYTES_PER_ELEMENT);
  assert.equal((requestedAfter - requestedBefore) / fullUploadBytes, 1 / 16,
    'the production-sized one-beam update must request 93.75% fewer bytes');
  acknowledgePublished(attributes);
  coordinator.disarm(epoch);
  pool.dispose();
});
