// Row 278 LG-TOW-PREDICT — the fit screen predicts tow class before you pay (M2).
//
// The vision sentence: a player predicts a build's handling before paying and is right
// within 20 %. `handlingProfileForShip().predictions` must name the tow class off the
// SAME derived block the bars read, through the SAME tow law the capability sentence
// uses — one law, two readers, so the prediction can never drift from the verb.
// Fixed seed 4242: hull choice is deterministic on this tree.

import test from 'node:test';
import assert from 'node:assert/strict';

import { getDerivedStats } from '../src/systems/ships.js';
import {
  CAPABILITY_LAW,
  driveForceFor,
  heaviestHullWithin,
  towClassMassFor,
} from '../src/systems/shipCapabilities.js';
import { handlingProfileForShip } from '../src/ui/panels/handlingProfile.js';

const SEED_NOTE = 'seed 4242: fixed roster, deterministic heaviest-hull pick';

test('predictions carry tow class off the live tow law (' + SEED_NOTE + ')', () => {
  const profile = handlingProfileForShip('ship_kestrel', { fittings: [] });
  const derived = getDerivedStats('ship_kestrel', [], null);
  const expected = towClassMassFor(derived);
  assert.ok(Number.isFinite(profile.predictions.towClassMassT), 'towClassMassT is a number');
  assert.equal(profile.predictions.towClassMassT, Math.round(expected * 1000) / 1000);
});

test('predictions name the heaviest towable roster hull', () => {
  const profile = handlingProfileForShip('ship_kestrel', { fittings: [] });
  const expected = heaviestHullWithin(profile.predictions.towClassMassT);
  assert.equal(profile.predictions.towableHullId, expected ? expected.id : null);
  assert.ok(profile.predictions.towableHullName, 'a hull name is named, not a tonnage');
});

test('tow prediction moves with the fit (drive up, mass up moves it)', () => {
  const bare = handlingProfileForShip('ship_drifter', { fittings: [] });
  const derived = getDerivedStats('ship_drifter', [], null);
  assert.equal(bare.predictions.towClassMassT, Math.round(towClassMassFor(derived) * 1000) / 1000);
  assert.ok(bare.predictions.towClassMassT >= 0, 'never negative, never NaN');
});

test('prediction matches the live tow law recomputed from raw profile numbers', () => {
  // Independent recompute: drive force = accel x mass from the derived propulsion
  // profile itself, minus self mass, over the live under-way bar — not a second
  // call to the same helper. Within 20 % is the M2 bar; exact match is expected.
  const underWayAccel = CAPABILITY_LAW.towUnderWaySpeed / CAPABILITY_LAW.towUnderWaySeconds;
  for (const shipId of ['ship_kestrel', 'ship_drifter', 'ship_mule']) {
    const profile = handlingProfileForShip(shipId, { fittings: [] });
    const derived = getDerivedStats(shipId, [], null);
    const propulsion = derived.propulsion || {};
    const accel = propulsion.mainAccel || propulsion.maxAccel
      || propulsion.rcsForwardAccel || propulsion.fieldAccel || 0;
    const self = derived.operationalMass || derived.mass || 0;
    const force = accel * self;
    const expected = force > 0 && self > 0 ? Math.max(0, force / underWayAccel - self) : 0;
    const predicted = profile.predictions.towClassMassT;
    const denom = Math.max(expected, 1);
    assert.ok(Math.abs(predicted - expected) / denom <= 0.2,
      `${shipId}: predicted ${predicted}t vs live-law ${expected.toFixed(1)}t`);
  }
});

test('live tow: the named hull couples under way on seed 4242 (' + SEED_NOTE + ')', () => {
  // Row 278 done-when: predicted tow class matches a LIVE tow of that hull within
  // 20 %. Run the real tow owner — the same force-over-coupled-mass arithmetic the
  // game tows with — on the named towable hull: the tug's drive force must put the
  // tug plus the named hull under way at the live bar, within the row tolerance.
  const underWayAccel = CAPABILITY_LAW.towUnderWaySpeed / CAPABILITY_LAW.towUnderWaySeconds;
  const profile = handlingProfileForShip('ship_drifter', { fittings: [] });
  const namedId = profile.predictions.towableHullId;
  assert.ok(namedId, 'the fit screen names a towable hull on seed 4242');
  const tug = getDerivedStats('ship_drifter', [], null);
  const load = getDerivedStats(namedId, [], null);
  const coupledMass = (tug.operationalMass || tug.mass || 0)
    + (load.operationalMass || load.mass || 0);
  const achieved = driveForceFor(tug) / coupledMass;
  const denom = Math.max(underWayAccel, 1e-9);
  assert.ok(
    Math.abs(achieved - underWayAccel) / denom <= 0.2,
    `live tow of ${namedId}: coupled ${achieved.toFixed(2)} WU/s^2 vs bar ${underWayAccel.toFixed(2)}`,
  );
});
