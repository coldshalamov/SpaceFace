// PQ-131.07 Cycle 02 — gas tap source-candidate contracts.
// JSON / root / hook / LOD / hash freeze / envelope. Not a wire or promote gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FAMILY = resolve(ROOT, 'assets/works/gas_tap');
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_gas_tap.glb');
const COMBINED = resolve(FAMILY, 'source/gas_tap.glb');
const HASHES = resolve(FAMILY, 'HASHES.json');
const INVENTORY = resolve(FAMILY, 'source/gas_tap_inventory.json');
const CONTRACT = resolve(FAMILY, 'MATERIAL_CONTRACT.json');
const ZONES = resolve(FAMILY, 'VISIBLE_ZONE_REGISTER.json');
const LEDGER = resolve(FAMILY, 'TECHNIQUE_LEDGER.json');
const CYCLE01 = resolve(FAMILY, 'evidence/cycle_001');
const CYCLE02 = resolve(FAMILY, 'evidence/cycle_002');

const CYCLE01_FREEZE = Object.freeze({
  'grazing.png': 'DF330186879416E9475628291892CD5F457147BC91CD3515523222315C5FE0F6',
  'hooks_identity.png': '4007E5F39615B068AF91188ED9EA4AAA9922FA745466825C04832D5FB8D9662D',
  'material_id.png': 'DD71BF7C875E0790D7E1EC6C6B4D2B9ED0C4F4FEFDE3E6CC1F3BA3341C2CA472',
  'normal_isolation.png': 'FE5EE51185804D49C8357F4C2A10A3560E702E00B41C8E11BC0EED59217B5FE7',
  'orm_isolation.png': '021704729E10FF30047302306EC729532A1A1C1A31D0072FE95D953FD28385E3',
  'works_edge.png': 'B1FF98A26C4F9FBE5B202A9798309A29EA193A8E020B7A94750575A9DFEC5C20',
  'works_edge_clay.png': 'D9F74E1A545C347FD7C09F360E0198379F22F0D9FC16BC61BCFADA3AE460AD0E',
  'works_site.png': '17FB06F6CF078A9F26A0036863D38CF8B6608824D9A585DF383C654C588DC634',
  'works_site_clay.png': '58FC845877B1A34F9A90827C8FBEAB4A74A41362D9EC59E990BE2A82A3E1638D',
  'works_top.png': '34C16BF19C7927631D0FA3E39F851E7B44BA3981DCA59CC15586B4C7AE7BCE57',
  'works_top_clay.png': 'FC59AF12BF6FF9F290B09DD75D8AF3EB21D1696775FC65823EF812C56B1AF5CD',
});

const HOOKS = ['valve_wheel', 'gauge_needle', 'lamp'];
const LOD_MESHES = [
  'LOD0_gas_tap', 'LOD0_valve_wheel', 'LOD0_gauge_needle', 'LOD0_lamp',
  'LOD1_gas_tap', 'LOD1_valve_wheel', 'LOD1_gauge_needle', 'LOD1_lamp',
  'LOD2_gas_tap', 'LOD2_valve_wheel', 'LOD2_gauge_needle', 'LOD2_lamp',
];
const BUDGET = { lod0: 6000, lod1: 1500, lod2: 500 };
const STILLS = [
  'works_top.png', 'works_top_clay.png', 'works_edge.png', 'works_edge_clay.png',
  'works_site.png', 'works_site_clay.png', 'grazing.png', 'hooks_identity.png',
  'material_id.png', 'normal_isolation.png', 'orm_isolation.png',
];

function sha256(abs) {
  return createHash('sha256').update(readFileSync(abs)).digest('hex').toUpperCase();
}

function readJson(abs) {
  return JSON.parse(readFileSync(abs, 'utf8'));
}

function readGlb(abs) {
  const buf = readFileSync(abs);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `GLB magic at ${abs}`);
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
}

function nodeNames(gltf) {
  return (gltf.nodes || []).map((n) => n.name).filter(Boolean);
}

function assertVecApprox(actual, expected, label) {
  assert.ok(Array.isArray(actual), `${label} transform exists`);
  assert.equal(actual.length, expected.length, `${label} transform length`);
  for (let i = 0; i < expected.length; i += 1) {
    assert.ok(Math.abs(actual[i] - expected[i]) <= 1e-4, `${label}[${i}] ${actual[i]} != ${expected[i]}`);
  }
}

test('JSON contracts parse and stay Cycle 02 source-candidate', () => {
  const hashes = readJson(HASHES);
  const inventory = readJson(INVENTORY);
  const contract = readJson(CONTRACT);
  const zones = readJson(ZONES);
  const ledger = readJson(LEDGER);
  assert.equal(hashes.packet, 'PQ-131.07');
  assert.equal(hashes.cycle, 2);
  assert.equal(hashes.state, 'design_candidate');
  assert.equal(hashes.rootName, 'SF_WORKS_GAS_TAP_V1');
  assert.equal(hashes.assetId, 'place_works_gas_tap');
  assert.equal(inventory.cycle, 2);
  assert.equal(inventory.rootName, 'SF_WORKS_GAS_TAP_V1');
  assert.equal(contract.cycle, 2);
  assert.equal(contract.currentState, 'design_candidate');
  assert.equal(zones.cycle, 2);
  assert.equal(ledger.productionState, 'design_candidate');
  assert.equal(hashes.inspect.wiringStatus, undefined);
  assert.equal(inventory.state, 'design_candidate');
});

test('Cycle 01 evidence hashes stay frozen', () => {
  const hashes = readJson(HASHES);
  assert.deepEqual(hashes.cycle01Freeze, CYCLE01_FREEZE);
  for (const [name, expected] of Object.entries(CYCLE01_FREEZE)) {
    const abs = resolve(CYCLE01, name);
    assert.equal(existsSync(abs), true, name);
    assert.equal(sha256(abs), expected, name);
  }
});

test('root, hooks, and LOD meshes exist on the combined source GLB', () => {
  assert.equal(existsSync(SOURCE_GLB), true);
  assert.equal(existsSync(COMBINED), true);
  const gltf = readGlb(SOURCE_GLB);
  const names = nodeNames(gltf);
  assert.equal(names.includes('SF_WORKS_GAS_TAP_V1'), true);
  const expectedHookTranslations = {
    // Blender authoring is Z-up; exported glTF is Y-up: (x, y, z) -> (x, z, -y).
    valve_wheel: [0.52, 0.80, -0.08],
    gauge_needle: [0.56, 0.761, 0.54],
    lamp: [0.94, 0.96, -0.58],
  };
  for (const hook of HOOKS) {
    const node = (gltf.nodes || []).find((n) => n.name === hook);
    assert.ok(node, hook);
    assert.equal(node.mesh, undefined, `${hook} is an empty`);
    assertVecApprox(node.translation, expectedHookTranslations[hook], `${hook} pivot`);
    assert.equal(node.children?.length, 3, `${hook} owns all three LOD meshes`);
    for (const childIndex of node.children) {
      const child = gltf.nodes[childIndex];
      assertVecApprox(
        child.translation,
        expectedHookTranslations[hook].map((value) => -value),
        `${child.name} counter-translation`,
      );
    }
  }
  for (const mesh of LOD_MESHES) {
    assert.equal(names.includes(mesh), true, mesh);
  }
  const extras = (gltf.asset && gltf.asset.extras) || {};
  assert.equal(extras.assetId, 'place_works_gas_tap');
  const hashes = readJson(HASHES);
  assert.equal(hashes.inspect.rootPresent, true);
  assert.deepEqual(hashes.inspect.hooks, {
    valve_wheel: true,
    gauge_needle: true,
    lamp: true,
  });
  assert.deepEqual(hashes.inspect.lodRoots, {
    LOD0_gas_tap: true,
    LOD1_gas_tap: true,
    LOD2_gas_tap: true,
  });
});

test('LOD budgets, one-cell envelope, wall bias, and lance occupancy', () => {
  const hashes = readJson(HASHES);
  const inventory = readJson(INVENTORY);
  const reports = hashes.lodReports || inventory.lodReports;
  assert.ok(Array.isArray(reports) && reports.length === 3);
  for (const report of reports) {
    const key = `lod${report.lod}`;
    assert.equal(report.overBudget, false, key);
    assert.ok(report.triangles <= BUDGET[key], `${key} ${report.triangles} > ${BUDGET[key]}`);
    assert.equal(inventory.lodTriangles[key], report.triangles);
    const { min, max } = report.bbox;
    assert.ok(min[2] >= -0.001, `${key} underside`);
    assert.ok(max[2] <= 1.00, `${key} height`);
    assert.ok(min[0] > 0, `${key} one-sided +X wall bias`);
    assert.ok(max[0] <= 1.18, `${key} occupancy tail`);
    assert.ok(max[0] >= 1.12, `${key} lance must clear the plate`);
    assert.ok(Math.abs(min[1]) <= 0.95 && Math.abs(max[1]) <= 0.95, `${key} Y envelope`);
    const spanY = max[1] - min[1];
    const spanX = max[0] - min[0];
    assert.ok(spanY > spanX, `${key} clamp/manifold must be the longest mass`);
    assert.ok(spanY >= 1.50, `${key} clamp bar length`);
    for (const hook of HOOKS) {
      assert.ok(Array.isArray(report.hooks[hook]), hook);
    }
    assert.equal(report.hooks.valve_wheel[0], report.hooks.valve_wheel[0]);
    // Stem coaxial with valve: wheel XY is the stem XY.
    assert.equal(report.hooks.valve_wheel[0], 0.52);
    assert.equal(report.hooks.valve_wheel[1], 0.08);
    // Gauge stays the smaller offset disc on -Y.
    assert.ok(report.hooks.gauge_needle[1] < -0.40);
    assert.ok(report.hooks.gauge_needle[1] > -0.70);
  }
});

test('Cycle 02 evidence and diagnostics exist beside frozen Cycle 01', () => {
  for (const name of STILLS) {
    assert.equal(existsSync(resolve(CYCLE02, name)), true, name);
    assert.notEqual(sha256(resolve(CYCLE02, name)), CYCLE01_FREEZE[name], `${name} must be a new still`);
  }
  const hashes = readJson(HASHES);
  for (const key of Object.keys(hashes.stills || {})) {
    const rel = hashes.stills[key];
    assert.match(rel, /cycle_002/);
    assert.equal(existsSync(resolve(ROOT, rel)), true, rel);
  }
  assert.ok(hashes.diagnostics);
  for (const rel of Object.values(hashes.diagnostics)) {
    assert.match(rel, /cycle_002\/diagnostics/);
    assert.equal(existsSync(resolve(ROOT, rel)), true, rel);
  }
  const evidenceHashes = hashes.evidenceSha256 || {};
  assert.equal(Object.keys(evidenceHashes).length, STILLS.length + Object.keys(hashes.diagnostics).length);
  for (const [rel, expected] of Object.entries(evidenceHashes)) {
    assert.match(rel, /cycle_002/);
    assert.equal(sha256(resolve(ROOT, rel)), expected, rel);
  }
});

test('source candidate is not a live release or wired part', () => {
  const release = resolve(ROOT, 'assets/ships/release/parts/works/place_works_gas_tap.glb');
  assert.equal(existsSync(release), false);
  const hashes = readJson(HASHES);
  const inventory = readJson(INVENTORY);
  assert.equal(inventory.partsSource, 'assets/ships/parts/works/place_works_gas_tap.glb');
  const gltf = readGlb(SOURCE_GLB);
  const extras = ((gltf.asset || {}).extras || {}).spacefaceAsset || {};
  assert.equal(extras.wiringStatus || 'source_candidate_unwired', 'source_candidate_unwired');
  assert.equal(extras.deliverableRole || 'source_candidate', 'source_candidate');
  assert.equal(hashes.state, 'design_candidate');
});
