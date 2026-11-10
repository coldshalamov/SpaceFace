import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import {
  scheduleRealtimeShadowRefresh,
  shouldRefreshRealtimeShadowMap,
} from '../src/render/shadowPresentCadence.js';

test('a late present skips one shadow refresh, then the map must update again', () => {
  assert.equal(shouldRefreshRealtimeShadowMap({}), true);
  assert.equal(shouldRefreshRealtimeShadowMap({ lastPresentDtMs: 16.7 }), true);
  assert.equal(shouldRefreshRealtimeShadowMap({ lastPresentDtMs: 33.3 }), false);
  assert.equal(shouldRefreshRealtimeShadowMap({ lastPresentDtMs: 33.3, skippedLast: true }), true);
});

test('a clean shadow map stays idle while a late dirty map retains its one-frame recovery', () => {
  assert.equal(shouldRefreshRealtimeShadowMap({ dirty: false, lastPresentDtMs: 16.7 }), false);
  assert.equal(shouldRefreshRealtimeShadowMap({ dirty: true, lastPresentDtMs: 16.7 }), true);
  assert.equal(shouldRefreshRealtimeShadowMap({ dirty: true, lastPresentDtMs: 33.3 }), false);
  assert.equal(shouldRefreshRealtimeShadowMap({
    dirty: true,
    lastPresentDtMs: 33.3,
    skippedLast: true,
  }), true);
});

test('a scheduled live shadow refresh arms both the light and the global map scope', () => {
  const renderer = { shadowMap: { autoUpdate: false, needsUpdate: false } };
  const light = { shadow: { autoUpdate: true, needsUpdate: false, map: null } };
  assert.equal(scheduleRealtimeShadowRefresh(renderer, light, true), true);
  assert.equal(light.shadow.autoUpdate, false);
  assert.equal(light.shadow.needsUpdate, true);
  assert.equal(renderer.shadowMap.needsUpdate, true,
    'WebGLShadowMap.render early-returns when the global scope is not armed');
  assert.equal(renderer.shadowMap.autoUpdate, false, 'the global autoUpdate policy is untouched');
});

test('a cadence-skipped refresh leaves both scopes idle', () => {
  const renderer = { shadowMap: { autoUpdate: false, needsUpdate: false } };
  const light = { shadow: { autoUpdate: true, needsUpdate: false } };
  assert.equal(scheduleRealtimeShadowRefresh(renderer, light, false), false);
  assert.equal(light.shadow.autoUpdate, false);
  assert.equal(light.shadow.needsUpdate, false);
  assert.equal(renderer.shadowMap.needsUpdate, false);
});

test('a missing shadow scope returns false without writing', () => {
  assert.equal(scheduleRealtimeShadowRefresh(null, null, true), false);
  const renderer = { shadowMap: { needsUpdate: false } };
  assert.equal(scheduleRealtimeShadowRefresh(renderer, null, true), false);
  assert.equal(renderer.shadowMap.needsUpdate, false);
  assert.equal(scheduleRealtimeShadowRefresh({ shadow: { needsUpdate: false } },
    { shadow: { needsUpdate: false } }, true), false);
});

test('live shadow follow consults the late-present cadence', async () => {
  const source = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /shouldRefreshRealtimeShadowMap/);
  assert.match(source, /scheduleRealtimeShadowRefresh/);
  const cadence = await readFile(
    new URL('../src/render/shadowPresentCadence.js', import.meta.url), 'utf8');
  assert.match(cadence, /shadow\.autoUpdate/);
  assert.match(cadence, /shadowMap\.needsUpdate/);
});
