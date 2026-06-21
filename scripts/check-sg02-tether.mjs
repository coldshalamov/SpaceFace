import assert from 'node:assert/strict';

import {
  createSg02CombatPhysicsPort,
  createSg02DynamicBodyOwner,
} from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;
const REST = 16;

const ownerShip = makeShip(101, -8);
const targetShip = makeShip(202, 8);
const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
const port = createSg02CombatPhysicsPort(runtime);

try {
  runtime.syncFromEntities([ownerShip, targetShip]);
  const handle = port.createAttachment({
    attachmentId: 'sg02_acceptance_massline',
    defId: 'att_massline',
    ownerId: ownerShip.id,
    targetId: targetShip.id,
    sourceSocketId: 'massline',
    targetSocketId: 'massline',
    sourceWorld: { x: ownerShip.pos.x, y: 0, z: ownerShip.pos.z },
    targetWorld: { x: targetShip.pos.x, y: 0, z: targetShip.pos.z },
    restLength: REST,
    break: { maxTension: 10000, maxImpulse: 10000, stiffness: 160, damping: 8 },
    tick: 0,
  });
  assert(handle && handle.attachmentId === 'sg02_acceptance_massline', 'Massline attachment should return a serializable handle');

  assert.equal(port.applyImpulse({ entityId: ownerShip.id, impulse: { x: -3, y: 999, z: 0 }, reason: 'tether_momentum_check' }), true);
  assert.equal(port.applyImpulse({ entityId: targetShip.id, impulse: { x: 3, y: -999, z: 0 }, reason: 'tether_momentum_check' }), true);

  let maxViolation = 0;
  for (let i = 0; i < 180; i++) {
    runtime.step(DT);
    const telemetry = port.getAttachmentTelemetry({ physicsHandle: handle, tick: i + 1 });
    assert(telemetry, 'active tether should publish telemetry every step');
    maxViolation = Math.max(maxViolation, Math.max(0, telemetry.distance - REST) / REST);
  }

  assert(maxViolation < 0.01, `Massline cable-length violation should stay below 1%; got ${maxViolation}`);
  const momentum = totalMomentum(ownerShip, targetShip);
  assert(Math.hypot(momentum.x, momentum.z) < 0.75, 'isolated tether should conserve paired-body momentum within tolerance');

  const beforeReel = port.getAttachmentTelemetry({ physicsHandle: handle, tick: 181 }).distance;
  assert.equal(port.setAttachmentReel({
    physicsHandle: handle,
    restLength: 10,
    previousRestLength: REST,
    tick: 181,
  }), true, 'Massline reel should update the physical rope rest length');
  for (let i = 0; i < 90; i++) runtime.step(DT);
  const afterReel = port.getAttachmentTelemetry({ physicsHandle: handle, tick: 271 }).distance;
  assert(afterReel < beforeReel, 'Massline reel should reduce anchor distance');

  assert.equal(port.cutAttachment({ physicsHandle: handle, reason: 'acceptance_cut', tick: 272 }), true,
    'Massline cut should remove the physical rope');
  assert.equal(port.getAttachmentTelemetry({ physicsHandle: handle, tick: 273 }), null,
    'cut tether should stop publishing telemetry');
  assert.equal(runtime.diagnostics().attachments, 0, 'runtime should not retain cut rope joints');
} finally {
  runtime.dispose();
}

console.log('SG-02 tether acceptance checks OK');

function makeShip(id, x) {
  return {
    id,
    type: 'ship',
    alive: true,
    radius: 4,
    mass: 24,
    physicsBody: {
      schemaVersion: 1,
      radius: 4,
      mass: 24,
      inertiaY: 64,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {},
  };
}

function totalMomentum(a, b) {
  return {
    x: a.mass * a.vel.x + b.mass * b.vel.x,
    z: a.mass * a.vel.z + b.mass * b.vel.z,
  };
}
