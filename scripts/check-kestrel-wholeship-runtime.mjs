#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Matrix4, Vector3 } from 'three';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_ASSET_ID = 'SF_K0_KESTREL_BORROWED_TIME_V4';
const MAX_GITHUB_BYTES = 100 * 1024 * 1024;
const FAMILY = Object.freeze([
  Object.freeze({
    lod: 'lod0', file: 'kestrel.glb', triangles: [36_000, 38_000], maxDraws: 24,
    acceptedCandidateSha256: '73A53A89A222FA7B2AF31436749CE81FE114BA0C5E0A227F2C15DFEC0E778150',
  }),
  Object.freeze({
    lod: 'lod1', file: 'kestrel_lod1.glb', triangles: [15_000, 16_500], maxDraws: 14,
    acceptedCandidateSha256: '6961187E55C62AC0A08D86B1E709B212B0D8A9E2956F84018B59AE2B35E694DC',
  }),
  Object.freeze({
    lod: 'lod2', file: 'kestrel_lod2.glb', triangles: [9_400, 10_400], maxDraws: 10,
    acceptedCandidateSha256: '43240099CD422D43DE4437DE86C4281C7C5C4C8A09CDEED7341BA24E43576568',
  }),
]);
const REQUIRED_SOCKETS = Object.freeze([
  'SOCKET_Weapon_Front',
  'SOCKET_Mining_Front',
  'SOCKET_Engine_Main',
  'SOCKET_Trail_Main',
  'SOCKET_Utility_Dorsal',
  'SOCKET_Cargo_Ventral',
  'SOCKET_Camera_Focus',
  'SOCKET_RCS_Port',
  'SOCKET_RCS_Starboard',
].sort());
const SOCKET_POSITIONS = Object.freeze({
  SOCKET_Weapon_Front: [12.62, 1.43, 0],
  SOCKET_Mining_Front: [12.26, -1.08, 0],
  SOCKET_Engine_Main: [-13.85, 0, 0],
  SOCKET_Trail_Main: [-14.05, 0, 0],
  SOCKET_Utility_Dorsal: [-1.45, 1.95, -3.8],
  SOCKET_Cargo_Ventral: [-0.8, -2.1, 0],
  SOCKET_Camera_Focus: [0, 0.35, 0],
  SOCKET_RCS_Port: [1.6, 0.45, -6.6],
  SOCKET_RCS_Starboard: [1.6, 0.45, 6.6],
});
const SOCKET_FORWARDS = Object.freeze({
  SOCKET_Weapon_Front: [1, 0, 0],
  SOCKET_Mining_Front: [1, 0, 0],
  SOCKET_Engine_Main: [-1, 0, 0],
  SOCKET_Trail_Main: [-1, 0, 0],
  SOCKET_Utility_Dorsal: [0, 1, 0],
  SOCKET_Cargo_Ventral: [0, -1, 0],
  SOCKET_Camera_Focus: [1, 0, 0],
  SOCKET_RCS_Port: [0, 0, -1],
  SOCKET_RCS_Starboard: [0, 0, 1],
});
const REQUIRED_LOD0_MATERIALS = Object.freeze([
  'Material_Accent_FrontierCyan',
  'Material_Accent_WarningOrange',
  'Material_ArmorDark',
  'Material_BrushedMetal',
  'Material_Decal_Hazard',
  'Material_Decal_Stencils',
  'Material_Emissive_Cyan',
  'Material_Emissive_DriveCore',
  'Material_Emissive_Orange',
  'Material_EngineCeramic',
  'Material_Glass_Canopy',
  'Material_Hull',
  'Material_Mechanical',
  'Material_Radiator',
  'Material_RepairGreen',
  'Material_Rubber',
  'Material_V6_MarkingIvory',
].sort());
const FACTOR_ONLY_MATERIALS = Object.freeze([
  'Material_Emissive_Cyan',
  'Material_Emissive_DriveCore',
  'Material_Emissive_Orange',
  'Material_Glass_Canopy',
  'Material_V6_MarkingIvory',
].sort());

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const sourceFamily = [];
const releaseFamily = [];
for (const member of FAMILY) {
  const sourcePath = resolve(ROOT, `assets/ships/parts/wholeships/${member.file}`);
  const releasePath = resolve(ROOT, `assets/ships/release/parts/wholeships/${member.file}`);
  assert.ok(existsSync(sourcePath), `${member.lod} canonical source must exist`);
  assert.ok(existsSync(releasePath), `${member.lod} canonical release must exist`);
  const source = await inspect(sourcePath, member, { inspectBounds: true });
  const release = await inspect(releasePath, member, { inspectBounds: false });
  verifyMember(source, member, 'source');
  verifyMember(release, member, 'release');
  assert.deepEqual(release.sockets, source.sockets, `${member.lod} release must preserve all sockets`);
  assert.deepEqual(release.socketPositions, source.socketPositions,
    `${member.lod} release must preserve socket transforms`);
  assert.deepEqual(release.socketForwards, source.socketForwards,
    `${member.lod} release must preserve socket directions`);
  assert.ok(release.bytes < MAX_GITHUB_BYTES, `${member.lod} release must stay below GitHub's 100MiB limit`);

  const releaseJson = readGlbJson(readFileSync(releasePath));
  assert.ok((releaseJson.extensionsUsed || []).includes('EXT_meshopt_compression'),
    `${member.lod} release geometry must use Meshopt`);
  const images = releaseJson.images || [];
  if (images.length) {
    assert.ok((releaseJson.extensionsUsed || []).includes('KHR_texture_basisu'),
      `${member.lod} release textures must use KTX2/BasisU`);
    assert.ok(images.every((image) => image.mimeType === 'image/ktx2'),
      `${member.lod} release images must all be KTX2`);
    const mipLevelCounts = readKtx2MipLevelCounts(readFileSync(releasePath));
    assert.equal(mipLevelCounts.length, images.length,
      `${member.lod} must expose a readable KTX2 mip header for every release image`);
    assert.ok(mipLevelCounts.every((count) => count >= 2),
      `${member.lod} release KTX2 images must contain mip chains; got ${mipLevelCounts.join(',')}`);
    release.mipLevelCounts = mipLevelCounts;
  }
  sourceFamily.push(source);
  releaseFamily.push(release);
}

assert.deepEqual(sourceFamily[0].materials, REQUIRED_LOD0_MATERIALS,
  'LOD0 must preserve the Hitch V7 polish semantic material set exactly');
for (const member of sourceFamily) {
  const collisionRatios = member.collisionDimensions.map((value, index) => value / member.visibleDimensions[index]);
  assert.ok(collisionRatios.every((ratio) => ratio >= 0.90 && ratio <= 0.94),
    `${member.lod} collision hull must fit 90-94% of visible bounds; got ${collisionRatios.join(',')}`);
}

const manifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/release/release_manifest.json'), 'utf8'));
for (const member of FAMILY) {
  const id = member.lod === 'lod0' ? 'wholeship_kestrel' : `wholeship_kestrel_${member.lod}`;
  const entry = manifest.assets.find((asset) => asset.id === id);
  assert.ok(entry, `release manifest must catalog ${id}`);
  const releasePath = resolve(ROOT, `assets/ships/release/parts/wholeships/${member.file}`);
  assert.equal(entry.releaseSha256.toUpperCase(), sha256(readFileSync(releasePath)), `${id} release hash must match`);
}

const partsLibrary = readFileSync(resolve(ROOT, 'src/render/partsLibrary.js'), 'utf8');
const assetLoader = readFileSync(resolve(ROOT, 'src/render/assetLoader.js'), 'utf8');
const renderPackageLoader = readFileSync(resolve(ROOT, 'src/render/renderPackageLoader.js'), 'utf8');
assert.match(partsLibrary, /'ship_kestrel'\s*:\s*'wholeships\/kestrel\.glb'/,
  'default starter must map to V4 LOD0 through the canonical player whole-ship path');
assert.match(partsLibrary, /'ship_kestrel'\s*:\s*'SF_K0_KESTREL_BORROWED_TIME_V4'/,
  'the player route must require the V4 asset identity');
for (const member of FAMILY) {
  assert.ok(partsLibrary.includes(`'wholeships/${member.file}'`),
    `${member.lod} must remain in the explicit V4 LOD family catalog`);
}
assert.match(partsLibrary, /AUTHORED_BOOTSTRAP_PLAN\s*=\s*Object\.freeze\(\{\s*hull:\s*Object\.freeze\(\['wholeships\/kestrel\.glb'\]\),?\s*\}\)/,
  'bootstrap residency must decode only the exact Kestrel identity before control');
assert.match(partsLibrary, /shouldBuildReadabilitySafetyCore\s*\(\s*\{[\s\S]*?wholeShip,[\s\S]*?authoredHullLevelCount:/,
  'whole-ship composition must route readability-shell ownership through the shared safety-core contract');
assert.match(partsLibrary, /function\s+shouldBuildReadabilitySafetyCore[\s\S]*?return\s+!wholeShip\s*&&\s*Number\(authoredHullLevelCount\)\s*<=\s*0/,
  'a validated whole ship must disable the readability safety shell');
assert.match(partsLibrary, /authored\.wholeShip\s*===\s*true/,
  'the production whole ship must replace, not retain, procedural/modular fallback');
assert.doesNotMatch(assetLoader, /fetch\(url,\s*\{\s*cache:\s*['"]force-cache['"]\s*\}\)/,
  'whole-ship validation must not pin stale GLBs on Electron stable origins');
assert.match(assetLoader,
  /loadGltfDocument\(url,\s*loader,\s*fetchImpl\s*=\s*globalThis\.fetch\)/,
  'whole-ship validation must retain a production fetch default and an injectable test seam');
assert.match(assetLoader, /fetchImpl\(url,\s*\{\s*cache:\s*['"]no-cache['"]\s*\}\)/,
  'whole-ship validation must revalidate current on-disk GLBs through the injected fetch seam');
assert.doesNotMatch(renderPackageLoader, /cache:\s*['"]force-cache['"]/,
  'Hitch production packages must not pin a stale Electron cache entry');
assert.match(renderPackageLoader, /cache:\s*['"]no-cache['"]/,
  'Hitch production packages must revalidate the current on-disk render package');
assert.match(renderPackageLoader, /cache:\s*['"]reload['"]/,
  'Hitch production packages must bypass a poisoned immutable cache after a hash mismatch');

console.log('Kestrel Borrowed Time V4 live whole-ship family: PASS');
console.log(JSON.stringify({
  assetId: LIVE_ASSET_ID,
  runtimeLod: 'lod0',
  decodedAtBoot: 'opening-shot Kestrel and Helios trade hub authored assets',
  source: sourceFamily.map(summary),
  release: releaseFamily.map(summary),
}, null, 2));

function verifyMember(result, member, label) {
  assert.equal(result.lod, member.lod, `${label} ${member.lod} must contain only its named LOD`);
  assert.ok(result.triangles >= member.triangles[0] && result.triangles <= member.triangles[1],
    `${label} ${member.lod} triangles ${result.triangles} outside ${member.triangles.join('-')}`);
  assert.ok(result.draws <= member.maxDraws, `${label} ${member.lod} draws ${result.draws} exceed ${member.maxDraws}`);
  assert.deepEqual(result.sockets, REQUIRED_SOCKETS, `${label} ${member.lod} must expose nine stable sockets`);
  assert.deepEqual(result.suffixedSockets, [], `${label} ${member.lod} socket names must be collision-free`);
  for (const [name, expected] of Object.entries(SOCKET_POSITIONS)) {
    assertVectorNear(result.socketPositions[name], expected, `${label} ${member.lod} ${name}`);
  }
  for (const [name, expected] of Object.entries(SOCKET_FORWARDS)) {
    assertVectorNear(result.socketForwards[name], expected, `${label} ${member.lod} ${name} forward`);
  }
  assert.deepEqual(result.plumeNodes, [], `${label} ${member.lod} must not embed a plume`);
  assert.equal(result.primitiveCount, result.normalPrimitiveCount, `${label} ${member.lod} requires NORMAL`);
  assert.equal(result.pbrSurfacePrimitiveCount, result.pbrSurfaceUvPrimitiveCount,
    `${label} ${member.lod} mapped PBR surfaces require TEXCOORD_0`);
  assert.equal(result.pbrSurfacePrimitiveCount, result.pbrSurfaceTangentPrimitiveCount,
    `${label} ${member.lod} mapped PBR surfaces require TANGENT`);
  assert.equal(result.asset.assetId, LIVE_ASSET_ID, `${label} ${member.lod} asset identity`);
  assert.equal(result.asset.contractVersion, 2, `${label} ${member.lod} must retain V4 contract v2`);
  assert.equal(result.asset.textureCompression, label === 'source' ? 'PNG-source' : 'KTX2/BasisU+mips',
    `${label} ${member.lod} texture metadata must describe the actual container and mip contract`);
  const expectedFactorOnly = FACTOR_ONLY_MATERIALS.filter((name) => result.materials.includes(name));
  assert.deepEqual([...(result.asset.factorOnlyMaterials || [])].sort(), expectedFactorOnly,
    `${label} ${member.lod} must declare the intentional emissive/glass/stencil factor-only materials`);
  assert.equal(result.asset.acceptedCandidateSha256, member.acceptedCandidateSha256,
    `${label} ${member.lod} must retain accepted-candidate provenance`);
  assert.equal(result.asset.wiringStatus, member.lod === 'lod0' ? 'live_player_only' : 'retained_lod_family_member',
    `${label} ${member.lod} wiring status`);
}

async function inspect(path, member, { inspectBounds }) {
  const bytes = readFileSync(path);
  const document = await io.read(path);
  const root = document.getRoot();
  const nodes = root.listNodes();
  const lodBuckets = new Set();
  let triangles = 0;
  let primitiveCount = 0;
  let uvPrimitiveCount = 0;
  let normalPrimitiveCount = 0;
  let tangentPrimitiveCount = 0;
  let pbrSurfacePrimitiveCount = 0;
  let pbrSurfaceUvPrimitiveCount = 0;
  let pbrSurfaceTangentPrimitiveCount = 0;
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const match = /^LOD([012])_/i.exec(node.getName());
    if (match) lodBuckets.add(`lod${match[1]}`);
    for (const primitive of mesh.listPrimitives()) {
      if (node.getName() === 'COLLISION_HULL') continue;
      triangles += primitiveTriangles(primitive);
      primitiveCount++;
      if (primitive.getAttribute('TEXCOORD_0')) uvPrimitiveCount++;
      if (primitive.getAttribute('NORMAL')) normalPrimitiveCount++;
      if (primitive.getAttribute('TANGENT')) tangentPrimitiveCount++;
      const materialName = primitive.getMaterial()?.getName() || '';
      if (!FACTOR_ONLY_MATERIALS.includes(materialName)) {
        pbrSurfacePrimitiveCount++;
        if (primitive.getAttribute('TEXCOORD_0')) pbrSurfaceUvPrimitiveCount++;
        if (primitive.getAttribute('TANGENT')) pbrSurfaceTangentPrimitiveCount++;
      }
    }
  }
  assert.deepEqual([...lodBuckets], [member.lod], `${member.file} must not bundle another LOD`);
  const visibleBounds = inspectBounds
    ? boundsForNodes(nodes.filter((node) => node.getMesh() && node.getName() !== 'COLLISION_HULL'))
    : null;
  const collisionBounds = inspectBounds
    ? boundsForNodes(nodes.filter((node) => node.getName() === 'COLLISION_HULL'))
    : null;
  const sockets = nodes.map((node) => node.getName()).filter((name) => name.startsWith('SOCKET_')).sort();
  const asset = root.getAsset().extras?.spacefaceAsset || null;
  return {
    lod: member.lod,
    bytes: bytes.length,
    sha256: sha256(bytes),
    triangles,
    draws: primitiveCount,
    primitiveCount,
    uvPrimitiveCount,
    normalPrimitiveCount,
    tangentPrimitiveCount,
    pbrSurfacePrimitiveCount,
    pbrSurfaceUvPrimitiveCount,
    pbrSurfaceTangentPrimitiveCount,
    materials: root.listMaterials().map((material) => material.getName()).sort(),
    sockets,
    socketPositions: Object.fromEntries(nodes
      .filter((node) => node.getName().startsWith('SOCKET_'))
      .map((node) => [node.getName(), node.getTranslation()])),
    socketForwards: Object.fromEntries(nodes
      .filter((node) => node.getName().startsWith('SOCKET_'))
      .map((node) => [node.getName(), node.getExtras()?.spaceface?.forward || null])),
    suffixedSockets: sockets.filter((name) => /\.\d{3}$/.test(name)),
    plumeNodes: nodes.map((node) => node.getName()).filter((name) => /plume/i.test(name)),
    visibleDimensions: visibleBounds ? dimensions(visibleBounds) : null,
    collisionDimensions: collisionBounds ? dimensions(collisionBounds) : null,
    asset,
  };
}

function boundsForNodes(nodes) {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const corner = new Vector3();
  for (const node of nodes) {
    const matrix = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of node.getMesh().listPrimitives()) {
      const accessor = primitive.getAttribute('POSITION');
      if (!accessor) continue;
      const localMin = accessor.getMin([]);
      const localMax = accessor.getMax([]);
      for (const x of [localMin[0], localMax[0]]) for (const y of [localMin[1], localMax[1]]) {
        for (const z of [localMin[2], localMax[2]]) {
          corner.set(x, y, z).applyMatrix4(matrix);
          min.min(corner);
          max.max(corner);
        }
      }
    }
  }
  return { min, max };
}

function dimensions({ min, max }) {
  return [max.x - min.x, max.y - min.y, max.z - min.z];
}

function assertVectorNear(actual, expected, label, epsilon = 1e-3) {
  assert.ok(Array.isArray(actual) && actual.length === expected.length, `${label} must have ${expected.length} axes`);
  for (let index = 0; index < expected.length; index++) {
    assert.ok(Number.isFinite(actual[index]) && Math.abs(actual[index] - expected[index]) <= epsilon,
      `${label}[${index}] expected ${expected[index]}, got ${actual[index]}`);
  }
}

function primitiveTriangles(primitive) {
  const count = primitive.getIndices()?.getCount() || primitive.getAttribute('POSITION')?.getCount() || 0;
  return primitive.getMode() === 4 ? Math.floor(count / 3) : 0;
}

function readGlbJson(buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x46546c67, 'release asset must be a binary glTF');
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, 'first GLB chunk must be JSON');
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

function readKtx2MipLevelCounts(buffer) {
  const json = readGlbJson(buffer);
  let offset = 12;
  let binOffset = -1;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === 0x004e4942) {
      binOffset = offset + 8;
      break;
    }
    offset += 8 + length;
  }
  assert.ok(binOffset >= 0, 'release GLB must contain a BIN chunk');
  return (json.images || []).filter((image) => image.mimeType === 'image/ktx2').map((image) => {
    const view = json.bufferViews?.[image.bufferView];
    assert.ok(view && (view.buffer ?? 0) === 0, 'KTX2 image must resolve to GLB buffer 0');
    const imageOffset = binOffset + (view.byteOffset || 0);
    assert.equal(buffer.subarray(imageOffset, imageOffset + 12).toString('hex'),
      'ab4b5458203230bb0d0a1a0a', 'KTX2 image identifier');
    return buffer.readUInt32LE(imageOffset + 40);
  });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function summary(member) {
  const result = {
    lod: member.lod,
    bytes: member.bytes,
    sha256: member.sha256,
    triangles: member.triangles,
    draws: member.draws,
    sockets: member.sockets.length,
  };
  if (member.visibleDimensions) result.visibleDimensions = member.visibleDimensions;
  if (member.collisionDimensions) result.collisionDimensions = member.collisionDimensions;
  return result;
}
