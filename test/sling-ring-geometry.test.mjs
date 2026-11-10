// PQ-028.00 first slice — authored Ceres sling-ring geometry only.
//
// Pure predicates. No Rapier, no bootRealPath, no capture, no player.vel write.

import test from 'node:test';
import assert from 'node:assert/strict';

import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  CERES_SLING_RING,
  ringAlong,
  pointInsideSlingRing,
  alignmentDot,
} from '../src/systems/travelLanes.js';

const STATION_CERES_LOCAL = { x: -1100, z: 620 };
const STATION_CERES_GLOBAL = sectorLocalToGlobalForSector(STATION_CERES_LOCAL, 'sector_ceres_belt');

function alongPoint(along, off = 0) {
  const { globalPos, axis } = CERES_SLING_RING;
  const px = -axis.z;
  const pz = axis.x;
  return {
    x: globalPos.x + axis.x * along + px * off,
    z: globalPos.z + axis.z * along + pz * off,
  };
}

test('authors one Ceres-local sling ring on the station_ceres approach', () => {
  assert.equal(CERES_SLING_RING.id, 'sling_ring_ceres_approach');
  assert.equal(CERES_SLING_RING.sectorId, 'sector_ceres_belt');
  assert.ok(Number.isFinite(CERES_SLING_RING.localPos.x));
  assert.ok(Number.isFinite(CERES_SLING_RING.localPos.z));
  assert.ok(Number.isFinite(CERES_SLING_RING.globalPos.x));
  assert.ok(Number.isFinite(CERES_SLING_RING.globalPos.z));
  assert.ok(Number.isFinite(CERES_SLING_RING.axis.x));
  assert.ok(Number.isFinite(CERES_SLING_RING.axis.z));
  assert.ok(CERES_SLING_RING.length > 0);
  assert.ok(CERES_SLING_RING.radius > 0);
  assert.equal(Math.hypot(CERES_SLING_RING.axis.x, CERES_SLING_RING.axis.z).toFixed(8), '1.00000000');

  const derivedGlobal = sectorLocalToGlobalForSector(CERES_SLING_RING.localPos, CERES_SLING_RING.sectorId);
  assert.equal(CERES_SLING_RING.globalPos.x, derivedGlobal.x);
  assert.equal(CERES_SLING_RING.globalPos.z, derivedGlobal.z);

  const fromStation = Math.hypot(
    CERES_SLING_RING.globalPos.x - STATION_CERES_GLOBAL.x,
    CERES_SLING_RING.globalPos.z - STATION_CERES_GLOBAL.z,
  );
  assert.ok(fromStation > 200 && fromStation < 500,
    `ring should sit on the approach, not on the pad (got ${fromStation.toFixed(1)} WU)`);
  assert.ok(!pointInsideSlingRing(STATION_CERES_GLOBAL),
    'the station pad itself is outside the ring tube');
});

test('inside/outside is a finite cylinder, not a sphere', () => {
  const half = CERES_SLING_RING.length * 0.5;
  const radius = CERES_SLING_RING.radius;

  assert.equal(pointInsideSlingRing(CERES_SLING_RING.globalPos), true);
  assert.equal(pointInsideSlingRing(alongPoint(0)), true);
  assert.equal(pointInsideSlingRing(alongPoint(half - 1)), true);
  assert.equal(pointInsideSlingRing(alongPoint(-(half - 1))), true);
  assert.equal(pointInsideSlingRing(alongPoint(0, radius - 1)), true);
  assert.equal(pointInsideSlingRing(alongPoint(0, -(radius - 1))), true);
  assert.equal(pointInsideSlingRing(alongPoint(half - 2, radius - 2)), true);

  assert.equal(pointInsideSlingRing(alongPoint(half + 1)), false,
    'on-axis past the end is outside the tube');
  assert.equal(pointInsideSlingRing(alongPoint(-(half + 1))), false,
    'on-axis behind the entry is outside the tube');
  assert.equal(pointInsideSlingRing(alongPoint(0, radius + 1)), false,
    'off-axis beyond the radius is outside the tube');

  // Sphere around the center with radius = length would include this off-axis point.
  const sphereRadius = CERES_SLING_RING.length;
  const offAxisNear = alongPoint(0, radius + 8);
  const distFromCenter = Math.hypot(
    offAxisNear.x - CERES_SLING_RING.globalPos.x,
    offAxisNear.z - CERES_SLING_RING.globalPos.z,
  );
  assert.ok(distFromCenter < sphereRadius,
    'discriminating point is still near the ring in a sphere');
  assert.equal(pointInsideSlingRing(offAxisNear), false,
    'near-in-a-sphere is not inside the sling ring');
});

test('ringAlong projects onto the axis from the ring center', () => {
  assert.ok(Math.abs(ringAlong(CERES_SLING_RING.globalPos)) < 1e-9);
  assert.ok(Math.abs(ringAlong(alongPoint(40)) - 40) < 1e-6);
  assert.ok(Math.abs(ringAlong(alongPoint(-25, 30)) - (-25)) < 1e-6,
    'off-axis offset must not change the along coordinate');
});

test('aligned means forward along the axis, not a sphere', () => {
  const { axis } = CERES_SLING_RING;
  const perp = { x: -axis.z, z: axis.x };

  assert.ok(alignmentDot(axis, axis) > 0.99);
  assert.ok(alignmentDot({ x: axis.x * 7, z: axis.z * 7 }, axis) > 0.99,
    'speed does not change alignment');
  assert.ok(alignmentDot({ x: -axis.x, z: -axis.z }, axis) < -0.99,
    'reverse along the axis is not forward-aligned');
  assert.ok(Math.abs(alignmentDot(perp, axis)) < 1e-9,
    'perpendicular velocity is off-axis');
  assert.ok(alignmentDot({ x: 0, z: 0 }, axis) === 0,
    'a parked body has no heading to align');

  // Sitting near the ring with sideways velocity is not alignment.
  assert.equal(pointInsideSlingRing(CERES_SLING_RING.globalPos), true);
  assert.ok(alignmentDot(perp, axis) < 0.25,
    'inside the tube with a sideways heading is still off-axis');
});
