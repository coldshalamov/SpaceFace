import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { attachNestBayIndicators } from '../src/render/nestBayVisuals.js';

const carrier = () => ({ type: 'ship', alive: true, data: {
  nestCarrier: true, nestSlot: 'carrier', nestEncounterId: 'visit:1',
  nestBayOffsets: [{ dx: 0, dz: -8.25 }, { dx: 0, dz: 8.25 }], nestBayStates: [false, false],
} });

test('unrelated ships and doors do not acquire carrier indicators', () => {
  for (const entity of [{ type: 'ship', data: {} }, { ...carrier(), type: 'beacon' },
    { ...carrier(), data: { ...carrier().data, nestSlot: 'door:0' } },
    { ...carrier(), data: { ...carrier().data, nestEncounterId: '' } }]) {
    const root = new THREE.Group();
    assert.equal(attachNestBayIndicators(root, entity), root);
    assert.equal(root.children.length, 0);
    assert.equal(root.userData.updateRuntimeState, undefined);
  }
});

test('two bays distinguish closed and open by geometry, independently of color', () => {
  const entity = carrier(), root = new THREE.Group(), before = JSON.stringify(entity);
  attachNestBayIndicators(root, entity);
  const group = root.userData.nestBayIndicators;
  assert.equal(group.children.length, 2);
  for (const bay of group.children) {
    assert.equal(bay.getObjectByName('Sealed_Cross').visible, true);
    assert.equal(bay.getObjectByName('Open_Inward_Chevrons').visible, false);
  }
  assert.equal(JSON.stringify(entity), before, 'presentation does not mutate physics or story');
  entity.data.nestBayStates = [true, false];
  root.userData.updateRuntimeState(entity, 10);
  assert.equal(group.children[0].getObjectByName('Sealed_Cross').visible, false);
  assert.equal(group.children[0].getObjectByName('Open_Inward_Chevrons').visible, true);
  assert.equal(group.children[1].getObjectByName('Sealed_Cross').visible, true);
  entity.data.nestBayStates = [false, true];
  root.userData.updateRuntimeState(entity, 12);
  assert.equal(group.children[0].getObjectByName('Sealed_Cross').visible, true);
  assert.equal(group.children[1].getObjectByName('Open_Inward_Chevrons').visible, true);
});

test('bounded graph is reused across cycles and duplicate attachment', () => {
  const entity = carrier(), root = attachNestBayIndicators(new THREE.Group(), carrier());
  const meshes = []; root.traverse(x => { if (x.isMesh) meshes.push(x); });
  assert.equal(meshes.length, 28);
  assert.equal(new Set(meshes.map(x => x.geometry)).size, 1);
  assert.equal(new Set(meshes.map(x => x.material)).size, 2);
  for (let i = 0; i < 100; i++) {
    entity.data.nestBayStates = [i % 2 === 0, i % 3 === 0];
    root.userData.updateRuntimeState(entity, i);
    attachNestBayIndicators(root, entity);
  }
  const after = []; root.traverse(x => { if (x.isMesh) after.push(x); });
  assert.deepEqual(after, meshes);
  assert.equal(root.children.length, 1);
});

test('indicators remain at carrier sockets, preserve update chain and hide stale owner', () => {
  const entity = carrier(), root = new THREE.Group(); let priorCalls = 0;
  root.userData.updateRuntimeState = () => priorCalls++;
  attachNestBayIndicators(root, entity);
  const group = root.userData.nestBayIndicators;
  assert.deepEqual(group.children.map(x => [x.position.x, x.position.z]), [[0, -8.25], [0, 8.25]]);
  entity.data.nestBayStates = [true, true];
  root.userData.updateRuntimeState(entity, 2);
  assert.equal(priorCalls, 2);
  assert.deepEqual(group.children.map(x => [x.position.x, x.position.z]), [[0, -8.25], [0, 8.25]], 'ripped plugs do not carry target glyph away');
  root.userData.updateRuntimeState({ ...entity, alive: false }, 3);
  assert.equal(group.visible, false);
  root.userData.updateRuntimeState({ ...entity, data: { ...entity.data, nestEncounterId: 'other' } }, 4);
  assert.equal(group.visible, false);
  root.userData.updateRuntimeState(entity, 5);
  assert.equal(group.visible, true);
});

test('async hull bounds retain both external sockets and malformed offsets hide', () => {
  const entity = carrier(), root = new THREE.Group();
  root.userData.visualBounds = { center: [0, 0, 0], size: [160, 12, 50] };
  attachNestBayIndicators(root, entity);
  assert.deepEqual(root.userData.visualBounds.size, [160, 30, 50]);
  root.userData.visualBounds = { center: [10, 0, 0], size: [180, 14, 40] };
  assert.deepEqual(root.userData.visualBounds.size, [180, 30, 40]);
  entity.data.nestBayOffsets = [{ dx: NaN, dz: -8.25 }, { dx: 0, dz: 1e8 }];
  root.userData.updateRuntimeState(entity, 3);
  assert.ok(root.userData.nestBayIndicators.children.every(x => x.visible === false));
});

test('carrier-space targets match the simulation rotation and move after a real plug tears', () => {
  const entity = carrier(), root = new THREE.Group(), angle = 0.73;
  entity.data.nestBayOffsets = [{ dx: 4, dz: -24 }, { dx: 0, dz: 24 }];
  root.position.set(8392, 0, 25872);
  // Renderer yaw is the negative of the XZ simulation heading.
  root.rotation.y = -angle;
  attachNestBayIndicators(root, entity);
  root.updateMatrixWorld(true);
  const bays = root.userData.nestBayIndicators.children;
  const world = new THREE.Vector3(); bays[0].getWorldPosition(world);
  assert.ok(Math.abs(world.x - (8392 + 4 * Math.cos(angle) + 24 * Math.sin(angle))) < 1e-8);
  assert.ok(Math.abs(world.z - (25872 + 4 * Math.sin(angle) - 24 * Math.cos(angle))) < 1e-8);
  entity.data.nestBayOffsets[0] = { dx: 0, dz: -8.25 };
  entity.data.nestBayStates[0] = true;
  root.userData.updateRuntimeState(entity, 4);
  assert.equal(bays[0].position.z, -8.25, 'exposed hull target replaces removed plug target');
  assert.equal(bays[1].position.z, 24, 'other intact physical plug target is unchanged');
});
