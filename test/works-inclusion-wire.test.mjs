// PQ-131.10 — authored inclusion kit: selected source/release/package binding, variant
// extraction with the baked board seat, and the renderer's per-commodity variant contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  INCLUSION_KIT_VARIANT_IDS,
  WORKS_PARTS,
  createWorksPartLoader,
  extractWorksInclusionKit,
  inclusionKitFamilyFor,
} from '../src/ui/asteroid/worksPartLoader.js';
import { ORE_KIT_VARIANTS } from '../src/ui/asteroid/asteroidRenderer3d.js';
import { renderPackagePilotForAssetId } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_PATH = 'assets/ships/parts/works/place_works_inclusion_kit.glb';
const RELEASE_PATH = 'assets/ships/release/parts/works/place_works_inclusion_kit.glb';
const PACKAGE_PATH = 'assets/ships/release/render-packages/works-inclusion-kit/render-package.json';

function pathOf(relative) { return resolve(ROOT, relative); }
function bytes(relative) { return readFileSync(pathOf(relative)); }
function json(relative) { return JSON.parse(readFileSync(pathOf(relative), 'utf8')); }
function sha256(payload) { return createHash('sha256').update(payload).digest('hex'); }
function glbJson(relative) {
  const payload = bytes(relative);
  assert.equal(payload.toString('ascii', 0, 4), 'glTF', `${relative} must be a GLB`);
  const jsonLength = payload.readUInt32LE(12);
  return JSON.parse(payload.subarray(20, 20 + jsonLength).toString('utf-8').replace(/\s+$/u, ''));
}

function makeKitBlueprint({ dropVariant = null, splitMaterial = false } = {}) {
  const atlas = new THREE.DataTexture(new Uint8Array([90, 80, 66, 255]), 1, 1);
  atlas.needsUpdate = true;
  const materialA = new THREE.MeshStandardMaterial({ color: 0xffffff, map: atlas });
  const materialB = new THREE.MeshStandardMaterial({ color: 0x888888, map: atlas });
  const primitives = [];
  for (const id of INCLUSION_KIT_VARIANT_IDS) {
    if (dropVariant === id) continue;
    for (const [prefix, tag] of [['LOD0_', 'lod0'], ['LOD1_', 'lod1']]) {
      // A source-space marker vertex one unit up +Y proves the board seat bakes into the clone.
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([
        -0.5, 0, -0.25, 0.5, 0, -0.25, 0.5, 1, -0.25, -0.5, 0, 0.25, 0.5, 0, 0.25,
      ], 3));
      primitives.push({
        name: `${prefix}${id}`,
        geometry,
        material: splitMaterial && id === INCLUSION_KIT_VARIANT_IDS[0] ? materialB : materialA,
        matrix: new THREE.Matrix4().makeTranslation(2.2, 0, 0),
        tags: { lod: tag },
      });
    }
  }
  return { assetId: 'place_works_inclusion_kit', primitives, markers: [] };
}

function loaderFor(blueprint) {
  const lease = {
    isActive: () => true,
    load: async () => blueprint,
    release: () => 0,
  };
  return createWorksPartLoader({
    renderer: {},
    lease,
    registry: { place_works_inclusion_kit: WORKS_PARTS.place_works_inclusion_kit },
  });
}

test('Inclusion kit selected runtime carries 18 variants in both live registers and no LOD2', () => {
  const gltf = glbJson(SOURCE_PATH);
  const names = new Set((gltf.nodes || []).map((n) => n.name || ''));
  for (const id of INCLUSION_KIT_VARIANT_IDS) {
    assert.ok(names.has(`LOD0_${id}`), `missing LOD0_${id}`);
    assert.ok(names.has(`LOD1_${id}`), `missing LOD1_${id}`);
  }
  assert.equal([...names].some((name) => /^LOD2(?:_|$)/u.test(name)), false, 'LOD2 must not ship');
  assert.equal(gltf.asset.extras.spacefaceAsset.exportedLods.join(','), 'lod0,lod1');
  const sceneAsset = gltf.scenes[0].extras.spacefaceAsset;
  assert.equal(sceneAsset.wiringStatus, 'selected_runtime_lod2_stripped');
  assert.equal(sceneAsset.masterRoot, 'SF_WORKS_INCLUSION_KIT_V1');
  assert.equal(sceneAsset.variants.length, 18);
  // One shared atlas material across every variant (the family colors live in the atlas).
  assert.equal(gltf.materials.length, 1);
  assert.equal(gltf.materials[0].name, 'Material_InclusionAtlas');
  // Variant LOD meshes are pivot-centered instancing units: no local transforms on LOD nodes.
  const transformed = gltf.nodes.filter((n) => /^LOD/.test(n.name || '')
    && (n.translation || n.rotation || n.scale || n.matrix));
  assert.equal(transformed.length, 0, 'LOD nodes must be pivot-centered');
});

test('Inclusion kit release, manifests, package, and pilot bind to the selected runtime', () => {
  const source = bytes(SOURCE_PATH);
  const release = bytes(RELEASE_PATH);
  assert.notDeepEqual(release, source);
  const releaseManifest = json('assets/ships/release/release_manifest.json');
  const row = releaseManifest.assets.find((asset) => asset.id === 'place_works_inclusion_kit');
  assert.ok(row, 'release manifest row missing');
  assert.equal(row.sourceSha256, sha256(source));
  assert.equal(row.releaseSha256, sha256(release));
  assert.equal(row.releaseBytes, release.length);
  const manifest = json('assets/ships/parts/parts_manifest.json');
  const part = manifest.parts.find((entry) => entry.id === 'place_works_inclusion_kit');
  assert.ok(part, 'parts manifest row missing');
  assert.equal(part.tris, 24028);
  const metadata = json(PACKAGE_PATH);
  assert.equal(metadata.assetId, 'sf.render.works-inclusion-kit');
  assert.ok(metadata.runtime.primitives.every((entry) => !/^LOD2/u.test(entry.name)));
  const pilot = renderPackagePilotForAssetId('sf.render.works-inclusion-kit');
  assert.equal(pilot.key, 'works-inclusion-kit');
  assert.equal(pilot.runtimeAssetId, 'place_works_inclusion_kit');
  assert.equal(pilot.sourceUrl, 'assets/ships/release/parts/works/place_works_inclusion_kit.glb');
  assert.equal(pilot.sourceSha256, sha256(release));
  // The parts table entry routes at the release URL with no hooks (instancing units, not machines).
  assert.equal(WORKS_PARTS.place_works_inclusion_kit.lod0, pilot.sourceUrl);
  assert.equal(WORKS_PARTS.place_works_inclusion_kit.hooks.length, 0);
});

test('Kit extraction bakes the board seat, measures footprints, and fails closed', () => {
  const kit = extractWorksInclusionKit(makeKitBlueprint());
  assert.equal(kit.variantIds.length, 18);
  assert.equal(kit.variants.size, 18);
  // One unit-up source vertex proves the Y-up -> board +Z seat is baked into the clone, and that
  // the blueprint geometry itself was never mutated.
  const variant = kit.variants.get('SF_INCL_SILVER_WIRE_V1');
  assert.ok(variant.lod0 !== undefined);
  const baked = variant.lod0.getAttribute('position');
  // Source (0.5, 1, -0.25) seated about X(+90deg) lands at board (0.5, 0.25, 1).
  assert.deepEqual(
    [baked.getX(2), baked.getY(2), baked.getZ(2)].map((v) => +v.toFixed(5)),
    [0.5, 0.25, 1],
  );
  // Footprint is measured in board XY after the seat (1.0 x 0.5 -> 1.0 wu).
  assert.ok(Math.abs(variant.footprintWu - 1.0) < 1e-5, `footprint ${variant.footprintWu}`);
  assert.equal(variant.family, 'silver');
  assert.equal(inclusionKitFamilyFor('SF_INCL_GAS_FISSURE_RADIAL_V1'), 'gas');
  assert.equal(inclusionKitFamilyFor('SF_INCL_VENTED_SCAR_V1'), 'scar');
  assert.equal(inclusionKitFamilyFor('SF_INCL_MK_LOCK_PLATE_V1'), 'lock');
  assert.equal(inclusionKitFamilyFor('SF_INCL_NOT_REAL_V1'), null);
  // The extraction must not touch the shared blueprint geometry.
  const source = makeKitBlueprint().primitives[0].geometry.getAttribute('position');
  assert.deepEqual([source.getX(2), source.getY(2), source.getZ(2)], [0.5, 1, -0.25]);
  // Fail closed: a missing register or a second atlas material is a build error, not a fallback.
  assert.throws(() => extractWorksInclusionKit(makeKitBlueprint({ dropVariant: 'SF_INCL_GOLD_LEAF_V1' })));
  assert.throws(() => extractWorksInclusionKit(makeKitBlueprint({ splitMaterial: true })));
});

test('Loader acquire exposes the resident kit; release is refcounted and fail-closed', async () => {
  const loader = loaderFor(makeKitBlueprint());
  const handle = await loader.acquireWorksInclusionKit();
  assert.ok(handle, 'kit handle missing');
  assert.equal(handle.kit.variants.size, 18);
  assert.ok(handle.kit.material, 'kit must expose the shared atlas material');
  assert.ok(handle.release(), 'first release succeeds');
  assert.equal(handle.release(), false, 'second release is a no-op');
  // A blueprint without primitives resolves to null (honest absence), never a crash.
  const empty = await loaderFor({ assetId: 'place_works_inclusion_kit', primitives: [] }).acquireWorksInclusionKit();
  assert.equal(empty, null);
});

test('Every board commodity outside the kit contract is named, and kit ores map to real variants', () => {
  // The kit contract covers these nine board ores; variant ids must exist in the kit.
  const known = new Set(INCLUSION_KIT_VARIANT_IDS);
  for (const [oreId, ids] of Object.entries(ORE_KIT_VARIANTS)) {
    assert.ok(ids.length >= 2, `${oreId} needs a variant choice`);
    for (const id of ids) assert.ok(known.has(id), `${oreId} maps to unknown variant ${id}`);
  }
  // Copper, platinium and silicate deliberately stay procedural until their own authoring cycle;
  // this pins that decision so an accidental mapping cannot quietly claim authored coverage.
  assert.equal(ORE_KIT_VARIANTS.cmdty_ore_copper, undefined);
  assert.equal(ORE_KIT_VARIANTS.cmdty_ore_platinium, undefined);
  assert.equal(ORE_KIT_VARIANTS.cmdty_silicate, undefined);
});
