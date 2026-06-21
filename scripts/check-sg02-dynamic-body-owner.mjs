import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  consumePhysicsCommand,
  damageThruster,
  queuePhysicsImpulse,
  queuePhysicsTorqueImpulse,
  readPhysicsTelemetry,
  writePhysicsControl,
} from '../src/core/physicsAuthority.js';
import {
  SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION,
  createSg02DynamicBodyOwner,
} from '../src/core/sg02DynamicBodyOwner.js';

const first = await runScenario();
const second = await runScenario();

assert.deepEqual(second.hash, first.hash, 'SG-02 dynamic owner lab should replay to the same quantized hash');
assert.deepEqual(second.snapshot, first.snapshot, 'SG-02 dynamic owner lab snapshots should be stable');

console.log('SG-02 dynamic body owner checks OK');

async function runScenario() {
  const ship = makeShip();
  const owner = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60, quantum: 1e-5 });

  try {
    owner.syncFromEntities([ship]);
    const initialDiagnostics = owner.diagnostics();
    assert.equal(initialDiagnostics.schemaVersion, SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION, 'diagnostics should be versioned');
    assert.equal(initialDiagnostics.bodies, 1, 'lab should create one Rapier body');
    assert.equal(initialDiagnostics.dynamicBodies, 1, 'ship should be a dynamic body');
    assert.equal(initialDiagnostics.ccdBodies, 1, 'ship should preserve CCD authoring');

    writePhysicsControl(ship, {
      source: 'sg02-dynamic-owner-check',
      mode: 'assisted',
      force: { x: 28, y: 9001, z: -14 },
      torque: { x: 123, y: 88, z: 456 },
      maxSpeed: 3,
    });
    assert.equal(queuePhysicsImpulse(ship, { x: 2, y: 99, z: 0 }), true, 'linear impulse should queue');
    assert.equal(queuePhysicsTorqueImpulse(ship, { x: 4, y: 1, z: 8 }), true, 'yaw torque impulse should queue');

    owner.step(1 / 60);
    assert.equal(consumePhysicsCommand(ship), null, 'dynamic owner should consume commands exactly once');
    assert(ship.pos.x > 0, 'positive force/impulse should move the ship on X');
    assert(ship.vel.x > 0, 'positive force/impulse should produce positive X velocity');
    assert(ship.rot > 0, 'positive yaw torque should rotate the ship');
    assert(Math.hypot(ship.vel.x, ship.vel.z) <= 3 + 1e-9, 'maxSpeed should clamp measured body velocity');

    const firstTelemetry = readPhysicsTelemetry(ship);
    assertTelemetry(firstTelemetry);
    assert.deepEqual(firstTelemetry.force, { x: 28, y: 0, z: -14 }, 'owner should apply force in the XZ plane');
    assert.deepEqual(firstTelemetry.torque, { x: 0, y: 88, z: 0 }, 'owner should apply yaw torque only');
    assert.equal(firstTelemetry.mass, 28, 'telemetry should report authored mass');
    assert.equal(firstTelemetry.inertiaY, 88, 'telemetry should report authored yaw inertia');

    const damaged = damageThruster(ship, 'drive-port', 0.5);
    assert(damaged && damaged.authority.forward < 1, 'fixture should damage a real thruster');
    writePhysicsControl(ship, {
      source: 'sg02-dynamic-owner-check',
      mode: 'assisted',
      force: { x: 0, y: 0, z: 0 },
      torque: { x: 0, y: 0, z: 0 },
      maxSpeed: 3,
    });
    owner.step(1 / 60);
    const damagedTelemetry = readPhysicsTelemetry(ship);
    assertTelemetry(damagedTelemetry);
    assert(damagedTelemetry.authority.forward < firstTelemetry.authority.forward, 'thruster damage should change measured force authority');
    assert(damagedTelemetry.authority.yaw < firstTelemetry.authority.yaw, 'thruster damage should change measured yaw authority');

    for (let i = 0; i < 30; i++) owner.step(1 / 60);
    const finalDiagnostics = owner.diagnostics();
    assert.equal(finalDiagnostics.lockedPlaneBodies, 1, 'body should stay locked to the 2.5D XZ plane');
    assert.equal(finalDiagnostics.tick, 32, 'fixed-step tick count should be deterministic');

    const snapshot = owner.quantizedSnapshot();
    assert.equal(snapshot.length, 1, 'snapshot should include the live body');
    assertFiniteSnapshot(snapshot[0]);
    return { snapshot, hash: hashSnapshot(snapshot) };
  } finally {
    owner.dispose();
  }
}

function makeShip() {
  return {
    id: 47,
    type: 'ship',
    alive: true,
    radius: 12,
    mass: 28,
    flightModel: { inertia: 88 },
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {},
  };
}

function assertTelemetry(value) {
  assert(value, 'telemetry should be published');
  assert.equal(value.dynamic, true, 'telemetry should preserve dynamic body state');
  assert.equal(value.ccd, true, 'telemetry should preserve CCD state');
  for (const field of ['force', 'torque', 'linearAcceleration']) {
    assertVectorFinite(value[field], `telemetry ${field} should be finite`);
  }
  assert(Number.isFinite(value.angularAccelerationY), 'telemetry angular acceleration should be finite');
  assert(Number.isFinite(value.lateralAcceleration), 'telemetry lateral acceleration should be finite');
}

function assertFiniteSnapshot(snapshot) {
  for (const key of ['x', 'z', 'yaw', 'vx', 'vz', 'wy']) {
    assert(Number.isFinite(snapshot[key]), `snapshot ${key} should be finite`);
  }
}

function assertVectorFinite(vector, message) {
  assert(vector, message);
  assert(Number.isFinite(vector.x), message);
  assert(Number.isFinite(vector.y), message);
  assert(Number.isFinite(vector.z), message);
}

function hashSnapshot(snapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}
