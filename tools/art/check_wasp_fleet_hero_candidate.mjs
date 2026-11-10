#!/usr/bin/env node
// Strict scratch-candidate gate for Wasp geometry, sockets, collision, PBR, LODs, and canonical preservation.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const candidateRoot = resolve(ROOT, '.devshots/graphics/wasp-fleet-hero-v1/candidate');
const manifest = JSON.parse(readFileSync(resolve(ROOT, '.devshots/graphics/wasp-fleet-hero-v1/INPUT_MANIFEST.json'), 'utf8'));
const expectedMaterials = [
  'Material_Accent', 'Material_Armor', 'Material_Canopy', 'Material_HeatMetal', 'Material_Hull',
  'Material_Mechanical', 'Material_Radiator', 'Material_Recessed', 'Material_Thruster', 'Material_Warning',
];
const expectedSockets = {
  SOCKET_Camera_Focus: [0.2, 0.35, 0],
  SOCKET_Cargo_Ventral: [-2.2, -1.15, 0],
  SOCKET_Engine_Main: [-9.7, 0, 0],
  SOCKET_Mining_Front: [10.2, -0.35, 0],
  SOCKET_RCS_Port: [-1.8, 0.05, 7],
  SOCKET_RCS_Starboard: [-1.8, 0.05, -7],
  SOCKET_Trail_Main: [-10, 0, 0],
  SOCKET_Trail_Port: [-9.8, 0, 5.55],
  SOCKET_Trail_Starboard: [-9.8, 0, -5.55],
  SOCKET_Utility_Dorsal: [-1.1, 1.5, 0],
  SOCKET_Weapon_Front: [10.6, 0.1, 0],
};
const expectedBounds = {
  lod0: [[-10, -1.38, -8.08183], [12, 2.319466, 8.08183]],
  lod1: [[-10, -1.38, -8.08183], [12, 1.790296, 8.08183]],
  lod2: [[-10, -1.38, -8.08183], [12, 1.790296, 8.08183]],
};
const files = [
  ['lod0', 'wasp_production_v1_golden.glb', false],
  ['lod1', 'wasp_production_v1_golden_lod1.glb', false],
  ['lod2', 'wasp_production_v1_golden_lod2.glb', false],
  ['lod0', 'wasp_production_v1_golden_ktx2.glb', true],
  ['lod1', 'wasp_production_v1_golden_lod1_ktx2.glb', true],
  ['lod2', 'wasp_production_v1_golden_lod2_ktx2.glb', true],
];

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const checks = [];
const reports = [];
const rawTriangles = [];
for (const [lod, name, compressed] of files) {
  const path = resolve(candidateRoot, name);
  assert(`${name}: exists`, existsSync(path), path);
  const document = await io.read(path);
  const root = document.getRoot();
  const scene = root.listScenes()[0];
  const bounds = getBounds(scene);
  const actualBounds = [round(bounds.min), round(bounds.max)];
  assert(`${name}: ${compressed ? 'quantized' : 'exact'} bounds`, deepClose(actualBounds, expectedBounds[lod], compressed ? 0.001 : 1e-5), { expected: expectedBounds[lod], actual: actualBounds });
  const roots = root.listNodes().filter((node) => /^WASP_PRODUCTION_V1_LOD\d_ROOT$/.test(node.getName()));
  assert(`${name}: one exact asset root`, roots.length === 1, roots.map((node) => node.getName()));
  assert(`${name}: root pivot`, deepClose(round(roots[0].getWorldTranslation()), [0, 0, 0]), round(roots[0].getWorldTranslation()));
  const sockets = Object.fromEntries(root.listNodes().filter((node) => /^SOCKET_/.test(node.getName())).map((node) => [node.getName(), round(node.getWorldTranslation())]));
  assert(`${name}: exact socket names`, sameSet(Object.keys(sockets), Object.keys(expectedSockets)), Object.keys(sockets).sort());
  for (const [socket, expected] of Object.entries(expectedSockets)) assert(`${name}: ${socket}`, deepClose(sockets[socket], expected), { expected, actual: sockets[socket] });
  const collisions = root.listNodes().filter((node) => node.getName() === 'COLLISION_HULL');
  assert(`${name}: exact collision node`, collisions.length === 1 && Boolean(collisions[0].getMesh()), collisions.length);
  const materials = root.listMaterials();
  assert(`${name}: semantic materials`, sameSet(materials.map((material) => material.getName()), expectedMaterials), materials.map((material) => material.getName()));
  for (const material of materials) {
    const materialName = material.getName();
    assert(`${name}: ${materialName} opaque`, material.getAlphaMode() === 'OPAQUE', material.getAlphaMode());
    assert(`${name}: ${materialName} base map`, Boolean(material.getBaseColorTexture()), material.getBaseColorTexture()?.getName());
    assert(`${name}: ${materialName} normal map`, Boolean(material.getNormalTexture()), material.getNormalTexture()?.getName());
    assert(`${name}: ${materialName} ORM map`, Boolean(material.getMetallicRoughnessTexture()) && material.getMetallicRoughnessTexture() === material.getOcclusionTexture(), {
      orm: material.getMetallicRoughnessTexture()?.getName(), ao: material.getOcclusionTexture()?.getName(),
    });
    const hasEmissive = Boolean(material.getEmissiveTexture());
    assert(`${name}: ${materialName} bounded emissive`, hasEmissive === (materialName === 'Material_Thruster'), hasEmissive);
  }
  const textures = root.listTextures();
  assert(`${name}: complete texture count`, textures.length === 31, textures.length);
  assert(`${name}: texture format`, textures.every((texture) => texture.getMimeType() === (compressed ? 'image/ktx2' : 'image/png')), textures.map((texture) => texture.getMimeType()));
  assert(`${name}: texture resolution`, textures.every((texture) => deepClose(texture.getSize(), [1024, 1024])), textures.map((texture) => texture.getSize()));
  const renderPrimitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives()).filter((primitive) => primitive.getMaterial());
  assert(`${name}: ten render primitives`, renderPrimitives.length === 10, renderPrimitives.length);
  assert(`${name}: render UV0`, renderPrimitives.every((primitive) => primitive.getAttribute('TEXCOORD_0')), renderPrimitives.map((primitive) => primitive.getAttribute('TEXCOORD_0')?.getCount()));
  assert(`${name}: render tangents`, renderPrimitives.every((primitive) => primitive.getAttribute('TANGENT')), renderPrimitives.map((primitive) => primitive.getAttribute('TANGENT')?.getCount()));
  const forbiddenMeshes = root.listMeshes().filter((mesh) => /(plume|sprite|cone|billboard|ball trail)/i.test(mesh.getName()));
  assert(`${name}: no embedded VFX geometry`, forbiddenMeshes.length === 0, forbiddenMeshes.map((mesh) => mesh.getName()));
  const triangles = renderPrimitives.reduce((sum, primitive) => sum + triangleCount(primitive), 0);
  if (!compressed) rawTriangles.push([lod, triangles]);
  reports.push({ lod, compressed, path, bytes: readFileSync(path).length, sha256: sha256(readFileSync(path)), bounds: actualBounds, triangles, materials: materials.length, textures: textures.length });
}
assert('LOD triangles descend', rawTriangles[0][1] > rawTriangles[1][1] && rawTriangles[1][1] > rawTriangles[2][1], rawTriangles);
assert('LOD1 retains at least half LOD0 triangles', rawTriangles[1][1] / rawTriangles[0][1] >= 0.5, rawTriangles);
assert('LOD2 retains at least 30 percent LOD0 triangles', rawTriangles[2][1] / rawTriangles[0][1] >= 0.3, rawTriangles);

const canonical = [];
for (const entry of manifest.files.filter((entry) => /(?:^|\/)wasp(?:_|\/|\.)/i.test(entry.relative.replaceAll('\\', '/')))) {
  const path = resolve(ROOT, entry.relative);
  const present = existsSync(path);
  const actual = present ? receipt(path) : null;
  const unchanged = present && actual.bytes === entry.bytes && actual.sha256 === entry.sha256;
  canonical.push({ relative: entry.relative, expected: { bytes: entry.bytes, sha256: entry.sha256 }, actual, unchanged });
  assert(`canonical unchanged: ${entry.relative}`, unchanged, { expected: entry, actual });
}
for (const entry of manifest.expectedMissing) {
  const missing = !existsSync(resolve(ROOT, entry.relative));
  canonical.push({ relative: entry.relative, expectedMissing: true, unchanged: missing });
  assert(`canonical remains absent: ${entry.relative}`, missing, entry.relative);
}

const report = {
  schema: 'spaceface.waspFleetHero.strictCheck.v1',
  ok: checks.every((check) => check.result === 'pass'),
  inputManifestSha256: sha256(readFileSync(resolve(ROOT, '.devshots/graphics/wasp-fleet-hero-v1/INPUT_MANIFEST.json'))),
  checks,
  assets: reports,
  canonical,
};
const output = resolve(candidateRoot, 'strict-contract-check.json');
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) throw new Error(`Wasp strict check failed; see ${output}`);
process.stdout.write(`${JSON.stringify({ ok: true, output, checks: checks.length, assets: reports.length }, null, 2)}\n`);

function assert(name, result, evidence) {
  checks.push({ name, result: result ? 'pass' : 'fail', evidence });
}

function triangleCount(primitive) {
  const indices = primitive.getIndices();
  return indices ? Math.floor(indices.getCount() / 3) : Math.floor((primitive.getAttribute('POSITION')?.getCount() || 0) / 3);
}

function receipt(path) {
  const bytes = readFileSync(path);
  return { bytes: bytes.length, sha256: sha256(bytes) };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function round(values) {
  return Array.from(values || [], (value) => Number(Number(value).toFixed(6)));
}

function deepClose(actual, expected, tolerance = 1e-5) {
  if (!actual || !expected || actual.length !== expected.length) return false;
  return actual.every((value, index) => Array.isArray(value) ? deepClose(value, expected[index], tolerance) : Math.abs(value - expected[index]) <= tolerance);
}

function sameSet(actual, expected) {
  return actual.length === expected.length && [...actual].sort().every((value, index) => value === [...expected].sort()[index]);
}
