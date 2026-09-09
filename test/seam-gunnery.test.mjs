import assert from 'node:assert/strict';
import test from 'node:test';

import { hasBallisticWeapon, leadSolution, primaryProjSpeed } from '../src/ai/gunnery.js';
import { solveLeadAngle } from '../src/systems/weapons.js';

function gunship(id, x, z, vel = { x: 0, z: 0 }) {
  return {
    id, type: 'ship', alive: true,
    pos: { x, z }, vel: { ...vel },
    data: { weapons: [{ defId: 'wpn_pulse_laser_s' }] },
  };
}

test('the HUD lead pip uses the same ballistic solver the fire path uses', () => {
  const shooter = gunship(1, 0, 0);
  const target = gunship(2, 120, 0, { x: 0, z: 40 });
  const speed = primaryProjSpeed(shooter);
  assert.equal(hasBallisticWeapon(shooter), true);
  assert.equal(speed, 320);

  const pip = leadSolution(shooter, target, speed);
  const simAngle = solveLeadAngle(shooter, { pos: target.pos, vel: target.vel }, speed);
  assert.equal(pip.valid, true);
  assert.equal(pip.angle, simAngle, 'a second solver would make the pip lie');
  assert.ok(pip.angle > 0, 'a +Z target velocity must lead the pip off the current bearing');
  const currentBearing = Math.atan2(target.pos.z - shooter.pos.z, target.pos.x - shooter.pos.x);
  assert.notEqual(pip.angle, currentBearing);
});

test('a co-located or beam-only shooter has no meaningful pip', () => {
  const shooter = gunship(1, 0, 0);
  const stacked = gunship(2, 0, 0);
  const pip = leadSolution(shooter, stacked, 320);
  assert.equal(pip.valid, false);

  const beam = {
    id: 3, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { weapons: [{ defId: 'wpn_beam_laser_m' }] },
  };
  assert.equal(hasBallisticWeapon(beam), false);
});
