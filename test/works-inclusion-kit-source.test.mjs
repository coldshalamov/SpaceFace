// PQ-131.10 — accepted Cycle 02 Asteroid Works Inclusion Kit source contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PARTS_GLB = resolve(ROOT, 'assets/ships/parts/works/place_works_inclusion_kit.glb');
const SOURCE_GLB = resolve(ROOT, 'assets/works/inclusion_kit/source/inclusion_kit.glb');
const INVENTORY = resolve(ROOT, 'assets/works/inclusion_kit/source/inclusion_kit_inventory.json');
const HASHES = resolve(ROOT, 'assets/works/inclusion_kit/source/HASHES.json');
const EVIDENCE = resolve(ROOT, 'assets/works/inclusion_kit/evidence/cycle_02');

const KEEP_SHA256 = 'e690aea63108d697a2d53fe8ba6ea5136f4e7a1f725572df6fb5d73f9101cd83';
const MASTER_ROOT = 'SF_WORKS_INCLUSION_KIT_V1';
const VARIANTS = Object.freeze([
  ['SF_INCL_SILVER_WIRE_V1', 'silver'],
  ['SF_INCL_SILVER_SHEET_V1', 'silver'],
  ['SF_INCL_GOLD_LEAF_V1', 'gold'],
  ['SF_INCL_GOLD_RIBBON_V1', 'gold'],
  ['SF_INCL_IRON_CHIP_RIDGE_V1', 'iron'],
  ['SF_INCL_IRON_SPECULAR_V1', 'iron'],
  ['SF_INCL_NICKEL_CUBIC_V1', 'nickel'],
  ['SF_INCL_NICKEL_DENDRITE_V1', 'nickel'],
  ['SF_INCL_EXOTIC_OCTAHEDRAL_CAGE_V1', 'exotic'],
  ['SF_INCL_EXOTIC_PRISMATIC_TRUSS_V1', 'exotic'],
  ['SF_INCL_EXOTIC_HOPPER_CUBE_V1', 'exotic'],
  ['SF_INCL_ICE_SHEEN_PLATE_V1', 'ice'],
  ['SF_INCL_ICE_FRACTURE_VEIN_V1', 'ice'],
  ['SF_INCL_GAS_FISSURE_RADIAL_V1', 'gas'],
  ['SF_INCL_GAS_FISSURE_BRANCH_V1', 'gas'],
  ['SF_INCL_GAS_FISSURE_SHEAR_V1', 'gas'],
  ['SF_INCL_VENTED_SCAR_V1', 'scar'],
  ['SF_INCL_MK_LOCK_PLATE_V1', 'lock'],
]);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function readGlbJson(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `GLB magic at ${path}`);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
}

function namedNodes(json) {
  const nodes = json.nodes || [];
  const parent = new Map();
  nodes.forEach((node, index) => {
    for (const child of node.children || []) parent.set(child, index);
  });
  return new Map(nodes.map((node, index) => [node.name, {
    node,
    parent: parent.has(index) ? nodes[parent.get(index)]?.name : null,
  }]));
}

test('Cycle 02 Inclusion Kit source and parts copy match the independent KEEP', () => {
  const hashes = JSON.parse(readFileSync(HASHES, 'utf8'));
  assert.equal(sha256(SOURCE_GLB), KEEP_SHA256);
  assert.equal(sha256(PARTS_GLB), KEEP_SHA256);
  assert.equal(hashes.masterGlb.toLowerCase(), KEEP_SHA256);
  assert.equal(hashes.placeGlb.toLowerCase(), KEEP_SHA256);
  assert.equal(readFileSync(SOURCE_GLB).length, 6693936);
  assert.equal(readFileSync(PARTS_GLB).length, 6693936);
});

test('the combined source retains one stable root and all 18 three-LOD variant families', () => {
  const json = readGlbJson(PARTS_GLB);
  const scene = json.scenes?.[json.scene || 0];
  const table = namedNodes(json);
  assert.equal(scene?.extras?.spacefaceAsset?.assetId, 'place_works_inclusion_kit');
  assert.equal(table.has(MASTER_ROOT), true);
  assert.equal(table.get(MASTER_ROOT).node.extras?.spaceface?.collision, false);
  for (const [variant] of VARIANTS) {
    assert.equal(table.get(variant)?.parent, MASTER_ROOT, `${variant} parent`);
    for (const lod of [0, 1, 2]) {
      const name = `LOD${lod}_${variant}`;
      assert.equal(table.get(name)?.parent, variant, `${name} parent`);
      assert.equal(Number.isInteger(table.get(name)?.node?.mesh), true, `${name} mesh`);
    }
  }
});

test('inventory, per-variant hashes, and original-resolution Cycle 02 evidence stay bound', () => {
  const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
  const hashes = JSON.parse(readFileSync(HASHES, 'utf8'));
  assert.equal(inventory.cycle, 2);
  assert.equal(inventory.masterRoot, MASTER_ROOT);
  assert.deepEqual(inventory.lodTriangles, { lod0: 24028, lod1: 6444, lod2: 2822 });
  assert.deepEqual(
    inventory.variants.map(({ id, family }) => [id, family]),
    [...VARIANTS],
  );
  for (const variant of inventory.variants) {
    const path = resolve(ROOT, `assets/works/inclusion_kit/source/variants/${variant.id}.glb`);
    assert.equal(existsSync(path), true, variant.id);
    assert.equal(sha256(path), hashes.variants[variant.id].toLowerCase(), `${variant.id} hash`);
  }
  for (const name of [
    'works_top_kit.png', 'works_edge_kit.png', 'works_site_kit.png',
    'no_emission_works_top.png', 'no_emission_works_site.png',
    'diag_clay_works_top.png', 'diag_material_id_works_top.png',
  ]) {
    const path = resolve(EVIDENCE, name);
    assert.equal(existsSync(path), true, name);
    assert.equal(sha256(path), hashes.evidence[name].toLowerCase(), `${name} hash`);
  }
});
