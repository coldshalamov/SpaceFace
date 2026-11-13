import assert from 'node:assert/strict';
import test from 'node:test';

import { queuePhysicsImpulse, writePhysicsControl } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;

function craft(id, x, isPlayer = false) {
  return {
    id, occupantGeneration: 1, type: 'ship', alive: true, isPlayer,
    radius: 6, mass: 24, maxSpeed: 100, combatSpeed: 100,
    pos: { x, z: 0 }, vel: { x: 15, z: 2 }, rot: 0, angVel: 0,
    flags: {}, data: { defId: 'ship_kestrel' },
    physicsBody: {
      schemaVersion: 1, radius: 6, mass: 24, inertiaY: 48,
      dynamic: true, ccd: true, revision: 0,
    },
  };
}

test('ordinary awake bodies read native translation once per fixed tick', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const entities = Array.from({ length: 96 }, (_, i) => craft(i + 1, i * 100));
    owner.syncFromEntities(entities);
    owner.step(DT);
    let reads = 0;
    for (const rec of owner.dynamicRecords) {
      const translation = rec.body.translation.bind(rec.body);
      rec.body.translation = () => { reads++; return translation(); };
    }
    for (let tick = 0; tick < 8; tick++) {
      owner.syncFromEntities(entities);
      owner.step(DT);
    }
    assert.equal(reads, 96 * 8, 'the plane pass reuses the current post-solve pose');
    assert.ok(entities.every(e => Number.isFinite(e.pos.x) && e.pos.x > (e.id - 1) * 100));
  } finally { owner.dispose(); }
});

test('contact receipts read native body centers only for missing manifold coordinates', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const queue = owner._eventQueue;
  const contactPair = owner.world.contactPair;
  try {
    const entities = [craft(1, 100), craft(2, 200)];
    entities[0].pos.z = 20;
    entities[1].pos.z = 40;
    owner.syncFromEntities(entities);
    const a = owner.records.get(1);
    const b = owner.records.get(2);
    let reads = 0;
    for (const rec of [a, b]) {
      const translation = rec.body.translation.bind(rec.body);
      rec.body.translation = () => { reads++; return translation(); };
    }
    owner._eventQueue = { drainContactForceEvents(receive) {
      receive({ collider1: () => a.colliders[0].handle, collider2: () => b.colliders[0].handle,
        totalForceMagnitude: () => 120, maxForceDirection: () => ({ x: 1, y: 0, z: 0 }) });
    } };
    const capture = points => {
      reads = 0;
      owner.world.contactPair = (_a, _b, receive) => {
        for (const point of points) receive({ numSolverContacts: () => 1, solverContactPoint: () => point });
      };
      return { pos: owner._captureContactImpacts()[0].pos, reads };
    };

    assert.deepEqual(capture([{ x: 110, z: 24 }, { x: 113, z: 26 }]), { pos: { x: 113, z: 26 }, reads: 0 });
    assert.deepEqual(capture([{ x: 118, z: NaN }]), { pos: { x: 118, z: 30 }, reads: 2 });
    assert.deepEqual(capture([]), { pos: { x: 150, z: 30 }, reads: 2 });
  } finally {
    owner._eventQueue = queue;
    owner.world.contactPair = contactPair;
    owner.dispose();
  }
});

test('a merged pair retains closing causality and reads only the last accepted manifold', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  const queue = owner._eventQueue;
  const contactPair = owner.world.contactPair;
  try {
    const player = craft(1, 100, true);
    const other = craft(2, 200);
    player.vel = { x: 0, z: 80 };
    other.vel = { x: -120, z: 60 };
    other.pos.z = 60;
    owner.syncFromEntities([player, other]);
    owner.step(DT);
    const a = owner.records.get(1).colliders[0];
    const b = owner.records.get(2).colliders[0];
    const event = (first, second, force, normal) => ({
      collider1: () => first.handle, collider2: () => second.handle,
      totalForceMagnitude: () => force, maxForceDirection: () => normal,
    });
    owner._eventQueue = { drainContactForceEvents(receive) {
      receive(event(a, b, 120, { x: 1, y: 0, z: 0 }));
      receive(event(b, a, 240, { x: 0, y: 0, z: -1 }));
      receive(event(a, b, 0, { x: 1, y: 0, z: 0 }));
    } };
    const queries = [];
    owner.world.contactPair = (first, second, receive) => {
      queries.push([first.handle, second.handle]);
      receive({ numSolverContacts: () => 1,
        solverContactPoint: () => ({ x: first === b ? 170 : 150, z: 3 }) });
    };
    const [receipt] = owner._captureContactImpacts();
    assert.deepEqual(queries, [[b.handle, a.handle]]);
    assert.equal(receipt.aId, 1);
    assert.equal(receipt.bId, 2);
    assert.equal(receipt.impulse, 6);
    assert.deepEqual(receipt.pos, { x: 170, z: 3 });
    assert.equal(Math.abs(receipt.normal.x), 0);
    assert.equal(receipt.normal.z, 1);
    assert.deepEqual(receipt.preSolveClosingNormal, { x: 1, z: 0 });
    assert.equal(receipt.preSolveClosingSpeed, 120);
    assert.equal(receipt.causalActorId, other.id);
  } finally {
    owner._eventQueue = queue;
    owner.world.contactPair = contactPair;
    owner.dispose();
  }
});

test('batched pose publication matches native rereads through control, teleports, and solver recovery', async () => {
  const owners = await Promise.all([
    createSg02DynamicBodyOwner({ publishTelemetry: false }),
    createSg02DynamicBodyOwner({ publishTelemetry: false }),
  ]);
  try {
    const actors = owners.map(() => [craft(1, 0, true), craft(2, 100), craft(3, 200)]);
    // Reference keeps the old unconditional translation read at publication. Both owners
    // solve the same native world; only reuse versus reread differs.
    const reference = owners[1];
    const enforcePlane = reference._enforcePlane.bind(reference);
    reference._enforcePlane = rec => {
      if (rec.postStep) rec.postStep.pDirty = true;
      return enforcePlane(rec);
    };
    for (let side = 0; side < 2; side++) owners[side].syncFromEntities(actors[side]);
    for (let tick = 0; tick < 60; tick++) {
      for (let side = 0; side < 2; side++) {
        const owner = owners[side], entities = actors[side];
        writePhysicsControl(entities[0], {
          force: { x: tick < 20 ? 24 : -12, z: 8 }, torque: { y: 1 }, maxSpeed: 100,
        });
        if (tick === 10) queuePhysicsImpulse(entities[1], { x: 120, z: -48 });
        if (tick === 20) {
          entities[2].pos.x += 130;
          entities[2].pos.z = 30;
          entities[2].flags.noInterp = true;
        }
        owner.syncFromEntities(entities);
        if (tick === 30) {
          const step = owner.world.step.bind(owner.world);
          owner.world.step = (...args) => {
            step(...args);
            // Impossible solver pose with finite, ordinary velocity exercises pose repair.
            owner.records.get(2).body.setTranslation({ x: 900000, y: 0, z: -800000 }, true);
          };
          owner.step(DT, tick);
          owner.world.step = step;
        } else owner.step(DT, tick);
      }
      assert.deepEqual(owners[0].quantizedSnapshot(), owners[1].quantizedSnapshot(), `tick ${tick}`);
      assert.deepEqual(owners[0].drainContactImpacts(), owners[1].drainContactImpacts(), `contacts at ${tick}`);
    }
    assert.ok(actors[0][1].pos.x < 1000, 'recovery publishes the repaired pose');
  } finally { for (const owner of owners) owner.dispose(); }
});
