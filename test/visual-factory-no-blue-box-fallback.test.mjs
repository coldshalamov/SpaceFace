import assert from 'node:assert/strict';
import test from 'node:test';

import { createVisualFactory } from '../src/render/visualFactory.js';

test('generic payloads receive a semantic canister instead of the blue fallback box', () => {
  const root = createVisualFactory().build({ type: 'payload', radius: 6, data: {} });
  const geometryTypes = [];
  root.traverse((object) => {
    if (object.geometry) geometryTypes.push(object.geometry.type);
  });
  assert.equal(root.userData.interactionKind, 'payload');
  assert.equal(root.userData.visualLanguage, 'sealed-cargo-canister');
  assert.ok(geometryTypes.length >= 3);
  assert.equal(geometryTypes.includes('BoxGeometry'), false);
});

test('unknown or failed visual types fail closed and never publish a visible blue box', () => {
  const root = createVisualFactory().build({ type: 'not-a-runtime-entity', radius: 20, data: {} });
  let renderables = 0;
  root.traverse((object) => { if (object.isMesh || object.isPoints || object.isLine) renderables++; });
  assert.equal(root.visible, false);
  assert.equal(root.userData.visualBuildFailed, true);
  assert.equal(renderables, 0);
});
