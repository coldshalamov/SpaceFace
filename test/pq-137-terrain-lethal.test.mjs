// PQ-137.06 / PQ-137.07 — the SIM HALVES of "terrain is lethal" and "the rope is a rope",
// asserted at the law level so the bars survive refactors of the route around them.
//
// Bar B6 (design/FEEL_CONTRACT.md §B): "A light hostile meeting rock at >= 50 % of cruise loses
// >= 60 % of hull and its helm; at >= 75 % of cruise it dies. A heavy at the same speed loses
// <= 15 % and keeps its helm." The damage input is the PRE-SOLVE closing speed; the solver's
// per-contact bound (sg02DynamicBodyOwner MAX_CONTACT_DV) is a rate limit on the solver, never
// the damage input. The real-path proof lives in test/terrain-damage-law.test.mjs /
// test/terrain-slam.test.mjs (scenario feel.terrain_slam, seed 4242).
//
// Bar B7: "Swinging at 1.5x cruise on a 100 WU line around a heavy anchor stretches the line
// < 10 % and does not break; releasing at the tangent keeps >= 95 % of tangential speed 5 s
// later" — and the line breaks by its LOAD RATING, never by how far it is stretched. The
// real-path proof lives in test/rope-swing-release.test.mjs (feel.rope_swing_release, seed 4242).
//
// Both halves here are deterministic by construction: the kernel law is a pure function of its
// inputs and the swing fixture starts from a fixed initial condition — no Math.random anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COLLISION_CONSEQUENCE_LIMITS,
  TERRAIN_CRUMPLE_LAW,
  resolveCollisionConsequence,
} from '../src/combat/impulseKernel.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { getPropulsionProfile } from '../src/core/flight/propulsionCatalog.js';

// Roster + governed-cruise references, LIVE from the propulsion catalog so the bar's
// "% of cruise" phrasing always tracks the real governed number:
// Wasp (drive_reaction_s) mass 16 / hull 150; starter Hitch (drive_reaction_m) mass 18,
// governed cruise 195; Atlas (drive_reaction_l) mass 200 / hull 720.
const WASP_MASS = 16;
const WASP_HULL = 150;
const ATLAS_MASS = 200;
const ATLAS_HULL = 720;
const LIGHT_CRUISE = getPropulsionProfile('drive_reaction_s').combatSpeed;
const STARTER_MASS = 18;
const STARTER_CRUISE = getPropulsionProfile('drive_reaction_m').combatSpeed;

const wasp = { type: 'ship', id: 'wasp', mass: WASP_MASS };
const atlas = { type: 'ship', id: 'atlas', mass: ATLAS_MASS };
const rock = { type: 'asteroid', id: 'rock', mass: 1e9 };

function slam(closingSpeed, victim = wasp, exchangedMomentum = victim.mass * 40) {
  return resolveCollisionConsequence({
    target: victim,
    other: rock,
    exchangedMomentum,
    preSolveClosingSpeed: closingSpeed,
    tick: 100,
    pos: { x: 0, z: 0 },
    normal: { x: 1, z: 0 },
  });
}

test('B6 damage half: the crumple law prints the bar numbers', () => {
  assert.equal(TERRAIN_CRUMPLE_LAW.threshold, 30, 'the crumple threshold stays ~30 WU/s');

  // Light at 50 % of its live cruise, and at 75 %; the heavy meets the light 75 % ABSOLUTE speed.
  const closing50 = LIGHT_CRUISE * 0.5;
  const closing75 = LIGHT_CRUISE * 0.75;
  const half = slam(closing50);
  const halfHullFraction = half.impactDamage / WASP_HULL;
  console.log(`B6 light @50% cruise (cruise ${LIGHT_CRUISE}): closing ${closing50} WU/s -> damage ${half.impactDamage.toFixed(2)} = ${(halfHullFraction * 100).toFixed(1)}% of a ${WASP_HULL} hull (bar >= 60%)`);
  assert.ok(
    halfHullFraction >= 0.6,
    `A light hostile at 50 % of cruise must lose >= 60 % of hull (got ${(halfHullFraction * 100).toFixed(1)} %)`,
  );

  // Light at 75 % of cruise: the packet is lethal against the full hull.
  const death = slam(closing75);
  console.log(`B6 light @75% cruise: closing ${closing75} WU/s -> damage ${death.impactDamage.toFixed(2)} >= hull ${WASP_HULL} (dies: ${death.impactDamage >= WASP_HULL})`);
  assert.ok(
    death.impactDamage >= WASP_HULL,
    `A light hostile at 75 % of cruise must take a lethal packet (got ${death.impactDamage.toFixed(2)} vs hull ${WASP_HULL})`,
  );

  const heavy = slam(closing75, atlas, ATLAS_MASS * 40);
  const heavyHullFraction = heavy.impactDamage / ATLAS_HULL;
  console.log(`B6 heavy @same speed: closing ${closing75} WU/s -> damage ${heavy.impactDamage.toFixed(2)} = ${(heavyHullFraction * 100).toFixed(2)}% of a ${ATLAS_HULL} hull (bar <= 15%)`);
  assert.ok(
    heavyHullFraction <= 0.15,
    `A heavy at the same speed must lose <= 15 % of hull (got ${(heavyHullFraction * 100).toFixed(2)} %)`,
  );
});

test('B6 rate limit: the solver bound is never the damage input — the pre-solve closing speed is', () => {
  // Two contacts whose exchanged momentum brackets the solver's mass x MAX_CONTACT_DV bound by
  // 100x deliver the IDENTICAL damage: the bound caps the solver, not the consequence.
  const bounded = slam(LIGHT_CRUISE * 0.5, wasp, WASP_MASS * 40);
  const unbounded = slam(LIGHT_CRUISE * 0.5, wasp, WASP_MASS * 4000);
  assert.equal(bounded.impactDamage, unbounded.impactDamage,
    'damage must not move when the (bounded) exchanged momentum moves — only closing speed is the input');
  assert.equal(bounded.deltaV, 40, 'the receipt deltaV stays the solver rate limit (mass x 40)');
  assert.equal(bounded.feelDeltaV, LIGHT_CRUISE * 0.5, 'the receipt carries the pre-solve closing speed for feel, not damage');

  // With the bound HELD FIXED, damage still rises with the real closing speed — proving the
  // pre-solve speed is the live input the old capped-dV path erased. (Absolute speeds chosen
  // below the mass-aware damage cap so the comparison is law-shaped, not cap-flattened.)
  const slow = slam(40);
  const fast = slam(50);
  assert.ok(fast.impactDamage > slow.impactDamage,
    'at the same solver bound, a faster slam must damage more');
});

test('B6 law shape: quadratic above the threshold, inverse in mass, scrapes stay soft', () => {
  const base = slam(40);
  const doubled = slam(50);
  const ratio = doubled.impactDamage / base.impactDamage;
  console.log(`B6 shape: closing 40 -> 50 WU/s scales damage ${ratio.toFixed(3)}x (quadratic = 4.000x)`);
  assert.ok(Math.abs(ratio - 4) < 0.01, `damage is quadratic in excess closing speed (got ${ratio.toFixed(3)}x)`);

  const medium = slam(50, { type: 'ship', id: 'm32', mass: 32 }, 32 * 40);
  const massRatio = medium.impactDamage / doubled.impactDamage;
  assert.ok(Math.abs(massRatio - 0.5) < 0.01, `damage is inverse in mass (got ${massRatio.toFixed(3)}x)`);

  const scrape = slam(20);
  assert.equal(scrape.impactDamage, 0, 'a sub-threshold scrape (20 < 30 WU/s) costs exactly nothing');
});

test('B6 receipt shape unchanged: bounded deltaV, pre-solve feelDeltaV, bounded debris', () => {
  const receipt = slam(LIGHT_CRUISE * 0.5);
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.surface, 'terrain');
  assert.equal(receipt.control, 'tumble', 'a slam above tumbleDeltaV still takes the helm (B6 helm half)');
  assert.ok(receipt.debrisCount >= 0 && receipt.debrisCount <= COLLISION_CONSEQUENCE_LIMITS.maxDebris,
    `debrisCount stays inside the authored ${COLLISION_CONSEQUENCE_LIMITS.maxDebris}-chip bound`);
  assert.ok(receipt.feelDeltaV > receipt.deltaV,
    'feel reads the real slam speed; damage and control semantics keep the bounded deltaV');

  // Legacy/manual receipts (no pre-solve speed) keep the exchanged-dV energy path bit-stable.
  const legacy = resolveCollisionConsequence({
    target: wasp, other: rock, exchangedMomentum: WASP_MASS * 40,
    tick: 100, pos: { x: 0, z: 0 }, normal: { x: 1, z: 0 },
  });
  const legacyExpected = 0.5 * WASP_MASS * 32 * 32
    * COLLISION_CONSEQUENCE_LIMITS.energyDamageScale * 1.15;
  assert.ok(Math.abs(legacy.impactDamage - legacyExpected) < 1e-9,
    'the legacy path is untouched when preSolveClosingSpeed is absent');
});

// ---- B7 — the rope is a rope ------------------------------------------------------------

const ANCHOR_MASS = 240000;
const LINE_LENGTH = 100;
const SWING_SPEED = 1.5 * STARTER_CRUISE; // 1.5x the starter's live governed cruise, tangential, on a 100 WU line

function swingBody(id, overrides = {}) {
  return {
    id, name: id, type: 'ship', alive: true, collides: false,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    mass: STARTER_MASS, radius: 6, hull: 140, hullMax: 140, shield: 0, armor: 0,
    physicsBody: { schemaVersion: 1, dynamic: true, mass: STARTER_MASS, radius: 6, inertiaY: 48, ccd: false },
    ...overrides,
  };
}

async function swingFixture({ maxTension = null, ticks = 360, cutTick = null } = {}) {
  const anchor = swingBody('anchor', {
    type: 'asteroid', mass: ANCHOR_MASS, radius: 30,
    physicsBody: { schemaVersion: 1, dynamic: false, mass: ANCHOR_MASS, radius: 30 },
  });
  const swinger = swingBody('swinger', { pos: { x: LINE_LENGTH, z: 0 }, vel: { x: 0, z: SWING_SPEED } });
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  owner.syncFromEntities([anchor, swinger]);
  owner.createAttachment({
    attachmentId: 'rope',
    defId: 'tether_standard',
    ownerId: 'anchor',
    targetId: 'swinger',
    sourceWorld: { x: 0, z: 0 },
    targetWorld: { x: LINE_LENGTH, z: 0 },
    restLength: LINE_LENGTH,
    tick: 0,
    break: maxTension ? { maxTension } : undefined,
  });
  const hullBody = owner.records.get('swinger').body;
  let breakRequestedTick = -1;
  let peakStretch = 0;
  let peakStiffness = 0;
  let cutTangentialSpeed = 0;
  let minSpeedAfterCut = Infinity;
  let speedFiveSecondsAfterCut = 0;
  for (let tick = 1; tick <= ticks; tick++) {
    owner.step(1 / 60);
    const attachment = owner.attachments.get('rope');
    if (attachment) {
      peakStretch = Math.max(peakStretch, attachment.springState.lastStretch);
      peakStiffness = Math.max(peakStiffness, attachment.springState.lastStiffness || 0);
      if (breakRequestedTick < 0 && attachment.springState.breakRequested) breakRequestedTick = tick;
    }
    const v = hullBody.linvel();
    const speed = Math.hypot(v.x, v.z);
    if (cutTick != null && tick === cutTick) {
      const p = hullBody.translation();
      const radius = Math.hypot(p.x, p.z);
      const radial = (v.x * p.x + v.z * p.z) / radius;
      const tangential = Math.sqrt(Math.max(0, speed * speed - radial * radial));
      cutTangentialSpeed = tangential;
      owner.cutAttachment({ attachmentId: 'rope', reason: 'tether_cut', tick });
      continue;
    }
    if (cutTick != null && tick > cutTick) {
      minSpeedAfterCut = Math.min(minSpeedAfterCut, speed);
      if (tick === cutTick + 300) speedFiveSecondsAfterCut = speed;
    }
  }
  const summary = {
    peakStretchFraction: peakStretch / LINE_LENGTH,
    peakStiffness,
    breakRequestedTick,
    cutTangentialSpeed,
    minSpeedAfterCut: Number.isFinite(minSpeedAfterCut) ? minSpeedAfterCut : 0,
    speedFiveSecondsAfterCut,
  };
  owner.dispose();
  return summary;
}

test('B7 swing: a 1.5x-cruise swing on a 100 WU line stretches < 10%, holds, and stiffness carries the load', async () => {
  const s = await swingFixture({ ticks: 360 });
  console.log(`B7 swing @1.5x cruise on a ${LINE_LENGTH} WU line: peak stretch ${(s.peakStretchFraction * 100).toFixed(2)}% (bar < 10%), peak stiffness ${s.peakStiffness.toFixed(0)} (authored K 140), breakRequested: ${s.breakRequestedTick < 0 ? 'never' : `tick ${s.breakRequestedTick}`}`);
  assert.ok(
    s.peakStretchFraction < 0.10,
    `Swinging at 1.5x cruise on a 100 WU line must stretch the line < 10 % (got ${(s.peakStretchFraction * 100).toFixed(2)} %)`,
  );
  assert.ok(s.breakRequestedTick < 0, 'the swing must not break the line');
  assert.ok(
    s.peakStiffness > 140,
    'the line stiffness must rise above the authored K with the coupled load (the rope is not a fixed spring)',
  );
});

test('B7 break is by load rating, never by stretch ratio', async () => {
  // Same 5.3 % stretch: an underrated line breaks (load ratio >= 1), an overrated line and the
  // unrated standard line never do — the geometric stretch edge alone fires nothing.
  const rated = await swingFixture({ maxTension: 3000, ticks: 120 });
  console.log(`B7 rated line (3000 rating, swing load ~15 kN): breakRequested at tick ${rated.breakRequestedTick} while stretch was only ${(rated.peakStretchFraction * 100).toFixed(2)}%`);
  assert.ok(rated.breakRequestedTick > 0, 'a line past its load rating must request a break');
  assert.ok(rated.peakStretchFraction < 0.45,
    'the rated break must fire while the line is far inside the geometric stretch edge');

  const overrated = await swingFixture({ maxTension: 60000, ticks: 360 });
  const unrated = await swingFixture({ ticks: 360 });
  assert.equal(overrated.breakRequestedTick, -1, 'a line inside its rating never breaks, at any stretch this swing reaches');
  assert.equal(unrated.breakRequestedTick, -1, 'the unrated standard line never breaks from stretch alone');
});

test('B7 release: cutting at the tangent keeps >= 95% of tangential speed 5 s later', async () => {
  const s = await swingFixture({ ticks: 600, cutTick: 300 });
  const retention = s.speedFiveSecondsAfterCut / s.cutTangentialSpeed;
  console.log(`B7 release: tangential ${s.cutTangentialSpeed.toFixed(1)} WU/s at the cut, ${s.speedFiveSecondsAfterCut.toFixed(1)} WU/s 5 s later = ${(retention * 100).toFixed(2)}% kept (bar >= 95%)`);
  assert.ok(s.cutTangentialSpeed > 0.95 * SWING_SPEED,
    'the swing must still be carrying ~1.5x cruise at the cut');
  assert.ok(
    retention >= 0.95,
    `Releasing at the tangent must keep >= 95 % of tangential speed 5 s later (got ${(retention * 100).toFixed(2)} %)`,
  );
  assert.ok(
    s.minSpeedAfterCut >= 0.95 * s.cutTangentialSpeed,
    'no drag: the released hull never falls below the retention bar at any point of the 5 s coast',
  );
});

test('B7 fixture is deterministic on a fixed initial condition', async () => {
  const a = await swingFixture({ ticks: 240 });
  const b = await swingFixture({ ticks: 240 });
  assert.deepEqual(a, b, 'Fixed seeds or it did not happen — the same fixture must print the same numbers');
});
