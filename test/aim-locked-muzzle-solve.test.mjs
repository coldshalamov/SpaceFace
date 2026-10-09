import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { launchVelocity, refineLeadForLaunch, solveLeadAngle, weapons } from '../src/systems/weapons.js';

// Straight round vs constant-velocity target: exact closest approach of the relative motion.
function closestApproach(origin, angle, projSpeed, shooterVel, target) {
  const u = launchVelocity(angle, projSpeed, shooterVel);
  const rx = origin.x - target.pos.x, rz = origin.z - target.pos.z;
  const vx = u.x - target.vel.x, vz = u.z - target.vel.z;
  const v2 = vx * vx + vz * vz;
  const t = v2 > 1e-12 ? Math.max(0, -(rx * vx + rz * vz) / v2) : 0;
  return Math.hypot(rx + vx * t, rz + vz * t);
}

test('launch refinement is a no-op where the relative lead is already exact', () => {
  const origin = { x: 3, z: -2 };
  const shooterVel = { x: 60, z: 40 };           // lateral speed well under projSpeed
  const target = { pos: { x: 180, z: 70 }, vel: { x: -30, z: 55 } };
  const plain = solveLeadAngle({ pos: origin, vel: shooterVel }, target, 320);
  const refined = refineLeadForLaunch(plain, 320, shooterVel, target, () => origin);
  assert.ok(Math.abs(plain - refined) < 1e-6, `refinement moved an exact solve: ${plain} -> ${refined}`);
  assert.ok(closestApproach(origin, refined, 320, shooterVel, target) < 1e-3);
});

test('a hull sliding faster than its own rounds still lands the solve (boost, dash)', () => {
  const origin = { x: 0, z: 0 };
  const shooterVel = { x: 0, z: 400 };           // lateral to the shot, above projSpeed 320
  const target = { pos: { x: 200, z: 20 }, vel: { x: 10, z: -40 } };
  const plain = solveLeadAngle({ pos: origin, vel: shooterVel }, target, 320);
  const refined = refineLeadForLaunch(plain, 320, shooterVel, target, () => origin);
  const plainMiss = closestApproach(origin, plain, 320, shooterVel, target);
  const refinedMiss = closestApproach(origin, refined, 320, shooterVel, target);
  assert.ok(plainMiss > 5, `the relative-frame solve should miss once compensation saturates, got ${plainMiss}`);
  assert.ok(refinedMiss < 1e-3, `the launch-model solve must meet the target, got ${refinedMiss}`);
});

test('the mount solve leads from the real muzzle, not the hull centre', () => {
  const sys = Object.create(weapons);
  const muzzleOffset = { x: 0, z: 9 };            // an off-axis wing mount
  sys._muzzle = (e) => ({ x: e.pos.x + muzzleOffset.x, z: e.pos.z + muzzleOffset.z, y: 0 });
  const shooter = { pos: { x: 0, z: 0 }, vel: { x: 120, z: 0 }, rot: 0 };
  const target = { pos: { x: 160, z: 0 }, vel: { x: 0, z: 70 } };
  const angle = sys._arcadeMountAngle(shooter, {}, target, 320);
  const centreAngle = solveLeadAngle(shooter, target, 320);
  const origin = sys._muzzle(shooter);
  const muzzleMiss = closestApproach(origin, angle, 320, shooter.vel, target);
  const centreMiss = closestApproach(origin, centreAngle, 320, shooter.vel, target);
  assert.ok(muzzleMiss < 1e-3, `muzzle solve should meet the target, got ${muzzleMiss}`);
  assert.ok(centreMiss > 5, `hull-centre lead from an off-axis mount misses by the offset, got ${centreMiss}`);
});

test('locked player shots use the mount solve; NPC locked shots keep the hull-centre lead', () => {
  const source = readFileSync(new URL('../src/systems/weapons.js', import.meta.url), 'utf8');
  assert.match(source,
    /if \(!mountGate && forceTarget && forceTarget\.pos\) \{[\s\S]*?fixedAim = isPlayer\s*\? this\._arcadeMountAngle\(e, w, forceTarget, mountProjSpeed\)\s*: this\._leadAngle\(e, forceTarget, mountProjSpeed\);/);
});

test('rounds fly straight: the bullet launch has no target input', () => {
  // Homing would need the target; the launch model takes only angle, speed and shooter velocity.
  assert.equal(launchVelocity.length, 3);
  const a = launchVelocity(0.4, 320, { x: 10, z: 0 });
  assert.ok(Math.abs(Math.atan2(a.z, a.x) - 0.4) < 1e-12, 'aim-true: the round travels along the aim line');
});
