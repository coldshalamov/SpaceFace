import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMachineMesh } from '../src/render/machineVisuals.js';
import { disposeObjectNode } from '../src/render/renderer.js';

function entity() {
  return { type: 'machine', data: { machine: { kind: 'surveyor_prism', sweepT: 0 } } };
}

test('surveyor keeps its visible shell and independent scan motion without an enclosed draw', () => {
  const firstEntity = entity(), otherEntity = entity();
  const first = buildMachineMesh(firstEntity), other = buildMachineMesh(otherEntity);
  const meshes = root => { const found = []; root.traverse(node => { if (node.isMesh) found.push(node); }); return found; };
  const firstMeshes = meshes(first), otherMeshes = meshes(other);
  assert.equal(firstMeshes.length, 4);
  assert.ok(!firstMeshes.some(mesh => mesh.geometry.type === 'SphereGeometry'));
  const [body, ring] = firstMeshes;
  assert.equal(body.geometry.type, 'OctahedronGeometry');
  assert.equal(ring.geometry.type, 'TorusGeometry');
  assert.equal(ring.geometry.parameters.tubularSegments, 40);
  assert.ok(firstMeshes.every((mesh, i) => mesh.geometry === otherMeshes[i].geometry));
  assert.ok(firstMeshes.every((mesh, i) => mesh.material !== otherMeshes[i].material));

  const arm = first.children.find(child => child.isGroup);
  const otherArm = other.children.find(child => child.isGroup);
  first.userData.updateAuthoredMotion(1, firstEntity);
  assert.equal(arm.rotation.x, 0.5);
  firstEntity.data.machine.sweepT = 12;
  first.userData.updateAuthoredMotion(1, firstEntity);
  assert.ok(arm.rotation.x < -0.59);
  assert.equal(otherArm.rotation.x, 0);
  firstEntity.data.machine.sweepT = 0;
  first.userData.updateAuthoredMotion(1, firstEntity);
  assert.equal(arm.rotation.x, 0.5);

  const materials = firstMeshes.map(mesh => mesh.material);
  const disposed = new Map(materials.map(material => [material, 0]));
  for (const material of materials) material.addEventListener('dispose', () => disposed.set(material, disposed.get(material) + 1));
  let sharedGeometryDisposals = 0;
  const geometryListener = () => sharedGeometryDisposals++;
  for (const mesh of firstMeshes) mesh.geometry.addEventListener('dispose', geometryListener);
  try {
    first.traverse(node => disposeObjectNode(node));
    assert.deepEqual([...disposed.values()], [1, 1, 1, 1]);
    assert.equal(sharedGeometryDisposals, 0);
    otherEntity.data.machine.visualScanWinding = true;
    other.userData.updateAuthoredMotion(1, otherEntity);
    assert.ok(otherArm.rotation.x < -0.59);
    other.traverse(node => disposeObjectNode(node));
    assert.equal(sharedGeometryDisposals, 0);
  } finally {
    for (const mesh of firstMeshes) mesh.geometry.removeEventListener('dispose', geometryListener);
  }
});
