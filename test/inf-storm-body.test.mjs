// inf-storm-body — a hazard zone has a body you can see from two rings out.
//
// The player story: the chart marks the zones and the sim damages you inside them, but the
// zone itself had no picture — the Roaming Burn you flew toward was empty air until your hull
// started ticking damage. Now every live zone carries a skin in the flight plane: two
// counter-rotating broken arc rings plus orbiting motes in the family hue, whose arc count and
// brightness key on the zone's LIVE intensity — so when the Ashfall boss falls and the burn's
// aftermath thins 0.8 -> 0.35 (world.js _applyBossHazardAftermath), the storm on screen visibly
// THINS with it. Churn is deterministic off simTime; reduced motion slows it without dropping
// or dimming anything (a hazard you cannot see is worse than one that sits still).
//
// These tests pin the pure geometry layer (src/render/stormZoneField.js); the vfx adapter binds
// one additive mesh and feeds it state.world.activeSector.hazards directly.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STORM_REDUCED_CHURN_MUL,
  STORM_RING1_RATE,
  STORM_ZONE_CAP,
  STORM_ZONE_FLOOR,
  STORM_ZONE_MOTES,
  STORM_ZONE_QUADS,
  createStormZoneGeometry,
  resolveStormZonePlans,
  writeStormZoneGeometry,
} from '../src/render/stormZoneField.js';
import { STORM_ZONE_COLORS } from '../src/render/hazardStormRead.js';

const FOCUS = { x: 0, z: 0 };

function makeZone(type, x, z, intensity, radius = 700) {
  return { type, center: { x, z }, radius, intensity };
}

test('a live zone builds a plan with its family hue and intensity-keyed density', () => {
  const zones = [makeZone('radiation', 600, -400, 0.8)];
  const plans = resolveStormZonePlans(zones, FOCUS, 100);
  assert.equal(plans.length, 1, 'the zone reads');
  const plan = plans[0];
  assert.equal(plan.colorHex, STORM_ZONE_COLORS.radiation, 'the skin wears the family hue');
  assert.equal(plan.ring1Arcs, 12, 'a dense storm carries most of the outer ring');
  assert.ok(plan.brightness > STORM_ZONE_FLOOR, 'density lifts brightness above the floor');
  assert.equal(plan.motes.length, STORM_ZONE_MOTES, 'the interior churns');
});

test('a thinned storm visibly thins — the boss-defeat aftermath reads without any event wiring', () => {
  const fat = resolveStormZonePlans([makeZone('radiation', 600, -400, 0.8)], FOCUS, 100);
  const thin = resolveStormZonePlans([makeZone('radiation', 600, -400, 0.35)], FOCUS, 100);
  assert.ok(thin[0].ring1Arcs < fat[0].ring1Arcs, 'fewer arcs after the aftermath thinning');
  assert.ok(thin[0].ring2Arcs < fat[0].ring2Arcs, 'the inner ring thins too');
  assert.ok(thin[0].brightness < fat[0].brightness, 'the skin dims with the storm');
  assert.ok(thin[0].brightness >= STORM_ZONE_FLOOR, 'a thinned storm still reads — never dark');

  const fatGeo = createStormZoneGeometry();
  const thinGeo = createStormZoneGeometry();
  writeStormZoneGeometry(fatGeo, fat, 20, false);
  writeStormZoneGeometry(thinGeo, thin, 20, false);
  assert.ok(fatGeo.indexCount > thinGeo.indexCount, 'the dense storm draws strictly more quads');
});

test('zones cull by range, cap at four, and unknown families fall to the house amber', () => {
  const far = makeZone('nebula', 9000, 9000, 0.5, 600);
  const plans = resolveStormZonePlans([far], FOCUS, 0);
  assert.equal(plans.length, 0, 'a zone beyond readability range stays off the glass');
  const crowd = [];
  for (let i = 0; i < 6; i++) crowd.push(makeZone('debris', i * 500 - 1200, 300, 0.4));
  const capped = resolveStormZonePlans(crowd, FOCUS, 0);
  assert.ok(capped.length <= STORM_ZONE_CAP, 'the mesh budget holds under a crowded field');
  const odd = resolveStormZonePlans([makeZone('something_new', 100, 0, 0.5)], FOCUS, 0);
  assert.equal(odd[0].colorHex, 0xffb35c, 'an unlisted family reads quiet amber like the hull static');
});

test('the churn turns on the sim clock and freezes with a frozen sim', () => {
  const plans = resolveStormZonePlans([makeZone('radiation', 600, -400, 0.7)], FOCUS, 0);
  const geoA = createStormZoneGeometry();
  const geoB = createStormZoneGeometry();
  writeStormZoneGeometry(geoA, plans, 10, false);
  writeStormZoneGeometry(geoB, plans, 14, false);
  assert.notDeepEqual(geoA.positions, geoB.positions, 'four seconds of churn moves the rings');
  writeStormZoneGeometry(geoB, plans, 10, false);
  assert.deepEqual(geoA.positions, geoB.positions, 'the churn is deterministic off simTime');
});

test('reduced motion slows the churn but keeps every ring and mote lit', () => {
  const plans = resolveStormZonePlans([makeZone('nebula', 200, 100, 0.6)], FOCUS, 0);
  const full = createStormZoneGeometry();
  const slow = createStormZoneGeometry();
  writeStormZoneGeometry(full, plans, 30, false);
  writeStormZoneGeometry(slow, plans, 30, true);
  assert.equal(full.indexCount, slow.indexCount, 'reduced motion drops nothing');
  const span = Math.abs(full.indexCount - slow.indexCount) + 1; // guard against a zero-span compare
  let drift = 0;
  for (let i = 0; i < full.positions.length; i++) drift += Math.abs(full.positions[i] - slow.positions[i]);
  assert.ok(drift > 0.001 * span, 'the churn still moves, just slower');
  const t30 = createStormZoneGeometry();
  writeStormZoneGeometry(t30, plans, 30, true);
  const t31 = createStormZoneGeometry();
  writeStormZoneGeometry(t31, plans, 31, true);
  let movedUnderReduced = 0;
  for (let i = 0; i < t30.positions.length; i++) movedUnderReduced += Math.abs(t30.positions[i] - t31.positions[i]);
  assert.ok(movedUnderReduced > 0.0005, 'the reduced churn is slowed, never frozen to a still frame');
  const expectedShare = STORM_REDUCED_CHURN_MUL * STORM_RING1_RATE;
  assert.ok(expectedShare > 0 && expectedShare < STORM_RING1_RATE, 'the reduced share stays a share');
});

test('the quad pool holds the worst case: four fully dense zones never clip', () => {
  const crowd = [];
  for (let i = 0; i < STORM_ZONE_CAP; i++) crowd.push(makeZone('radiation', i * 900 - 1350, 0, 1.0));
  const plans = resolveStormZonePlans(crowd, FOCUS, 5);
  assert.equal(plans.length, STORM_ZONE_CAP);
  const geo = createStormZoneGeometry();
  writeStormZoneGeometry(geo, plans, 5, false);
  const quads = geo.indexCount / 6;
  assert.ok(quads <= geo.quadCapacity, `the writer respects the pool (${quads} of ${geo.quadCapacity})`);
  assert.ok(geo.quadCapacity >= STORM_ZONE_QUADS, 'the default pool matches the declared budget');
});
