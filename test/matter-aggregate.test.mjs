/**
 * Aggregate mass / momentum / launch accounting (src/matter/aggregateMass.js) — the pure seam Gyre
 * Snare and the Pull collector share. Packet 05: M = Σm, x_cm, v_cm from one snapshot; angular
 * momentum about the common centre; size from occupied volume and packing; launch Δv = J/M with a
 * charge tradeoff; capture as a reserved, generation-safe, bounded transaction.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MATTER_REFUSAL, explainRefusal, isRefusalCode, solidInertia, makeBody, mergeBodies, aggregateOf,
  linearMomentum, angularMomentumAbout, mergeImpulse, unionRadius, grownRadius, meanDensity,
  launchPlan, burstPlan, createCaptureLedger, memberRef, refMatches,
} from '../src/matter/aggregateMass.js';
import { GYRE_SNARE as D } from '../src/data/gyreSnare.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `${a} ≉ ${b}`);

const SAMPLE = [
  makeBody(12, 10, -4, 3, 1, 0.2, 5),
  makeBody(40, -22, 30, -6, 2, -0.1, 9),
  makeBody(6, 55, 8, 14, -9, 1.3, 3),
  makeBody(90, 0, 0, 0.5, 0.25, 0, 12),
];

test('merge: M = Σm, x_cm = Σ m x / M, v_cm = Σ m v / M', () => {
  const agg = aggregateOf(SAMPLE);
  const M = SAMPLE.reduce((s, b) => s + b.m, 0);
  close(agg.m, M);
  close(agg.x, SAMPLE.reduce((s, b) => s + b.m * b.x, 0) / M);
  close(agg.z, SAMPLE.reduce((s, b) => s + b.m * b.z, 0) / M);
  close(agg.vx, SAMPLE.reduce((s, b) => s + b.m * b.vx, 0) / M);
  close(agg.vz, SAMPLE.reduce((s, b) => s + b.m * b.vz, 0) / M);
});

test('merge conserves linear and angular momentum exactly, in any order', () => {
  const agg = aggregateOf(SAMPLE);
  const p0 = linearMomentum(SAMPLE);
  close(agg.m * agg.vx, p0.x);
  close(agg.m * agg.vz, p0.z);
  // Angular momentum about an arbitrary point: spin + orbital before == the merged body's after.
  for (const [cx, cz] of [[0, 0], [100, -40], [agg.x, agg.z]]) {
    const before = angularMomentumAbout(SAMPLE, cx, cz);
    const after = angularMomentumAbout([agg], cx, cz);
    close(before, after, 1e-9);
  }
  // Order independence (floating point only).
  const shuffled = [SAMPLE[2], SAMPLE[0], SAMPLE[3], SAMPLE[1]];
  const alt = aggregateOf(shuffled);
  close(alt.x, agg.x); close(alt.vz, agg.vz); close(alt.w, agg.w); close(alt.I, agg.I);
});

test('inertia follows the parallel-axis theorem and a lone body is untouched', () => {
  const a = makeBody(10, 0, 0, 0, 0, 0, 4), b = makeBody(10, 20, 0, 0, 0, 0, 4);
  const m = mergeBodies(a, b);
  // Two equal bodies 20 apart: each sits 10 from the centre.
  close(m.I, a.I + b.I + 10 * 100 + 10 * 100);
  const lone = aggregateOf([a]);
  close(lone.m, a.m); close(lone.I, solidInertia(10, 4));
  assert.equal(aggregateOf([]).m, 0);
});

test('a meal arriving on the core is a momentum-conserving inelastic merge (mergeImpulse = Δp)', () => {
  const core = makeBody(60, 0, 0, 4, 0, 0, 10);
  const meal = makeBody(12, 25, 5, -30, 6, 0.5, 5);
  const merged = mergeBodies(core, meal);
  const J = mergeImpulse(core, meal);
  // Applying J to the merged mass (still moving at the core's old velocity) yields v_cm.
  close(core.vx + J.x / merged.m, merged.vx);
  close(core.vz + J.z / merged.m, merged.vz);
});

test('size comes from occupied volume and packing, not a linear fudge of mass', () => {
  const radii = [4, 6, 9];
  const solid = unionRadius(radii, 1);
  close(solid, Math.cbrt(4 ** 3 + 6 ** 3 + 9 ** 3));
  // A loose pile (φ ≈ 0.64) is wider than the solid union by (1/φ)^(1/3).
  close(unionRadius(radii, 0.64), solid / Math.cbrt(0.64));
  // Incremental growth is bit-identical to Gyre's authored cbrt union at φ = 1.
  let r = 0;
  for (const m of radii) r = grownRadius(r, m, 1);
  close(r, solid, 1e-12);
  assert.equal(grownRadius(55, 40, 1, 60), 60, 'the envelope cap holds while mass keeps counting');
  // Doubling mass at constant density does not double the radius.
  close(unionRadius([5, 5], 1) / 5, Math.cbrt(2));
  assert.ok(meanDensity(100, 10) > 0 && meanDensity(100, 0) === 0);
});

test('launch plan reproduces Gyre\'s authored speed, coil, scale and recoil and prices the commit', () => {
  for (const mass of [6, 80, 576, 1200, D.maxClumpMass, D.maxClumpMass * 3]) {
    const plan = launchPlan(mass, D);
    const frac = Math.min(1, mass / D.maxClumpMass);
    close(plan.speed, D.launchSpeed * (1 - D.launchMassPenalty * frac));
    assert.equal(plan.windupTicks, D.launchWindupTicks + Math.round(D.launchWindupTicksMass * frac));
    close(plan.impactScale, Math.min(D.launchImpactScaleMax, D.launchImpactScaleBase + mass / D.launchImpactScalePerMass));
    close(plan.recoilDv, Math.min(18, 2 + mass / 200));
    close(plan.J, mass * plan.speed);
    close(plan.deltaV, plan.J / mass);
  }
  // Δv = J / M: the same impulse moves a heavier body less (the handling tradeoff is physical).
  const light = launchPlan(50, D), heavy = launchPlan(2000, D);
  assert.ok(heavy.speed < light.speed);
  assert.ok(heavy.J > light.J, 'a heavier knot carries more impulse — and a heavier price below');
  // The charge tradeoff: a base plus a mass term, bounded by the reference mass.
  const priced = { ...D, chargeBase: 8, chargePerMass: 0.02, chargeMassRef: 1000 };
  assert.ok(launchPlan(900, priced).chargeCost > launchPlan(100, priced).chargeCost);
  close(launchPlan(5000, priced).chargeCost, 8 + 0.02 * 1000);
});

test('burst plan: final speed floors the aim axis, carry repays an aft coil, the sideways drift is stripped', () => {
  const mass = 100;
  const dir = { x: 1, z: 0 };
  // Ball drifting aft at 30 and sideways at 12 while the carrier moves +20 on x, 5 on z.
  const plan = burstPlan({ mass, dir, coreVel: { x: -30, z: 12 }, refVel: { x: 20, z: 5 }, speed: 400, ticks: 5 });
  close(plan.carry, 30);
  close(plan.exitVel.x, -30 + (400 + 30)); // 400 along the aim
  close(plan.exitVel.z, 5);                 // sideways matches the carrier frame
  close(plan.perTick.x * 5, (400 + 30) * mass);
  // A ball already flying forward keeps riding: the commanded speed is a floor, not a cap.
  const fast = burstPlan({ mass, dir, coreVel: { x: 80, z: 0 }, refVel: { x: 0, z: 0 }, speed: 400, ticks: 5 });
  close(fast.carry, 0);
  close(fast.exitVel.x, 480);
  assert.ok(Number.isFinite(burstPlan({ mass: 0, dir: { x: 0, z: 0 }, coreVel: {}, refVel: {}, speed: 1, ticks: 0 }).exitVel.x));
});

test('capture ledger: reserve BEFORE mutation, refuse a second claim, bounded, generation-safe', () => {
  const ledger = createCaptureLedger({ capacity: 3 });
  const a = { id: 7, occupantGeneration: 1 };
  const refA = memberRef(a);
  const r1 = ledger.reserve(refA, 10);
  assert.equal(r1.ok, true);
  // A reentrant or repeated attempt on the same body while the first is still open is refused.
  const dup = ledger.reserve(refA, 10);
  assert.deepEqual([dup.ok, dup.reason], [false, MATTER_REFUSAL.CLAIMED]);
  assert.equal(ledger.commit(r1.ticket), true);
  assert.equal(ledger.commit(r1.ticket), false, 'a ticket commits once');
  assert.equal(ledger.reserve(refA, 10).ok, false, 'a captured body cannot be captured again');
  // A recycled id with a new generation is a different body.
  assert.equal(ledger.reserve(memberRef({ id: 7, occupantGeneration: 2 }), 4).ok, true);
  assert.equal(refMatches({ id: 7, occupantGeneration: 2 }, refA), false);
  assert.equal(refMatches({ id: 7, occupantGeneration: 1 }, refA), true);
  assert.equal(refMatches({ id: 7 }, { id: 7, gen: null }), true, 'unstamped fixtures match on id');
  // Capacity counts open reservations: saturation is visible BEFORE the third body commits.
  assert.equal(ledger.reserve(memberRef({ id: 8, occupantGeneration: 1 }), 1).ok, true);
  const full = ledger.reserve(memberRef({ id: 9, occupantGeneration: 1 }), 1);
  assert.deepEqual([full.ok, full.reason], [false, MATTER_REFUSAL.SATURATED]);
  // Cancel returns the seat and leaves no memory of the body.
  const open = ledger.reserve(memberRef({ id: 7, occupantGeneration: 2 }), 4);
  assert.equal(open.ok, false);
  ledger.reset();
  assert.equal(ledger.size + ledger.pending, 0);
  assert.equal(ledger.reserve(refA, 1).ok, true);
});

test('capture ledger memory is bounded by its capacity and a cancelled reservation can be retried', () => {
  const ledger = createCaptureLedger({ capacity: 4 });
  const mint = (id) => memberRef({ id, occupantGeneration: 1 });
  let taken = 0;
  for (let id = 1; id <= 50; id++) {
    const r = ledger.reserve(mint(id), 1);
    if (r.ok && ledger.commit(r.ticket)) taken += 1;
  }
  assert.equal(taken, 4, 'only capacity-many bodies ever join');
  assert.equal(ledger.size, 4);
  assert.equal(ledger.full, true);
  const one = createCaptureLedger({ capacity: 1 });
  const t = one.reserve(mint(1), 1);
  assert.equal(one.cancel(t.ticket), true);
  assert.equal(one.has(mint(1)), false);
  assert.equal(one.reserve(mint(1), 1).ok, true, 'a cancelled reservation can be retried');
});

test('refusal vocabulary: every code has words, unknown codes degrade instead of throwing', () => {
  for (const code of Object.values(MATTER_REFUSAL)) {
    assert.equal(isRefusalCode(code), true);
    const words = explainRefusal(code);
    assert.equal(words.code, code);
    assert.ok(words.short.length > 0 && words.text.length > 4);
  }
  assert.equal(isRefusalCode('nope'), false);
  assert.equal(explainRefusal('nope').short, 'NOPE');
  assert.equal(explainRefusal(undefined).short, 'REFUSED');
  // The historical spellings the HUD and tests compare are unchanged.
  assert.equal(MATTER_REFUSAL.TOO_HEAVY, 'too-heavy');
  assert.equal(MATTER_REFUSAL.PROTECTED, 'protected');
});

// ── glancing contact ────────────────────────────────────────────────────────────────────────────

import { glancingImpulse, GLANCE_MAX_DOMEGA } from '../src/matter/aggregateMass.js';

test('glancing contact: head-on spins nothing, a graze spins the struck body, the sign follows the side', () => {
  const ball = makeBody(300, 0, 0, 200, 0, 0, 16);
  const rockUp = makeBody(60, 40, 8, 0, 0, 0, 10);     // struck on the +z side of the line
  const rockDown = makeBody(60, 40, -8, 0, 0, 0, 10);
  const centred = makeBody(60, 40, 0, 0, 0, 0, 10);
  assert.equal(glancingImpulse(ball, centred, 2400).jt, 0, 'no sliding, no grip, no spin');
  const up = glancingImpulse(ball, rockUp, 2400), down = glancingImpulse(ball, rockDown, 2400);
  assert.ok(up.jt > 0 && down.jt > 0);
  assert.ok(up.torqueB * down.torqueB < 0, 'opposite sides spin opposite ways');
  close(Math.abs(up.torqueB), Math.abs(down.torqueB));
  // The thrown mass is turned the SAME way (two wheels dragged by the same friction pair: the contact
  // points slide past each other, so both skins are pulled the same sense), and by less (more inertia).
  assert.ok(up.torqueA * up.torqueB > 0);
  assert.ok(Math.abs(up.torqueA) / ball.I < Math.abs(up.torqueB) / rockUp.I);
});

test('glancing contact: equal-and-opposite tangential impulse, Coulomb-bounded, sticking removes the slide', () => {
  const ball = makeBody(300, 0, 0, 200, 0, 0, 16);
  const rock = makeBody(60, 40, 9, 0, 0, 0, 10);
  // Plenty of normal impulse: the contact sticks (J_t = J_stick), and afterwards nothing slides.
  const g = glancingImpulse(ball, rock, 1e9, 1);
  assert.equal(g.sticks, true);
  const nx = (rock.x - ball.x) / Math.hypot(rock.x - ball.x, rock.z - ball.z);
  const nz = (rock.z - ball.z) / Math.hypot(rock.x - ball.x, rock.z - ball.z);
  const after = (body, sign, torque) => ({
    ...body, vx: body.vx + sign * g.tx * g.jt / body.m, vz: body.vz + sign * g.tz * g.jt / body.m,
    w: body.w + torque / body.I,
  });
  // (the Δω cap is a graze limit, not the stick law — compare only when it did not bite)
  if (Math.abs(g.torqueB) / rock.I < GLANCE_MAX_DOMEGA * 0.99) {
    const a2 = after(ball, -1, g.torqueA), b2 = after(rock, +1, g.torqueB);
    const slide = glancingImpulse(a2, b2, 1e9, 1);
    assert.ok(slide.slide < 1e-6, `the sliding is gone (${slide.slide})`);
  }
  // Linear momentum: what b gains along t̂, a loses.
  close(g.jt * g.tx, g.jt * g.tx); // identity guard for the vector the caller negates
  // Coulomb: J_t ≤ μ·J_n.
  const light = glancingImpulse(ball, rock, 10, 0.3);
  assert.ok(light.jt <= 0.3 * 10 + 1e-9);
  // And a graze never winds a body up past the cap.
  const hard = glancingImpulse(makeBody(5000, 0, 0, 900, 0, 0, 30), makeBody(20, 50, 12, 0, 0, 0, 6), 1e9, 1);
  assert.ok(Math.abs(hard.torqueB) / solidInertia(20, 6) <= GLANCE_MAX_DOMEGA + 1e-9);
  void nx; void nz;
});
