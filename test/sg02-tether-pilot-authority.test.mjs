import assert from 'node:assert/strict';
import test from 'node:test';

import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

const DT = 1 / 60;

test('a loaded standard tether constrains separation without capping tangent speed or steering the ship', async () => {
  const pilot = makeBody('pilot', -8, {
    mass: 24,
    maxSpeed: 170,
    rot: Math.PI / 2,
    vel: { x: -20, z: 240 },
  });
  const anchor = makeBody('anchor', 8, {
    mass: 240_000,
    maxSpeed: 0,
    dynamic: false,
  });
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });

  try {
    runtime.syncFromEntities([pilot, anchor]);
    const handle = runtime.createAttachment({
      attachmentId: 'pilot-authority-loaded-line',
      defId: 'tether_standard',
      ownerId: pilot.id,
      targetId: anchor.id,
      sourceWorld: pilot.pos,
      targetWorld: anchor.pos,
      restLength: 14,
      tick: 0,
    });
    assert.ok(handle, 'fixture creates the production standard tether');

    const initialYaw = pilot.rot;
    for (let tick = 0; tick < 6; tick++) runtime.step(DT);

    const speed = Math.hypot(pilot.vel.x, pilot.vel.z);
    assert.ok(speed > 200,
      `the radial line force must redirect rather than confiscate speed; got ${speed.toFixed(3)} WU/s`);
    assert.ok(Math.abs(wrapAngle(pilot.rot - initialYaw)) < 0.01,
      `the physical line must not steer the pilot's nose; yaw moved ${wrapAngle(pilot.rot - initialYaw).toFixed(4)} rad`);
  } finally {
    runtime.dispose();
  }
});

test('cutting a parked taut line does not invent launch velocity', async () => {
  const pilot = makeBody('pilot', -8, { mass: 24, maxSpeed: 170 });
  const anchor = makeBody('anchor', 8, { mass: 240_000, dynamic: false });
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });

  try {
    runtime.syncFromEntities([pilot, anchor]);
    const handle = runtime.createAttachment({
      attachmentId: 'parked-cut-line',
      defId: 'tether_standard',
      ownerId: pilot.id,
      targetId: anchor.id,
      sourceWorld: pilot.pos,
      targetWorld: anchor.pos,
      restLength: 14,
      tick: 0,
    });
    assert.ok(handle);

    assert.equal(runtime.cutAttachment({ attachmentId: handle.attachmentId, reason: 'tether_cut' }), true);
    assert.ok(Math.hypot(pilot.vel.x, pilot.vel.z) < 1e-9,
      `an accidental latch/cut must preserve a parked ship; got ${JSON.stringify(pilot.vel)}`);
  } finally {
    runtime.dispose();
  }
});

function makeBody(id, x, options = {}) {
  const mass = options.mass ?? 24;
  const dynamic = options.dynamic !== false;
  return {
    id,
    type: dynamic ? 'ship' : 'station',
    alive: true,
    radius: 4,
    mass,
    maxSpeed: options.maxSpeed ?? 170,
    physicsBody: {
      schemaVersion: 1,
      radius: 4,
      mass,
      inertiaY: 64,
      dynamic,
      ccd: dynamic,
      revision: 0,
    },
    pos: { x, z: 0 },
    vel: { x: options.vel?.x ?? 0, z: options.vel?.z ?? 0 },
    rot: options.rot ?? 0,
    angVel: options.angVel ?? 0,
    data: {},
  };
}

function wrapAngle(value) {
  let angle = value % (Math.PI * 2);
  if (angle <= -Math.PI) angle += Math.PI * 2;
  if (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}
