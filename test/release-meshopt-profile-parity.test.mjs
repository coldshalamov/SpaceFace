import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { RELEASE_MESHOPT_OPTIONS } from '../scripts/lib/releaseMeshoptProfile.mjs';

const releaseBuilder = readFileSync(new URL('../scripts/build-sg04-release-assets.mjs', import.meta.url), 'utf8');
const releaseValidator = readFileSync(new URL('../src/contracts/assetReleaseValidation.js', import.meta.url), 'utf8');
const kestrelFinalizer = readFileSync(
  new URL('../assets/ships/kestrel_borrowed_time_v4/scripts/finalize_v4.mjs', import.meta.url),
  'utf8',
);

test('release geometry uses the reviewed high-quality quantization profile', () => {
  assert.deepEqual(RELEASE_MESHOPT_OPTIONS, {
    level: 'high',
    quantizePosition: 14,
    quantizeNormal: 12,
    quantizeTexcoord: 13,
    quantizeColor: 8,
    quantizeWeight: 8,
    quantizeGeneric: 12,
  });
});

test('the main release builder and Kestrel finalizer share one mesh profile', () => {
  for (const [label, source] of [
    ['release builder', releaseBuilder],
    ['Kestrel finalizer', kestrelFinalizer],
  ]) {
    assert.match(source, /RELEASE_MESHOPT_OPTIONS/, `${label} must consume the common profile`);
    assert.doesNotMatch(source, /quantizeNormal:\s*\d+/, `${label} must not shadow the common normal precision`);
    assert.doesNotMatch(source, /quantizeTexcoord:\s*\d+/, `${label} must not shadow the common UV precision`);
  }
});

test('release texture parity counts only primitive-referenced source materials', () => {
  assert.match(
    releaseValidator,
    /usedMaterialIndices\.add\(primitive\.material\)/,
    'texture parity must derive the material set from renderable primitives',
  );
  assert.match(releaseValidator, /countMaterialTextureSlots\([\s\S]*usedMaterialIndices/);
  assert.doesNotMatch(releaseBuilder, /normalizedSourceDoc/,
    'the builder must compare the immutable source rather than a lossy temporary rewrite');
});
