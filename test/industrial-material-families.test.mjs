// PQ-190.00 — behaviour tests for the style slice's named material families.
//
// Real three.js materials, not fakes: the pass depends on `isMeshStandardMaterial`, on
// `emissive.getHex()/setHex()`, and on `'envMapIntensity' in material`, and a hand-rolled stub
// would let all three drift without failing.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  applyIndustrialMaterialFamilies,
  applyWorksFurnaceHeat,
  INDUSTRIAL_ASSET_SURFACING,
  INDUSTRIAL_MATERIAL_BASE_STAMP,
  INDUSTRIAL_MATERIAL_FAMILY_STAMP,
  MATERIAL_FAMILIES,
  resolveIndustrialAssetKey,
  resolveMaterialFamilyId,
  restoreAuthoredMaterialResponse,
  WORKS_FURNACE_HEAT,
} from '../src/render/industrialMaterialFamilies.js';

// A material shaped like the shipped GLBs: complete PBR map set, factor slots left at 1.0 so the
// texture carries the whole response.
function authoredMaterial(name, overrides = {}) {
  const material = new THREE.MeshStandardMaterial({
    name,
    metalness: 1,
    roughness: 1,
    ...overrides,
  });
  material.map = new THREE.Texture();
  material.normalMap = new THREE.Texture();
  material.roughnessMap = new THREE.Texture();
  material.metalnessMap = new THREE.Texture();
  material.aoMap = new THREE.Texture();
  material.envMapIntensity = 2.1;
  return material;
}

function rootOf(...materials) {
  const root = new THREE.Group();
  for (const material of materials) {
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
  }
  return root;
}

function snapshot(material) {
  return {
    roughness: material.roughness,
    metalness: material.metalness,
    envMapIntensity: material.envMapIntensity,
    emissiveIntensity: material.emissiveIntensity,
    emissive: material.emissive.getHex(),
    color: material.color.getHex(),
    map: material.map,
    roughnessMap: material.roughnessMap,
    metalnessMap: material.metalnessMap,
    normalMap: material.normalMap,
    aoMap: material.aoMap,
  };
}

// --------------------------------------------------------------------------------- named mapping

test('every mapped family id resolves to a real family record', () => {
  for (const [assetKey, surfacing] of Object.entries(INDUSTRIAL_ASSET_SURFACING)) {
    for (const [materialName, familyId] of Object.entries(surfacing.byMaterialName)) {
      assert.ok(MATERIAL_FAMILIES[familyId],
        `${assetKey}.${materialName} names a family that does not exist: ${familyId}`);
    }
    for (const [role, familyId] of Object.entries(surfacing.byRole)) {
      assert.ok(MATERIAL_FAMILIES[familyId],
        `${assetKey} role ${role} names a family that does not exist: ${familyId}`);
    }
  }
});

test('no family is dead data — every declared family is referenced by some asset', () => {
  const referenced = new Set([WORKS_FURNACE_HEAT.familyId]);
  for (const surfacing of Object.values(INDUSTRIAL_ASSET_SURFACING)) {
    for (const familyId of Object.values(surfacing.byMaterialName)) referenced.add(familyId);
    for (const familyId of Object.values(surfacing.byRole)) referenced.add(familyId);
  }
  for (const familyId of Object.keys(MATERIAL_FAMILIES)) {
    assert.ok(referenced.has(familyId), `${familyId} is declared but mapped by no asset`);
  }
});

test('the named mapping applies the family a material was assigned', () => {
  const hull = authoredMaterial('Material_Hull');
  const mech = authoredMaterial('Material_Mechanical');
  const glass = authoredMaterial('Material_Glass_Canopy');
  const summary = applyIndustrialMaterialFamilies(rootOf(hull, mech, glass), 'kestrel');

  assert.equal(summary.applied, 3);
  assert.equal(summary.preserved, 0);
  assert.equal(hull.userData[INDUSTRIAL_MATERIAL_FAMILY_STAMP], 'painted_shell');
  assert.equal(mech.userData[INDUSTRIAL_MATERIAL_FAMILY_STAMP], 'worn_tool_metal');
  assert.equal(glass.userData[INDUSTRIAL_MATERIAL_FAMILY_STAMP], 'controlled_glass');
});

test('the ship route falls back to the semantic role when the authored name was renamed', () => {
  // `partsLibrary.js` sharedMaterialFor renames shared materials to a program-family token and
  // keeps the semantic role in userData. The fallback is what makes the pass survive that.
  const renamed = authoredMaterial('SF_Shared_hull_hull');
  renamed.userData.spacefaceMaterialRole = 'hull';
  assert.equal(resolveMaterialFamilyId(renamed, 'kestrel'), 'painted_shell');
  assert.equal(resolveMaterialFamilyId(renamed, 'ashline_rig'), 'bare_structure');

  const unknownRole = authoredMaterial('SF_Shared_something_else');
  unknownRole.userData.spacefaceMaterialRole = 'not_a_role';
  assert.equal(resolveMaterialFamilyId(unknownRole, 'kestrel'), null);
});

// ----------------------------------------------------------------------- source-material isolation

test('the same authored material name maps differently per asset', () => {
  // The starter is a maintained ship with intact paint; the rig is salvage plate. Both call the
  // material `Material_Hull`. A global name guess would collapse the contrast this leaf exists to
  // prove — the mapping must be asset-scoped.
  const kestrelHull = authoredMaterial('Material_Hull');
  const ashlineHull = authoredMaterial('Material_Hull');
  applyIndustrialMaterialFamilies(rootOf(kestrelHull), 'kestrel');
  applyIndustrialMaterialFamilies(rootOf(ashlineHull), 'ashline_rig');

  assert.equal(kestrelHull.userData[INDUSTRIAL_MATERIAL_FAMILY_STAMP], 'painted_shell');
  assert.equal(ashlineHull.userData[INDUSTRIAL_MATERIAL_FAMILY_STAMP], 'bare_structure');
  assert.ok(ashlineHull.envMapIntensity > kestrelHull.envMapIntensity,
    'bare salvage plate must reflect more than an intact painted shell');
  assert.ok(ashlineHull.metalness > kestrelHull.metalness,
    'an intact coating is dielectric; bare plate is not');
});

// ------------------------------------------------------------------- unrecognized asset / material

test('an asset outside the six-item table is left exactly as authored', () => {
  const hull = authoredMaterial('Material_Hull');
  const before = snapshot(hull);
  const summary = applyIndustrialMaterialFamilies(rootOf(hull), 'wholeships/some_other_ship');

  assert.equal(summary.applied, 0);
  assert.deepEqual(snapshot(hull), before);
  assert.equal(hull.userData[INDUSTRIAL_MATERIAL_FAMILY_STAMP], undefined);
  assert.equal(hull.userData[INDUSTRIAL_MATERIAL_BASE_STAMP], undefined);
});

test('a material outside its asset table is left exactly as authored', () => {
  const mapped = authoredMaterial('Material_Hull');
  const unmapped = authoredMaterial('Material_SomethingNobodyMapped');
  const before = snapshot(unmapped);
  const summary = applyIndustrialMaterialFamilies(rootOf(mapped, unmapped), 'kestrel');

  assert.equal(summary.applied, 1);
  assert.equal(summary.preserved, 1);
  assert.deepEqual(snapshot(unmapped), before);
  assert.ok(summary.preservedNames.includes('Material_SomethingNobodyMapped'));
});

test('a non-standard material is preserved rather than reinterpreted', () => {
  const basic = new THREE.MeshBasicMaterial({ name: 'Material_Hull' });
  const summary = applyIndustrialMaterialFamilies(rootOf(basic), 'kestrel');
  assert.equal(summary.applied, 0);
  assert.equal(summary.preserved, 1);
});

// --------------------------------------------------------------------------- factors, never maps

test('roughness and metalness scale the authored factor and never touch a map', () => {
  const mech = authoredMaterial('Material_Mechanical');
  const before = snapshot(mech);
  applyIndustrialMaterialFamilies(rootOf(mech), 'kestrel');

  const family = MATERIAL_FAMILIES.worn_tool_metal;
  assert.equal(mech.roughness, before.roughness * family.roughness);
  assert.equal(mech.metalness, before.metalness * family.metalness);
  assert.equal(mech.envMapIntensity, family.env);
  // Every authored map survives by identity.
  assert.equal(mech.map, before.map);
  assert.equal(mech.roughnessMap, before.roughnessMap);
  assert.equal(mech.metalnessMap, before.metalnessMap);
  assert.equal(mech.normalMap, before.normalMap);
  assert.equal(mech.aoMap, before.aoMap);
  // Base colour is never repainted.
  assert.equal(mech.color.getHex(), before.color);
});

test('the pass never forces a shader recompile or replaces a material', () => {
  const hull = authoredMaterial('Material_Hull');
  const marker = Symbol('shader-hook');
  hull.onBeforeCompile = () => {};
  hull.onBeforeCompile.marker = marker;
  hull.customProgramCacheKey = () => 'existing-key';
  hull.needsUpdate = false;
  const root = rootOf(hull);
  const mesh = root.children[0];

  applyIndustrialMaterialFamilies(root, 'kestrel');

  assert.equal(mesh.material, hull, 'the material instance must not be swapped or cloned');
  assert.equal(hull.onBeforeCompile.marker, marker, 'a cloned shader hook must survive untouched');
  assert.equal(hull.customProgramCacheKey(), 'existing-key');
  assert.equal(hull.version, 0, 'uniform-only changes must not bump the material version');
});

test('roughness and metalness stay inside legal ranges', () => {
  const rough = authoredMaterial('Material_Rubber', { roughness: 0.98, metalness: 0.9 });
  applyIndustrialMaterialFamilies(rootOf(rough), 'kestrel');
  assert.ok(rough.roughness > 0 && rough.roughness <= 1, `roughness out of range: ${rough.roughness}`);
  assert.ok(rough.metalness >= 0 && rough.metalness <= 1, `metalness out of range: ${rough.metalness}`);
});

test('no family exceeds the existing reflection ceiling — this redistributes, it does not amplify', () => {
  const SOLID_ENV_INTENSITY_METAL = 2.8; // authoredMaterialProfiles.js
  for (const family of Object.values(MATERIAL_FAMILIES)) {
    if (!Number.isFinite(family.env)) continue;
    assert.ok(family.env <= SOLID_ENV_INTENSITY_METAL,
      `${family.id} raises the ceiling to ${family.env}`);
  }
  assert.ok(MATERIAL_FAMILIES.worn_tool_metal.env > MATERIAL_FAMILIES.painted_shell.env * 2,
    'tool edges must separate clearly from painted mass, or nothing was actually differentiated');
});

// ----------------------------------------------------------------------------- state / attention

test('emission is never invented for a surface the author left dark', () => {
  const trim = authoredMaterial('Material_Emissive_Cyan');
  trim.emissive.setHex(0x000000);
  trim.emissiveIntensity = 1;
  applyIndustrialMaterialFamilies(rootOf(trim), 'kestrel');
  assert.equal(trim.emissive.getHex(), 0x000000);
  assert.equal(trim.emissiveIntensity, 1, 'a dark surface must not be lit by the family pass');
});

test('emissive intensity moves but the authored hue never does', () => {
  const drive = authoredMaterial('Material_Emissive_DriveCore');
  drive.emissive.setHex(0xa6faff);
  drive.emissiveIntensity = 12;
  const trim = authoredMaterial('Material_Emissive_Orange');
  trim.emissive.setHex(0xff2e02);
  trim.emissiveIntensity = 8;
  // The rig's `Material_Cyan` emits warm red despite its name. That mislabel is the contrasting
  // enemy's identity and must survive the pass untouched.
  const rigWarm = authoredMaterial('Material_Cyan');
  rigWarm.emissive.setHex(0xff120a);
  rigWarm.emissiveIntensity = 2.1;

  applyIndustrialMaterialFamilies(rootOf(drive, trim), 'kestrel');
  applyIndustrialMaterialFamilies(rootOf(rigWarm), 'ashline_rig');

  assert.equal(drive.emissive.getHex(), 0xa6faff);
  assert.equal(trim.emissive.getHex(), 0xff2e02);
  assert.equal(rigWarm.emissive.getHex(), 0xff120a, 'the rig keeps its warm identity');
  assert.equal(drive.emissiveIntensity, MATERIAL_FAMILIES.state_emission_drive.emissiveIntensity);
  assert.equal(trim.emissiveIntensity, MATERIAL_FAMILIES.state_emission_trim.emissiveIntensity);
});

test('the three attention levels are ordered primary > state > atmosphere > secondary trim', () => {
  const { state_emission_drive: drive, state_emission_warm: warm } = MATERIAL_FAMILIES;
  const { state_emission_window: window, state_emission_trim: trim } = MATERIAL_FAMILIES;
  assert.ok(drive.emissiveIntensity > warm.emissiveIntensity);
  assert.ok(warm.emissiveIntensity > window.emissiveIntensity);
  assert.ok(window.emissiveIntensity > trim.emissiveIntensity,
    'always-on trim must sit below everything that reports a state');
});

// ------------------------------------------------------------------------------ idempotence

test('applying twice equals applying once', () => {
  const hull = authoredMaterial('Material_Hull');
  const drive = authoredMaterial('Material_Emissive_DriveCore', { emissive: 0x66ccff });
  drive.emissiveIntensity = 12;
  const root = rootOf(hull, drive);

  applyIndustrialMaterialFamilies(root, 'kestrel');
  const once = [snapshot(hull), snapshot(drive)];
  applyIndustrialMaterialFamilies(root, 'kestrel');
  applyIndustrialMaterialFamilies(root, 'kestrel');

  assert.deepEqual([snapshot(hull), snapshot(drive)], once,
    'the pass must derive from the authored snapshot, never compound on its own output');
});

test('the authored response can be restored exactly', () => {
  const hull = authoredMaterial('Material_Hull');
  const before = snapshot(hull);
  applyIndustrialMaterialFamilies(rootOf(hull), 'kestrel');
  assert.notDeepEqual(snapshot(hull), before);
  assert.equal(restoreAuthoredMaterialResponse(hull), true);
  assert.deepEqual(snapshot(hull), before);
});

// -------------------------------------------------------------------------------- key resolution

test('the asset key resolves from each admission route and from nothing else', () => {
  assert.equal(resolveIndustrialAssetKey({
    authoredParts: [
      { url: 'assets/ships/release/parts/engines/engine_ion_small.glb' },
      { url: 'assets/ships/release/parts/wholeships/kestrel.glb' },
    ],
  }), 'kestrel');
  assert.equal(resolveIndustrialAssetKey({
    authoredParts: [
      'assets/ships/release/parts/engines/engine_ion_small.glb',
      'assets/ships/release/parts/wholeships/kestrel.glb',
    ],
  }), 'kestrel', 'live ship swap payloads publish URLs, not record objects');
  assert.equal(resolveIndustrialAssetKey({
    authoredParts: [{ url: 'assets/ships/release/parts/wholeships/ashline_rig.glb' }],
  }), 'ashline_rig');
  assert.equal(resolveIndustrialAssetKey({
    userData: { authoredPayloadAssetId: 'pod_cargo_container' },
  }), 'pod_cargo_container');
  assert.equal(resolveIndustrialAssetKey({
    entity: { data: { archetypeGlb: 'place_station_trade_hub' } },
  }), 'place_station_trade_hub');
  assert.equal(resolveIndustrialAssetKey({ partId: 'place_works_refinery' }), 'place_works_refinery');

  // A near-miss must not resolve: the LOD siblings are separate records and the wasp is a
  // different ship entirely.
  assert.equal(resolveIndustrialAssetKey({
    authoredParts: [{ url: 'assets/ships/release/parts/wholeships/kestrel_lod1.glb' }],
  }), null);
  assert.equal(resolveIndustrialAssetKey({
    authoredParts: [{ url: 'assets/ships/release/parts/wholeships/wasp_production_v1.glb' }],
  }), null);
  assert.equal(resolveIndustrialAssetKey({}), null);
  assert.equal(resolveIndustrialAssetKey({ entity: { data: {} } }), null);
});

// ------------------------------------------------------------------------- works furnace heat

test('the furnace slit gains the ember colour its state driver has always needed', () => {
  // Ships with no emissiveFactor, so GLTFLoader leaves it black and `setFurnaceIntensity` — which
  // sets emissiveIntensity only — multiplies black by the machine state forever.
  const slit = new THREE.MeshStandardMaterial({
    name: 'Material_slit_LOD0', color: 0x080505, metalness: 0, roughness: 0.62,
  });
  assert.equal(slit.emissive.getHex(), 0x000000, 'precondition: the authored slit does not emit');

  assert.equal(applyWorksFurnaceHeat([slit]), 1);
  assert.equal(slit.emissive.getHex(), WORKS_FURNACE_HEAT.emberHex);
  assert.equal(slit.userData[INDUSTRIAL_MATERIAL_FAMILY_STAMP], WORKS_FURNACE_HEAT.familyId);

  // The existing driver's contract still reads: hot while running, near-dark when starved or
  // blocked. Law §5 is untouched — only the colour of the heat was missing.
  slit.emissiveIntensity = 1.25;
  const hot = slit.emissiveIntensity;
  slit.emissiveIntensity = 0.08;
  assert.ok(hot > slit.emissiveIntensity * 10,
    'a starved machine must still go dark relative to a running one');
});

test('applying furnace heat twice does not compound', () => {
  const slit = new THREE.MeshStandardMaterial({ name: 'Material_slit_LOD0' });
  applyWorksFurnaceHeat([slit]);
  const emberOnce = slit.emissive.getHex();
  assert.equal(applyWorksFurnaceHeat([slit]), 1);
  assert.equal(slit.emissive.getHex(), emberOnce);
});

test('restoring the furnace baseline restores its authored black emitter', () => {
  const slit = new THREE.MeshStandardMaterial({ name: 'Material_slit_LOD0', emissiveIntensity: 1 });
  applyWorksFurnaceHeat([slit]);
  assert.equal(restoreAuthoredMaterialResponse(slit), true);
  assert.equal(slit.emissive.getHex(), 0);
  assert.equal(slit.emissiveIntensity, 1);
  assert.equal(slit.userData.sfFurnaceEmberHex, undefined);
});

test('furnace heat tolerates an empty or malformed material list', () => {
  assert.equal(applyWorksFurnaceHeat([]), 0);
  assert.equal(applyWorksFurnaceHeat(null), 0);
  assert.equal(applyWorksFurnaceHeat([null, {}]), 0);
});

// -------------------------------------------------------------------------------- six-item cover

test('all five authored assets and the furnace are covered', () => {
  const expected = [
    'kestrel', 'ashline_rig', 'pod_cargo_container',
    'place_station_trade_hub', 'place_works_refinery',
  ];
  assert.deepEqual(Object.keys(INDUSTRIAL_ASSET_SURFACING).sort(), [...expected].sort());
  for (const key of expected) {
    assert.ok(INDUSTRIAL_ASSET_SURFACING[key].source.endsWith('.glb'),
      `${key} must record the exact release source it was inventoried from`);
  }
  // The Refinery body is deliberately empty: `worksPartLoader.js` keeps `LOD[01]_refinery`
  // materials as shared blueprint resources and its own header forbids mutating them. The machine's
  // contribution is the instance-owned furnace heat instead.
  assert.deepEqual(INDUSTRIAL_ASSET_SURFACING.place_works_refinery.byMaterialName, {});
  assert.ok(WORKS_FURNACE_HEAT.emberHex > 0);
});
