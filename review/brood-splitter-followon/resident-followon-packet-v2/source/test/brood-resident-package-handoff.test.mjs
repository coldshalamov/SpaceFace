import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadSplitterPackage } from './lib/splitterCompiledPackage.mjs';
import { composeBroodMaterialForProbe } from '../src/render/partsLibrary.js';
import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';
import { createBroodResidentCellOwner } from '../src/render/broodResidentCells.js';
import { createLodState } from '../src/render/lod.js';
import { BROOD_SPLITTER_BODIES } from '../src/data/broodSplitterBodies.js';
import { partitionKinematics } from '../src/core/bodyPartition.js';

async function fixture({ foreign = false } = {}) {
  const residency = createAssetResidencyRegistry({ now: () => 0 });
  const pkg = await loadSplitterPackage('brood-splitter', residency);
  const built = composeBroodMaterialForProbe(pkg.record, { entityId: 'actual-parent' });
  const { entity: parent, root, owner: boundary, scene } = built;
  parent.pos = { x: 109432.75, z: -77219.5 }; parent.rot = .71;
  parent.vel = { x: 6, z: -3 }; parent.angVel = -.23;
  parent.centerOfMass = { x: -.334267787357306, z: .00017851174666703816 };
  parent.data.splitterFamily = { schema: 1, id: 'exact-package-family', parentLife: parent.occupantGeneration };
  const children = BROOD_SPLITTER_BODIES.brood_splitter.splitterCells.map((cell, ordinal) => {
    const motion = partitionKinematics(parent, { x: cell.center[0], z: cell.center[2] }, cell.yaw);
    return { ...motion, id: `actual-child-${ordinal}`, occupantGeneration: ordinal + 2, alive: true,
      data: { broodBodyId: cell.bodyId, splitterChild: { familyId: parent.data.splitterFamily.id,
        parentLife: parent.occupantGeneration, ordinal } } };
  });
  // Real large-world source pose rebased to the local renderer origin.
  const toLocal = p => ({ x: p.x - 109400, z: p.z + 77200 });
  const local = toLocal(parent.pos); boundary.position.set(local.x, 0, local.z); boundary.rotation.y = -parent.rot;
  boundary.userData.broodResidentLife = parent.occupantGeneration;
  boundary.userData.lod = createLodState(); boundary.userData.lod.adopt('lod2', 9);
  boundary.userData.authoredVisualRoot = 'authored-root';
  root.userData.updateLod('lod2');
  const leaves = []; root.traverse(node => { if (node.isMesh && node.userData.spacefaceTags?.broodCell) leaves.push(node); });
  assert.equal(leaves.length, 36);
  scene.updateMatrixWorld(true);
  const before = leaves.map(node => ({ node, matrix: node.matrixWorld.clone(), geometry: node.geometry,
    material: node.material, uv: node.geometry.getAttribute('uv')?.array.slice(),
    castShadow: node.castShadow, receiveShadow: node.receiveShadow }));
  const state = { entities: new Map([parent, ...children].map(entity => [entity.id, entity])) };
  const meshes = new Map([[parent, boundary]]);
  const disposal = new Map();
  for (const resource of pkg.loaded.resources) resource.addEventListener?.('dispose', () => disposal.set(resource, (disposal.get(resource) || 0) + 1));
  let foreignBuild = null;
  if (foreign) foreignBuild = composeBroodMaterialForProbe(pkg.record, { scene, entityId: 'unrelated-live-parent' });
  let refused = null;
  const retire = (object, reason) => {
    object.removeFromParent(); object.userData.releaseAuthoredAssetResidency?.(reason);
    residency.releaseOwner(object, reason);
  };
  const owner = createBroodResidentCellOwner({ state, residency, lookupMesh: e => meshes.get(e),
    ready: object => object === boundary, toLocal,
    bind(entity, object) { if (entity === refused) return false; meshes.set(entity, object); scene.add(object); return true; },
    unbind(entity, object) { if (meshes.get(entity) === object) meshes.delete(entity); object.removeFromParent(); }, retire });
  return { ...built, parent, children, state, meshes, leaves, before, residency, pkg, owner,
    foreignBuild, disposal, retire, refuse: entity => { refused = entity; } };
}

function killAndPrepare(f) {
  f.parent.alive = false; f.parent.data.splitterMaterialTransferred = true;
  assert.equal(f.owner.prepare({ parent: f.parent, children: f.children }), true);
  assert.equal(f.owner.pendingCount(), 3);
  f.retire(f.ownerBoundary || f.meshes.get(f.parent), 'parent-disappeared');
  f.meshes.delete(f.parent);
}
function assertExactFirstFrame(f) {
  f.scene.updateMatrixWorld(true);
  for (const row of f.before) {
    assert.equal(row.node.geometry, row.geometry); assert.equal(row.node.material, row.material);
    assert.deepEqual(row.node.geometry.getAttribute('uv')?.array, row.uv);
    assert.equal(row.node.castShadow, row.castShadow); assert.equal(row.node.receiveShadow, row.receiveShadow);
    assert.ok(row.node.matrixWorld.elements.every((v, i) => Math.abs(v - row.matrix.elements[i]) < 1e-9), row.node.name);
  }
  for (const child of f.children) {
    const root = f.meshes.get(child); assert.ok(root?.parent === f.scene);
    assert.equal(root.userData.lod.level, 'lod2');
    const visible = []; root.traverseVisible(n => { if (n.isMesh) visible.push(n); });
    assert.ok(visible.length > 0, 'cold child has real surfaces before its first frame');
    assert.ok(visible.every(n => n.userData.spacefaceTags.lod === 'lod2'));
    assert.ok(visible.every(n => n.userData.spacefaceTags.broodCell === child.data.broodBodyId));
    root.userData.updateLod('lod1');
    const later = []; root.traverseVisible(n => { if (n.isMesh) later.push(n); });
    assert.ok(later.length > 0 && later.every(n => n.userData.spacefaceTags.lod === 'lod1'));
  }
  assert.equal(f.pkg.decodeCount(), 1, 'zero child decodes or async visibility gaps');
}

test('actual compiled cells retain exact pose, material and LOD on the first publish after parent retirement', async () => {
  const f = await fixture();
  try {
    killAndPrepare(f);
    assert.equal(f.disposal.size, 0);
    assert.equal(f.owner.flush(), 3);
    assertExactFirstFrame(f);
    for (const child of f.children) { f.retire(f.meshes.get(child), 'child-end'); f.retire(f.meshes.get(child), 'duplicate-end'); }
    f.pkg.loader.dispose();
    assert.equal(f.disposal.size, f.pkg.loaded.resources.length);
    assert.ok([...f.disposal.values()].every(count => count === 1));
  } finally { f.owner.reset(); f.pkg.loader.dispose(); }
});

test('actual shared package survives parent removal and refused first publication until every real owner retires', async () => {
  const f = await fixture({ foreign: true });
  try {
    killAndPrepare(f); f.refuse(f.children[1]);
    assert.equal(f.owner.flush(), 0);
    assert.ok(f.children.every(child => !f.meshes.has(child)), 'no partial sibling frame');
    assert.equal(f.owner.pendingCount(), 3); assert.equal(f.disposal.size, 0);
    f.refuse(null); assert.equal(f.owner.flush(), 3); assertExactFirstFrame(f);
    f.pkg.loader.dispose();
    for (const child of f.children) f.retire(f.meshes.get(child), 'child-end');
    assert.equal(f.disposal.size, 0, 'unrelated live parent keeps the shared geometry and images');
    f.retire(f.foreignBuild.owner, 'foreign-end');
    assert.equal(f.disposal.size, f.pkg.loaded.resources.length);
    assert.ok([...f.disposal.values()].every(count => count === 1));
  } finally { f.owner.reset(); f.pkg.loader.dispose(); }
});

for (const reason of ['recycled-life', 'Retry', 'context-loss']) test(`actual pending cells release safely on ${reason}`, async () => {
  const f = await fixture();
  try {
    killAndPrepare(f);
    if (reason === 'recycled-life') {
      for (const child of f.children) f.state.entities.set(child.id, { ...child, occupantGeneration: child.occupantGeneration + 100 });
      assert.equal(f.owner.flush(), 0);
    } else {
      if (reason === 'context-loss') f.residency.handleContextLost();
      f.owner.reset(reason); f.owner.reset(reason);
    }
    assert.equal(f.owner.pendingCount(), 0);
    assert.ok(f.children.every(child => !f.meshes.has(child)));
    f.pkg.loader.dispose();
    assert.ok([...f.disposal.values()].every(count => count === 1));
    if (reason !== 'context-loss') assert.equal(f.disposal.size, f.pkg.loaded.resources.length);
  } finally { f.owner.reset(); f.pkg.loader.dispose(); }
});
