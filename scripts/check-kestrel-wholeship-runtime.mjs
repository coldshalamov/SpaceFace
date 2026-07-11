#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(ROOT, 'assets/ships/parts/wholeships/kestrel.glb');
const RELEASE = resolve(ROOT, 'assets/ships/release/parts/wholeships/kestrel.glb');
const REQUIRED_SOCKETS = [
  'SOCKET_Weapon_Front',
  'SOCKET_Mining_Front',
  'SOCKET_Engine_Main',
  'SOCKET_Trail_Main',
  'SOCKET_Utility_Dorsal',
  'SOCKET_Cargo_Ventral',
  'SOCKET_Camera_Focus',
  'SOCKET_RCS_Port',
  'SOCKET_RCS_Starboard',
].sort();
const SOCKET_CONTRACT = Object.freeze({
  SOCKET_Weapon_Front: { position: [12.62, 1.43, 0], forward: [1, 0, 0] },
  SOCKET_Mining_Front: { position: [12.26, -1.08, 0], forward: [1, 0, 0] },
  SOCKET_Engine_Main: { position: [-13.85, 0, 0], forward: [-1, 0, 0] },
  SOCKET_Trail_Main: { position: [-14.05, 0, 0], forward: [-1, 0, 0] },
  SOCKET_Utility_Dorsal: { position: [-1.45, 1.95, 3.8], forward: [0, 1, 0] },
  SOCKET_Cargo_Ventral: { position: [-0.8, -2.1, 0], forward: [0, -1, 0] },
  SOCKET_Camera_Focus: { position: [0, 0.35, 0], forward: [1, 0, 0] },
  SOCKET_RCS_Port: { position: [1.6, 0.45, -6.6], forward: [0, 0, -1] },
  SOCKET_RCS_Starboard: { position: [1.6, 0.45, 6.6], forward: [0, 0, 1] },
});
const LOD_BUDGETS = Object.freeze({
  lod0: [16_000, 22_000],
  lod1: [5_500, 10_000],
  lod2: [1_200, 4_500],
});

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

assert.ok(existsSync(SOURCE), 'production Kestrel source GLB must exist');
const source = await inspect(SOURCE);
assert.deepEqual(source.sockets, REQUIRED_SOCKETS, 'Kestrel must expose the nine stable bare socket names');
assert.deepEqual(source.suffixedSockets, [], 'socket names must not contain Blender collision suffixes');
for (const [name, expected] of Object.entries(SOCKET_CONTRACT)) {
  const actual = source.socketContracts[name];
  assert.ok(actual, `${name} metadata must be present`);
  assertVectorNear(actual.position, expected.position, `${name} position`);
  assertVectorNear(actual.forward, expected.forward, `${name} forward`);
}
assert.deepEqual(source.plumeNodes, [], 'runtime VFX owns the drive plume; the GLB must not embed one');
assert.ok(source.totalTriangles <= 32_000, `stored LOD triangles must be <=32k, got ${source.totalTriangles}`);
assert.ok(source.materials.length >= 4 && source.materials.length <= 8,
  `Kestrel should use 4-8 consolidated semantic materials, got ${source.materials.join(', ')}`);
for (const token of ['hull', 'mechanical', 'cyan', 'warm']) {
  assert.ok(source.materials.some((name) => name.toLowerCase().includes(token)),
    `Kestrel materials must preserve the ${token} semantic role`);
}
for (const [lod, [min, max]] of Object.entries(LOD_BUDGETS)) {
  const triangles = source.lodTriangles[lod] || 0;
  assert.ok(triangles >= min && triangles <= max,
    `${lod} must remain in its structural budget ${min}-${max}; got ${triangles}`);
  assert.ok((source.lodPrimitives[lod] || 0) <= 20,
    `${lod} must stay at or below 20 live primitives/draws; got ${source.lodPrimitives[lod] || 0}`);
}
assert.ok(source.lod0HullTriangles >= 800,
  `LOD0 must contain a substantive hull body, got ${source.lod0HullTriangles} hull triangles`);
assert.equal(source.primitiveCount, source.uvPrimitiveCount, 'every primitive must carry TEXCOORD_0');
assert.equal(source.primitiveCount, source.normalPrimitiveCount, 'every primitive must carry NORMAL');
assert.equal(source.primitiveCount, source.tangentPrimitiveCount, 'every primitive must carry real exported TANGENT data');
assert.ok(source.rootAsset && source.rootAsset.assetId === 'SF_WHOLESHIP_KESTREL',
  'GLB asset metadata must identify the production Kestrel whole ship');

assert.ok(existsSync(RELEASE), 'release Kestrel GLB must exist');
const release = await inspect(RELEASE);
assert.deepEqual(release.sockets, source.sockets, 'release must preserve the complete source socket set');
assert.deepEqual(release.socketContracts, source.socketContracts,
  'release compression must preserve every socket position and forward axis exactly');
const releaseBytes = readFileSync(RELEASE);
const releaseJson = readGlbJson(releaseBytes);
assert.ok((releaseJson.extensionsUsed || []).includes('EXT_meshopt_compression'),
  'release Kestrel geometry must use Meshopt compression');
const releaseImages = releaseJson.images || [];
if (releaseImages.length) {
  assert.ok((releaseJson.extensionsUsed || []).includes('KHR_texture_basisu'),
    'release Kestrel textures must use KTX2/BasisU');
  assert.ok(releaseImages.every((image) => image.mimeType === 'image/ktx2'),
    'every embedded release Kestrel image must be KTX2');
}

const partsLibrary = readFileSync(resolve(ROOT, 'src/render/partsLibrary.js'), 'utf8');
const assetLoader = readFileSync(resolve(ROOT, 'src/render/assetLoader.js'), 'utf8');
assert.match(partsLibrary, /'ship_kestrel'\s*:\s*'wholeships\/kestrel\.glb'/,
  'default starter ship must map to the production whole-ship GLB');
assert.match(partsLibrary, /'wholeships\/kestrel\.glb'/,
  'the Kestrel GLB must be declared in the live hull slot');
assert.match(partsLibrary, /wholeShip\s*\?\s*false\s*:/,
  'a validated whole ship must disable the readability safety shell');
assert.match(partsLibrary, /authored\.wholeShip\s*===\s*true/,
  'the production whole ship must replace, not retain, the code-native fallback');
assert.doesNotMatch(assetLoader, /fetch\(url,\s*\{\s*cache:\s*['"]force-cache['"]\s*\}\)/,
  'whole-ship validation must not pin stale GLBs on Electron\'s stable save origin');
assert.match(assetLoader, /fetch\(url,\s*\{\s*cache:\s*['"]no-cache['"]\s*\}\)/,
  'whole-ship validation must revalidate the current on-disk release GLB');

console.log('Kestrel production whole-ship runtime contract: PASS');
console.log(JSON.stringify({
  source: {
    triangles: source.totalTriangles,
    lodTriangles: source.lodTriangles,
    lodPrimitives: source.lodPrimitives,
    materials: source.materials,
    sockets: source.sockets.length,
  },
  release: {
    bytes: releaseBytes.byteLength,
    meshopt: true,
    ktx2Images: releaseImages.length,
  },
}, null, 2));

async function inspect(path) {
  const document = await io.read(path);
  const gltfRoot = document.getRoot();
  const nodes = gltfRoot.listNodes();
  const materials = gltfRoot.listMaterials().map((material) => material.getName()).sort();
  const sockets = nodes.map((node) => node.getName()).filter((name) => name.startsWith('SOCKET_')).sort();
  const suffixedSockets = sockets.filter((name) => /\.\d{3}$/.test(name));
  const plumeNodes = nodes.map((node) => node.getName()).filter((name) => /plume/i.test(name));
  const lodTriangles = { lod0: 0, lod1: 0, lod2: 0 };
  const lodPrimitives = { lod0: 0, lod1: 0, lod2: 0 };
  let lod0HullTriangles = 0;
  let primitiveCount = 0;
  let uvPrimitiveCount = 0;
  let normalPrimitiveCount = 0;
  let tangentPrimitiveCount = 0;

  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const lod = /^LOD([012])_/i.exec(node.getName());
    const bucket = lod ? `lod${lod[1]}` : null;
    for (const primitive of mesh.listPrimitives()) {
      const triangles = primitiveTriangles(primitive);
      primitiveCount++;
      if (primitive.getAttribute('TEXCOORD_0')) uvPrimitiveCount++;
      if (primitive.getAttribute('NORMAL')) normalPrimitiveCount++;
      if (primitive.getAttribute('TANGENT')) tangentPrimitiveCount++;
      if (bucket) {
        lodTriangles[bucket] += triangles;
        lodPrimitives[bucket]++;
      }
      if (bucket === 'lod0' && /hull/i.test(node.getName())) lod0HullTriangles += triangles;
    }
  }
  return {
    totalTriangles: Object.values(lodTriangles).reduce((sum, value) => sum + value, 0),
    lodTriangles,
    lodPrimitives,
    lod0HullTriangles,
    primitiveCount,
    uvPrimitiveCount,
    normalPrimitiveCount,
    tangentPrimitiveCount,
    materials,
    sockets,
    socketContracts: Object.fromEntries(nodes
      .filter((node) => node.getName().startsWith('SOCKET_'))
      .map((node) => [node.getName(), {
        position: node.getTranslation(),
        forward: node.getExtras()?.spaceface?.forward,
      }])),
    suffixedSockets,
    plumeNodes,
    rootAsset: gltfRoot.getAsset().extras?.spacefaceAsset || gltfRoot.getAsset().spacefaceAsset || null,
  };
}

function assertVectorNear(actual, expected, label, epsilon = 1e-3) {
  assert.ok(Array.isArray(actual) && actual.length === expected.length, `${label} must have ${expected.length} axes`);
  for (let i = 0; i < expected.length; i++) {
    assert.ok(Number.isFinite(actual[i]) && Math.abs(actual[i] - expected[i]) <= epsilon,
      `${label}[${i}] expected ${expected[i]}, got ${actual[i]}`);
  }
}

function primitiveTriangles(primitive) {
  const count = primitive.getIndices()?.getCount() || primitive.getAttribute('POSITION')?.getCount() || 0;
  return primitive.getMode() === 4 ? Math.floor(count / 3) : 0;
}

function readGlbJson(buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'release asset must be a binary glTF');
  assert.equal(buffer.readUInt32LE(12 + 4), 0x4e4f534a, 'first GLB chunk must be JSON');
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/g, '').trim());
}
