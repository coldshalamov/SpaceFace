// PQ-131.08 — authored fabricator SOURCE candidate (unwired).
// Reads the local part GLB only. Does not touch runtime, manifests, or release.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_fabricator.glb');
const INVENTORY = resolve(ROOT, 'assets/works/fabricator/source/fabricator_inventory.json');
const HASHES = resolve(ROOT, 'assets/works/fabricator/HASHES.json');
const LEDGER = resolve(ROOT, 'assets/works/fabricator/TECHNIQUE_LEDGER.json');
const BRIEF = resolve(ROOT, 'assets/works/fabricator/reference/REFERENCE_BRIEF.md');
const TEX = resolve(ROOT, 'assets/works/fabricator/source/textures');
const EVIDENCE = resolve(ROOT, 'assets/works/fabricator/evidence/cycle_001');

const ROOT_NAME = 'SF_WORKS_FABRICATOR_V1';
const LOD_ROOTS = ['LOD0_fabricator', 'LOD1_fabricator', 'LOD2_fabricator'];
const HOOKS = ['gantry_head', 'lamp'];
const TRI_BUDGET = { lod0: 10000, lod1: 2500, lod2: 800 };
const TRAVEL_LENGTH = 1.4;

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

function triangleCount(json, node) {
  if (node.mesh == null) return 0;
  let total = 0;
  for (const primitive of json.meshes[node.mesh].primitives) {
    const count = primitive.indices != null
      ? json.accessors[primitive.indices].count
      : json.accessors[primitive.attributes.POSITION].count;
    total += count / 3;
  }
  return total;
}

test('fabricator source files exist', () => {
  for (const path of [SOURCE_GLB, INVENTORY, HASHES, LEDGER, BRIEF]) {
    assert.equal(existsSync(path), true, path);
  }
  for (const lod of [0, 1, 2]) {
    for (const kind of ['basecolor', 'normal', 'orm']) {
      const png = resolve(TEX, `fabricator_atlas_lod${lod}_${kind}.png`);
      assert.equal(existsSync(png), true, png);
      const buf = readFileSync(png);
      assert.equal(buf[0], 0x89);
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      assert.equal(width, 1024, `${png} width`);
      assert.equal(height, 1024, `${png} height`);
    }
  }
});

test('root, LOD roots, hooks, and rail exist', () => {
  const { json } = readGlb(SOURCE_GLB);
  const table = nodeTable(json);
  assert.equal(table.has(ROOT_NAME), true, 'stable root');
  const sceneNodes = (json.scenes[json.scene || 0].nodes || []).map((i) => json.nodes[i].name);
  assert.equal(sceneNodes.includes(ROOT_NAME) || table.get(ROOT_NAME).parent == null, true);
  for (const name of [...LOD_ROOTS, ...HOOKS, 'rail']) {
    assert.equal(table.has(name), true, name);
  }
  assert.equal(table.get('gantry_head').node.mesh, undefined, 'gantry_head is an empty');
  assert.equal(table.get('lamp').node.mesh, undefined, 'lamp is an empty');
  assert.equal(table.get('rail').node.mesh, undefined, 'rail is an empty');
});

test('gantry_head owns the moving LOD meshes and is authored at progress 0', () => {
  const { json } = readGlb(SOURCE_GLB);
  const table = nodeTable(json);
  for (const lod of [0, 1, 2]) {
    const gantry = table.get(`LOD${lod}_Gantry`);
    assert.ok(gantry, `LOD${lod}_Gantry`);
    assert.equal(gantry.parent, 'gantry_head', `LOD${lod}_Gantry parent`);
  }
  const head = table.get('gantry_head').node;
  const extras = head.extras || {};
  const travel = extras.travel || (table.get('rail').node.extras || {}).travel;
  assert.ok(travel, 'travel extras');
  assert.equal(Number(travel.length), TRAVEL_LENGTH);
  assert.equal(Number(travel.authoredProgress ?? extras.authoredProgress ?? 0), 0);
  assert.deepEqual(travel.axis, [1, 0, 0]);
});

test('LOD triangle budgets', () => {
  const { json } = readGlb(SOURCE_GLB);
  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  for (const [lod, budget] of Object.entries(TRI_BUDGET)) {
    const n = inventory.lodTriangles[lod];
    assert.ok(n > 0, `${lod} has triangles`);
    assert.ok(n <= budget, `${lod} ${n} <= ${budget}`);
  }
  const table = nodeTable(json);
  let lod0 = 0;
  for (const [name, entry] of table) {
    if (name.startsWith('LOD0_') && entry.node.mesh != null) lod0 += triangleCount(json, entry.node);
  }
  assert.ok(lod0 <= TRI_BUDGET.lod0, `counted lod0 ${lod0}`);
});

test('legal evidence stills exist', () => {
  for (const name of [
    'works_top.png', 'works_edge.png', 'works_site.png',
    'works_top_clay.png', 'grazing_close.png',
    'normal_isolation.png', 'orm_isolation.png', 'material_id.png',
    'hook_view.png', 'progress_0.png', 'progress_05.png', 'progress_1.png',
    'uv0_layout.png',
  ]) {
    assert.equal(existsSync(resolve(EVIDENCE, name)), true, name);
  }
});

test('technique ledger covers the place MTX set', () => {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const ids = new Set(ledger.rows.map((row) => row.id));
  for (const id of [
    'MTX-01', 'MTX-03', 'MTX-16', 'MTX-20', 'MTX-21', 'MTX-22', 'MTX-23',
    'MTX-24', 'MTX-25', 'MTX-30', 'MTX-31', 'MTX-32', 'MTX-33', 'MTX-39',
    'MTX-46', 'MTX-50', 'MTX-52', 'MTX-53', 'MTX-54',
  ]) {
    assert.equal(ids.has(id), true, id);
  }
  for (const row of ledger.rows) {
    assert.ok(['implemented', 'not_applicable', 'blocked'].includes(row.state), row.id);
  }
});
