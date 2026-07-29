import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILDER = resolve(ROOT, 'tools/blender/build_m4_ashline_v2.py');
const SOURCE = resolve(
  ROOT,
  'assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_dart.glb',
);
const SUMMARY = resolve(
  ROOT,
  'assets/ships/m4_ashline_v2/evidence/dart/build_summary.json',
);
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
];

function glbJson(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.toString('utf8', 0, 4), 'glTF');
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(
    bytes.toString('utf8', 20, 20 + jsonLength).replace(/\0+$/u, '').trim(),
  );
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

test('Dart builder replaces the primitive add-on vocabulary with manufactured assemblies', () => {
  const source = readFileSync(BUILDER, 'utf8');
  for (const retired of ['Dart_Engine_', 'Dart_Core_', 'Dart_ThreatRail_', 'Dart_Gun']) {
    assert.equal(source.includes(retired), false, `${retired} primitive must stay retired`);
  }
  for (const helper of [
    'make_revolved_profile_x',
    'make_revolved_shell_x',
    'make_segmented_clamp_x',
    'make_hat_section_x',
    'make_service_line',
  ]) {
    assert.equal(source.includes(`def ${helper}`), true, `${helper} helper missing`);
  }
});

test('Dart source GLB carries explicit hot-metal and refractory assemblies through LOD1', () => {
  const gltf = glbJson(SOURCE);
  const materialNames = new Set((gltf.materials || []).map((material) => material.name));
  for (const material of [
    'Material_Hull',
    'Material_Mechanical',
    'Material_Red_Paint',
    'Material_Cyan',
    'Material_HeatMetal',
    'Material_Refractory',
  ]) {
    assert.equal(materialNames.has(material), true, `missing ${material}`);
  }

  const nodeNames = new Set((gltf.nodes || []).map((node) => node.name));
  for (const lod of ['LOD0', 'LOD1']) {
    assert.equal(
      nodeNames.has(`${lod}_Merged_Material_HeatMetal`),
      true,
      `${lod} drops the hot-section construction`,
    );
    assert.equal(
      nodeNames.has(`${lod}_Merged_Material_Refractory`),
      true,
      `${lod} drops the refractory throat/collimator`,
    );
  }
  assert.equal(nodeNames.has('LOD2_Merged_Material_HeatMetal'), false);
  assert.equal(nodeNames.has('LOD2_Merged_Material_Refractory'), false);

  const sockets = [...nodeNames].filter((name) => name?.startsWith('SOCKET_')).sort();
  assert.deepEqual(sockets, [...REQUIRED_SOCKETS].sort());
});

test('Dart material-truth receipt names every fictional material and LOD policy', () => {
  const summary = JSON.parse(readFileSync(SUMMARY, 'utf8'));
  const actualSourceSha256 = sha256(SOURCE);
  assert.equal(summary.gateOk, true, summary.gateErrors?.join('\n'));
  assert.equal(summary.sourceSha256, actualSourceSha256);
  assert.equal(summary.materialTruth?.sourceSha256, actualSourceSha256);
  assert.equal(summary.materialTruth?.revision, 'dart-material-truth-2026-07-28-v1');
  assert.deepEqual(summary.materialTruth?.components, [
    'fixed-pulse-projector-s',
    'folded-feed-spines',
    'vector-reaction-drive-s-twin',
  ]);
  assert.deepEqual(summary.materialTruth?.lodPolicy, {
    lod0: 'full-component-construction',
    lod1: 'load-path-and-material-boundaries',
    lod2: 'donor-macro-hull-only',
  });
  assert.equal(summary.lodTriangles.lod0 > summary.lodTriangles.lod1, true);
  assert.equal(summary.lodTriangles.lod1 > summary.lodTriangles.lod2, true);
});
