// PQ-029.02 — Frame coupler as the tow you can trust.
// Prove-only: the live spring already holds. Seed 29020. No owner retune.
import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { mulberry32 } from '../src/core/rng.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { SHIPS } from '../src/data/ships.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const SEED = 29020;
const DT = 1 / 60;
const HITCH_CRUISE = 95;
const TURN_SPEED = 0.6 * HITCH_CRUISE;
const REST = 80;
const TOW_MASS = 200;
const DIST_SWING_CEILING = 20;
const DRIFTER = SHIPS.find((def) => def.id === 'ship_drifter');
const STANDARD = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');

function makeBody(id, x, z, mass, vx, vz) {
  return {
    id, type: 'ship', alive: true, radius: 6, mass, maxSpeed: 260,
    physicsBody: { schemaVersion: 1, radius: 6, mass, inertiaY: mass * 4, dynamic: true, ccd: true, revision: 0 },
    pos: { x, z }, vel: { x: vx, z: vz }, rot: 0, angVel: 0, data: {},
  };
}

test('PQ-029.02 seed 29020: 200-mass coupler tow holds a 180° at 60% cruise', async () => {
  const rng = mulberry32(SEED);
  rng();
  assert.equal(PRODUCTION_FEATURES.massline2.masslineHeadFrameCoupler, true);
  const policy = effectiveTetherPolicy(STANDARD, {
    data: { derived: { masslineHeadId: 'frame_coupler' } },
  }, PRODUCTION_FEATURES);
  assert.equal(policy.headId, 'frame_coupler');

  const tug = makeBody('tow-tug', 0, 0, DRIFTER.mass, TURN_SPEED, 0);
  const load = makeBody('tow-load', -REST, 0, TOW_MASS, TURN_SPEED, 0);
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([tug, load]);
    const handle = runtime.createAttachment({
      attachmentId: 'coupler-tow-29020', defId: 'tether_standard',
      ownerId: tug.id, targetId: load.id,
      sourceWorld: tug.pos, targetWorld: load.pos,
      restLength: REST, spring: policy.spring, tick: 0,
    });
    assert.ok(handle);

    const turnTicks = 240;
    const omega = Math.PI / (turnTicks * DT);
    const tau = 0.22;
    let heading = 0;
    let minDist = Infinity;
    let maxDist = 0;
    let relSignFlips = 0;
    let prevRelSign = 0;
    for (let tick = 0; tick < turnTicks + 90; tick += 1) {
      if (tick < turnTicks) heading = omega * tick * DT;
      const vx = Math.cos(heading) * TURN_SPEED;
      const vz = Math.sin(heading) * TURN_SPEED;
      writePhysicsControl(tug, {
        source: 'pq-029-02', mode: 'newtonian',
        force: { x: ((vx - tug.vel.x) / tau) * tug.mass, y: 0, z: ((vz - tug.vel.z) / tau) * tug.mass },
        torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      writePhysicsControl(load, {
        source: 'pq-029-02', mode: 'newtonian',
        force: { x: 0, y: 0, z: 0 }, torque: { x: 0, y: 0, z: 0 }, maxSpeed: Infinity,
      });
      runtime.step(DT);
      const dist = Math.hypot(load.pos.x - tug.pos.x, load.pos.z - tug.pos.z);
      minDist = Math.min(minDist, dist);
      maxDist = Math.max(maxDist, dist);
      const telemetry = runtime.getAttachmentTelemetry({ attachmentId: handle.attachmentId });
      const rel = telemetry ? telemetry.relativeSpeed : 0;
      const sign = rel > 0.15 ? 1 : rel < -0.15 ? -1 : 0;
      if (sign !== 0 && prevRelSign !== 0 && sign !== prevRelSign) relSignFlips += 1;
      if (sign !== 0) prevRelSign = sign;
    }

    const distSwing = maxDist - minDist;
    const oscillationAmplitude = distSwing;
    const restError = Math.max(Math.abs(maxDist - REST), Math.abs(minDist - REST));
    const tugHeading = Math.atan2(tug.vel.z, tug.vel.x);
    const comVx = (tug.vel.x * tug.mass + load.vel.x * load.mass) / (tug.mass + load.mass);
    const comVz = (tug.vel.z * tug.mass + load.vel.z * load.mass) / (tug.mass + load.mass);
    const comHeading = Math.atan2(comVz, comVx);
    console.log(JSON.stringify({
      seed: SEED,
      towMass: TOW_MASS,
      commandedVsCruise: TURN_SPEED / HITCH_CRUISE,
      speed: TURN_SPEED,
      distSwing,
      oscillationAmplitude,
      restError,
      minDist,
      maxDist,
      relSignFlips,
      tugHeadingDeg: tugHeading * 180 / Math.PI,
      comHeadingDeg: comHeading * 180 / Math.PI,
    }));
    assert.ok(minDist > REST * 0.7, `hitch must stay taut, min ${minDist.toFixed(1)}`);
    assert.ok(distSwing <= DIST_SWING_CEILING,
      `200-mass 180° tow accordion ${distSwing.toFixed(1)} WU > ${DIST_SWING_CEILING}`);
    assert.ok(Math.abs(tugHeading) > 2, `tug must turn, heading ${((tugHeading * 180) / Math.PI).toFixed(1)}`);
    assert.ok(relSignFlips <= 4, `oscillation sign flips ${relSignFlips}`);
  } finally {
    runtime.dispose();
  }
});
