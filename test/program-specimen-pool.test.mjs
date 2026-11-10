// Canonical program specimen pool (wave-2 shaderwarm2): authored admissions mount one tiny
// specimen mesh per unseen material-state x object-axes signature into the same compile pass,
// so the bound program survives its source material's disposal and re-admissions hit the cache.
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  canonicalProgramSpecimenPoolSize,
  canonicalProgramSpecimenSignature,
  mountCanonicalProgramSpecimens,
  settleCanonicalProgramSpecimens,
} from '../src/render/programCanon.js';

function geometryWith(attributes = {}) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  for (const [name, itemSize] of Object.entries(attributes)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(3 * itemSize), itemSize));
  }
  return geometry;
}

function rootWith(object) {
  const root = new THREE.Group();
  root.add(object);
  return root;
}

test('mounts one specimen per novel signature, then settles off the live root', () => {
  const material = new THREE.MeshStandardMaterial({ name: 'SF_SpecimenTest_A' });
  material.map = new THREE.Texture();
  const mesh = new THREE.Mesh(geometryWith({ uv: 2 }), material);
  const root = rootWith(mesh);

  const before = canonicalProgramSpecimenPoolSize();
  const mount = mountCanonicalProgramSpecimens(root);
  assert.ok(mount, 'a novel signature produces a mount group');
  assert.equal(mount.children.length, 1);
  assert.equal(root.children.includes(mount), true);
  assert.equal(canonicalProgramSpecimenPoolSize(), before + 1);

  const specimen = mount.children[0];
  assert.notEqual(specimen.material, material, 'the specimen is a clone, not the live material');
  assert.equal(specimen.material.map, material.map, 'texture slots carry over by reference');
  assert.equal(specimen.userData.spacefaceSharedAsset, true);
  assert.equal(specimen.geometry.attributes.uv.itemSize, 2, 'geometry axes replicate');
  assert.equal(specimen.material.userData.spacefaceProgramSpecimen, true);
  // The specimen must mint the identical program: its signature equals the source pair's
  // across every axis three's program cache key reads.
  assert.equal(
    canonicalProgramSpecimenSignature(specimen.material, specimen),
    canonicalProgramSpecimenSignature(material, mesh),
  );

  settleCanonicalProgramSpecimens(root, mount);
  assert.equal(root.children.includes(mount), false, 'the mount detaches after compile');
  assert.equal(root.children.length, 1, 'the authored content is untouched');
  // The registry still pins the specimen: its program cannot be released with the source.
  assert.equal(canonicalProgramSpecimenPoolSize(), before + 1);
});

test('already-covered signatures mount nothing, across roots and admissions', () => {
  const first = new THREE.MeshStandardMaterial({ name: 'SF_SpecimenTest_B' });
  first.emissiveMap = new THREE.Texture();
  const second = new THREE.MeshStandardMaterial({ name: 'SF_SpecimenTest_B2' });
  second.emissiveMap = new THREE.Texture(); // same feature set, different color/texture identity
  second.emissive.setRGB(1, 0, 0);

  const before = canonicalProgramSpecimenPoolSize();
  const mountA = mountCanonicalProgramSpecimens(rootWith(new THREE.Mesh(geometryWith(), first)));
  assert.ok(mountA);
  const specimen = mountA.children[0];
  settleCanonicalProgramSpecimens(null, mountA);

  const mountB = mountCanonicalProgramSpecimens(rootWith(new THREE.Mesh(geometryWith(), second)));
  assert.ok(mountB, 'a covered signature re-mounts its retained specimen');
  assert.equal(mountB.children.length, 1);
  assert.equal(mountB.children[0], specimen, 'the same specimen object is re-pinned — self-healing if its first admission aborted mid-compile');
  assert.equal(canonicalProgramSpecimenPoolSize(), before + 1,
    'uniform-level differences do not mint a second specimen');
  settleCanonicalProgramSpecimens(null, mountB);
});

test('key axes split signatures: side, hooks, and geometry attributes', () => {
  const base = canonicalProgramSpecimenPoolSize();

  const front = new THREE.MeshStandardMaterial({ name: 'SF_SpecimenTest_C' });
  const double = new THREE.MeshStandardMaterial({ name: 'SF_SpecimenTest_C' });
  double.side = THREE.DoubleSide;

  const hooked = new THREE.MeshStandardMaterial({ name: 'SF_SpecimenTest_C' });
  const hook = (shader) => shader;
  hooked.onBeforeCompile = hook;
  hooked.customProgramCacheKey = () => 'spaceface-surface-breakup:test';
  hooked.defines = { STANDARD: '', EXTRA: '1' };

  const plain = geometryWith({ normal: 3 });
  const tangented = geometryWith({ normal: 3, tangent: 4 });
  const vertexColored = geometryWith({ normal: 3, color: 4 });

  const root = new THREE.Group();
  root.add(
    new THREE.Mesh(plain, front),
    new THREE.Mesh(geometryWith({ normal: 3 }), double),
    new THREE.Mesh(geometryWith({ normal: 3 }), hooked),
    new THREE.Mesh(tangented, new THREE.MeshStandardMaterial({ name: 'SF_SpecimenTest_C' })),
    new THREE.Mesh(vertexColored, (() => {
      const m = new THREE.MeshStandardMaterial({ name: 'SF_SpecimenTest_C' });
      m.vertexColors = true;
      return m;
    })()),
  );

  const mount = mountCanonicalProgramSpecimens(root);
  assert.ok(mount);
  assert.equal(mount.children.length, 5, 'each distinct program axis earns a specimen');
  assert.equal(canonicalProgramSpecimenPoolSize(), base + 5);

  const hookedSpecimen = mount.children[2];
  assert.equal(hookedSpecimen.material.customProgramCacheKey, hooked.customProgramCacheKey,
    'the own-property cache key hook rides the clone');
  assert.equal(hookedSpecimen.material.onBeforeCompile, hook);
  assert.deepEqual(hookedSpecimen.material.defines, { STANDARD: '', EXTRA: '1' },
    'Standard copy() resets defines — the specimen restores them');
  assert.equal(hookedSpecimen.material.userData.spacefaceProgramSpecimen, true);

  const tangentSpecimen = mount.children[3];
  assert.equal(tangentSpecimen.geometry.attributes.tangent.itemSize, 4);
  const colorSpecimen = mount.children[4];
  assert.equal(colorSpecimen.geometry.attributes.color.itemSize, 4,
    'a vec4 color attribute keeps vertexAlphas on the minted key');

  settleCanonicalProgramSpecimens(root, mount);
  assert.equal(root.children.length, 5);
});

test('material arrays, skinned/instanced carriers, and the kill switch', () => {
  const base = canonicalProgramSpecimenPoolSize();

  const arrayedD1 = new THREE.MeshStandardMaterial({ name: 'SF_SpecimenTest_D1' });
  arrayedD1.roughnessMap = new THREE.Texture(); // keep its signature distinct from plain carriers
  const arrayed = new THREE.Mesh(
    geometryWith({ normal: 3, uv: 2 }),
    [arrayedD1, new THREE.MeshPhysicalMaterial({ name: 'SF_SpecimenTest_D2' })],
  );
  const skinned = new THREE.SkinnedMesh(
    geometryWith({ normal: 3, skinIndex: 4, skinWeight: 4 }),
    new THREE.MeshStandardMaterial({ name: 'SF_SpecimenTest_D3' }),
  );
  const instanced = new THREE.InstancedMesh(
    geometryWith({ normal: 3 }),
    new THREE.MeshStandardMaterial({ name: 'SF_SpecimenTest_D4' }), 2,
  );
  instanced.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(6), 3);

  const root = rootWith(arrayed);
  root.add(skinned, instanced);
  const mount = mountCanonicalProgramSpecimens(root);
  assert.ok(mount);
  assert.equal(mount.children.length, 4);
  assert.equal(canonicalProgramSpecimenPoolSize(), base + 4);

  const [d1, d2, d3, d4] = mount.children;
  assert.equal(d1.material.isMeshStandardMaterial, true);
  assert.equal(d2.material.isMeshPhysicalMaterial, true);
  assert.equal(d3.isSkinnedMesh, true);
  assert.ok(d3.geometry.attributes.skinIndex && d3.geometry.attributes.skinWeight);
  assert.equal(d4.isInstancedMesh, true);
  assert.equal(d4.instanceColor.itemSize, 3);
  settleCanonicalProgramSpecimens(root, mount);

  globalThis.__SF_PROGRAM_SPECIMENS_OFF__ = true;
  try {
    const off = mountCanonicalProgramSpecimens(
      rootWith(new THREE.Mesh(geometryWith(), new THREE.MeshBasicMaterial({ name: 'SF_SpecimenTest_E' }))));
    assert.equal(off, null);
  } finally {
    delete globalThis.__SF_PROGRAM_SPECIMENS_OFF__;
  }
});
