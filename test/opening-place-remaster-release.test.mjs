import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { evaluateOpeningPlaceRemaster } from '../scripts/check-opening-place-remaster.mjs';

test('opening place remaster proof is reachable through the art gate', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    pkg.scripts['check:opening-place-remaster'],
    'node scripts/check-opening-place-remaster.mjs',
  );
  assert.equal(
    pkg.scripts['check:art'].split('npm run check:opening-place-remaster').length - 1,
    1,
  );
});

test('opening place remasters retain exact source/release identity and compression contracts', () => {
  const receipt = evaluateOpeningPlaceRemaster();
  assert.equal(receipt.pass, true, receipt.failures.join('\n'));
  assert.deepEqual(receipt.ids, [
    'place_debris_chunk',
    'place_dead_hulk',
    'place_dock_interior',
  ]);
  assert.equal(receipt.assets.length, 3);
  for (const asset of receipt.assets) {
    assert.match(asset.sourceSha256, /^[0-9a-f]{64}$/);
    assert.match(asset.releaseSha256, /^[0-9a-f]{64}$/);
    assert.ok(asset.sourceBytes > 0);
    assert.ok(asset.releaseBytes > 0);
    assert.ok(asset.primitives > 0);
    assert.ok(asset.textureSlots > 0);
    assert.ok(asset.ktx2Textures > 0);
    assert.ok(asset.meshoptBufferViews > 0);
    assert.ok(asset.contractNodes > 0);
  }
});
