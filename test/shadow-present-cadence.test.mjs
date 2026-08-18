import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { shouldRefreshRealtimeShadowMap } from '../src/render/shadowPresentCadence.js';

test('a late present skips one shadow refresh, then the map must update again', () => {
  assert.equal(shouldRefreshRealtimeShadowMap({}), true);
  assert.equal(shouldRefreshRealtimeShadowMap({ lastPresentDtMs: 16.7 }), true);
  assert.equal(shouldRefreshRealtimeShadowMap({ lastPresentDtMs: 33.3 }), false);
  assert.equal(shouldRefreshRealtimeShadowMap({ lastPresentDtMs: 33.3, skippedLast: true }), true);
});

test('live shadow follow consults the late-present cadence', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /shouldRefreshRealtimeShadowMap/);
  assert.match(source, /shadow\.autoUpdate/);
});
