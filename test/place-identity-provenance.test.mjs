#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const authoring = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/blender/authoring.json'), 'utf8'));
const conceptIdx = JSON.parse(readFileSync(resolve(ROOT, 'assets/concept/index.json'), 'utf8'));

const slice = authoring.vertical_slice || [];
const blenderMcp = slice.filter((id) => authoring.entries[id]?.method === 'blender_mcp');
assert.ok(blenderMcp.length >= 3, `vertical_slice blender_mcp count=${blenderMcp.length}`);

const ledgerPath = resolve(ROOT, 'assets/ships/parts/blender/iteration_ledger.json');
assert.ok(existsSync(ledgerPath), 'iteration_ledger.json');
const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
for (const id of blenderMcp) {
  const promo = ledger.promotions?.[id];
  assert.ok(promo, `${id} ledger promotion`);
  assert.ok(Number.isFinite(promo.silhouette_iou) && promo.silhouette_iou >= 0 && promo.silhouette_iou <= 1,
    `${id} silhouette_iou diagnostic=${promo.silhouette_iou}`);
}

for (const id of blenderMcp) {
  const entry = authoring.entries[id];
  assert.equal(entry.method, 'blender_mcp', id);
  assert.ok(existsSync(resolve(ROOT, entry.blend_path)), `${id} blend`);
  assert.ok(existsSync(resolve(ROOT, entry.concept_path)), `${id} concept`);
  const glb = resolve(ROOT, 'assets/ships/parts/places', `${id}.glb`);
  assert.ok(existsSync(glb), glb);
  const bytes = readFileSync(glb);
  const jsonLen = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLen).toString('utf8').replace(/\0+$/, ''));
  assert.ok(String(json.asset?.generator || '').includes('author_place_archetype.py'), `${id} generator`);
}

const wiredCities = conceptIdx.entries.filter((e) => e.target_asset_role?.includes('/city') && e.blender_part_id);
assert.ok(wiredCities.length >= 10, `wired cities=${wiredCities.length}`);

const gapFill = resolve(ROOT, 'docs/worldbuilding/story/PLACE-IDENTITY-GAP-FILL.md');
assert.ok(existsSync(gapFill), 'PLACE-IDENTITY-GAP-FILL.md');
assert.ok(readFileSync(gapFill, 'utf8').includes('City districts'), 'city districts section');

console.log('place-identity-provenance.test: ok');
