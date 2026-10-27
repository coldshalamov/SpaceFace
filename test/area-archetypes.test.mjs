// Area archetypes — the Gate Garrison (Tethys) and the Den Shoal (Pallas).
//
// The WORLD-lane area-personality slice, in the terms the owner asked for: a standing body
// of law at the one military station of the confirmation six (a garrison you can watch, not
// an incident response), and the Smuggler Den dressed as a den — a wreck archipelago
// threaded along the Sker approach, a fence runner, a shoal scavenger. Pure data asserts;
// the runtime that materializes these is traffic._materializeAuthoredActivityCast, the
// same path every other authored pocket already rides. Module-load asserts cover band
// membership, capacity honesty and route-topology distinctness; these tests pin the
// archetypes themselves so a later edit cannot quietly flatten the two places back into
// one mix.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PALLAS_ACTIVITY_POCKETS,
  PALLAS_AUTHORED_ACTIVITY_CAPACITY,
  PALLAS_POCKET_ACTOR_SLOT_ORDER,
  TETHYS_ACTIVITY_POCKETS,
  TETHYS_AUTHORED_ACTIVITY_CAPACITY,
  TETHYS_POCKET_ACTOR_SLOT_ORDER,
  activityPocketsForSector,
} from '../src/data/sectorActivityPockets.js';
import { TRAFFIC_ROLES } from '../src/systems/traffic.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import * as SectorData from '../src/data/sectors.js';

function sectorRow(id) {
  for (const value of Object.values(SectorData)) {
    if (!Array.isArray(value)) continue;
    const row = value.find((entry) => entry && entry.id === id);
    if (row) return row;
  }
  return null;
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const markLen = (m) => Math.hypot(m.offset.x, m.offset.z);

test('the Customs Gate keeps a standing garrison of lawful hulls', () => {
  const pockets = activityPocketsForSector('sector_tethys_junction');
  const garrison = pockets.find((p) => p.id === 'tethys_gate_garrison');
  const stores = pockets.find((p) => p.id === 'tethys_gate_stores');
  assert.ok(garrison, 'tethys_gate_garrison pocket exists');
  assert.ok(stores, 'tethys_gate_stores pocket exists');
  assert.equal(garrison.activityAnchor.id, 'station_customs');
  assert.equal(stores.activityAnchor.id, 'station_customs');
  // The garrison read: patrol hulls on station at the gate whether or not anyone misbehaves.
  const lawfulPatrol = TETHYS_ACTIVITY_POCKETS
    .flatMap((p) => p.actorSlots)
    .filter((s) => s.lawful === true && s.jobKind === 'patrol');
  assert.ok(lawfulPatrol.length >= 4, 'at least four lawful patrol hulls stand in Tethys');
  const atGate = lawfulPatrol.filter((s) => s.pocketId === 'tethys_gate_garrison' || s.pocketId === 'tethys_gate_stores');
  assert.equal(atGate.length, 3, 'watch + overwatch + relieved hold the gate');
  for (const slot of [...garrison.actorSlots, ...stores.actorSlots]) {
    assert.ok(TRAFFIC_ROLES[slot.presentationRole], slot.id + ' resolves a traffic role');
    assert.match(slot.worldRecordSlotId, /^tethys:activity:/, slot.id + ' carries a durable record slot');
    assert.ok(markLen(slot.route.marks[0]) > 95 && markLen(slot.route.marks[0]) <= 125);
    assert.ok(markLen(slot.route.marks[1]) > 95 && markLen(slot.route.marks[1]) <= 125);
  }
  assert.equal(TETHYS_AUTHORED_ACTIVITY_CAPACITY, TETHYS_POCKET_ACTOR_SLOT_ORDER.length);
});

test('the Smuggler Den keeps its own cast — fence runner and shoal scav', () => {
  const pockets = activityPocketsForSector('sector_pallas_drift');
  const den = pockets.find((p) => p.id === 'pallas_den_shoal');
  assert.ok(den, 'pallas_den_shoal pocket exists');
  assert.equal(den.activityAnchor.id, 'station_smuggler');
  const fence = den.actorSlots.find((s) => s.id === 'pallas_den_fence');
  const scav = den.actorSlots.find((s) => s.id === 'pallas_shoal_scav');
  assert.ok(fence && fence.presentationRole === 'smuggler', 'the fence runner is a smuggler hull');
  assert.ok(scav && scav.presentationRole === 'salvor', 'the shoal scavenger is a salvor hull');
  // The den is the Quiet's ground: nobody lawful holds it.
  assert.ok(den.actorSlots.every((s) => s.lawful !== true));
  assert.equal(PALLAS_AUTHORED_ACTIVITY_CAPACITY, PALLAS_POCKET_ACTOR_SLOT_ORDER.length);
});

test('the Smuggler’s Archipelago threads the Sker approach to the den', () => {
  const row = sectorRow('sector_pallas_drift');
  assert.ok(row, 'pallas sector row resolves');
  const ids = ['poi_den_arch_a', 'poi_den_arch_b', 'poi_den_arch_c', 'poi_den_arch_d'];
  const pois = ids.map((id) => (row.pois || []).find((p) => p.id === id));
  for (const poi of pois) {
    assert.ok(poi, poi && poi.id ? poi.id : 'archipelago poi missing');
  }
  for (const poi of pois) {
    assert.ok(poi.type === 'wreck' || poi.type === 'derelict', poi.id + ' is broken ground');
    assert.ok(poi.landmarkGlb, poi.id + ' has a visible body');
    assert.equal(poi.scannerSignalKind, 'salvage', poi.id + ' reads as salvage');
    assert.ok(poi.discoveryPlate && poi.discoveryPlate.body, poi.id + ' carries a plate');
  }
  const anchors = SECTOR_ANCHORS.sector_pallas_drift;
  const den = anchors.stations.find((s) => s.id === 'station_smuggler').pos;
  const skerGate = anchors.gates.find((g) => g.to === 'sector_sker_haven').pos;
  // A threadable chain: every hop short enough to read as one shoal, and the chain reaches
  // from the den mouth to the Sker line.
  let cursor = den;
  for (const poi of pois) {
    const hop = dist(cursor, poi.pos);
    assert.ok(hop > 250 && hop < 600, poi.id + ' hop ' + hop.toFixed(0) + ' WU stays a shoal, not a scatter');
    cursor = poi.pos;
  }
  assert.ok(dist(cursor, skerGate) < 1100, 'the chain ends at the Sker line');
});
