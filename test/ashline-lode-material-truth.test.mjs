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
  'assets/ships/m4_ashline_v2/source/wholeships/ashline_v2_lode.glb',
);
const SUMMARY = resolve(
  ROOT,
  'assets/ships/m4_ashline_v2/evidence/lode/build_summary.json',
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

test('Lode builder permanently retires its primitive blockout vocabulary', () => {
  const source = readFileSync(BUILDER, 'utf8');
  for (const retired of ['Maul_Casemate_', 'Maul_Gun_', 'Maul_Rail_', 'Maul_Engine']) {
    assert.equal(source.includes(retired), false, `${retired} primitive must stay retired`);
  }
  for (const component of [
    'Lode_CasemateShell_',
    'Lode_RadialLoadFrame_',
    'Lode_AutocannonBreech_',
    'Lode_RecoilDamper_',
    'Lode_TorchBell',
    'Lode_PulseProjector_',
  ]) {
    assert.equal(source.includes(component), true, `${component} assembly missing`);
  }
});

test('Lode source preserves interfaces while carrying material-truth assemblies through LOD1', () => {
  const gltf = glbJson(SOURCE);
  const materialNames = new Set((gltf.materials || []).map((material) => material.name));
  for (const material of [
    'Material_Hull',
    'Material_Mechanical',
    'Material_Red_Paint',
    'Material_Cyan',
    'Material_RepairPrimer',
    'Material_HeatMetal',
    'Material_Refractory',
  ]) {
    assert.equal(materialNames.has(material), true, `missing ${material}`);
  }

  const nodeNames = new Set((gltf.nodes || []).map((node) => node.name));
  for (const lod of ['LOD0', 'LOD1']) {
    for (const material of ['Material_RepairPrimer', 'Material_HeatMetal', 'Material_Refractory']) {
      assert.equal(
        nodeNames.has(`${lod}_Merged_${material}`),
        true,
        `${lod} drops ${material}`,
      );
    }
  }
  assert.equal(nodeNames.has('LOD2_Merged_Material_RepairPrimer'), false);
  assert.equal(nodeNames.has('LOD2_Merged_Material_HeatMetal'), false);
  assert.equal(nodeNames.has('LOD2_Merged_Material_Refractory'), false);

  const sockets = [...nodeNames].filter((name) => name?.startsWith('SOCKET_')).sort();
  assert.deepEqual(sockets, [...REQUIRED_SOCKETS].sort());
});

test('Lode receipt pins loadout, construction, LOD policy, envelope, and current source hash', () => {
  const summary = JSON.parse(readFileSync(SUMMARY, 'utf8'));
  const actualSourceSha256 = sha256(SOURCE);
  assert.equal(summary.gateOk, true, summary.gateErrors?.join('\n'));
  assert.equal(summary.sourceSha256, actualSourceSha256);
  assert.equal(summary.materialTruth?.sourceSha256, actualSourceSha256);
  assert.equal(summary.materialTruth?.revision, 'lode-material-truth-2026-07-28-v1');
  assert.equal(summary.materialTruth?.driveProfileId, 'drive_torch_l');
  assert.deepEqual(summary.materialTruth?.weaponIds, [
    'wpn_autocannon_m',
    'wpn_autocannon_m',
    'wpn_pulse_laser_s',
  ]);
  assert.deepEqual(summary.materialTruth?.components, [
    'paired-heavy-autocannon-casemates',
    'radial-recoil-load-frames',
    'fixed-pulse-projector-s',
    'open-cycle-torch-l',
  ]);
  assert.deepEqual(summary.materialTruth?.lodPolicy, {
    lod0: 'full-component-construction',
    lod1: 'load-path-and-material-boundaries',
    lod2: 'donor-macro-hull-only',
  });
  assert.deepEqual(
    summary.lod0AabbSize.map((value) => Math.round(value * 1000) / 1000),
    [24, 7.246, 21.824],
  );
  assert.equal(summary.lodTriangles.lod0 > summary.lodTriangles.lod1, true);
  assert.equal(summary.lodTriangles.lod1 > summary.lodTriangles.lod2, true);
});
