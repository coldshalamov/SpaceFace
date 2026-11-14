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
  assert.equal(firstMeshes.length, 3);
  assert.ok(!firstMeshes.some(mesh => mesh.geometry.type === 'SphereGeometry'));
  assert.ok(!firstMeshes.some(mesh => mesh.geometry.type === 'TorusGeometry'));
  const [body] = firstMeshes;
  const positions = body.geometry.getAttribute('position');
  const normals = body.geometry.getAttribute('normal');
  const uvs = body.geometry.getAttribute('uv');
  assert.ok(positions.count > 24, 'the faceted housing keeps its inset surface detail');
  assert.equal(normals.count, positions.count);
  assert.equal(uvs.count, positions.count);
  assert.ok([...positions.array, ...normals.array, ...uvs.array].every(Number.isFinite));
  assert.ok(firstMeshes.every((mesh, i) => mesh.geometry === otherMeshes[i].geometry));
  assert.ok(firstMeshes.every((mesh, i) => mesh.material !== otherMeshes[i].material));
  assert.equal(firstMeshes[0].material.map, firstMeshes[1].material.map,
    'body and moving mast share the valid embedded fallback before any load');
  assert.equal(firstMeshes[0].material.normalMap, null, 'the rejected nacre normal response stays off this instrument');
  assert.equal(firstMeshes[0].material.vertexColors, true, 'merged chassis retains its vertex-tone contrast');
  assert.equal(firstMeshes[0].geometry.groups.length, 0, 'static body/frame use one material submission');

  const arm = first.children.find(child => child.isGroup);
  const otherArm = other.children.find(child => child.isGroup);
  assert.deepEqual(arm.position.toArray(), [0, 4, 0]);
  assert.equal(arm.children[1].position.z, -6.65, 'reviewed visual-only endpoint');
  first.userData.updateAuthoredMotion(1, firstEntity);
  assert.equal(arm.rotation.x, 0.5);

  const absoluteEntity = entity(), absolute = buildMachineMesh(absoluteEntity);
  const absoluteArm = absolute.children.find(child => child.isGroup);
  absoluteEntity.data.machine.visualScanWinding = true;
  absolute.userData.updateAuthoredMotion(absoluteEntity, 3);
  assert.ok(Math.abs(absoluteArm.rotation.x + 0.6) < 1e-12);
  assert.ok(Math.abs(absoluteArm.rotation.y - 2.1) < 1e-12);
  assert.ok(Math.abs(absoluteArm.children[1].material.emissiveIntensity - (2.4 + Math.sin(27) * 0.4) * 0.38) < 1e-12);
  absolute.traverse(node => disposeObjectNode(node));
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
    assert.deepEqual([...disposed.values()], [1, 1, 1]);
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
