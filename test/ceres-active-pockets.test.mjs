import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  expandProxyPrimitives,
  resolveCollisionProxyManifest,
} from '../src/data/collisionProxyManifests.js';
import {
  CERES_ACTIVITY_BANDS,
  CERES_ACTIVITY_POCKET_ORDER,
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_POCKETS_BY_ID,
  CERES_ACTIVITY_SERVICE_SLOTS,
  CERES_AUTHORED_ACTIVITY_CAPACITY,
  CERES_AUTHORED_ACTIVITY_SLOT_ORDER,
  CERES_POCKET_ACTOR_SLOT_ORDER,
  CERES_REFERENCE_ACCEPTANCE_ENTRY,
  CERES_ROUTE_TOPOLOGY,
  ceresActivityPocket,
  ceresRouteTopologyClass,
  distanceFromPocketAnchor,
} from '../src/data/sectorActivityPockets.js';
import {
  sectorGlobalOrigin,
  sectorLocalToGlobalForSector,
} from '../src/data/sectorCoordinates.js';
import {
  CERES_THROUGHLINE_BEACON_LOCAL_POS,
  CERES_WRECK_CATHEDRAL_LOCAL_POS,
  SECTOR_ANCHORS,
} from '../src/data/sectorAnchors.js';
import { SECTOR_ZONES } from '../src/data/sectorZones.js';
import {
  CINDER_SLUICE_LOCAL_POS,
  CINDER_SLUICE_SITE_ID,
  CINDER_SLUICE_TRAFFIC_STAGING_POS,
} from '../src/data/environmentalMachinery.js';
import {
  applySandboxSetup,
  requestSandboxGame,
  SANDBOX_PHYSICS_LOADOUTS,
} from '../src/ui/sandbox/sandboxSetup.js';
import { SHIPS } from '../src/data/ships.js';
import { WEAPONS } from '../src/data/weapons.js';
import { planFactionPresence } from '../src/data/factionPresence.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import {
  asteroidFormations,
  formationBodyKey,
} from '../src/systems/asteroidFormations.js';
import { buildSlotList, fits, ships } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';

const EXPECTED_POCKETS = Object.freeze([
  'ceres_refinery_pocket',
  'ceres_working_seam',
  'ceres_ambush_run',
  'ceres_cathedral_grave',
]);

const EXPECTED_OBJECT_SLOTS = Object.freeze([
  'ceres_refinery_cargo_pod',
  'ceres_refinery_disabled_hull',
  'ceres_seam_ore_clast',
  'ceres_ambush_distress_beacon',
  'ceres_ambush_bait_wreck',
  'ceres_cathedral_grave_shard',
]);

const EXPECTED_COLLISION_ANCHORS = Object.freeze([
  Object.freeze({
    id: 'ceres_throughline_collision_anchor',
    sourceFieldId: 'f_ceres_1',
    sourceIndex: 5,
    offset: Object.freeze({ x: 48, z: 64 }),
    evidenceEntityId: 9,
    evidenceRadius: 15.773138417862356,
  }),
  Object.freeze({
    id: 'ceres_ambush_collision_anchor',
    sourceFieldId: 'f_ceres_2',
    sourceIndex: 2,
    offset: Object.freeze({ x: 150, z: 20 }),
    evidenceEntityId: 38,
    evidenceRadius: 12.386358419433236,
  }),
]);

const PRE_CLOSEOUT_ASTEROID_INVARIANT_HASH = '910b5aff6f84a065fa399c4116831346c9162e092cefb785844f1b73be3812da';
const PRE_CLOSEOUT_UNAFFECTED_POSITION_HASH = '6e9660c489b8b096a671d47239ae4880ba9247b6cb13613fd74401873b3ec209';

test('R5A binds four camera-local pockets to PQ-020 canonical identities and anchors', () => {
  assert.deepEqual(CERES_ACTIVITY_POCKET_ORDER, EXPECTED_POCKETS);
  assert.equal(CERES_ACTIVITY_POCKETS.length, 4);

  const anchors = SECTOR_ANCHORS.sector_ceres_belt;
  const zones = SECTOR_ZONES.sector_ceres_belt;
  const refinery = ceresActivityPocket('ceres_refinery_pocket');
  const seam = ceresActivityPocket('ceres_working_seam');
  const ambush = ceresActivityPocket('ceres_ambush_run');
  const cathedral = ceresActivityPocket('ceres_cathedral_grave');

  const station = anchors.stations.find((row) => row.id === 'station_ceres');
  const refineryZone = zones.find((row) => row.id === 'zone_ceres_refinery');
  assert.notStrictEqual(refinery.activityAnchor.localPos, station.pos,
    'the frozen activity contract must not expose PQ-020 mutable geography');
  assert.equal(refinery.pq020Identity.zoneId, refineryZone.id);
  assert.deepEqual(refinery.activityAnchor.localPos, refineryZone.center);

  const miningZone = zones.find((row) => row.id === 'zone_ceres_belt');
  assert.deepEqual(seam.activityAnchor.localPos, miningZone.center);
  assert.equal(seam.pq020Identity.zoneId, 'zone_ceres_belt');
  assert.equal(seam.externalSiteRefs[0].id, CINDER_SLUICE_SITE_ID);
  assert.deepEqual(seam.externalSiteRefs[0].localPos, CINDER_SLUICE_LOCAL_POS);
  assert.equal(seam.externalSiteRefs[0].countsTowardBandCensus, false);

  const throughlineZone = zones.find((row) => row.id === 'zone_ceres_throughline');
  const throughlinePoi = anchors.pois.find((row) => row.id === 'poi_ceres_throughline');
  assert.equal(ambush.pq020Identity.zoneId, throughlineZone.id,
    'Ambush Run is choreography on PQ-020 Throughline, not a second Ceres zone');
  assert.notStrictEqual(ambush.activityAnchor.localPos, throughlinePoi.pos);
  assert.deepEqual(ambush.activityAnchor.localPos, CERES_THROUGHLINE_BEACON_LOCAL_POS);

  assert.notStrictEqual(cathedral.activityAnchor.localPos, CERES_WRECK_CATHEDRAL_LOCAL_POS);
  assert.deepEqual(cathedral.activityAnchor.localPos, CERES_WRECK_CATHEDRAL_LOCAL_POS);
  assert.equal(cathedral.pq020Identity.siteId, 'world_site_wreck_cathedral');
  assert.equal(CERES_ACTIVITY_POCKETS.every((pocket) => pocket.bandOrigin.kind === 'activity_anchor'), true);
});

test('R5A authored capacity is stable 2/3/2/2 without counting encounter hostiles', () => {
  assert.deepEqual(CERES_ACTIVITY_POCKETS.map((pocket) => pocket.actorSlots.length), [2, 2, 2, 2]);
  assert.deepEqual(CERES_ACTIVITY_POCKETS.map((pocket) => pocket.authoredCapacityContribution), [2, 3, 2, 2]);
  assert.equal(CERES_POCKET_ACTOR_SLOT_ORDER.length, 8);
  assert.equal(CERES_ACTIVITY_SERVICE_SLOTS.length, 1);
  assert.equal(CERES_AUTHORED_ACTIVITY_SLOT_ORDER.length, CERES_AUTHORED_ACTIVITY_CAPACITY);
  assert.equal(CERES_AUTHORED_ACTIVITY_CAPACITY, 9);
  assert.equal(new Set(CERES_AUTHORED_ACTIVITY_SLOT_ORDER).size, 9);
  assert.deepEqual(CERES_AUTHORED_ACTIVITY_SLOT_ORDER, [
    'ceres_refinery_hauler',
    'ceres_refinery_tender',
    'ceres_seam_miner',
    'ceres_seam_surveyor',
    'ceres_ambush_loaded_hauler',
    'ceres_ambush_escort',
    'ceres_cathedral_salvor',
    'ceres_cathedral_patrol',
    'ceres_cinder_service_hauler',
  ]);

  const tender = actor('ceres_refinery_tender');
  const liveTenderPlans = planFactionPresence({ sectorId: 'sector_ceres_belt', seed: 1 })
    .filter((row) => row.yardTender === true);
  assert.equal(liveTenderPlans.length, 1, 'the reuse descriptor binds one live Pitborn tender plan');
  assert.equal(liveTenderPlans[0].factionId, tender.binding.match.factionId);
  assert.equal(liveTenderPlans[0].sectorId, tender.binding.match.sectorId);
  assert.equal(tender.binding.runtimeStatus, 'requires_world_record_adoption');
  const service = CERES_ACTIVITY_SERVICE_SLOTS[0];
  const cinderManifest = worldSiteManifestById(CINDER_SLUICE_SITE_ID);
  assert.equal(service.binding.owner, 'traffic');
  assert.equal(service.binding.hookId, cinderManifest.trafficHook.id);
  assert.equal(service.binding.siteId, cinderManifest.id);
  assert.deepEqual(cinderManifest.trafficHook.stagingPos, CINDER_SLUICE_TRAFFIC_STAGING_POS);
  assert.equal(service.binding.runtimeStatus, 'requires_r5d_hook_reconciliation');
  assert.equal(service.binding.currentPolicy, 'eligible_ambient_actor');
  assert.equal(service.binding.targetPolicy, 'reserved_stable_slot');
  assert.equal(service.jobKind, null);
  assert.equal(service.countsTowardPocketActorCensus, false);
  assert.equal(service.tombstonePolicy, 'no_refill_or_reassign_after_r5d_reconciliation');
  for (const slot of CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots)) {
    assert.equal(slot.worldRecordSlotId, `ceres:activity:${slot.id}`);
    assert.equal(slot.tombstonePolicy, 'no_refill_or_reassign');
  }
  assert.equal(CERES_AUTHORED_ACTIVITY_SLOT_ORDER.some((id) => /pirate|hostile|encounter/.test(id)), false);
});

test('R5A positions and inert routes use the named-anchor camera bands', () => {
  assert.deepEqual(
    Object.values(CERES_ACTIVITY_BANDS).map((band) => [band.minWU, band.maxWU]),
    [[0, 95], [95, 125], [125, 165]],
  );

  for (const pocket of CERES_ACTIVITY_POCKETS) {
    for (const slot of pocket.actorSlots) {
      const spawnDistance = distanceFromPocketAnchor(slot.spawnOffset);
      assert.ok(spawnDistance >= 0 && spawnDistance <= 95, `${slot.id} spawn is immediate`);
      assert.equal(slot.route.inert, true);
      assert.equal(slot.route.owner, 'npcJobsRuntime');
      assert.equal(slot.route.marks.length, 2);
      for (const mark of slot.route.marks) {
        const d = distanceFromPocketAnchor(mark.offset);
        assert.ok(d > 95 && d <= 125, `${slot.id}/${mark.id} route mark is moving-play local`);
      }
    }
  }

  const loadedHauler = actor('ceres_ambush_loaded_hauler');
  const escort = actor('ceres_ambush_escort');
  assert.equal(loadedHauler.presentationRole, 'hauler');
  assert.equal(loadedHauler.jobKind, 'hauler');
  assert.equal(escort.presentationRole, 'escort');
  assert.equal(escort.jobKind, 'patrol', 'the existing job kernel does not gain an escort kind');
  assert.equal(escort.lawful, true);
  assert.equal(actor('ceres_cathedral_patrol').lawful, true);
  assert.equal(actor('ceres_refinery_hauler').route.receiptType, 'freight:arrival');
  assert.equal(actor('ceres_seam_miner').route.receiptType, 'mining:npcExtraction');
  assert.equal(
    actor('ceres_seam_miner').route.marks[1].targetRef,
    'field:slot:ceres_seam_ore_clast',
  );
});

// ── PQ-045.route-topology ───────────────────────────────────────────────────────────────────────
// Ceres is the propagation template for every other sector, so it has to satisfy the
// no-two-places-share-a-topology rule against itself first. Before this unit it did not: all eight
// actors shared one pair of cardinal 102/116 WU marks, six of the eight routes were the identical
// 180deg/218 WU colinear shuttle, and the other two were the identical 90deg/154.467 WU right angle
// — three of the four pockets were geometrically indistinguishable from each other.
//
// A sibling unit learned the hard way that asserting distinctness in a COMMENT lets every trade
// quietly collapse back to one behaviour, so it is computed here instead, from the marks, with the
// bearing and distance maths written out independently of the module that ships the values.

const DEG = 180 / Math.PI;

function bearingDeg(fromX, fromZ, toX, toZ) {
  return Math.atan2(toZ - fromZ, toX - fromX) * DEG;
}

function separationDeg(a, b) {
  const spread = Math.abs(a - b) % 360;
  return spread > 180 ? 360 - spread : spread;
}

/** Recomputed from the raw marks — deliberately not imported from the module under test. */
function measureRoute(slot) {
  const [first, second] = slot.route.marks;
  return {
    sweepDeg: separationDeg(
      bearingDeg(0, 0, first.offset.x, first.offset.z),
      bearingDeg(0, 0, second.offset.x, second.offset.z),
    ),
    spanWU: Math.sqrt(
      (second.offset.x - first.offset.x) ** 2 + (second.offset.z - first.offset.z) ** 2,
    ),
  };
}

/** Distance to the nearest class boundary, which sit halfway between bucket centres. */
function classEdgeMargin(value, step) {
  const offsetIntoBucket = (((value - step / 2) % step) + step) % step;
  return Math.min(offsetIntoBucket, step - offsetIntoBucket);
}

const EXPECTED_ROUTE_TOPOLOGY = Object.freeze([
  ['ceres_refinery_pocket', 'ceres_refinery_freight_loop', '135deg/200wu'],
  ['ceres_refinery_pocket', 'ceres_refinery_tender_service', '150deg/225wu'],
  ['ceres_working_seam', 'ceres_seam_extraction_loop', '60deg/125wu'],
  ['ceres_working_seam', 'ceres_seam_survey_sweep', '75deg/150wu'],
  ['ceres_ambush_run', 'ceres_ambush_loaded_crossing', '180deg/250wu'],
  ['ceres_ambush_run', 'ceres_ambush_escort_crossing', '165deg/225wu'],
  ['ceres_cathedral_grave', 'ceres_cathedral_salvage_loop', '105deg/175wu'],
  ['ceres_cathedral_grave', 'ceres_cathedral_patrol_perimeter', '105deg/200wu'],
]);

test('R5A no two Ceres routes and no two Ceres pockets share a route topology', () => {
  const slots = CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots);
  assert.equal(CERES_ROUTE_TOPOLOGY.length, slots.length);

  // The shipped measurements must agree with maths written here, so a broken derivation in the
  // module cannot certify itself distinct.
  for (const slot of slots) {
    const row = CERES_ROUTE_TOPOLOGY.find((entry) => entry.actorSlotId === slot.id);
    const measured = measureRoute(slot);
    // The shipped values are published rounded to 3dp, so agreement is to that precision and no
    // looser — 5e-4 is the most a correct rounding can differ by.
    assert.ok(row, `${slot.id} contributes a measured topology`);
    assert.ok(Math.abs(row.sweepDeg - measured.sweepDeg) <= 5e-4,
      `${slot.id} sweep ${row.sweepDeg} disagrees with ${measured.sweepDeg}`);
    assert.ok(Math.abs(row.spanWU - measured.spanWU) <= 5e-4,
      `${slot.id} span ${row.spanWU} disagrees with ${measured.spanWU}`);
    assert.ok(Math.abs(row.speedWUPerS - measured.spanWU / slot.route.durationS) < 1e-3,
      `${slot.id} derived speed must stay span/durationS`);
  }

  // Distinctness, at both scopes the rule is stated at. Eight distinct routes make the four pockets
  // distinct too, but the pocket claim is asserted in its own right because it is the one that
  // gates propagation to other sectors.
  const routeClasses = CERES_ROUTE_TOPOLOGY.map(ceresRouteTopologyClass);
  assert.equal(new Set(routeClasses).size, routeClasses.length,
    `every Ceres route needs its own topology; got ${routeClasses.join(', ')}`);
  const pocketClasses = CERES_ACTIVITY_POCKETS.map((pocket) => CERES_ROUTE_TOPOLOGY
    .filter((row) => row.pocketId === pocket.id)
    .map(ceresRouteTopologyClass)
    .sort()
    .join('+'));
  assert.equal(new Set(pocketClasses).size, CERES_ACTIVITY_POCKETS.length,
    `no two Ceres pockets may share a topology; got ${pocketClasses.join(' | ')}`);

  // Pin the authored design, not merely that something differs: a retune that stays technically
  // distinct while abandoning each pocket's band is the failure this unit exists to prevent.
  assert.deepEqual(
    CERES_ROUTE_TOPOLOGY.map((row) => [row.pocketId, row.routeId, ceresRouteTopologyClass(row)]),
    EXPECTED_ROUTE_TOPOLOGY.map((row) => [...row]),
  );

  // Coarse classes are only meaningful while the authored values sit clear of the bucket edges.
  // Without this, a route could drift onto a boundary and its class would start reporting a
  // difference that no player could see.
  for (const row of CERES_ROUTE_TOPOLOGY) {
    assert.ok(classEdgeMargin(row.sweepDeg, 15) >= 3,
      `${row.routeId} sweep ${row.sweepDeg} sits too near a class edge`);
    assert.ok(classEdgeMargin(row.spanWU, 25) >= 4,
      `${row.routeId} span ${row.spanWU} sits too near a class edge`);
  }

  // Span is speed: durations are fixed and npcJobsRuntime divides by them. Keeping the spread inside
  // the shipped envelope is what stops "give it its own topology" turning into a stalled or
  // teleporting actor.
  for (const row of CERES_ROUTE_TOPOLOGY) {
    assert.ok(row.speedWUPerS >= 4 && row.speedWUPerS <= 13,
      `${row.routeId} derives ${row.speedWUPerS} WU/s, outside the accepted Ceres motion envelope`);
  }
});

test('R5A route bearings are taken from Ceres geography rather than chosen', () => {
  const bearingOfMark = (slotId, markId) => {
    const slot = actor(slotId);
    const found = slot.route.marks.find((mark) => mark.id === markId);
    return bearingDeg(0, 0, found.offset.x, found.offset.z);
  };
  const objectOffset = (slotId) => CERES_ACTIVITY_POCKETS
    .flatMap((pocket) => pocket.objectSlots)
    .find((slot) => slot.id === slotId).offset;

  // A mark that is simply a destination points at the object it names. This is what makes the
  // topology derived from the pocket's own fiction instead of a shape that merely happens to differ.
  for (const [slotId, markId, objectSlotId] of [
    ['ceres_refinery_hauler', 'refinery_cargo_approach', 'ceres_refinery_cargo_pod'],
    ['ceres_cathedral_salvor', 'cathedral_salvor_shard', 'ceres_cathedral_grave_shard'],
  ]) {
    const target = objectOffset(objectSlotId);
    assert.ok(
      separationDeg(bearingOfMark(slotId, markId), bearingDeg(0, 0, target.x, target.z)) < 0.5,
      `${markId} must sit on the true bearing of ${objectSlotId}`,
    );
  }

  // The ore face is the other kind of mark: npcJobsRuntime physically drives the miner to the live
  // clast, so the authored fallback has to point somewhere else or the two are indistinguishable.
  // ceres-activity-runtime-lifecycle proves that by flying an approach 200 WU west of the live rock
  // and requiring the two aims to differ by more than 0.25 rad. That is a cross-file constraint on
  // THIS file's geometry, so it is restated here — retuning the mark toward the clast breaks a test
  // in a file this unit is not allowed to touch, and it should fail here first, where it is caused.
  const clast = objectOffset('ceres_seam_ore_clast');
  const oreFace = actor('ceres_seam_miner').route.marks
    .find((mark) => mark.id === 'seam_miner_ore_face').offset;
  const approach = { x: clast.x - 200, z: clast.z };
  const aimSeparation = separationDeg(
    bearingDeg(approach.x, approach.z, clast.x, clast.z),
    bearingDeg(approach.x, approach.z, oreFace.x, oreFace.z),
  ) / DEG;
  assert.ok(aimSeparation > 0.25,
    `the miner's authored ore face must stay causally distinct from the live clast (${aimSeparation} rad)`);

  // The Ambush lane runs down the axis the two authored collision anchors already define, so the one
  // route still allowed to cross its own anchor is aimed by the sector, not by a cardinal default.
  const anchors = ceresActivityPocket('ceres_ambush_run').collisionAnchorSlots;
  const laneBearing = bearingDeg(
    anchors[0].offset.x, anchors[0].offset.z,
    anchors[1].offset.x, anchors[1].offset.z,
  );
  assert.ok(separationDeg(bearingOfMark('ceres_ambush_loaded_hauler', 'ambush_hauler_outbound'),
    laneBearing) < 0.5, 'the loaded crossing runs the authored collision-anchor lane axis');
  assert.equal(
    CERES_ROUTE_TOPOLOGY.filter((row) => row.sweepClassDeg === 180).length, 1,
    'exactly one Ceres route may still run straight through its own anchor',
  );

  // Inherited from PQ-045.tender-client-materialization: the tender's authored client mark is
  // deliberately held OFF the disabled hull's own bearing, so closing on the real casualty is a
  // visibly different heading. Re-aiming that mark onto the hull would collapse this to ~0.13 rad.
  const tender = actor('ceres_refinery_tender');
  const clientMark = tender.route.marks.find((mark) => mark.id === 'refinery_tender_client');
  const hull = objectOffset('ceres_refinery_disabled_hull');
  const spawnToHull = bearingDeg(tender.spawnOffset.x, tender.spawnOffset.z, hull.x, hull.z);
  const spawnToMark = bearingDeg(
    tender.spawnOffset.x, tender.spawnOffset.z, clientMark.offset.x, clientMark.offset.z,
  );
  assert.ok(separationDeg(spawnToHull, spawnToMark) / DEG > 0.5,
    'the tender approaches its authored mark and its real client on distinct headings');
});

// The `activity:` namespace means "abstract choreography — no object is or ever will be this". That
// is a naming rule the runtime relies on but cannot check for itself: npcJobsRuntime only ever sees
// the marks it was handed. Pinning it here is what stops a future slot being materialized while
// keeping a name that promises it was not, which is exactly the defect PQ-045 existed to repair.
test('R5A activity: marks stay abstract and never name a materialized object slot', () => {
  const marks = CERES_ACTIVITY_POCKETS
    .flatMap((pocket) => pocket.actorSlots)
    .flatMap((slot) => slot.route.marks);
  const abstract = marks.filter((mark) => String(mark.targetRef).startsWith('activity:'));
  assert.deepEqual(abstract.map((mark) => mark.id).sort(), [
    'ambush_hauler_inbound',
    'ambush_hauler_outbound',
    'cathedral_patrol_beat_a',
    'cathedral_patrol_beat_b',
    'seam_survey_mark_a',
    'seam_survey_mark_b',
  ], 'exactly the six scan/throughline/perimeter marks remain abstract choreography');

  const objectSlotIds = new Set(CERES_ACTIVITY_POCKETS
    .flatMap((pocket) => pocket.objectSlots)
    .map((slot) => slot.id));
  for (const mark of abstract) {
    const named = String(mark.targetRef).slice('activity:'.length);
    assert.equal(objectSlotIds.has(named), false,
      `${mark.id} promises no object exists, so ${named} must not be a materialized slot`);
  }
  for (const slot of CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.objectSlots)) {
    assert.equal(String(slot.targetRef ?? '').startsWith('activity:'), false,
      `${slot.id} is a real object, so it must not be referenced through the abstract namespace`);
  }
});

test('R5A companion objects are logical world slots, not a second place registry', () => {
  assert.deepEqual(
    CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.objectSlots.map((slot) => slot.id)),
    EXPECTED_OBJECT_SLOTS,
  );
  for (const pocket of CERES_ACTIVITY_POCKETS) {
    for (const slot of pocket.objectSlots) {
      assert.equal(slot.inert, true);
      assert.equal(slot.coordinateSpace, 'pocket_anchor_offset_v1');
      assert.equal(slot.runtimeOwner, 'world');
      assert.equal('globalPos' in slot, false);
      assert.equal('atlasId' in slot, false);
      assert.ok(distanceFromPocketAnchor(slot.offset) <= 95,
        `${slot.id} remains in the ordinary-camera immediate band`);
    }
  }
});

test('R5 collision anchors are a separate frozen two-rock physical-lane contract', () => {
  const collisionAnchors = CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.collisionAnchorSlots);
  assert.equal(CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.objectSlots).length, 6,
    'collision anchors never expand the logical-object census');
  assert.deepEqual(collisionAnchors.map((slot) => ({
    id: slot.id,
    sourceFieldId: slot.sourceFieldId,
    sourceIndex: slot.sourceIndex,
    offset: slot.offset,
  })), EXPECTED_COLLISION_ANCHORS.map((slot) => ({
    id: slot.id,
    sourceFieldId: slot.sourceFieldId,
    sourceIndex: slot.sourceIndex,
    offset: slot.offset,
  })));
  assert.equal(collisionAnchors.length, 2);
  assert.equal(CERES_ACTIVITY_POCKETS.filter((pocket) => pocket.collisionAnchorSlots.length > 0).length, 1);

  const objectIds = new Set(EXPECTED_OBJECT_SLOTS);
  const selectors = new Set();
  for (const slot of collisionAnchors) {
    assert.equal(slot.pocketId, 'ceres_ambush_run');
    assert.equal(slot.coordinateSpace, 'pocket_anchor_offset_v1');
    assert.equal(slot.runtimeOwner, 'world');
    assert.equal(slot.inert, true);
    assert.equal(slot.countsTowardObjectSlotCensus, false);
    assert.equal(slot.countsTowardAuthoredCapacity, false);
    assert.equal(Number.isInteger(slot.sourceIndex) && slot.sourceIndex > 0, true);
    assert.equal(objectIds.has(slot.id), false);
    const selector = `${slot.sourceFieldId}:${slot.sourceIndex}`;
    assert.equal(selectors.has(selector), false);
    selectors.add(selector);
    assert.equal(Object.isFrozen(slot), true);
    assert.equal(Object.isFrozen(slot.offset), true);
  }

  const pocket = ceresActivityPocket('ceres_ambush_run');
  const throughlineZone = SECTOR_ZONES[pocket.sectorId].find((zone) => zone.id === pocket.activityAnchor.zoneId);
  const positions = collisionAnchors.map((slot) => ({
    x: pocket.activityAnchor.localPos.x + slot.offset.x,
    z: pocket.activityAnchor.localPos.z + slot.offset.z,
  }));
  const pocketDistances = collisionAnchors.map((slot) => Math.hypot(slot.offset.x, slot.offset.z));
  const zoneDistances = positions.map((pos) => Math.hypot(
    pos.x - throughlineZone.center.x,
    pos.z - throughlineZone.center.z,
  ));
  assert.deepEqual(positions, [{ x: 3088, z: -856 }, { x: 3190, z: -900 }]);
  assert.ok(Math.abs(pocketDistances[0] - 80) < 1e-12);
  assert.ok(Math.abs(pocketDistances[1] - Math.hypot(150, 20)) < 1e-12);
  assert.ok(Math.abs(zoneDistances[0] - Math.hypot(-67, 99)) < 1e-12);
  assert.ok(Math.abs(zoneDistances[1] - Math.hypot(35, 55)) < 1e-12);
  assert.ok(pocketDistances.every((distance) => distance <= 165));
  assert.ok(zoneDistances.every((distance) => distance <= 165));
  assert.ok(Math.abs(Math.hypot(
    positions[1].x - positions[0].x,
    positions[1].z - positions[0].z,
  ) - Math.sqrt(12340)) < 1e-12);
});

test('R5B materializes six inert object slots and two existing-budget collision anchors', () => {
  const first = materializeCeresActivityObjects(47);
  const repeat = materializeCeresActivityObjects(47);

  assert.deepEqual(first.fullCeresSignature, first.sameSectorReentrySignature,
    'same-sector entry must not create, replace, or reorder Ceres entities');
  assert.deepEqual(repeat.fullCeresSignature, first.fullCeresSignature,
    'same-seed rebuild must retain the complete live Ceres entity signature');
  assert.deepEqual(first.census, {
    total: 129,
    byType: { asteroid: 90, fx: 13, ship: 2, station: 6, wreck: 18 },
    collidable: 107,
    colliders: 107,
  }, 'a sixth logical object must still add no entity, type, or collider cost to full Ceres');

  assert.deepEqual(first.activity.map((row) => row.slotId).sort(), [...EXPECTED_OBJECT_SLOTS].sort());
  assert.equal(new Set(first.activity.map((row) => row.slotId)).size, EXPECTED_OBJECT_SLOTS.length);
  assert.equal(first.activity.length, EXPECTED_OBJECT_SLOTS.length);
  assert.deepEqual(first.collisionAnchors.map((row) => row.slotId),
    EXPECTED_COLLISION_ANCHORS.map((slot) => slot.id));
  assert.equal(new Set(first.collisionAnchors.map((row) => row.slotId)).size, 2);

  for (const expected of EXPECTED_COLLISION_ANCHORS) {
    const descriptor = collisionAnchorSlot(expected.id);
    const row = first.collisionAnchorBySlot[expected.id];
    const pocket = ceresActivityPocket(descriptor.pocketId);
    const expectedPos = sectorLocalToGlobalForSector({
      x: pocket.activityAnchor.localPos.x + descriptor.offset.x,
      z: pocket.activityAnchor.localPos.z + descriptor.offset.z,
    }, pocket.sectorId);
    const field = first.fields.find((entry) => entry.id === descriptor.sourceFieldId);
    assert.ok(row);
    assert.equal(field.asteroidIds[descriptor.sourceIndex], row.id,
      `${descriptor.id} is selected by field id plus zero-based source index`);
    assert.equal(row.id, expected.evidenceEntityId);
    assert.equal(row.radius, expected.evidenceRadius);
    assert.deepEqual(row.pos, { x: expectedPos.x, z: expectedPos.z });
    assert.equal(row.type, 'asteroid');
    assert.equal(row.alive, true);
    assert.equal(row.collides, true);
    assert.ok(row.mass > 0 && row.hull > 0);
    assert.ok(row.data.oreHP > 0 && row.data.yieldU > 0 && row.data.respawnSec > 0);
    assert.ok(Array.isArray(row.data.seams) && row.data.seams.length > 0);
    assert.equal(row.data.activityCollisionAnchorSlotId, descriptor.id);
    assert.equal(Object.hasOwn(row.data, 'activityObjectSlotId'), false);
    const formationId = first.formationByAsteroidId[formationBodyKey(row)];
    assert.equal(typeof formationId, 'string',
      'the recomputed live formation model indexes the relocated collision anchor');
    assert.equal(first.liveFormationIds.includes(formationId), true,
      'the relocated collision anchor resolves to a live targetable formation');
  }

  const expectedPlaceBySlot = new Map([
    ['ceres_refinery_cargo_pod', 'place_conveyor_barge'],
    ['ceres_refinery_disabled_hull', 'place_dead_hulk'],
    ['ceres_ambush_distress_beacon', 'place_nav_buoy'],
    ['ceres_ambush_bait_wreck', 'place_ceres_bait_wreck'],
    ['ceres_cathedral_grave_shard', 'place_ceres_grave_shard'],
  ]);
  for (const row of first.activity) {
    const descriptor = objectSlot(row.slotId);
    const pocket = ceresActivityPocket(descriptor.pocketId);
    const expectedPos = sectorLocalToGlobalForSector({
      x: pocket.activityAnchor.localPos.x + descriptor.offset.x,
      z: pocket.activityAnchor.localPos.z + descriptor.offset.z,
    }, pocket.sectorId);
    assert.deepEqual(row.pos, { x: expectedPos.x, z: expectedPos.z }, `${row.slotId} uses its R5A offset`);
    assert.equal(row.data.activityObjectSlotId, descriptor.id);
    for (const forbidden of [
      'worldRecordId', 'durable', 'persistent', 'persistenceOwner', 'missionId', 'trafficHookId',
    ]) {
      assert.equal(Object.prototype.hasOwnProperty.call(row.data, forbidden), false,
        `${row.slotId} must not gain durable/runtime ownership through ${forbidden}`);
    }

    if (row.slotId === 'ceres_seam_ore_clast') {
      assert.equal(row.type, 'asteroid');
      assert.equal(row.collides, true);
      assert.equal(row.data.fieldId, 'f_ceres_1');
      assert.equal(row.data.typeId, 'ast_metallic');
      assert.equal(row.data.authoredGeologySkin, undefined,
        'the nonzero activity index must leave index-0 geology ownership intact');
      assert.ok(row.data.oreHP > 0 && row.data.yieldU > 0 && row.data.size > 0);
      assert.ok(Array.isArray(row.data.seams) && row.data.seams.length > 0);
    } else {
      assert.equal(row.type, 'fx');
      assert.equal(row.placeId, expectedPlaceBySlot.get(row.slotId));
      assert.equal(row.collides, false);
      assert.equal(row.mass, 0);
      assert.equal(row.ttl, Infinity);
      assert.equal(row.noInterp, true);
      assert.equal(row.data.worldDressing, true);
    }
  }

  assert.deepEqual(first.fieldAsteroidIds.map((row) => row.length), [32, 32, 26]);
  assert.equal(first.fieldAsteroidIds[0][0], 4);
  assert.equal(first.fieldAsteroidIds[0][1], first.activityBySlot.ceres_seam_ore_clast.id);
  assert.equal(first.entityById[4].data.authoredGeologySkin, true);
  assert.equal(first.entityById[4].data.placeId, 'place_asteroid_rock_a');

  assert.deepEqual(first.dressing.map((row) => row.id), [102, 103, 104, 105, 106, 107, 108]);
  // The i=0 prospecting drone is the ambient prop the tender's disabled client re-points; no prop is
  // added, so the dressing list keeps its length, ids and RNG cadence.
  assert.deepEqual(first.dressing.map((row) => row.placeId), [
    'place_nav_buoy',
    'place_dead_hulk',
    'place_nav_buoy',
    'place_ceres_bait_wreck',
    'place_nav_buoy',
    'place_ceres_grave_shard',
    'place_conveyor_barge',
  ]);
  assert.deepEqual(first.activity.map((row) => row.id).sort((a, b) => a - b), [5, 102, 103, 105, 107, 108]);
  assert.equal(first.ceresRngDraws, 495,
    'Ceres materialization must retain the complete pre-R5B content-stream draw count');

  assert.deepEqual(first.unaffectedRngSignature, [
    [104, -12930.087603, 8742.364164],
    [106, -11393.591553, 9264.164417],
  ], 'unaffected tail positions fingerprint the original asteroid/dressing RNG cadence');
  assert.deepEqual(first.numericTail, [
    [109, 'ship', 'sector_ceres_belt'],
    [110, 'ship', 'sector_ceres_belt'],
    [111, 'station', 'sector_helios_prime'],
  ], 'the first entities after Ceres dressing retain their numeric IDs and order');
  assert.equal(first.asteroidInvariantHash, PRE_CLOSEOUT_ASTEROID_INVARIANT_HASH,
    'all per-rock type, mining, collider, size, motion, and seam properties remain byte-stable');
  assert.equal(first.unaffectedAsteroidPositionHash, PRE_CLOSEOUT_UNAFFECTED_POSITION_HASH,
    'every asteroid except the two exact collision bindings retains its seed-47 position');
});

test('R5 acceptance entry wires the legal Hornet physics toolkit without claiming acceptance', () => {
  const entry = CERES_REFERENCE_ACCEPTANCE_ENTRY;
  const pocket = CERES_ACTIVITY_POCKETS_BY_ID[entry.pocketId];
  assert.equal(entry.scope, 'sandbox_acceptance_entry');
  assert.equal(entry.runtimeStatus, 'wired_unaccepted');
  assert.ok(pocket);
  assert.equal(pocket.activityAnchor.zoneId, 'zone_ceres_refinery');
  assert.equal(entry.shipId, 'ship_hornet');
  assert.equal(entry.loadoutId, 'physics_toolkit');
  assert.equal(entry.cameraZoomWU, 144);
  assert.equal(entry.fixedSeed, 47);
  assert.equal(Number.isSafeInteger(entry.fixedSeed), true);
  assert.ok(entry.fixedSeed >= 1 && entry.fixedSeed <= 0xffffffff);
  assert.equal(entry.moduleGrantPolicy, 'named_loadout_only');
  assert.deepEqual(entry.entryPipeline, ['requestSandboxGame', 'game:new', 'game:started', 'applySandboxSetup']);
  assert.equal(typeof requestSandboxGame, 'function');
  assert.equal(typeof applySandboxSetup, 'function');
  assert.deepEqual(entry.requiredSystemOperations, [
    'ships.buyShip',
    'ships.setActiveShip',
    'ships.grantModule',
    'ships.unfitModule',
    'ships.fitModule',
  ]);
  for (const operation of entry.requiredSystemOperations) {
    const method = operation.split('.')[1];
    assert.equal(typeof ships[method], 'function', `${operation} is a live public system operation`);
  }

  const loadout = SANDBOX_PHYSICS_LOADOUTS.find((row) => row.id === entry.loadoutId);
  assert.ok(loadout);
  assert.deepEqual(entry.itemIds, loadout.itemIds);

  const hornet = SHIPS.find((row) => row.id === entry.shipId);
  const defs = entry.itemIds.map((id) => WEAPONS.find((row) => row.id === id));
  assert.ok(hornet && defs.every(Boolean));
  const available = buildSlotList(hornet).map((slot) => ({ ...slot }));
  for (const def of defs) {
    const index = available.findIndex((slot) => fits(slot, def));
    assert.notEqual(index, -1, `${def.id} must fit the canonical Hornet`);
    available.splice(index, 1);
  }
  assert.deepEqual(entry.entryOffset, { x: -72, z: 0 });
  assert.equal(distanceFromPocketAnchor(entry.entryOffset) <= 95, true);
});

test('R5A contract is deeply immutable at its public data boundaries', () => {
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0]), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0].actorSlots), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0].actorSlots[0]), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0].actorSlots[0].route.marks), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0].activityAnchor), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[0].activityAnchor.localPos), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[2].collisionAnchorSlots), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[2].collisionAnchorSlots[0]), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[2].collisionAnchorSlots[0].offset), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_POCKETS[1].externalSiteRefs[0]), true);
  assert.equal(Object.isFrozen(CERES_ACTIVITY_SERVICE_SLOTS[0].binding), true);
  assert.equal(Object.isFrozen(CERES_REFERENCE_ACCEPTANCE_ENTRY), true);
  assert.equal(ceresActivityPocket('__proto__'), null);
  assert.equal(ceresActivityPocket('constructor'), null);
});

function actor(id) {
  const found = CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots).find((slot) => slot.id === id);
  assert.ok(found, `missing actor slot ${id}`);
  return found;
}

function objectSlot(id) {
  const found = CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.objectSlots).find((slot) => slot.id === id);
  assert.ok(found, `missing object slot ${id}`);
  return found;
}

function collisionAnchorSlot(id) {
  const found = CERES_ACTIVITY_POCKETS
    .flatMap((pocket) => pocket.collisionAnchorSlots)
    .find((slot) => slot.id === id);
  assert.ok(found, `missing collision anchor slot ${id}`);
  return found;
}

function materializeCeresActivityObjects(seed) {
  const sim = createSimulation({ seed, systems: [world, asteroidSites, asteroidFormations] });
  const { state } = sim;
  let originalMulberry32 = null;
  try {
    state.mode = 'flight';
    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: sectorLocalToGlobalForSector({ x: 0, z: 0 }, 'sector_ceres_belt'),
      vel: { x: 0, z: 0 },
      radius: 10,
      mass: 1,
      collides: false,
      data: { ceresActivityHarnessPlayer: true },
    });
    state.playerId = player.id;
    const worldSystem = sim.registry.get('world');
    const drawCounts = new Map();
    originalMulberry32 = worldSystem.helpers.mulberry32;
    worldSystem.helpers.mulberry32 = (rngSeed) => {
      const next = originalMulberry32(rngSeed);
      return () => {
        drawCounts.set(rngSeed, (drawCounts.get(rngSeed) || 0) + 1);
        return next();
      };
    };
    const ceresContentSeed = worldSystem.helpers.hash32(seed, 'sector_ceres_belt', 0);
    worldSystem.enterSector('sector_ceres_belt', {
      continuous: true,
      noTeleport: true,
      placePlayer: false,
    });
    sim.step(SIM_DT);
    const formationsSystem = sim.registry.get('asteroidFormations');
    const first = captureCeresActivityState(state, formationsSystem.currentModel());

    worldSystem.enterSector('sector_ceres_belt', {
      continuous: true,
      noTeleport: true,
      placePlayer: false,
    });
    const reentry = captureCeresActivityState(state, formationsSystem.currentModel());
    return {
      ...first,
      ceresRngDraws: drawCounts.get(ceresContentSeed) || 0,
      sameSectorReentrySignature: reentry.fullCeresSignature,
    };
  } finally {
    if (originalMulberry32) sim.registry.get('world').helpers.mulberry32 = originalMulberry32;
    sim.dispose();
  }
}

function captureCeresActivityState(state, formationModel) {
  const all = [...state.entities.values()];
  const entities = all.filter((entity) => {
    if (!entity || entity.alive === false || entity.data?.ceresActivityHarnessPlayer) return false;
    const sectorId = entity.homeSectorId || entity.data?.homeSectorId || entity.data?.sectorId || null;
    const recordId = String(entity.data?.worldRecordId || '');
    return sectorId === 'sector_ceres_belt' || recordId.startsWith('world_site_wreck_cathedral/');
  });
  const byType = {};
  for (const entity of entities) byType[entity.type] = (byType[entity.type] || 0) + 1;
  const sortedByType = Object.fromEntries(
    Object.entries(byType).sort(([left], [right]) => left.localeCompare(right)),
  );
  const collidable = entities.filter((entity) => entity.collides === true);
  const colliders = collidable.reduce((sum, entity) => {
    const manifest = resolveCollisionProxyManifest(entity);
    return sum + (manifest ? expandProxyPrimitives(manifest, { entity }).length : 1);
  }, 0);
  const activity = entities
    .filter((entity) => typeof entity.data?.activityObjectSlotId === 'string')
    .map((entity) => ({
      id: entity.id,
      slotId: entity.data.activityObjectSlotId,
      type: entity.type,
      placeId: entity.data.placeId,
      pos: { x: entity.pos.x, z: entity.pos.z },
      mass: entity.mass,
      collides: entity.collides === true,
      ttl: entity.ttl,
      noInterp: entity.flags?.noInterp === true,
      data: cloneJson(entity.data),
    }))
    .sort((left, right) => left.id - right.id);
  const activityBySlot = Object.fromEntries(activity.map((row) => [row.slotId, row]));
  const active = state.world.activeSector;
  const collisionAnchors = entities
    .filter((entity) => typeof entity.data?.activityCollisionAnchorSlotId === 'string')
    .map((entity) => ({
      id: entity.id,
      slotId: entity.data.activityCollisionAnchorSlotId,
      type: entity.type,
      alive: entity.alive !== false,
      pos: { x: entity.pos.x, z: entity.pos.z },
      radius: entity.radius,
      mass: entity.mass,
      hull: entity.hull,
      collides: entity.collides === true,
      data: cloneJson(entity.data),
    }))
    .sort((left, right) => left.id - right.id);
  const collisionAnchorBySlot = Object.fromEntries(collisionAnchors.map((row) => [row.slotId, row]));
  const asteroids = entities
    .filter((entity) => entity.type === 'asteroid')
    .sort((left, right) => left.id - right.id);
  const origin = sectorGlobalOrigin('sector_ceres_belt');
  const asteroidInvariantHash = hashJson(asteroids.map((entity) => {
    const data = cloneJson(entity.data);
    delete data.activityCollisionAnchorSlotId;
    return {
      id: entity.id,
      type: entity.type,
      radius: entity.radius,
      mass: entity.mass,
      hull: entity.hull,
      hullMax: entity.hullMax,
      angVel: entity.angVel,
      collides: entity.collides,
      data,
    };
  }));
  const unaffectedAsteroidPositionHash = hashJson(asteroids
    .filter((entity) => entity.id !== 9 && entity.id !== 38)
    .map((entity) => [entity.id, entity.pos.x - origin.x, entity.pos.z - origin.z]));
  const entityById = Object.fromEntries([4].map((id) => {
    const entity = state.entities.get(id);
    return [id, entity ? { id, type: entity.type, data: cloneJson(entity.data) } : null];
  }));
  const pointSignature = (id) => {
    const entity = state.entities.get(id);
    return [id, round6(entity?.pos?.x), round6(entity?.pos?.z)];
  };
  return {
    census: {
      total: entities.length,
      byType: sortedByType,
      collidable: collidable.length,
      colliders,
    },
    activity,
    activityBySlot,
    collisionAnchors,
    collisionAnchorBySlot,
    formationByAsteroidId: { ...formationModel.byAsteroidId },
    liveFormationIds: formationModel.formations.map((formation) => formation.id),
    entityById,
    fields: active.fields.map((field) => ({ id: field.id, asteroidIds: [...field.asteroidIds] })),
    fieldAsteroidIds: active.fields.map((field) => [...field.asteroidIds]),
    dressing: active.dressing.map((row) => ({ id: row.id, placeId: row.placeId })),
    // 102/103/105/107/108 are the dressing props claimed by an activity slot; 104 and 106 are the
    // ambient buoys nothing binds, so they are what still fingerprints the untouched RNG cadence.
    unaffectedRngSignature: [104, 106].map(pointSignature),
    numericTail: [109, 110, 111].map((id) => {
      const entity = state.entities.get(id);
      return [id, entity?.type || null, entity?.homeSectorId || entity?.data?.homeSectorId || null];
    }),
    asteroidInvariantHash,
    unaffectedAsteroidPositionHash,
    fullCeresSignature: entities
      .map((entity) => ({
        id: entity.id,
        type: entity.type,
        team: entity.team,
        factionId: entity.factionId,
        pos: { x: entity.pos.x, y: entity.pos.y, z: entity.pos.z },
        vel: { x: entity.vel.x, y: entity.vel.y, z: entity.vel.z },
        rot: entity.rot,
        angVel: entity.angVel,
        radius: entity.radius,
        mass: entity.mass,
        hull: entity.hull,
        hullMax: entity.hullMax,
        collides: entity.collides === true,
        ttl: Number.isFinite(entity.ttl) ? entity.ttl : 'Infinity',
        flags: cloneJson(entity.flags),
        data: cloneJson(entity.data),
      }))
      .sort((left, right) => left.id - right.id),
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function round6(value) {
  return Number(Number(value).toFixed(6));
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
