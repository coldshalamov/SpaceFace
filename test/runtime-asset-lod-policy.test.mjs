import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { authoredLodMaxMetadataIssue } from '../src/render/assetLoader.js';

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
