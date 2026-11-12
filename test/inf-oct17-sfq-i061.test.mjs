// SFQ-I061 — the ring a pilot can see is the edge where the field lets go.
// Authored sites, not a roll. Seed 4242 is the campaign pin; these two sites do not draw from it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { VELOCITY_PLANE, velocityPlaneRecord } from '../src/data/velocityPlane.js';
import { LANE_FIELD, laneFieldRecord } from '../src/data/laneField.js';

const SEED = 4242;
const HULL = { mass: 12, type: 'ship', id: SEED };

function feel(pos, spec) {
  return sampleFieldAcceleration(pos, { x: 0, z: 0 }, [normalizeField(spec)], 0, HULL);
}

function pushing(accel) {
  return accel.ax !== 0 || accel.az !== 0;
}

test('one world-unit outside the star marker the velocity plane lets go', () => {
  const site = MACHINE_SITES.charon_star_marker;
  assert.equal(site.radius, VELOCITY_PLANE.radius);
  assert.equal(site.radius, 180);
  const plane = velocityPlaneRecord(site.center);
  const inside = feel({ x: site.center.x + site.radius - 1, z: site.center.z }, plane);
  const outside = feel({ x: site.center.x + site.radius + 1, z: site.center.z }, plane);
  assert.equal(pushing(inside), true);
  assert.equal(outside.ax, 0);
  assert.equal(outside.az, 0);
});

test('one world-unit outside the line of spines the lane lets go', () => {
  const site = MACHINE_SITES.ashfall_the_line;
  assert.equal(site.propRing.linear, true);
  assert.equal(site.propRing.radius, LANE_FIELD.length);
  assert.equal(site.propRing.radius, 640);
  const lane = laneFieldRecord(site.center);
  const half = site.propRing.radius / 2;
  const insideExit = feel({ x: site.center.x + half - 1, z: site.center.z }, lane);
  const outsideExit = feel({ x: site.center.x + half + 1, z: site.center.z }, lane);
  const insideEntry = feel({ x: site.center.x - half + 1, z: site.center.z }, lane);
  const outsideEntry = feel({ x: site.center.x - half - 1, z: site.center.z }, lane);
  assert.equal(pushing(insideExit), true);
  assert.equal(pushing(insideEntry), true);
  assert.equal(outsideExit.ax, 0);
  assert.equal(outsideExit.az, 0);
  assert.equal(outsideEntry.ax, 0);
  assert.equal(outsideEntry.az, 0);
});
