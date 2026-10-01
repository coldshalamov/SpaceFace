import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { previewBrakeStop, previewCounterThrust } from '../src/core/flight/propulsionKernel.js';
import { resolveBrakeStopPreview } from '../src/ui/hud.js';

const HUD_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ui', 'hud.js'),
  'utf8',
);

// reactionBrakeLimits(profile): brake = max(reverseAccel 20, mainAccel*1.35) = 54,
// lateral = max(strafeAccel 18, 54*0.85) = 45.9. horizon τ = 0.72.
const PROFILE = { family: 'reaction', mainAccel: 40, assist: { pilotBrakeHorizonS: 0.72 } };
const TAU = 0.72;
const BRAKE_LIMIT = 54;

test('brake held: the stop vector is the kernel brake law carried to its floor', () => {
  // Saturated regime: the proportional ask (60/0.72 = 83.3) exceeds brake authority 54.
  const body = { pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 }, rot: 0, mass: 10 };
  const rec = previewBrakeStop(body, PROFILE, 'assisted');
  assert.equal(rec.speed, 60);
  assert.equal(rec.horizonS, TAU);
  assert.equal(rec.deadSpeed, 0.18);
  // Saturated constant decel to v_sat = 54*0.72 = 38.88, then the proportional tail down to the
  // kernel's deadband — below it the brake stops commanding, so "stop" means crawl, not zero.
  const sat = BRAKE_LIMIT * TAU;
  const expected = (60 * 60 - sat * sat) / (2 * BRAKE_LIMIT) + (sat - 0.18) * TAU;
  assert.ok(Math.abs(rec.stopDistance - expected) < 1e-6,
    `stopDistance ${rec.stopDistance} ≈ two-phase ${expected}`);
  assert.ok(Math.abs(rec.projectedStop.x - expected) < 1e-6);
  assert.ok(Math.abs(rec.projectedStop.z) < 1e-9);
  // The carried accel is verbatim the kernel's brake preview — one owner for the law.
  assert.deepEqual(rec.accel, previewCounterThrust(body, PROFILE, 'assisted'));
  assert.equal(rec.accel.x, -BRAKE_LIMIT, 'the saturated ask clamps to brake authority');
});

test('brake held: below the clamp the settle is the proportional tail to the deadband', () => {
  const body = { pos: { x: 5, z: -3 }, vel: { x: 10, z: 0 }, rot: 0, mass: 10 };
  const rec = previewBrakeStop(body, PROFILE, 'assisted');
  const expected = (10 - 0.18) * TAU;
  assert.ok(Math.abs(rec.stopDistance - expected) < 1e-9, 'unsaturated: d = (v − dead)·τ');
  assert.ok(Math.abs(rec.accel.x - (-10 / TAU)) < 1e-9, 'accel stays proportional');
  assert.ok(Math.abs(rec.projectedStop.x - (5 + expected)) < 1e-9);
});

test('brake held: a lateral drift spends the strafe limit and the settle lands off-axis', () => {
  const body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 30 }, rot: 0, mass: 10 };
  const rec = previewBrakeStop(body, PROFILE, 'assisted');
  // ask = 30/0.72 = 41.67 < strafe 45.9 → unsaturated lateral tail to the deadband.
  assert.ok(Math.abs(rec.stopDistance - (30 - 0.18) * TAU) < 1e-9);
  assert.ok(Math.abs(rec.projectedStop.z - (30 - 0.18) * TAU) < 1e-9);
  assert.ok(Math.abs(rec.projectedStop.x) < 1e-9);
});

test('brake held: at rest the readout is zero and stays at the ship', () => {
  const rec = previewBrakeStop(
    { pos: { x: 7, z: 2 }, vel: { x: 0, z: 0 }, rot: 0, mass: 10 },
    PROFILE,
    'assisted',
  );
  assert.equal(rec.speed, 0);
  assert.equal(rec.stopDistance, 0);
  assert.deepEqual(rec.projectedStop, { x: 7, z: 2 });
  assert.ok(Number.isFinite(rec.accel.x) && Number.isFinite(rec.accel.z), 'fail-closed, no NaN');
});

test('brake held: the answer does not depend on the assist mode (brake is mode-exempt)', () => {
  const body = { pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 }, rot: 0, mass: 10 };
  for (const mode of ['assisted', 'drift', 'newtonian']) {
    const rec = previewBrakeStop(body, PROFILE, mode);
    assert.ok(rec.stopDistance > 0, `${mode} still produces a brake stop`);
    assert.equal(rec.stopDistance, previewBrakeStop(body, PROFILE, 'assisted').stopDistance);
  }
});

test('the HUD model carries the preview while the brake is held and nothing otherwise', () => {
  const player = {
    pos: { x: 0, z: 0 }, vel: { x: 50, z: 0 }, rot: 0, mass: 10,
    _flightFrame: { assistMode: 'drift' },
  };
  const held = resolveBrakeStopPreview(player, PROFILE, { actions: { brake: true } });
  assert.ok(held && held.stopDistance > 0, 'actions.brake carries the record');
  assert.equal(held.horizonS, TAU);
  const heldRaw = resolveBrakeStopPreview(player, PROFILE, { brake: true });
  assert.ok(heldRaw && heldRaw.stopDistance > 0, 'input.brake covers the raw flag too');

  assert.equal(resolveBrakeStopPreview(player, PROFILE, { actions: { brake: false } }), null);
  assert.equal(resolveBrakeStopPreview(player, PROFILE, { actions: {} }), null);
  assert.equal(resolveBrakeStopPreview(player, PROFILE, {}), null);
  assert.equal(resolveBrakeStopPreview(player, PROFILE, null), null);
  assert.equal(resolveBrakeStopPreview(null, PROFILE, { brake: true }), null);
});

test('the tape actually paints the preview: wiring pins', () => {
  assert.match(HUD_SRC, /const brakeStop = resolveBrakeStopPreview\(p, profile, state\.input\)/);
  assert.match(HUD_SRC, /const want = active \|\| nearCeiling \|\| !!brakeStop/);
  assert.match(HUD_SRC, /sf-vtape--stopping/);
  assert.match(HUD_SRC, /BRAKING · SETTLES ~/);
});
