import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { authoredLodMaxMetadataIssue } from '../src/render/assetLoader.js';

const source = fs.readFileSync(new URL('../scripts/check-runtime-asset-contract.mjs', import.meta.url), 'utf8');

test('runtime asset audit treats optional LOD technique as measured advice, not a quality gate', () => {
  const match = source.match(/pushIssue\(row,\s*'([^']+)',\s*'missing-hull-lods'/);
  assert(match, 'runtime asset audit must continue reporting missing hull LODs');
  assert.equal(match[1], 'advisory',
    'an unmeasured LOD technique cannot hard-fail authored LOD0 assets on capable hardware');
  assert.match(source, /measured frame\/load\/memory evidence owns hard[\s/]+performance acceptance/i);
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
