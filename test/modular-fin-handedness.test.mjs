import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Float32BufferAttribute, Int16BufferAttribute, Group, Mesh,
  MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { handedFinPlacement, mirroredFinGeometry, mirroredFinNode,
  prepareMirroredFinGeometries } from '../src/render/modularFinHandedness.js';
import { createPackageDetachManifest, detachPackageGeometry, isPackageGeometryDetached,
  resetPackageDetachManifestsForTests } from '../src/render/packageCpuDetach.js';

test('only unilateral fins facing inward are reflected; authored orientations and stabilators survive', () => {
  const port = { position: [-.13, .006, -.45], rotation: [0, 0, -.04] };
  for (const family of ['wedge', 'radiator_grid', 'swept_smuggler', 'crystalline', 'delta']) {
    const record = { url: `assets/ships/release/parts/fins/fin_${family}.glb` };
    assert.equal(handedFinPlacement(record, port).mirrorFinZ, true);
    const starboard = { position: [-.13, .006, .45] };
    assert.equal(handedFinPlacement(record, starboard), starboard);
    const turned = { ...port, quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI) };
    assert.equal(handedFinPlacement(record, turned), turned);
  }
  assert.equal(handedFinPlacement({ url: 'fins/fin_stabilator.glb' }, port), port);
  assert.equal(handedFinPlacement({ url: 'fins/unknown.glb' }, port), port);
  assert.equal(port.mirrorFinZ, undefined);
});

function triangle(indexed = true) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Int16BufferAttribute([0, 0, 0, 32767, 0, 0, 0, 0, 32767], 3, true));
  geometry.setAttribute('normal', new Float32BufferAttribute([0, -1, 0, 0, -1, 0, 0, -1, 0], 3));
  geometry.setAttribute('tangent', new Float32BufferAttribute([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1], 4));
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  if (indexed) geometry.setIndex([0, 1, 2]);
  geometry.addGroup(0, 3, 2);
  return geometry;
}

test('normalized/indexed and nonindexed geometry retain front faces, normal-map handedness, UVs and groups', () => {
  for (const indexed of [true, false]) {
    const source = triangle(indexed), mirrored = mirroredFinGeometry(source);
    assert.deepEqual([...mirrored.index.array], [0, 2, 1]);
    assert.equal(mirrored.getAttribute('position').getZ(2), -1);
    assert.equal(source.getAttribute('position').getZ(2), 1);
    const p = mirrored.getAttribute('position'), v = i => new Vector3().fromBufferAttribute(p, i);
    const geometricNormal = v(2).sub(v(0)).cross(v(1).sub(v(0))).normalize();
    assert(geometricNormal.dot(new Vector3().fromBufferAttribute(mirrored.getAttribute('normal'), 0)) > .999);
    assert.equal(mirrored.getAttribute('tangent').getW(0), -1);
    assert.equal(source.getAttribute('tangent').getW(0), 1);
    assert.deepEqual(mirrored.getAttribute('uv').array, source.getAttribute('uv').array);
    assert.deepEqual(mirrored.groups, source.groups);
    source.dispose();
  }
});

test('nested semantic transforms reflect the whole fin, preserving positive determinants, material and LOD names', () => {
  const root = new Group(); root.position.set(1, 2, 3); root.rotation.y = .3; root.updateMatrix();
  const mesh = new Mesh(triangle(), new MeshStandardMaterial()); mesh.name = 'LOD1_Radiator';
  mesh.position.set(2, 0, .4); mesh.rotation.x = .2; mesh.updateMatrix(); root.add(mesh); root.updateMatrixWorld(true);
  const leftRoot = mirroredFinNode(root), leftMesh = mirroredFinNode(mesh);
  leftRoot.add(leftMesh); leftRoot.updateMatrixWorld(true);
  const original = new Vector3(0, 0, 1).applyMatrix4(mesh.matrixWorld);
  const reflected = new Vector3(0, 0, -1).applyMatrix4(leftMesh.matrixWorld);
  assert(reflected.distanceTo(new Vector3(original.x, original.y, -original.z)) < 1e-10);
  assert(leftMesh.matrixWorld.determinant() > 0);
  assert.equal(leftMesh.material, mesh.material);
  assert.equal(leftMesh.name, mesh.name);
  mesh.geometry.dispose();
});

test('ships share one derived geometry until source residency is released', () => {
  const source = triangle(), a = mirroredFinGeometry(source), b = mirroredFinGeometry(source);
  assert.equal(a, b); assert.notEqual(a, source);
  let disposed = 0; a.addEventListener('dispose', () => disposed++);
  const shipA = new Mesh(source), shipB = new Mesh(source);
  const leftA = mirroredFinNode(shipA), leftB = mirroredFinNode(shipB);
  leftA.removeFromParent();
  assert.equal(leftB.geometry, a); assert.equal(disposed, 0);
  source.dispose(); assert.equal(disposed, 1);
  source.dispose(); assert.equal(disposed, 1);
});

test('first mirrored instance refills a genuinely detached package once, then shares its complete derivative', async () => {
  resetPackageDetachManifestsForTests();
  const source = triangle(); let decodes = 0;
  const expectedUV = [...source.attributes.uv.array];
  createPackageDetachManifest({ contentHash: 'fixture.fin-retired-before-first-port', resources: [source] }, {
    redecode: async () => { decodes++; return triangle(); }, collectResources: donor => [donor],
  });
  assert.equal(detachPackageGeometry(source, {}), true);
  assert.equal(source.attributes.normal.array.length, 0);
  assert.equal(source.attributes.tangent.array.length, 0);
  assert.equal(source.attributes.uv.array.length, 0);
  assert.throws(() => mirroredFinGeometry(source), /refilled/);
  await Promise.all([prepareMirroredFinGeometries([source]), prepareMirroredFinGeometries([source])]);
  const mirrored = mirroredFinGeometry(source);
  assert.equal(decodes, 1);
  for (const name of ['position', 'normal', 'tangent', 'uv']) {
    assert.equal(mirrored.attributes[name].count, 3);
    assert(mirrored.attributes[name].array.every(Number.isFinite));
  }
  assert.deepEqual([...mirrored.attributes.uv.array], expectedUV);
  assert.equal(mirrored.attributes.tangent.getW(0), -1);
  assert.equal(detachPackageGeometry(source, {}), true, 'the preparation lease was released');
  assert.equal(isPackageGeometryDetached(source), true);
  await prepareMirroredFinGeometries([source]);
  assert.equal(decodes, 1, 'a later ship must not re-decode a cached derivative');
  assert.equal(mirroredFinGeometry(source), mirrored);
  source.dispose();
});

test('failed first-mirror refill releases its CPU lease and never caches incomplete geometry', async () => {
  resetPackageDetachManifestsForTests();
  const source = triangle(); let fail = true;
  createPackageDetachManifest({ contentHash: 'fixture.fin-refill-failure', resources: [source] }, {
    redecode: async () => { if (fail) throw new Error('decoder rejected'); return triangle(); },
    collectResources: donor => [donor],
  });
  detachPackageGeometry(source, {});
  await assert.rejects(prepareMirroredFinGeometries([source]), /CPU refill failed/);
  assert.throws(() => mirroredFinGeometry(source), /refilled/);
  fail = false;
  await prepareMirroredFinGeometries([source]);
  assert.equal(detachPackageGeometry(source, {}), true, 'neither failed nor successful attempt leaks a lease');
  source.dispose();
});
