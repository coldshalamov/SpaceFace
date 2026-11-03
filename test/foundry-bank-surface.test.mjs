import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { planRigidOpaqueBatchSpecimenGroups, mintRigidOpaqueBatchSpecimen } from '../src/render/rigidOpaqueBatch.js';

function bank(id) {
  return { id, type: 'station', radius: Math.hypot(48, 16.9),
    data: { roomOwner: 'survival-arena', roomKind: 'plate',
      foundryPlate: { referenceRadius: 26, halfWidth: 48, halfDepth: 16.9, halfHeight: 2.08 } } };
}
function meshes(root) {
  const result = [];
  root.traverse(node => { if (node.isMesh) result.push(node); });
  return result;
}
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`); }

test('banks use one shared, bounded steel surface through the production factory and LOD', () => {
  const factory = createVisualFactory();
  const roots = [factory.build(bank(1)), factory.build(bank(2)), factory.build(bank(3))];
  const bodies = roots.map(root => {
    const found = meshes(root);
    assert.equal(found.length, 1);
    root.userData.updateLod('lod2');
    assert.equal(meshes(root).length, 1);
    assert.equal(found[0].visible, true);
    return found[0];
  });
  for (const body of bodies) {
    assert.equal(body.geometry, bodies[0].geometry);
    assert.equal(body.material, bodies[0].material);
    assert.equal(Array.isArray(body.material), false);
    assert.equal(body.geometry.groups.length, 0);
    assert.equal(body.material.isMeshStandardMaterial, true);
    assert.equal(body.material.vertexColors, true);
    assert.equal(body.material.map, null);
    assert.equal(body.material.normalMap, null);
    assert.equal(body.material.emissive.getHex(), 0);
    assert.equal(body.material.userData.spacefaceSharedMaterialRole, 'station');
    assert.equal(body.castShadow, true); // Same single caster as the old box.
    assert.equal(body.receiveShadow, true);
    const box = new THREE.Box3().setFromObject(body);
    near(box.min.x, -48); near(box.max.x, 48);
    near(box.min.y, -2.08); near(box.max.y, 2.08);
    near(box.min.z, -16.9); near(box.max.z, 16.9);
  }
  // Per-entity disposal must not invalidate the shared resources of the other plates.
  let disposed = false;
  bodies[0].geometry.addEventListener('dispose', () => { disposed = true; });
  bodies[0].geometry.dispose(); bodies[0].material.dispose();
  assert.equal(disposed, false);
  assert.ok(bodies[1].geometry.getAttribute('position').count > 0);
});

test('top has three broad flush panels, two weld divisions and an inset wear rim', () => {
  const body = meshes(createVisualFactory().build(bank(4)))[0];
  const { position, normal, color } = body.geometry.attributes;
  function colorAt(x, z) {
    for (let i = 0; i < position.count; i += 3) {
      if (normal.getY(i) !== 1) continue;
      const a = new THREE.Vector2(position.getX(i), position.getZ(i));
      const b = new THREE.Vector2(position.getX(i + 1), position.getZ(i + 1));
      const c = new THREE.Vector2(position.getX(i + 2), position.getZ(i + 2));
      const point = new THREE.Vector2(x, z);
      const cross = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
      const signs = [cross(a, b, point), cross(b, c, point), cross(c, a, point)];
      if (signs.every(n => n >= -1e-7) || signs.every(n => n <= 1e-7)) {
        return [color.getX(i), color.getY(i), color.getZ(i)];
      }
    }
    assert.fail(`no top triangle at ${x}, ${z}`);
  }
  const panel = colorAt(-0.6, 0.1), middle = colorAt(0, 0.1), other = colorAt(0.6, 0.1);
  const weldA = colorAt(-0.333, 0.1), weldB = colorAt(0.333, 0.1);
  const edge = colorAt(0.1, 0.96);
  assert.deepEqual(panel, other);
  assert.notDeepEqual(panel, middle);
  assert.deepEqual(weldA, weldB);
  assert.notDeepEqual(weldA, panel);
  assert.notDeepEqual(edge, middle);
  for (let i = 0; i < position.count; i++) assert.ok(Math.abs(position.getY(i)) === 1,
    'surface markings remain flush, not painted holes or floating geometry');
});

test('retained batch admission preserves vertex colors for the shared steel surface', () => {
  const factory = createVisualFactory();
  const roots = [factory.build(bank(5)), factory.build(bank(6))];
  const plan = planRigidOpaqueBatchSpecimenGroups(roots);
  assert.equal(plan.groups.length, 1);
  const specimen = mintRigidOpaqueBatchSpecimen(plan.groups[0]);
  assert.ok(specimen);
  try {
    assert.equal(specimen.material.vertexColors, true);
    const source = meshes(roots[0])[0].geometry.getAttribute('color');
    const retained = specimen.geometry.getAttribute('color');
    assert.ok(retained);
    for (let i = 0; i < source.count; i++) {
      near(retained.getX(i), source.getX(i));
      near(retained.getY(i), source.getY(i));
      near(retained.getZ(i), source.getZ(i));
    }
  } finally { specimen.dispose(); specimen.material.dispose(); }
});
