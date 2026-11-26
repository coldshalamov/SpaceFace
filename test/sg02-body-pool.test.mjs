import assert from 'node:assert/strict';
import test from 'node:test';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;

// Spec-keyed retired-body pool + per-sync WASM mint/remove budgets. The pool keeps kill-wave
// retire/mint pairs off Rapier's createRigidBody/createCollider path; the budgets bound the
// WASM work that cannot be pooled, deferring the rest to later sync passes.

function debris(id, { type = 'wreck', shape = 'ball', material = 'debris', mass = 24, radius = 5, x = 0, z = 0 } = {}) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    radius,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    flags: {},
    data: {},
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: mass * radius * radius,
      shape,
      dynamic: true,
      ccd: false,
      material,
      revision: 0,
    },
  };
}

function pooledCount(owner) {
  return [...owner._retiredBodyPool.values()].flat().length;
}

test('a retired debris body is disabled, pooled, and reused by a same-contract mint', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const a = debris(1, { x: 100 }), b = debris(2, { x: 300 });
    owner.syncFromEntities([a, b]);
    const bodyA = owner.records.get(1).body;
    a.alive = false;
    owner.syncFromEntities([b]);
    assert.equal(pooledCount(owner), 1, 'the dead wreck retired into the pool instead of freeing');
    assert.equal(owner.world.getRigidBody(bodyA.handle), bodyA, 'the WASM body still exists');
    assert.equal(bodyA.isEnabled(), false, 'a pooled body is disabled — no broad phase, no solver');
    const c = debris(3, { x: 900 });
    owner.syncFromEntities([b, c]);
    assert.equal(owner.records.get(3).body, bodyA, 'a same-contract mint reused the retired body');
    assert.equal(bodyA.isEnabled(), true, 'the reused body is enabled again');
    assert.equal(pooledCount(owner), 0, 'the pool bucket drained');
    owner.step(DT);
    assert.equal(owner.records.get(3).body.isValid(), true, 'the reused body steps normally');
  } finally { owner.dispose(); }
});

test('a different collider contract never reuses a pooled body', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const a = debris(1, { x: 100, radius: 5 });
    owner.syncFromEntities([a]);
    const bodyA = owner.records.get(1).body;
    a.alive = false;
    owner.syncFromEntities([]);
    assert.equal(pooledCount(owner), 1);
    // Same shape family but a different material contract lands in a different bucket.
    const c = debris(3, { x: 900, radius: 5, material: 'rock' });
    owner.syncFromEntities([c]);
    assert.notEqual(owner.records.get(3).body, bodyA, 'rock must not reuse the debris body');
    assert.equal(pooledCount(owner), 1, 'the debris body stays pooled');
  } finally { owner.dispose(); }
});

test('budgeted layered sync defers excess mints and retries them on later passes', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const entities = [];
    for (let i = 0; i < 20; i++) entities.push(debris(i + 1, { x: 200 + i * 60 }));
    owner.syncFromEntityLayers([], entities, 1, null);
    assert.equal(owner.records.size, 12, 'SG02_SYNC_NATIVE_MINT_BUDGET caps fresh WASM mints at 12 per pass');
    const pending = entities[15];
    assert.equal(owner.records.has(pending.id), false, 'the 16th mint is deferred, not dropped');
    owner.syncFromEntityLayers([], entities, 1, null);
    assert.equal(owner.records.size, 20, 'the deferred mints drain on the next pass');
  } finally { owner.dispose(); }
});

test('an impulse aimed at a deferred mint parks on the entity queue and lands on arrival', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT });
  try {
    const entities = [];
    for (let i = 0; i < 20; i++) entities.push(debris(i + 1, { x: 200 + i * 60 }));
    owner.syncFromEntityLayers([], entities, 1, null);
    const pending = entities[15];
    assert.equal(owner.records.has(pending.id), false);
    // Before the budget fix this returned false and the hit was lost forever; now it rides
    // the entity's own command queue and applies the first step after the body lands.
    assert.equal(owner.applyImpulse({ entityId: pending.id, impulse: { x: 120, z: 0 } }), true);
    let passes = 0;
    while (!owner.records.has(pending.id) && passes++ < 4) {
      owner.syncFromEntityLayers([], entities, 1, null);
    }
    assert.equal(owner.records.has(pending.id), true);
    owner.step(DT);
    assert.ok(pending.vel.x > 0.1, `the parked impulse moved the body once minted (vel.x=${pending.vel.x})`);
  } finally { owner.dispose(); }
});
