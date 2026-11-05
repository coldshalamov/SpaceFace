// inf-gate-departure — the departure gate plays a committed jump.
//
// Player story: leaving through a gate used to be a camera kick and a hull shudder while the
// aperture idled through the whole 1.2 s tunnel. The gate structure itself now answers: the
// aperture swells as the drive bites, the swirl runs hot, and the ring collapses behind the
// departing hull before easing home. These tests pin the pure response curve and the pulse
// gates; the transform application rides the existing portalScale/hubGlow paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GATE_JUMP_WINDOW_S,
  GATE_JUMP_SETTLE_S,
  GATE_JUMP_RADIUS_WU,
  jumpPulseFromCommit,
  gateServesJumpPulse,
  resolveGateJumpResponse,
} from '../src/render/infrastructureMotion.js';

const near = (actual, expected, eps, msg) => {
  assert.ok(Math.abs(actual - expected) <= eps, `${msg}: got ${actual}, want ${expected} ±${eps}`);
};

test('a gate jump commit arms a pulse; a drive jump never does', () => {
  const gate = jumpPulseFromCommit({ via: 'gate', fromPos: { x: 120, z: -40 } });
  assert.ok(gate, 'gate via arms a pulse');
  near(gate.x, 120, 1e-9, 'pulse x');
  near(gate.z, -40, 1e-9, 'pulse z');

  assert.equal(jumpPulseFromCommit({ via: 'drive', fromPos: { x: 1, z: 2 } }), null,
    'a drive jump has no gate to play');
  assert.equal(jumpPulseFromCommit({ via: 'gate', fromPos: { x: NaN, z: 0 } }), null,
    'an off-map exit point cannot arm a pulse');
  assert.equal(jumpPulseFromCommit(null), null, 'a missing payload arms nothing');
});

test('only the departure gate serves the pulse', () => {
  const pulse = { x: 0, z: 0 };
  assert.equal(gateServesJumpPulse(pulse, { x: 100, z: 0 }), true, 'nearby gate plays');
  assert.equal(gateServesJumpPulse(pulse, { x: GATE_JUMP_RADIUS_WU, z: 0 }), true,
    'exactly at the radius still plays');
  assert.equal(gateServesJumpPulse(pulse, { x: GATE_JUMP_RADIUS_WU + 1, z: 0 }), false,
    'a gate beyond the radius keeps its idle cadence');
  assert.equal(gateServesJumpPulse(null, { x: 0, z: 0 }), false, 'no pulse, no response');
  assert.equal(gateServesJumpPulse(pulse, { x: NaN, z: 0 }), false, 'NaN gate pos fails closed');
});

test('the response swells, collapses behind the hull, and settles home', () => {
  const idle = resolveGateJumpResponse(GATE_JUMP_WINDOW_S + GATE_JUMP_SETTLE_S + 0.01);
  near(idle.scaleMul, 1, 1e-9, 'after the window the aperture is idle');
  near(idle.swirlMul, 1, 1e-9, 'after the window the swirl is idle');

  // Swell: aperture opens through the first fifth and peaks mid-tunnel above its base.
  const early = resolveGateJumpResponse(0.12);
  const peak = resolveGateJumpResponse(GATE_JUMP_WINDOW_S * 0.42);
  assert.ok(early.scaleMul > 1, `swell lifts the aperture early (${early.scaleMul})`);
  assert.ok(peak.scaleMul > 1.1, `mid-tunnel aperture peaks hot (${peak.scaleMul})`);
  assert.ok(peak.swirlMul > 3, `mid-tunnel swirl runs hot (${peak.swirlMul})`);
  assert.ok(peak.glowMul > 1.2, `mid-tunnel hub glow swells (${peak.glowMul})`);

  // Collapse: by the end of the tunnel the ring has run closed behind the hull.
  const end = resolveGateJumpResponse(GATE_JUMP_WINDOW_S);
  assert.ok(end.scaleMul < 0.8, `the aperture collapses behind the hull (${end.scaleMul})`);
  assert.ok(end.swirlMul < 1.2, `the swirl eases home as the tunnel closes (${end.swirlMul})`);
  assert.ok(end.scaleMul > 0.3, `the collapse bottoms, it does not vanish (${end.scaleMul})`);

  // Settle: the rebound climbs back toward idle without ever going negative or past hot.
  const midSettle = resolveGateJumpResponse(GATE_JUMP_WINDOW_S + GATE_JUMP_SETTLE_S * 0.5);
  assert.ok(midSettle.scaleMul > end.scaleMul, `the aperture rebounds (${midSettle.scaleMul})`);
  assert.ok(midSettle.scaleMul < 1, 'the rebound has not overshot idle');

  // Continuity: the tunnel-to-settle handoff does not jump.
  const handoffA = resolveGateJumpResponse(GATE_JUMP_WINDOW_S - 1e-6);
  const handoffB = resolveGateJumpResponse(GATE_JUMP_WINDOW_S + 1e-6);
  near(handoffA.scaleMul, handoffB.scaleMul, 0.02, 'tunnel-to-settle handoff is continuous');

  // Shape: scale stays inside a sane band the whole window, and swirl never dips under idle.
  for (let i = 0; i <= 60; i++) {
    const resp = resolveGateJumpResponse((i / 60) * (GATE_JUMP_WINDOW_S + GATE_JUMP_SETTLE_S));
    assert.ok(resp.scaleMul > 0.3 && resp.scaleMul < 1.3,
      `scale in band at t=${(i / 60).toFixed(2)} (${resp.scaleMul})`);
    assert.ok(resp.swirlMul >= 1 - 1e-9, `swirl never below idle at t=${(i / 60).toFixed(2)}`);
    assert.ok(resp.glowMul >= 1 - 1e-9, `glow never below idle at t=${(i / 60).toFixed(2)}`);
  }
});

test('reduced motion halves the travel and keeps the phases readable, never silent', () => {
  const full = resolveGateJumpResponse(GATE_JUMP_WINDOW_S * 0.42);
  const reduced = resolveGateJumpResponse(GATE_JUMP_WINDOW_S * 0.42, true);
  assert.ok(reduced.scaleMul > 1 && reduced.scaleMul < full.scaleMul,
    `reduced swell is a stretched, smaller lift (${reduced.scaleMul} vs ${full.scaleMul})`);
  assert.ok(reduced.swirlMul > 1.5, `reduced swirl still reads hot (${reduced.swirlMul})`);
  assert.ok(reduced.glowMul > 1 && reduced.glowMul < full.glowMul, 'reduced glow still lifts');

  const reducedEnd = resolveGateJumpResponse(GATE_JUMP_WINDOW_S, true);
  const fullEnd = resolveGateJumpResponse(GATE_JUMP_WINDOW_S);
  assert.ok(reducedEnd.scaleMul < 1 && reducedEnd.scaleMul > fullEnd.scaleMul,
    `reduced collapse still closes behind the hull (${reducedEnd.scaleMul} vs ${fullEnd.scaleMul})`);
});

test('hostile elapsed values fail closed to idle', () => {
  for (const bad of [NaN, -1, undefined, null, 'nonsense']) {
    const resp = resolveGateJumpResponse(bad);
    near(resp.scaleMul, 1, 1e-9, `idle scale for ${String(bad)}`);
    near(resp.swirlMul, 1, 1e-9, `idle swirl for ${String(bad)}`);
    near(resp.glowMul, 1, 1e-9, `idle glow for ${String(bad)}`);
  }
});
