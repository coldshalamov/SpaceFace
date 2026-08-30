// PQ-131.09 — authored Cargo Port SOURCE candidate at accepted Cycle 04.
// Reads local parts/source/evidence only. Does not touch runtime wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_cargo_port.glb');
const COMBINED = resolve(ROOT, 'assets/works/cargo_port/source/cargo_port.glb');
const LOD0 = resolve(ROOT, 'assets/works/cargo_port/source/cargo_port_lod0.glb');
const LOD1 = resolve(ROOT, 'assets/works/cargo_port/source/cargo_port_lod1.glb');
const LOD2 = resolve(ROOT, 'assets/works/cargo_port/source/cargo_port_lod2.glb');
const INVENTORY = resolve(ROOT, 'assets/works/cargo_port/source/cargo_port_inventory.json');
const HASHES = resolve(ROOT, 'assets/works/cargo_port/HASHES.json');
const EPOCH = resolve(ROOT, 'assets/works/cargo_port/evidence/cycle_004/EPOCH.json');
const EVIDENCE = resolve(ROOT, 'assets/works/cargo_port/evidence/cycle_004');
const TEX = resolve(ROOT, 'assets/works/cargo_port/source/textures');

const KEEP = Object.freeze({
  parts: 'f4b8c87df96fce899c540e71f1ed76cfe2422d751dc5b1ab1214f2c0d1189614',
  lod0: '68c0157efcbaa80a904f680e2305cd5c07d3c90f4c46733c569dbe4bcc7b649c',
  lod1: '9c1ea95e414b00f3311bd4b8a8f91a63238ae5d70e1660cfa0a259181247668a',
  lod2: '83dcfc43511c55116b7ea04e09cda6b9c7d982e627fac641e1694438dddbd6f3',
  epoch: '0476281b9b59ba1b421fc01cd2f54f836457150f53a6edddb9157ff3d0870b62',
});
const HOOKS = Object.freeze([
  'crate_0', 'crate_1', 'crate_2', 'crate_3', 'crate_4',
  'cradle', 'pod_root', 'pod_thruster',
]);
const LOD_ROOTS = Object.freeze(['LOD0_cargo_port', 'LOD1_cargo_port', 'LOD2_cargo_port']);

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

test('Cycle 04 Cargo Port source hashes match the independent KEEP', () => {
  const hashes = JSON.parse(readFileSync(HASHES, 'utf8'));
  assert.equal(sha256(SOURCE_GLB), KEEP.parts);
  assert.equal(sha256(COMBINED), KEEP.parts);
  assert.equal(sha256(LOD0), KEEP.lod0);
  assert.equal(sha256(LOD1), KEEP.lod1);
  assert.equal(sha256(LOD2), KEEP.lod2);
  assert.equal(sha256(EPOCH), KEEP.epoch);
  assert.equal(hashes.parts.toLowerCase(), KEEP.parts);
  assert.equal(hashes.lod0.toLowerCase(), KEEP.lod0);
  assert.equal(hashes.lod1.toLowerCase(), KEEP.lod1);
  assert.equal(hashes.lod2.toLowerCase(), KEEP.lod2);
  assert.equal(readFileSync(SOURCE_GLB).length, 3833156);
});

test('the accepted source keeps the eight hooks, LOD roots, and keyed well', () => {
  const { json } = readGlb(SOURCE_GLB);
  const table = nodeTable(json);
  assert.equal(table.has('SF_WORKS_CARGO_PORT_V1'), true, 'stable root');
  for (const name of [...HOOKS, ...LOD_ROOTS, 'LOD0_cradle', 'LOD0_pod', 'LOD0_pod_thruster']) {
    assert.equal(table.has(name), true, name);
  }
  for (const name of HOOKS) {
    assert.equal(table.get(name).node.mesh, undefined, `${name} remains an empty`);
  }
  assert.equal(table.get('LOD0_pod').parent, 'pod_root');
  assert.equal(table.get('pod_thruster').parent, 'pod_root');
  assert.equal(table.get('LOD0_cradle').parent, 'cradle');
});

test('five freight planforms sit on the +X loading path opposite the well', () => {
  const { json } = readGlb(SOURCE_GLB);
  const table = nodeTable(json);
  const wellX = table.get('cradle').node.translation[0];
  const podX = table.get('pod_root').node.translation[0];
  assert.ok(wellX < 0, 'the C cradle sits in the keyed well, not on the apron');
  assert.ok(podX < 0, 'the pod seats in the well');
  const xs = [];
  for (let i = 0; i < 5; i++) {
    const t = table.get(`crate_${i}`).node.translation;
    assert.ok(t[0] > 0.6, `crate_${i} stays on the +X apron (${t[0]})`);
    xs.push(t[0]);
  }
  assert.equal(new Set(xs.map((x) => x.toFixed(3))).size, 5, 'the five crates keep distinct planform stations');
});

test('inventory launch-clear, triangle budgets, and Cycle 04 evidence stay bound', () => {
  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  assert.equal(inventory.cycle, 4);
  assert.equal(inventory.launchAxis.launchClearWu, 1.55);
  assert.equal(inventory.launchAxis.gltfAfterYup, '+Y');
  assert.deepEqual(inventory.hooks, [...HOOKS]);
  assert.equal(inventory.triangles[0].port_tris, 6644);
  assert.ok(inventory.triangles[0].port_tris <= inventory.budgets.port[0]);
  assert.ok(inventory.triangles[1].port_tris <= inventory.budgets.port[1]);
  assert.ok(inventory.triangles[2].port_tris <= inventory.budgets.port[2]);
  for (const kind of ['basecolor', 'normal', 'orm']) {
    const png = resolve(TEX, `cargo_port_atlas_${kind}.png`);
    assert.equal(existsSync(png), true, png);
  }
  for (const name of [
    'works_top.png', 'works_edge.png', 'works_site.png',
    'works_top_clay.png', 'works_edge_clay.png',
    'crate_stage_01.png', 'crate_stage_05.png', 'crate_stage_sheet.png',
    'pod_seated_top.png', 'pod_launch_clear_top.png',
    'works_top_lod1.png', 'works_top_lod2.png',
  ]) {
    assert.equal(existsSync(resolve(EVIDENCE, name)), true, name);
  }
});
