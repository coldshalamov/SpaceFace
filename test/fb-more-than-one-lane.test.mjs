import test from 'node:test';
import assert from 'node:assert/strict';
import { NAMED_LANE_CONTACTS } from '../src/data/laneContacts.js';
import {
  TRAVEL_LANES,
  buildLaneGeometry,
  laneDisruptionHeadline,
} from '../src/data/travelLaneRoutes.js';

function dist(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

test('six authored lanes do not overlap and each has a named contact', () => {
  assert.equal(TRAVEL_LANES.length, 6);
  const ids = new Set(TRAVEL_LANES.map((lane) => lane.id));
  assert.equal(ids.size, 6);
  const geometries = TRAVEL_LANES.map((lane) => {
    const geometry = buildLaneGeometry(lane);
    assert.ok(geometry.lengthWU > 0, lane.id);
    assert.ok(geometry.beacons.length >= 2, lane.id);
    const contactId = lane.contactId;
    const contact = contactId
      ? NAMED_LANE_CONTACTS.find((row) => row.id === contactId)
      : NAMED_LANE_CONTACTS.find((row) => row.sectorIds.includes(lane.fromSectorId)
        || row.sectorIds.includes(lane.toSectorId));
    assert.ok(contact, lane.id);
    assert.ok(
      contact.sectorIds.includes(lane.fromSectorId) || contact.sectorIds.includes(lane.toSectorId),
      lane.id,
    );
    return geometry;
  });
  for (let i = 0; i < geometries.length; i++) {
    for (let j = i + 1; j < geometries.length; j++) {
      const a = geometries[i];
      const b = geometries[j];
      const limit = a.radiusWU + b.radiusWU;
      for (const segA of a.segments) {
        for (const segB of b.segments) {
          assert.ok(dist(segA.midpoint, segB.midpoint) > limit, `${a.id} overlaps ${b.id}`);
        }
      }
    }
  }
});

test('a disrupted lane publishes one cited headline', () => {
  const line = laneDisruptionHeadline(TRAVEL_LANES[1]);
  assert.match(line.text, /Helios–Ceres Ore Run/);
  assert.equal(line.sourceRef, 'lane:disrupted:lane_helios_ceres');
  assert.equal(laneDisruptionHeadline(line).sourceRef, line.sourceRef);
});
