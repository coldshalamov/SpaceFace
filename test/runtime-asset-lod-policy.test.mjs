import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { authoredLodMaxMetadataIssue } from '../src/render/assetLoader.js';
import { hullLodContractIssue } from '../scripts/check-runtime-asset-contract.mjs';

const source = fs.readFileSync(new URL('../scripts/check-runtime-asset-contract.mjs', import.meta.url), 'utf8');
const reusableModuleGenerator = fs.readFileSync(
  new URL('../assets/ships/parts/scripts/golden_reusable_modules_v1.py', import.meta.url),
  'utf8',
);

test('runtime asset audit keeps stable authored hull LODs as a release contract', () => {
  const match = source.match(/pushIssue\(row,\s*'([^']+)',\s*'missing-hull-lods'/);
  assert(match, 'runtime asset audit must continue reporting missing hull LODs');
  assert.equal(match[1], 'required',
    'major authored bodies must retain exact LOD identities instead of relying on a single heavy mesh');
});

test('separate hull files prove all exact LOD tiers and one authored identity', () => {
  const family = { lod0: 'wholeships/body.glb', lod1: 'wholeships/body_lod1.glb', lod2: 'wholeships/body_lod2.glb' };
  const rows = Object.entries(family).map(([tier, path]) => ({ path, authoredAssetId: 'BODY', issues: [],
    lod: { lod0: tier === 'lod0' ? 10 : 0, lod1: tier === 'lod1' ? 5 : 0, lod2: tier === 'lod2' ? 2 : 0 } }));
  const map = new Map(rows.map(row => [row.path, row]));
  assert.equal(hullLodContractIssue(rows[0], { lodFamily: family }, map), null);
  assert.match(hullLodContractIssue(rows[0], {}, map), /requires LOD0\/LOD1\/LOD2/);
  map.delete(family.lod2);
  assert.match(hullLodContractIssue(rows[0], { lodFamily: family }, map), /missing readable lod2/);
  map.set(family.lod2, { ...rows[2], authoredAssetId: 'OTHER' });
  assert.match(hullLodContractIssue(rows[0], { lodFamily: family }, map), /foreign authored identity/);
  map.set(family.lod2, { ...rows[2], lod: { lod0: 2, lod1: 0, lod2: 0 } });
  assert.match(hullLodContractIssue(rows[0], { lodFamily: family }, map), /exact lod2/);
  assert.match(hullLodContractIssue(rows[0], { lodFamily: { ...family, lod2: family.lod1 } }, map), /three distinct/);
  assert.equal(hullLodContractIssue({ lod: { lod0: 10, lod1: 5, lod2: 2 } }, {}), null);
});

test('range-style sf_lod_max metadata fails closed instead of changing exact LOD selection', () => {
  assert.equal(authoredLodMaxMetadataIssue({ spacefaceLod: 'lod0' }), null);
  assert.match(
    authoredLodMaxMetadataIssue({ sf_lod_max: 2 }),
    /unsupported sf_lod_max=2.*exact LOD0_\*\/LOD1_\*\/LOD2_\*/,
  );
  assert.match(source, /missing-hull-lods/,
    'existing runtime LOD policy remains intact');

  const loaderSource = fs.readFileSync(new URL('../src/render/assetLoader.js', import.meta.url), 'utf8');
  assert.match(loaderSource, /const lodRangeIssue = authoredLodMaxMetadataIssue\(node\.userData\);/);
  assert.match(loaderSource, /if \(lodRangeIssue\) errors\.push/,
    'unsupported range metadata must reject the asset before blueprint publication');
  assert.doesNotMatch(loaderSource, /tags\.lod\s*=\s*[^;]*sf_lod_max/,
    'sf_lod_max must not be guessed into one exact runtime LOD');
});

test('reusable-module generator exports exact per-file LOD content without range metadata', () => {
  assert.doesNotMatch(reusableModuleGenerator, /\["sf_lod_max"\]\s*=/,
    'generated GLBs must not carry range metadata that runtime admission rejects');
  assert.match(reusableModuleGenerator, /LOD_TIERS\s*=\s*\{/,
    'the authoring recipe must retain its deterministic per-export detail selection');
  assert.match(reusableModuleGenerator,
    /selected\s*=\s*list\(source_objects\)[^\n]+sf_detail_tier[^\n]+allowed/,
    'each lodN export must continue selecting its intended detail tiers explicitly');
});
