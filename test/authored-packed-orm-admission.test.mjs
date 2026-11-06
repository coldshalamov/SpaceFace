import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'meshoptimizer';
import { prepareRenderPackageBlueprint, deriveAuthoredRuntimeTable } from '../src/render/assetLoader.js';
import { cloneMaterialPreservingShaderHooks } from '../src/render/materialClone.js';
import { canonicalizeInstalledSurfaceProgramKey, canonicalizeObjectSurfaceProgramKeys, installIllustratedSurface } from '../src/render/illustratedSurface.js';
import { lineHardwarePart } from '../src/render/lineHardware.js';
import { createKilnbackVisualDriver, KILNBACK_ASSET_ID, KILNBACK_MOTION_NODES } from '../src/render/kilnbackVisuals.js';
import { KILNBACK } from '../src/data/kilnback.js';
import { installAuthoredPackedOrmOnPrimitives } from '../src/render/packedOrmShader.js';

const sourceUrl = 'assets/ships/release/parts/wholeships/ashline_rig_corsair_blade.glb';
const pilot = { assetId: 'sf.render.ashline-rig-corsair-blade', runtimeAssetId: 'SF_WHOLESHIP_ASHLINE_RIG_CORSAIR_BLADE', sourceUrl, slot: 'hull' };

// Decode the real shipped geometry and material references with GLTFLoader. Replace the KTX2
// payload decoder only: a placeholder Texture per GLTF texture index still exercises the loader's
// real texture caching and material assignment, without a browser, GPU or transcoder.
async function decode() {
  await MeshoptDecoder.ready;
  const bytes = await readFile(sourceUrl);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  json.extensionsRequired = json.extensionsRequired.filter((x) => x !== 'KHR_texture_basisu');
  let chunk = Buffer.from(JSON.stringify(json));
  chunk = Buffer.concat([chunk, Buffer.alloc((4 - chunk.length % 4) % 4, 0x20)]);
  const header = Buffer.from(bytes.subarray(0, 20));
  header.writeUInt32LE(chunk.length, 12);
  const modified = Buffer.concat([header, chunk, bytes.subarray(20 + jsonLength)]);
  modified.writeUInt32LE(modified.length, 8);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.register(() => ({ name: 'test-placeholder-textures', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
  return loader.parseAsync(modified.buffer.slice(modified.byteOffset, modified.byteOffset + modified.byteLength), '');
}
function planFor(scene) {
  const entries = [];
  const append = (source, parentIndex = -1) => {
    const index = entries.length;
    entries.push({ source, parentIndex });
    for (const child of source.children) append(child, index);
  };
  append(scene);
  return { entries };
}
function shaderFor(material) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  return shader;
}

test('actual Corsair GLTFLoader assigns one texture object to the packed ORM slots', async () => {
  const decoded = await decode();
  const eligible = new Set();
  decoded.scene.traverse((object) => {
    const m = object.material;
    if (m?.aoMap && m.aoMap === m.roughnessMap && m.aoMap === m.metalnessMap) eligible.add(m.name);
  });
  assert.deepEqual([...eligible].sort(), ['Material_Accent', 'Material_Armor', 'Material_BrushedMetal',
    'Material_Hull', 'Material_Mechanical', 'Material_MechanicalDark', 'Material_Warning']);
  const table = deriveAuthoredRuntimeTable(decoded.scene, { url: sourceUrl, slot: 'hull', assetId: pilot.runtimeAssetId });
  const prepared = prepareRenderPackageBlueprint(pilot, decoded, { runtime: table }, { plan: planFor(decoded.scene) });
  const installed = new Set(prepared.primitives.filter((p) => p.material.userData.spacefacePackedOrmSingleSample).map((p) => p.material.userData.spacefaceAuthoredMaterialName || p.material.name));
  assert.ok(installed.has('Material_Hull'));
  assert.ok(installed.has('Material_Armor'));
  assert.ok(installed.size >= 7, `post-profile eligible names: ${[...installed]}`);
});

function fixture() {
  const scene = new THREE.Group();
  scene.userData.spacefaceAsset = { contractVersion: 2, assetId: 'fixture_packed_orm', slot: 'place',
    forward: '+X', up: '+Y', starboard: '+Z', unit: 'metre', normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic', textureCompression: 'PNG-source', legacyPart: true };
  const orm = new THREE.Texture({ width: 4, height: 4 });
  const material = new THREE.MeshStandardMaterial({ roughnessMap: orm, metalnessMap: orm, aoMap: orm });
  material.name = 'Material_Hull';
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  mesh.name = 'LOD0_Hull';
  scene.add(mesh);
  return { scene };
}
for (const mode of ['blueprint', 'package']) test(`authored ${mode} retains packed ORM through material admission`, () => {
  const decoded = fixture();
  const fixturePilot = { assetId: 'sf.render.fixture-packed', runtimeAssetId: 'fixture_packed_orm',
    sourceUrl: 'fixture_packed.glb', slot: 'place' };
  const table = mode === 'package' ? deriveAuthoredRuntimeTable(decoded.scene,
    { url: fixturePilot.sourceUrl, slot: 'place', legacyPart: true, assetId: fixturePilot.runtimeAssetId }) : null;
  const metadata = table ? { runtime: table } : {};
  const options = table ? { plan: planFor(decoded.scene) } : {};
  const prepared = prepareRenderPackageBlueprint(fixturePilot, decoded, metadata, options);
  const hull = prepared.primitives[0].material;
  assert.equal(hull.roughnessMap, hull.metalnessMap);
  assert.equal(hull.roughnessMap, hull.aoMap);
  assert.equal(hull.userData.spacefacePackedOrmSingleSample, true);
  assert.equal(hull.userData.spacefaceIllustratedSurface != null, true);
  assert.match(hull.customProgramCacheKey(), /spaceface-packed-orm-single-sample-v1/);
  const shader = shaderFor(hull);
  assert.equal((shader.fragmentShader.match(/texture2D\( roughnessMap, vRoughnessMapUv \)/g) || []).length, 1);
  assert.match(shader.fragmentShader, /sfPackedOrmTexel\.r/);
  assert.match(shader.fragmentShader, /sfPackedOrmTexel\.g/);
  assert.match(shader.fragmentShader, /sfPackedOrmTexel\.b/);
  assert.match(shader.fragmentShader, /sfPaintLuma/);
  const copy = cloneMaterialPreservingShaderHooks(hull);
  canonicalizeInstalledSurfaceProgramKey(copy);
  assert.match(copy.customProgramCacheKey(), /spaceface-packed-orm-single-sample-v1/);
  assert.match(shaderFor(copy).fragmentShader, /sfPackedOrmTexel\.r/);
});

test('incompatible, transmissive and transparent materials do not acquire the optimization', () => {
  const tex = new THREE.Texture();
  const differentTexture = tex.clone();
  differentTexture.offset.x = 0.2;
  const incompatible = new THREE.MeshStandardMaterial({ roughnessMap: tex, metalnessMap: tex, aoMap: differentTexture });
  const transparent = new THREE.MeshStandardMaterial({ roughnessMap: tex, metalnessMap: tex, aoMap: tex, transparent: true });
  const glass = new THREE.MeshPhysicalMaterial({ roughnessMap: tex, metalnessMap: tex, aoMap: tex, transmission: 0.4 });
  installAuthoredPackedOrmOnPrimitives([incompatible, transparent, glass].map((material) => ({ material })));
  for (const material of [incompatible, transparent, glass]) assert.notEqual(material.userData.spacefacePackedOrmSingleSample, true);
});

function packedIllustratedMaterial(name) {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ roughnessMap: texture, metalnessMap: texture, aoMap: texture });
  material.name = name;
  installIllustratedSurface(material);
  installAuthoredPackedOrmOnPrimitives([{ material }]);
  return material;
}

test('line hardware keeps both shader hooks and its private mutable material', () => {
  const source = packedIllustratedMaterial('Material_Hull');
  const owned = [];
  const root = lineHardwarePart({ primitives: [{ name: 'LOD0_Hull', geometry: new THREE.BoxGeometry(), material: source, matrix: new THREE.Matrix4() }] }, 'head', owned);
  const material = root.children[0].material;
  assert.notEqual(material, source);
  assert.equal(owned[0], material);
  assert.equal(material.onBeforeCompile, source.onBeforeCompile);
  assert.equal(material.customProgramCacheKey, source.customProgramCacheKey);
  canonicalizeObjectSurfaceProgramKeys(root);
  const shader = shaderFor(material);
  assert.equal((shader.fragmentShader.match(/texture2D\( roughnessMap, vRoughnessMapUv \)/g) || []).length, 1);
  assert.match(shader.fragmentShader, /sfPackedOrmTexel\.r/);
  assert.match(shader.fragmentShader, /sfPaintLuma/);
});

test('Kilnback cask ceramic owns a hook-preserving clone and restores its source', () => {
  const source = packedIllustratedMaterial('Material_Ceramic');
  const root = new THREE.Group();
  root.userData.kilnbackAuthoredSource = { assetId: KILNBACK_ASSET_ID, file: 'wholeships/kilnback.glb' };
  const nodes = new Map();
  for (const name of KILNBACK_MOTION_NODES) { const node = new THREE.Group(); node.name = name; root.add(node); nodes.set(name, node); }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source);
  nodes.get('MOTION_KILNBACK_CASK_PORT').add(mesh);
  const entity = { id: 1, occupantGeneration: 1, data: { persistenceOwner: KILNBACK.persistenceOwner, kilnbackKey: 'fixture', lootTableId: KILNBACK.enemyId } };
  const driver = createKilnbackVisualDriver(root, entity);
  assert.ok(driver);
  assert.notEqual(mesh.material, source);
  assert.equal(mesh.material.onBeforeCompile, source.onBeforeCompile);
  assert.equal(mesh.material.customProgramCacheKey, source.customProgramCacheKey);
  canonicalizeObjectSurfaceProgramKeys(root);
  const shader = shaderFor(mesh.material);
  assert.match(shader.fragmentShader, /sfPackedOrmTexel\.r/);
  assert.match(shader.fragmentShader, /sfPaintLuma/);
  driver.dispose();
  assert.equal(mesh.material, source);
});
