import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  WORKS_INCLUSION_COMMODITY_FAMILY,
  WORKS_INCLUSION_VARIANTS,
  WORKS_INCLUSION_VARIANTS_BY_FAMILY,
  createWorksInclusionCatalog,
  createWorksInclusionInstance,
  releaseWorksInclusionInstance,
  selectWorksInclusionVariant,
  setWorksInclusionRegister,
  worksInclusionFamilyForCommodity,
} from '../src/ui/asteroid/worksInclusionKit.js';
import { WORKS_PARTS } from '../src/ui/asteroid/worksPartLoader.js';

const FAMILY_BY_VARIANT = Object.fromEntries(
  Object.entries(WORKS_INCLUSION_VARIANTS_BY_FAMILY)
    .flatMap(([family, variants]) => variants.map((variant) => [variant, family])),
);

function makeCompleteStandingGroup() {
  const group = new THREE.Group();
  group.name = 'place_works_inclusion_kit';
  WORKS_INCLUSION_VARIANTS.forEach((variant, index) => {
    const origin = new THREE.Vector3((index % 6) * 2.2 - 5.5, 2.2 - Math.floor(index / 6) * 2.2, 0);
    for (let lod = 0; lod <= 2; lod++) {
      const geometry = new THREE.BoxGeometry(0.7 - lod * 0.1, 0.6, 0.12);
      const material = new THREE.MeshStandardMaterial({ color: 0x886644 + index });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `LOD${lod}_${variant}`;
      mesh.position.copy(origin);
      mesh.rotation.z = index * 0.01;
      mesh.scale.set(1, 1 + index * 0.002, 1);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.sourceSentinel = `${variant}:${lod}`;
      group.add(mesh);
    }
  });
  return group;
}

function meshNamed(group, name) {
  return group.children.find((child) => child.name === name);
}

test('commodity mapping and variant selection are complete and deterministic', () => {
  assert.deepEqual(WORKS_INCLUSION_COMMODITY_FAMILY, {
    cmdty_ore_iron: 'iron',
    cmdty_ore_copper: 'iron',
    cmdty_ore_bronzium: 'nickel',
    cmdty_ore_silverium: 'silver',
    cmdty_ore_platinium: 'silver',
    cmdty_ore_goldium: 'gold',
    cmdty_gem_diamond: 'ice',
    cmdty_ore_einsteinium: 'exotic',
    cmdty_gem_emerald: 'exotic',
    cmdty_gem_ruby: 'exotic',
    cmdty_exotic_amazonite: 'exotic',
  });
  for (const [commodityId, family] of Object.entries(WORKS_INCLUSION_COMMODITY_FAMILY)) {
    assert.equal(worksInclusionFamilyForCommodity(commodityId), family, commodityId);
  }
  assert.equal(worksInclusionFamilyForCommodity('cmdty_silicate'), null);
  for (const family of Object.keys(WORKS_INCLUSION_VARIANTS_BY_FAMILY)) {
    const first = selectWorksInclusionVariant({ family, col: 17, row: 9, salt: 'same-rock' });
    assert.equal(selectWorksInclusionVariant({ family, col: 17, row: 9, salt: 'same-rock' }), first);
    assert.equal(FAMILY_BY_VARIANT[first], family);
  }
  assert.throws(
    () => selectWorksInclusionVariant({ family: 'unknown', col: 0, row: 0 }),
    /unknown inclusion family/,
  );
  assert.throws(
    () => selectWorksInclusionVariant({ family: 'iron', col: 0.5, row: 0 }),
    /integer col and row/,
  );
});

test('complete 18x3 standing mesh contract binds into one catalog', () => {
  const group = makeCompleteStandingGroup();
  const catalog = createWorksInclusionCatalog(group);
  assert.equal(catalog.sourceGroup, group);
  assert.equal(catalog.variantCount, 18);
  assert.deepEqual(Object.keys(catalog.variants), [...WORKS_INCLUSION_VARIANTS]);
  for (const variant of WORKS_INCLUSION_VARIANTS) {
    assert.equal(catalog.variants[variant].family, FAMILY_BY_VARIANT[variant]);
    assert.equal(catalog.variants[variant].lods.length, 3);
  }
});

test('catalog fails closed on missing, duplicate, unknown, malformed, or divergent rows', () => {
  const missing = makeCompleteStandingGroup();
  missing.remove(meshNamed(missing, 'LOD2_SF_INCL_GOLD_LEAF_V1'));
  assert.throws(() => createWorksInclusionCatalog(missing), /missing LOD2 mesh.*GOLD_LEAF/);

  const duplicate = makeCompleteStandingGroup();
  const duplicateMesh = meshNamed(duplicate, 'LOD1_SF_INCL_ICE_SHEEN_PLATE_V1').clone();
  duplicate.add(duplicateMesh);
  assert.throws(() => createWorksInclusionCatalog(duplicate), /duplicate LOD1 mesh.*ICE_SHEEN/);

  const unknown = makeCompleteStandingGroup();
  const unknownMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  unknownMesh.name = 'LOD0_SF_INCL_UNKNOWN_V1';
  unknown.add(unknownMesh);
  assert.throws(() => createWorksInclusionCatalog(unknown), /unknown accepted variant/);

  const malformed = makeCompleteStandingGroup();
  const malformedMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  malformedMesh.name = 'LOD9_SF_INCL_GOLD_LEAF_V1';
  malformed.add(malformedMesh);
  assert.throws(() => createWorksInclusionCatalog(malformed), /malformed inclusion node name/);

  const divergent = makeCompleteStandingGroup();
  meshNamed(divergent, 'LOD2_SF_INCL_SILVER_WIRE_V1').position.x += 0.01;
  assert.throws(() => createWorksInclusionCatalog(divergent), /LOD origins diverge/);
});

test('per-cell instances recenter without mutating or taking ownership of source resources', () => {
  const source = makeCompleteStandingGroup();
  const sourceChildren = [...source.children];
  const sourcePositions = sourceChildren.map((mesh) => mesh.position.clone());
  const catalog = createWorksInclusionCatalog(source);
  const variant = 'SF_INCL_IRON_CHIP_RIDGE_V1';
  const row = catalog.variants[variant];
  const instance = createWorksInclusionInstance(catalog, variant, 'work');

  assert.equal(instance.children.length, 3);
  assert.equal(instance.userData.worksInclusionVariant, variant);
  assert.equal(instance.userData.worksInclusionOwnsGpuResources, false);
  for (let lod = 0; lod <= 2; lod++) {
    const clone = instance.children[lod];
    assert.equal(clone.geometry, row.lods[lod].geometry);
    assert.equal(clone.material, row.lods[lod].material);
    assert.deepEqual(clone.position.toArray(), [0, 0, 0]);
    assert.equal(clone.userData.sourceSentinel, `${variant}:${lod}`);
    assert.equal(clone.userData.worksInclusionOwnsGpuResources, false);
  }
  assert.deepEqual(instance.children.map((mesh) => mesh.visible), [true, false, false]);

  const sameInstance = setWorksInclusionRegister(instance, 'site');
  assert.equal(sameInstance, instance);
  assert.deepEqual(instance.children.map((mesh) => mesh.visible), [false, true, false]);
  setWorksInclusionRegister(instance, 'work');
  assert.deepEqual(instance.children.map((mesh) => mesh.visible), [true, false, false]);
  assert.throws(() => setWorksInclusionRegister(instance, 'far'), /register must be/);

  assert.deepEqual(source.children, sourceChildren);
  source.children.forEach((mesh, index) => assert.equal(mesh.position.equals(sourcePositions[index]), true));
  const parent = new THREE.Group();
  parent.add(instance);
  assert.equal(releaseWorksInclusionInstance(instance), true);
  assert.equal(instance.parent, null);
  assert.equal(instance.children.length, 0);
  assert.equal(releaseWorksInclusionInstance(instance), false);
  assert.equal(releaseWorksInclusionInstance(new THREE.Group()), false);
});

test('standing loader registry binds the exact accepted Inclusion Kit release', () => {
  assert.deepEqual(WORKS_PARTS.inclusion_kit, {
    lod0: 'assets/ships/release/parts/works/place_works_inclusion_kit.glb',
    lod1: null,
    slot: 'place',
    hooks: [],
  });
});
