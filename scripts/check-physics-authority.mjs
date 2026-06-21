import assert from 'node:assert/strict';

import {
  PHYSICS_BODY_SCHEMA_VERSION,
  PHYSICS_COMMAND_SCHEMA_VERSION,
  PHYSICS_TELEMETRY_SCHEMA_VERSION,
  clearPhysicsAuthority,
  consumePhysicsCommand,
  damageThruster,
  ensurePhysicsBodySpec,
  measureThrusterAuthority,
  queuePhysicsImpulse,
  queuePhysicsTorqueImpulse,
  readPhysicsTelemetry,
  resolvePhysicsBodySpec,
  setThrusterHealth,
  writePhysicsControl,
  writePhysicsTelemetry,
} from '../src/core/physicsAuthority.js';

const ship = {
  id: 17,
  type: 'ship',
  radius: 12,
  mass: 28,
  flightModel: { inertia: 88 },
  data: {},
};

const body = ensurePhysicsBodySpec(ship);
assert.equal(body.schemaVersion, PHYSICS_BODY_SCHEMA_VERSION, 'body spec should be versioned');
assert.equal(body.dynamic, true, 'ship body spec should default to dynamic');
assert.equal(body.ccd, true, 'ship body spec should default to CCD');
assert.equal(body.mass, 28, 'body spec should derive mass from entity');
assert.equal(body.inertiaY, 88, 'body spec should preserve authored inertia');
assert.equal(body.attachmentPoints.massline.x, 0, 'body spec should expose a default Massline socket');
assert.equal(body.thrusters.length, 4, 'ship body spec should derive default thruster authority set');

const resolved = resolvePhysicsBodySpec(ship);
assert.deepEqual(Object.keys(resolved).sort(), [
  'attachmentPoints',
  'ccd',
  'centerOfMass',
  'dynamic',
  'inertiaY',
  'mass',
  'material',
  'radius',
  'revision',
  'schemaVersion',
], 'resolved body spec should expose only save-safe physics authoring fields');

const fullAuthority = measureThrusterAuthority(ship);
assert.deepEqual(fullAuthority, { forward: 1, reverse: 1, strafe: 1, yaw: 1 }, 'undamaged default thrusters should have full authority');

const damaged = damageThruster(ship, 'drive-port', 0.5);
assert.equal(damaged.id, 'drive-port', 'damage should target the requested thruster');
assert.equal(damaged.health, 0.5, 'damage should reduce thruster health');
assertApprox(damaged.authority.forward, 2.2 / 2.7, 'forward authority should reflect thruster damage');
assertApprox(damaged.authority.reverse, 2.3 / 2.7, 'reverse authority should reflect thruster damage');
assertApprox(damaged.authority.strafe, 2.675 / 2.9, 'strafe authority should reflect thruster damage');
assertApprox(damaged.authority.yaw, 3.2 / 3.6, 'yaw authority should reflect thruster damage');

const restored = setThrusterHealth(ship, 'drive-port', 1);
assert.deepEqual(restored.authority, { forward: 1, reverse: 1, strafe: 1, yaw: 1 }, 'restoring thruster health should restore authority');
assert.equal(setThrusterHealth(ship, 'missing-thruster', 0.25), null, 'unknown thruster ids should reject cleanly');

const control = writePhysicsControl(ship, {
  mode: 'assisted',
  source: 'check',
  force: { x: 10, y: Number.NaN, z: -5 },
  torque: { x: 0, y: 3, z: undefined },
  authority: { forward: 2, reverse: -1, strafe: 0.5, yaw: 0.25 },
  maxSpeed: 240,
});
assert.equal(control.schemaVersion, PHYSICS_COMMAND_SCHEMA_VERSION, 'control command should be versioned');
assert.deepEqual(control.force, { x: 10, y: 0, z: -5 }, 'control force should sanitize to finite vectors');
assert.deepEqual(control.torque, { x: 0, y: 3, z: 0 }, 'control torque should sanitize to finite vectors');
assert.deepEqual(control.authority, { forward: 1, reverse: 0, strafe: 0.5, yaw: 0.25 }, 'authority should clamp to [0,1]');
assert.equal(control.maxSpeed, 240, 'control maxSpeed should preserve positive finite values');

assert.equal(queuePhysicsImpulse(ship, { x: 4, y: 1, z: -2 }), true, 'linear impulse should queue');
assert.equal(queuePhysicsTorqueImpulse(ship, { x: 0, y: 7, z: 0 }), true, 'torque impulse should queue');
const consumed = consumePhysicsCommand(ship);
assert.equal(consumed.schemaVersion, PHYSICS_COMMAND_SCHEMA_VERSION, 'command batch should be versioned');
assert.equal(consumed.control.source, 'check', 'consume should include latest control command');
assert.deepEqual(consumed.impulses, [{ x: 4, y: 1, z: -2 }], 'consume should include queued linear impulses');
assert.deepEqual(consumed.torqueImpulses, [{ x: 0, y: 7, z: 0 }], 'consume should include queued torque impulses');
assert.equal(consumePhysicsCommand(ship), null, 'commands should be consumed atomically once');

const telemetry = writePhysicsTelemetry(ship, {
  tick: 123.9,
  bodyHandle: 42,
  dynamic: true,
  ccd: true,
  mass: 28,
  inertiaY: 88,
  force: { x: 1, y: 2, z: 3 },
  torque: { x: 0, y: 4, z: 0 },
  linearAcceleration: { x: 0.1, y: 0, z: -0.2 },
  angularAccelerationY: 0.3,
  lateralAcceleration: -0.4,
  authority: { forward: 0.9, reverse: 0.8, strafe: 0.7, yaw: 0.6 },
  mode: 'assisted',
});
assert.equal(telemetry.schemaVersion, PHYSICS_TELEMETRY_SCHEMA_VERSION, 'telemetry should be versioned');
assert.equal(telemetry.tick, 123, 'telemetry tick should be deterministic integer state');
assert.equal(readPhysicsTelemetry(ship), telemetry, 'telemetry read should return last measured state');
assert(Object.isFrozen(telemetry), 'telemetry object should be immutable to readers');

clearPhysicsAuthority(ship);
assert.equal(readPhysicsTelemetry(ship), null, 'clear should drop telemetry');
assert.equal(consumePhysicsCommand(ship), null, 'clear should drop queued commands');

assert.equal(writePhysicsControl(null, {}), null, 'null entities should not create commands');
assert.equal(queuePhysicsImpulse(null, {}), false, 'null entities should reject impulses');
assert.equal(writePhysicsTelemetry(null, {}), null, 'null entities should not create telemetry');

console.log('Physics authority membrane checks OK');

function assertApprox(actual, expected, message) {
  assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}
