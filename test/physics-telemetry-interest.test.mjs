import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPhysicsAuthority, hasPhysicsTelemetryRequest, requestPhysicsTelemetry,
  readPhysicsTelemetry, writePhysicsControl,
} from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;
function body(id) {
  return {
    id, occupantGeneration: 0, alive: true, type: 'ship', radius: 6, mass: 24,
    pos: { x: id * 80, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    maxSpeed: 120, flags: {}, data: { defId: 'ship_kestrel' },
    physicsBody: { schemaVersion: 1, radius: 6, mass: 24, inertiaY: 48,
      dynamic: true, ccd: false, revision: 0 },
  };
}

test('telemetry interest stays transient and belongs to the exact live occupant, including generation zero', () => {
  const entity = body(1), before = JSON.stringify(entity);
  assert.equal(hasPhysicsTelemetryRequest(entity), false);
  assert.equal(requestPhysicsTelemetry(entity), true);
  assert.equal(requestPhysicsTelemetry(entity), true, 'repeated admission is idempotent');
  assert.equal(hasPhysicsTelemetryRequest(entity), true);
  assert.equal(JSON.stringify(entity), before, 'no request leaks into the save/entity graph');
  assert.equal(hasPhysicsTelemetryRequest(JSON.parse(before)), false, 'a copied entity is a different owner');
  entity.occupantGeneration = 1;
  assert.equal(hasPhysicsTelemetryRequest(entity), false, 'a recycled object cannot inherit interest');
  assert.equal(requestPhysicsTelemetry(entity), true);
  assert.equal(hasPhysicsTelemetryRequest(entity), true);
  clearPhysicsAuthority(entity);
  assert.equal(hasPhysicsTelemetryRequest(entity), false, 'authority retirement removes the demand');
  entity.alive = false;
  assert.equal(requestPhysicsTelemetry(entity), false);
  assert.equal(hasPhysicsTelemetryRequest(entity), false);
  for (const value of [null, undefined, 0, 'body']) {
    assert.equal(requestPhysicsTelemetry(value), false);
    assert.equal(hasPhysicsTelemetryRequest(value), false);
  }
});

test('native telemetry demand publishes only the admitted body when global diagnostics are disabled', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  const requested = body(1), unrelated = body(2);
  try {
    owner.syncFromEntities([requested, unrelated]);
    owner.step(DT);
    assert.equal(readPhysicsTelemetry(requested), null);
    assert.equal(readPhysicsTelemetry(unrelated), null);
    requestPhysicsTelemetry(requested);
    writePhysicsControl(requested, { mode: 'shutter_surge', force: { x: 48, z: 0 }, maxSpeed: 120 });
    owner.step(DT);
    const first = readPhysicsTelemetry(requested);
    assert.ok(first && first.dynamic, 'the real native owner publishes measured post-step state');
    assert.equal(first.tick, owner.tick);
    assert.equal(first.force.x, 48);
    assert.ok(first.linearAcceleration.x > 0);
    assert.equal(readPhysicsTelemetry(unrelated), null, 'a requested body does not turn on the world');
    owner.step(DT);
    assert.ok(readPhysicsTelemetry(requested).tick > first.tick, 'the one-time request remains fresh');
    requested.occupantGeneration++;
    const retired = readPhysicsTelemetry(requested);
    owner.step(DT);
    assert.equal(readPhysicsTelemetry(requested), retired, 'a new occupant receives no new sample without admission');
    clearPhysicsAuthority(requested);
    owner.step(DT);
    assert.equal(readPhysicsTelemetry(requested), null, 'cleared authority does not republish itself');
    requestPhysicsTelemetry(requested);
    owner.step(DT);
    assert.equal(readPhysicsTelemetry(requested).tick, owner.tick, 'the new lifetime can explicitly subscribe');
  } finally {
    owner.dispose();
    clearPhysicsAuthority(requested); clearPhysicsAuthority(unrelated);
  }
});

test('global diagnostic telemetry keeps its existing publication behavior without requests', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: true, fixedDt: DT });
  const entity = body(1);
  try {
    owner.syncFromEntities([entity]); owner.step(DT);
    assert.equal(hasPhysicsTelemetryRequest(entity), false);
    assert.equal(readPhysicsTelemetry(entity).tick, owner.tick);
  } finally { owner.dispose(); clearPhysicsAuthority(entity); }
});
