import assert from 'node:assert/strict';
import { PROPULSION_PROFILES } from '../../src/core/flight/propulsionCatalog.js';
import { createPropulsionRuntime, stepPropulsion } from '../../src/core/flight/propulsionKernel.js';

export const B1_SENTENCE = 'After leaving the cap at 2× cruise by ANY means (rope release, shove, well fling, bounce), speed 10 s later is ≥ 99 % of the exit speed with hands off, and ≥ 99 % with forward held. Only the brake spends it.';

// Kernel guard: start at the post-impulse boundary. Source delivery is covered by the real-path
// verb scenarios; this check guards the governor common to all four sources in milliseconds.
export function measureEarnedSpeed(step = stepPropulsion) {
  const profile = PROPULSION_PROFILES.drive_reaction_s;
  const dt = 1 / 60;
  return [0, 1].map(throttle => {
    const body = { pos: { x: 0, z: 0 }, vel: { x: 2 * profile.combatSpeed, z: 0 },
      rot: 0, angVel: 0, mass: 18, inertia: 90, radius: 14 };
    const exitSpeed = body.vel.x;
    let runtime = createPropulsionRuntime(profile);
    for (let tick = 0; tick < 600; tick++) {
      const result = step({ dt, body, profile, runtime, input: { throttle, assistMode: 'assisted' } });
      runtime = result.runtime;
      body.vel.x += (result.force.x * dt + (result.impulse?.x || 0)) / body.mass;
      body.vel.z += (result.force.z * dt + (result.impulse?.z || 0)) / body.mass;
      body.pos.x += body.vel.x * dt;
      body.pos.z += body.vel.z * dt;
      body.angVel += result.torque.y / body.inertia * dt;
      body.rot += body.angVel * dt;
    }
    return { throttle, exitSpeed, speedAt10s: Math.hypot(body.vel.x, body.vel.z),
      keptFraction: Math.hypot(body.vel.x, body.vel.z) / exitSpeed };
  });
}

export function assertEarnedSpeed(rows) {
  assert.equal(rows.length, 2, B1_SENTENCE);
  for (const throttle of [0, 1]) {
    const row = rows.find(r => r.throttle === throttle);
    assert.ok(row && Number.isFinite(row.keptFraction) && row.keptFraction >= 0.99,
      `${B1_SENTENCE} throttle=${throttle}; kept=${row?.keptFraction}`);
  }
}
