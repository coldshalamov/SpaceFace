import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { prepareRenderPackageBlueprint } from '../src/render/assetLoader.js';
import { applyAuthoredMaterialProfile } from '../src/render/authoredMaterialProfiles.js';
import { calibrateWaspTrimEmission } from '../src/render/waspTrimEmission.js';

const assetId = 'SF_WASP_PRODUCTION_V1';
const cyanName = 'Material_Emissive_Cyan';
async function decode(key, sourcePath = null) {
  await MeshoptDecoder.ready;
  const base = `assets/ships/release/render-packages/${key}/`;
  const bytes = await readFile(sourcePath || base + 'render.glb');
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + length));
  json.extensionsRequired = (json.extensionsRequired || []).filter(x => x !== 'KHR_texture_basisu');
  let chunk = Buffer.from(JSON.stringify(json));
  chunk = Buffer.concat([chunk, Buffer.alloc((4 - chunk.length % 4) % 4, 0x20)]);
  const header = Buffer.from(bytes.subarray(0, 20)); header.writeUInt32LE(chunk.length, 12);
  const modified = Buffer.concat([header, chunk, bytes.subarray(20 + length)]);
  modified.writeUInt32LE(modified.length, 8);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // Real package geometry/material decode; only GPU texture transcoding is stubbed.
  loader.register(parser => ({ name: 'test-placeholder-textures', loadTexture: index => {
    const texture = new THREE.Texture({ width: 1024, height: 1024 });
    parser.associations.set(texture, { textures: index });
    return Promise.resolve(texture);
  } }));
  const gltf = await loader.parseAsync(modified.buffer.slice(modified.byteOffset, modified.byteOffset + modified.byteLength), '');
  const entries = [];
  function append(source, parentIndex = -1) { const index = entries.length; entries.push({ source, parentIndex }); for (const c of source.children) append(c, index); }
  append(gltf.scene);
  return { gltf, plan: { entries }, metadata: JSON.parse(await readFile(base + 'render-package.json', 'utf8')) };
}
test('actual authored base Wasp source uses the same calibrated blueprint response', async () => {
  const sourceUrl = 'assets/ships/parts/wholeships/wasp_production_v1.glb';
  const { gltf } = await decode('wasp', sourceUrl);
  const pilot = { assetId: 'sf.render.wasp', runtimeAssetId: assetId, sourceUrl, slot: 'hull' };
  // No runtime table: exercises compileBlueprint, also used by development source loads.
  const prepared = prepareRenderPackageBlueprint(pilot, gltf, {});
  const cyan = prepared.primitives.find(p => (p.material.userData.spacefaceAuthoredMaterialName || p.material.name) === cyanName)?.material;
  assert.ok(cyan);
  assert.equal(cyan.userData.spacefaceAuthoredEmissiveIntensity, .75);
  assert.ok(Math.abs(cyan.emissiveIntensity - 1.65) < 1e-9);
  assert.deepEqual(cyan.emissive.toArray(), [.11443537473678589, .8069522380828857, 1]);
  prepareRenderPackageBlueprint(pilot, gltf, {});
  assert.ok(Math.abs(cyan.emissiveIntensity - 1.65) < 1e-9);
});
for (const [lod, key] of ['wasp', 'wasp-production-v1-lod1', 'wasp-production-v1-lod2'].entries()) {
  test(`real packaged LOD${lod} admission quarters only cyan and survives reprofiling`, async () => {
    const { gltf, plan, metadata } = await decode(key);
    const originals = new Map();
    gltf.scene.traverse(o => { if (o.material) originals.set(o.material, { clone: o.material.clone(), geometry: o.geometry }); });
    const pilot = { assetId: metadata.assetId, runtimeAssetId: assetId, sourceUrl: `assets/ships/release/parts/wholeships/wasp_production_v1${lod ? '_lod' + lod : ''}.glb`, slot: 'hull' };
    const prepared = prepareRenderPackageBlueprint(pilot, gltf, metadata, { plan });
    const materials = new Set(prepared.primitives.map(p => p.material));
    let cyan;
    for (const material of materials) {
      const name = material.userData.spacefaceAuthoredMaterialName || material.name;
      const original = originals.get(material)?.clone;
      if (!original) continue; // Canopy construction intentionally replaces its material.
      applyAuthoredMaterialProfile(original, material.userData.spacefaceMaterialRole, { assetId, slot: 'hull', bounds: metadata.runtime.bounds, allowTextures: true });
      if (name === cyanName) {
        cyan = material;
        assert.ok(Math.abs(material.emissiveIntensity - original.emissiveIntensity * .25) < 1e-9);
        assert.deepEqual(material.emissive.toArray(), original.emissive.toArray());
        assert.equal(material.userData.spacefaceAuthoredEmissiveIntensity, .75);

        const hook = material.onBeforeCompile;
        assert.equal(calibrateWaspTrimEmission(material, assetId), false);
        assert.equal(material.onBeforeCompile, hook);
      } else {
        assert.equal(material.emissiveIntensity, original.emissiveIntensity, name);
        assert.deepEqual(material.emissive.toArray(), original.emissive.toArray(), name);
      }
    }
    assert.ok(cyan);
    const intensity = cyan.emissiveIntensity;
    applyAuthoredMaterialProfile(cyan, 'signal', { assetId, slot: 'hull' });
    assert.equal(calibrateWaspTrimEmission(cyan, assetId), false);
    assert.equal(cyan.emissiveIntensity, intensity);
    const twice = prepareRenderPackageBlueprint(pilot, gltf, metadata, { plan });
    assert.ok(twice.primitives.some(p => p.material === cyan));
    assert.equal(cyan.emissiveIntensity, intensity);
  });
}
function fixture() {
  const m = new THREE.MeshStandardMaterial(); m.name = cyanName;
  m.emissive.setRGB(.11443537473678589, .8069522380828857, 1); m.emissiveIntensity = 6.6;
  m.userData = { forgeShip: 'wasp', forgeFinish: 'glow_cyan', spacefaceAuthoredEmissiveIntensity: 3 };
  return m;
}
test('variant identities, other materials, changed color and future native quarter exports are excluded', () => {
  for (const mutate of [m => m.name = 'Material_Thruster', m => m.userData.forgeShip = 'wasp_free_militia', m => m.emissive.r = .2,
    m => m.userData.spacefaceAuthoredEmissiveIntensity = 1, m => m.userData.spacefaceAuthoredEmissiveIntensity = .75]) {
    const m = fixture(); mutate(m); assert.equal(calibrateWaspTrimEmission(m, assetId), false); assert.equal(m.emissiveIntensity, 6.6);
  }
  const m = fixture(); assert.equal(calibrateWaspTrimEmission(m, 'SF_WASP_FREE_MILITIA'), false); assert.equal(m.emissiveIntensity, 6.6);
});

test('calibration preserves an installed shader hook and program key', () => {
  const m = fixture(), hook = () => {}, key = () => 'existing-material-program';
  m.onBeforeCompile = hook; m.customProgramCacheKey = key;
  assert.equal(calibrateWaspTrimEmission(m, assetId), true);
  assert.equal(m.onBeforeCompile, hook); assert.equal(m.customProgramCacheKey, key);
  assert.equal(m.emissiveIntensity, 1.65);
});

