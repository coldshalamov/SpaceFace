// PQ-131.07 — authored Gas Tap SOURCE at accepted Cycle 02.
// Reads local parts/source/evidence only. Does not rewrite source visuals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_gas_tap.glb');
const COMBINED = resolve(ROOT, 'assets/works/gas_tap/source/gas_tap.glb');
const LOD0 = resolve(ROOT, 'assets/works/gas_tap/source/gas_tap_lod0.glb');
const LOD1 = resolve(ROOT, 'assets/works/gas_tap/source/gas_tap_lod1.glb');
const LOD2 = resolve(ROOT, 'assets/works/gas_tap/source/gas_tap_lod2.glb');
const INVENTORY = resolve(ROOT, 'assets/works/gas_tap/source/gas_tap_inventory.json');
const HASHES = resolve(ROOT, 'assets/works/gas_tap/HASHES.json');
const EVIDENCE = resolve(ROOT, 'assets/works/gas_tap/evidence/cycle_002');

const KEEP = Object.freeze({
  parts: '8da1d98dafe6ef475ff94c0f47e320c90128756bfb215ce7f362c8c52af8aa60',
  lod0: '2eb1059d9598b82782dbeb118e6cf614330129a4c01c10ea9118ceb0bea3d3eb',
  lod1: '90c1e1b93bb44f122c9c01774514d53bfdea8ff15ca2c5c5104b3ffd1c0151a1',
  lod2: '57e511a161bfd88f48589c920e17d75d01187966b384db390858451c2f5b50e1',
});
const HOOKS = Object.freeze(['valve_wheel', 'gauge_needle', 'lamp']);
const EXPECTED_HOOKS = Object.freeze({
  valve_wheel: [0.5199999809265137, 0.800000011920929, -0.07999999821186066],
  gauge_needle: [0.5600000023841858, 0.7609999775886536, 0.5400000214576721],
  lamp: [0.9399999976158142, 0.9599999785423279, -0.5799999833106995],
});
const EXPECTED_COLLISION_T = Object.freeze([0.6000000238418579, 0.47999998927116394, 0]);
const EXPECTED_COLLISION_S = Object.freeze([
  0.550000011920929,
  0.5,
  0.8999999761581421,
]);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readGlb(abs) {
  const buf = readFileSync(abs);
  assert.equal(buf.readUInt32LE(0), 0x46546c67, `GLB magic at ${abs}`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  return { json, buf };
}

function nodeTable(json) {
  const nodes = json.nodes || [];
  const parentOf = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children || []) parentOf.set(child, index);
  });
  const table = new Map();
  const roots = json.scenes[json.scene || 0].nodes || [];
  const stack = [...roots];
  while (stack.length) {
    const index = stack.pop();
    const node = nodes[index];
    table.set(node.name, {
      index,
      node,
      parent: parentOf.has(index) ? nodes[parentOf.get(index)].name : null,
    });
    for (const child of node.children || []) stack.push(child);
  }
  return table;
}

test('Cycle 02 Gas Tap source hashes match the independent KEEP', () => {
  const hashes = JSON.parse(readFileSync(HASHES, 'utf8'));
  assert.equal(sha256(SOURCE_GLB), KEEP.parts);
  assert.equal(sha256(COMBINED), KEEP.parts);
  assert.equal(sha256(LOD0), KEEP.lod0);
  assert.equal(sha256(LOD1), KEEP.lod1);
  assert.equal(sha256(LOD2), KEEP.lod2);
  assert.equal(hashes.inspect.sha256.toLowerCase(), KEEP.parts);
  assert.equal(readFileSync(SOURCE_GLB).length, 2569116);
  assert.equal(readFileSync(LOD0).length, 2371428);
  assert.equal(readFileSync(LOD1).length, 2257916);
  assert.equal(readFileSync(LOD2).length, 2194796);
});

test('the accepted source keeps the root, three hooks, LOD children, and collision envelope', () => {
  const { json } = readGlb(SOURCE_GLB);
  const table = nodeTable(json);
  assert.equal(table.has('SF_WORKS_GAS_TAP_V1'), true, 'stable root');
  for (const name of [...HOOKS, 'LOD0_gas_tap', 'LOD1_gas_tap', 'LOD2_gas_tap', 'COLLISION_HULL']) {
    assert.equal(table.has(name), true, name);
  }
  for (const name of HOOKS) {
    const node = table.get(name).node;
    assert.equal(node.mesh, undefined, `${name} remains an empty`);
    assert.deepEqual(node.translation, EXPECTED_HOOKS[name], `${name} keeps its authored transform`);
    assert.ok(Math.hypot(...EXPECTED_HOOKS[name]) > 0.05, `${name} is not an identity/origin empty`);
    assert.equal(table.get(`LOD0_${name}`).parent, name);
    assert.equal(table.get(`LOD1_${name}`).parent, name);
    assert.equal(table.get(`LOD2_${name}`).parent, name);
  }
  const collision = table.get('COLLISION_HULL').node;
  assert.equal(collision.mesh, undefined);
  assert.equal(collision.extras?.spaceface?.collision, true);
  assert.deepEqual(collision.translation, EXPECTED_COLLISION_T);
  assert.deepEqual(collision.scale, EXPECTED_COLLISION_S);
});

test('inventory triangle budgets and Cycle 02 evidence stay bound', () => {
  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  assert.equal(inventory.cycle, 2);
  assert.deepEqual(inventory.hooks, [...HOOKS]);
  assert.equal(inventory.lodTriangles.lod0, 2464);
  assert.equal(inventory.lodTriangles.lod1, 1182);
  assert.equal(inventory.lodTriangles.lod2, 496);
  assert.ok(inventory.lodTriangles.lod0 <= 6000);
  assert.ok(inventory.lodTriangles.lod1 <= 1500);
  assert.ok(inventory.lodTriangles.lod2 <= 500);
  for (const name of [
    'works_top.png', 'works_edge.png', 'works_site.png',
    'works_top_clay.png', 'works_edge_clay.png', 'hooks_identity.png',
  ]) {
    assert.equal(existsSync(resolve(EVIDENCE, name)), true, name);
  }
});
