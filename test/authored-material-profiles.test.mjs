import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  applyAuthoredMaterialProfile,
  authoredMaterialRole,
  configureAuthoredMaterialProfiles,
  inspectAuthoredPbrCoverage,
} from '../src/render/authoredMaterialProfiles.js';

test('semantic Blender material names resolve to stable runtime roles', () => {
  assert.equal(authoredMaterialRole('Material_Hull'), 'hull');
  assert.equal(authoredMaterialRole('Material_Mechanical'), 'mechanical');
  assert.equal(authoredMaterialRole('Material_Canopy'), 'glass');
  assert.equal(authoredMaterialRole('Material_Thruster'), 'drive');
  assert.equal(authoredMaterialRole('Material_Emissive_DriveCore'), 'drive');
  assert.equal(authoredMaterialRole('Material_Emissive_Cyan'), 'signal');
  assert.equal(authoredMaterialRole('Material_Emissive_Orange'), 'signal');
  assert.equal(authoredMaterialRole('LOD0_Warning_Material'), 'warning');
  assert.equal(authoredMaterialRole('Station_Radiator_Thermal'), 'radiator');
  assert.equal(authoredMaterialRole('Docking_Contact_Surface'), 'docking');
  assert.equal(authoredMaterialRole('Engine_Ceramic_Liner'), 'ceramic');
  assert.equal(authoredMaterialRole('Asteroid_Regolith_Matrix'), 'geology');
  assert.equal(authoredMaterialRole('Maintenance_Access_Panel'), 'service');
  assert.equal(authoredMaterialRole('Material_BrushedMetal'), 'mechanical');
  assert.equal(authoredMaterialRole('Material_Rubber'), 'rubber');
  assert.equal(authoredMaterialRole('Material_RepairGreen'), 'repair');
  assert.equal(authoredMaterialRole('SF_Window'), 'glass');
  assert.equal(authoredMaterialRole('SF_AmberEmission'), 'signal');
  assert.equal(authoredMaterialRole('mystery'), null);
});

test('a base-color skin is not misreported as a complete PBR surface', () => {
  const skinOnly = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(), roughness: 0.95, metalness: 0.9,
  });
  skinOnly.name = 'Material_Hull';

  const before = inspectAuthoredPbrCoverage(skinOnly);
  assert.equal(before.baseColor, true);
  assert.equal(before.complete, false);
  assert.equal(applyAuthoredMaterialProfile(skinOnly), true);
  assert.equal(skinOnly.userData.spacefacePbrRemasterRequired, true);
  assert.equal(skinOnly.userData.spacefacePbrCoverage.roughnessVariation, false);
  assert.equal(skinOnly.userData.spacefacePbrCoverageAfterFallback.complete, true);
  assert.ok(skinOnly.normalMap);
  assert.strictEqual(skinOnly.roughnessMap, skinOnly.metalnessMap);
  assert.ok(skinOnly.roughness <= 0.9);
  assert.ok(skinOnly.metalness <= 0.42,
    'painted hull without ORM must not default to uniformly metallic plastic');
});

test('authored functional signals preserve distinct cyan and orange hues', () => {
  const cyan = new THREE.MeshStandardMaterial({ color: 0x0b6f88, emissive: 0x19d8ff, emissiveIntensity: 0.8 });
  cyan.name = 'Material_Emissive_Cyan';
  const orange = new THREE.MeshStandardMaterial({ color: 0x8f3a0c, emissive: 0xff6b18, emissiveIntensity: 1.1 });
  orange.name = 'Material_Emissive_Orange';
  const cyanBefore = cyan.emissive.getHex();
  const orangeBefore = orange.emissive.getHex();

  applyAuthoredMaterialProfile(cyan);
  applyAuthoredMaterialProfile(orange);

  assert.equal(cyan.userData.spacefaceMaterialRole, 'signal');
  assert.equal(orange.userData.spacefaceMaterialRole, 'signal');
  assert.equal(cyan.emissive.getHex(), cyanBefore);
  assert.equal(orange.emissive.getHex(), orangeBefore);
  assert.notEqual(cyan.emissive.getHex(), orange.emissive.getHex());
});

test('textured material profiles preserve authored maps, color, and calibrated PBR factors', () => {
  const map = new THREE.Texture();
  const normalMap = new THREE.Texture();
  const roughnessMap = new THREE.Texture();
  const metalnessMap = new THREE.Texture();
  const color = new THREE.Color(0x6f747d);
  const hull = new THREE.MeshStandardMaterial({
    map, normalMap, roughnessMap, metalnessMap, color, roughness: 0.92, metalness: 0.8,
  });
  hull.name = 'Material_Hull';
  const beforeColor = hull.color.getHex();

  assert.equal(applyAuthoredMaterialProfile(hull), true);
  assert.strictEqual(hull.map, map);
  assert.strictEqual(hull.normalMap, normalMap);
  assert.strictEqual(hull.roughnessMap, roughnessMap);
  assert.strictEqual(hull.metalnessMap, metalnessMap);
  assert.equal(hull.color.getHex(), beforeColor);
  assert.equal(hull.roughness, 0.92);
  assert.equal(hull.metalness, 0.8);
  assert.equal(hull.dithering, true);
  assert.equal(hull.userData.spacefacePbrCoverage.complete, true);
  assert.equal(hull.userData.spacefacePbrRemasterRequired, false);
});

test('one shared material is configured once across an authored subtree', () => {
  const root = new THREE.Group();
  const shared = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.1 });
  shared.name = 'Material_Mechanical';
  root.add(
    new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared),
    new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared),
  );

  const result = configureAuthoredMaterialProfiles(root);

  assert.deepEqual(result, { materials: 1, roles: { mechanical: 1 } });
  assert.ok(shared.metalness >= 0.55);
  assert.ok(shared.roughness <= 0.72);
  assert.equal(shared.userData.spacefaceProceduralPbrFallback.role, 'mechanical');
});

test('material profile configuration preserves an exported fine-grained semantic role', () => {
  const material = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(),
    normalMap: new THREE.Texture(),
    roughnessMap: new THREE.Texture(),
    metalnessMap: new THREE.Texture(),
  });
  material.name = 'SF_GOLDEN_V1_PAINTED_ARMOR';
  material.userData.spacefaceMaterialRole = 'painted_armor';
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));

  assert.deepEqual(configureAuthoredMaterialProfiles(root, { assetId: 'cockpit_slab' }), {
    materials: 1,
    roles: { painted_armor: 1 },
  });
  assert.equal(material.userData.spacefaceMaterialRole, 'painted_armor');
  assert.equal(material.userData.spacefacePbrCoverage.complete, true);
});

test('runtime fallback recipes remain role-specific, bounded, and never replace complete authored maps', async () => {
  const { proceduralPbrFallbackDiagnostics } = await import('../src/render/proceduralPbrFallback.js');
  const hull = new THREE.MeshStandardMaterial();
  hull.name = 'Material_Hull';
  const geology = new THREE.MeshStandardMaterial();
  geology.name = 'Asteroid_Regolith_Matrix';
  applyAuthoredMaterialProfile(hull, null, { assetId: 'hull_starter' });
  applyAuthoredMaterialProfile(geology, null, { assetId: 'place_asteroid_rock_a' });

  assert.notStrictEqual(hull.normalMap, geology.normalMap);
  assert.notEqual(hull.userData.spacefaceProceduralPbrFallback.role, geology.userData.spacefaceProceduralPbrFallback.role);
  assert.ok(hull.normalScale.x < geology.normalScale.x, 'rock relief must not reuse painted-hull strength');
  assert.ok(proceduralPbrFallbackDiagnostics().bundles <= proceduralPbrFallbackDiagnostics().maxBundles);

  const authored = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(),
    normalMap: new THREE.Texture(),
    roughnessMap: new THREE.Texture(),
    metalnessMap: new THREE.Texture(),
  });
  authored.name = 'Material_Hull';
  const before = [authored.map, authored.normalMap, authored.roughnessMap, authored.metalnessMap];
  applyAuthoredMaterialProfile(authored, null, { assetId: 'hull_starter' });
  assert.deepEqual([authored.map, authored.normalMap, authored.roughnessMap, authored.metalnessMap], before);
  assert.equal(authored.userData.spacefaceProceduralPbrFallback, undefined);
});

test('UV-less legacy geometry keeps safe role factors and stays explicitly queued for source remaster', () => {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.deleteAttribute('uv');
  const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1 });
  material.name = 'Material_Hull';
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, material));

  assert.deepEqual(configureAuthoredMaterialProfiles(root, { assetId: 'hull_legacy' }), {
    materials: 1,
    roles: { hull: 1 },
  });
  assert.equal(material.normalMap, null);
  assert.equal(material.roughnessMap, null);
  assert.equal(material.userData.spacefacePbrRemasterRequired, true);
  assert.ok(material.roughness <= 0.9);
  assert.ok(material.metalness <= 0.42);
});

test('Rock A suppresses only its unmasked whole-primitive warm emission', () => {
  const rockRoot = new THREE.Group();
  const unmaskedWarm = new THREE.MeshStandardMaterial({
    color: 0x5a4235,
    emissive: 0xf2a957,
    emissiveIntensity: 1.7,
  });
  unmaskedWarm.name = 'Material_Warm';
  rockRoot.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1), unmaskedWarm));

  const result = configureAuthoredMaterialProfiles(rockRoot, { assetId: 'place_asteroid_rock_a' });

  assert.deepEqual(result, { materials: 1, roles: { geology: 1 } });
  assert.equal(unmaskedWarm.emissive.getHex(), 0x000000);
  assert.equal(unmaskedWarm.emissiveIntensity, 0);
  assert.equal(unmaskedWarm.userData.spacefaceMaterialRole, 'geology');
  assert.equal(unmaskedWarm.userData.spacefaceEmissionCorrection, 'unmasked-rock-emission-suppressed');
  assert.equal(unmaskedWarm.userData.spacefacePbrCoverageAfterFallback.complete, true);

  const stationRoot = new THREE.Group();
  const stationWarm = unmaskedWarm.clone();
  stationWarm.emissive.setHex(0xf2a957);
  stationWarm.emissiveIntensity = 1.7;
  stationWarm.userData = {};
  stationRoot.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), stationWarm));
  assert.deepEqual(configureAuthoredMaterialProfiles(stationRoot, { assetId: 'place_station_trade_hub' }), {
    materials: 1,
    roles: { signal: 1 },
  });
  assert.equal(stationWarm.emissive.getHex(), 0xf2a957);
  assert.equal(stationWarm.emissiveIntensity, 1.7);

  const maskedRoot = new THREE.Group();
  const maskedWarm = stationWarm.clone();
  maskedWarm.emissiveMap = new THREE.Texture();
  maskedRoot.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1), maskedWarm));
  assert.deepEqual(configureAuthoredMaterialProfiles(maskedRoot, { assetId: 'place_asteroid_rock_a' }), {
    materials: 1,
    roles: { signal: 1 },
  });
  assert.equal(maskedWarm.emissive.getHex(), 0xf2a957);
  assert.equal(maskedWarm.emissiveIntensity, 1.7);
});
