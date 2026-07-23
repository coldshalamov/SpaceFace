import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearPhysicsAuthority,
  ensurePhysicsBodySpec,
  measureThrusterAuthority,
  resolvePhysicsBodySpec,
  syncDerivedPhysicsMass,
} from '../src/core/physicsAuthority.js';

function ship(overrides = {}) {
  return {
    id: 1,
    type: 'ship',
    radius: 8,
    mass: 20,
    ...overrides,
  };
}

test('normalized physics bodies and resolved specs are identity-stable while unchanged', () => {
  const entity = ship();
  const body = ensurePhysicsBodySpec(entity);
  assert.equal(ensurePhysicsBodySpec(entity), body,
    'hot-path normalization must not replace an already-normalized body');

  const resolved = resolvePhysicsBodySpec(entity);
  assert.equal(resolvePhysicsBodySpec(entity), resolved,
    'physics synchronization must reuse an unchanged resolved spec');

  const authority = measureThrusterAuthority(entity);
  assert.equal(measureThrusterAuthority(entity), authority,
    'unchanged body identity and revision must preserve measured thruster authority');
});

test('body replacement and revision changes invalidate only the affected caches', () => {
  const entity = ship();
  const firstBody = ensurePhysicsBodySpec(entity);
  const firstResolved = resolvePhysicsBodySpec(entity);

  entity.physicsBody = { ...firstBody, radius: 12, revision: firstBody.revision + 1 };
  const replacement = ensurePhysicsBodySpec(entity);
  assert.notEqual(replacement, firstBody);
  assert.equal(replacement.radius, 12);
  assert.notEqual(resolvePhysicsBodySpec(entity), firstResolved);

  const beforeMassSync = resolvePhysicsBodySpec(entity);
  assert.equal(syncDerivedPhysicsMass(entity, 30, 900), replacement,
    'derived mass updates preserve the normalized authoring record');
  const afterMassSync = resolvePhysicsBodySpec(entity);
  assert.notEqual(afterMassSync, beforeMassSync,
    'revision changes must invalidate the resolved physics spec');
  assert.equal(afterMassSync.mass, 30);
  assert.equal(afterMassSync.inertiaY, 900);

  clearPhysicsAuthority(entity);
  assert.notEqual(ensurePhysicsBodySpec(entity), replacement,
    'explicit authority cleanup must invalidate normalization identity');
});
