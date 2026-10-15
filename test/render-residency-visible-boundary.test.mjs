import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRetainVisibleEntityMesh } from '../src/render/renderer.js';

const scene = {};

function mesh(overrides = {}) {
  return { visible: true, parent: scene, ...overrides };
}

test('residency keeps a mounted visible ship boundary through a transient poll miss', () => {
  const entity = { id: 471, type: 'ship', alive: true };
  assert.equal(shouldRetainVisibleEntityMesh(entity, mesh(), scene), true);
});

test('visible-boundary retention does not pin hidden or detached content', () => {
  const ship = { id: 471, type: 'ship', alive: true };
  assert.equal(shouldRetainVisibleEntityMesh(ship, mesh({ visible: false }), scene), false);
  assert.equal(shouldRetainVisibleEntityMesh(ship, mesh({ parent: {} }), scene), false);
  assert.equal(shouldRetainVisibleEntityMesh({ ...ship, alive: false }, mesh(), scene), false);
});

test('residency retention stays limited to mobile hull classes', () => {
  assert.equal(shouldRetainVisibleEntityMesh({ id: 4, type: 'wreck', alive: true }, mesh(), scene), true);
  assert.equal(shouldRetainVisibleEntityMesh({ id: 5, type: 'asteroid', alive: true }, mesh(), scene), false);
  assert.equal(shouldRetainVisibleEntityMesh({ id: 6, type: 'station', alive: true }, mesh(), scene), false);
});
