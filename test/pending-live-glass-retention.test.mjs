import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRetainPendingReadableMesh } from '../src/render/renderer.js';

const scene = {};

function fixture(overrides = {}) {
  const entity = {
    id: 345,
    type: 'drone',
    alive: true,
    pos: { x: 0, z: 0 },
    radius: 15,
    data: { morrow: true },
    ...overrides.entity,
  };
  const mesh = {
    visible: false,
    parent: scene,
    userData: { geometryPending: true, authoredAssetState: 'authored' },
    ...overrides.mesh,
  };
  const state = {
    mode: 'flight',
    player: { pos: { x: 0, z: 0 } },
    render: {
      firstPlayableFrameAt: 1,
      activityFrame: { renderGlassIds: new Set([entity.id]) },
    },
    ...overrides.state,
  };
  return { entity, mesh, state };
}

test('retains an authored pending root that is already owed by the readable glass', () => {
  const { entity, mesh, state } = fixture();
  assert.equal(shouldRetainPendingReadableMesh(entity, mesh, scene, state), true);
});

test('pending readable retention releases ordinary, terminal, detached, and dead roots', () => {
  const base = fixture();
  assert.equal(shouldRetainPendingReadableMesh(
    base.entity,
    base.mesh,
    scene,
    { ...base.state, render: { ...base.state.render, activityFrame: { renderGlassIds: new Set() } } },
  ), false, 'an off-glass pending root remains evictable');
  assert.equal(shouldRetainPendingReadableMesh(
    base.entity,
    { ...base.mesh, userData: { geometryPending: true, authoredAssetState: 'loading' } },
    scene,
    base.state,
  ), false, 'a loading/fallback boundary is not retained by the authored rule');
  assert.equal(shouldRetainPendingReadableMesh(base.entity, { ...base.mesh, parent: {} }, scene, base.state), false);
  assert.equal(shouldRetainPendingReadableMesh({ ...base.entity, alive: false }, base.mesh, scene, base.state), false);
});
