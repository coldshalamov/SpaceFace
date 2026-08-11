// R5A — canonical, inert activity choreography for the Ceres reference pocket.
//
// PQ-020 remains the geography owner. This module references its existing stations, zones and
// landmarks; it does not register a place, spawn an actor, or run a job. Runtime owners consume the
// stable slot and route descriptors in later R5 slices. All positions are sector-local offsets from
// the named activity anchor, so the R1 camera bands never accidentally measure from sector origin.

import {
  CERES_THROUGHLINE_BEACON_LOCAL_POS,
  CERES_WRECK_CATHEDRAL_LOCAL_POS,
  SECTOR_ANCHORS,
} from './sectorAnchors.js';
import { SECTOR_ZONES } from './sectorZones.js';
import {
  CINDER_SLUICE_LOCAL_POS,
  CINDER_SLUICE_SECTOR_ID,
  CINDER_SLUICE_SITE_ID,
} from './environmentalMachinery.js';

export const CERES_ACTIVITY_SECTOR_ID = 'sector_ceres_belt';
export const CERES_AUTHORED_ACTIVITY_CAPACITY = 9;

/** R1's accepted camera-local population bands, measured from each pocket activity anchor. */
export const CERES_ACTIVITY_BANDS = Object.freeze({
  immediate: Object.freeze({ id: 'immediate', minWU: 0, maxWU: 95, minInclusive: true, maxInclusive: true }),
  moving: Object.freeze({ id: 'moving', minWU: 95, maxWU: 125, minInclusive: false, maxInclusive: true }),
  speedRevealed: Object.freeze({ id: 'speed_revealed', minWU: 125, maxWU: 165, minInclusive: false, maxInclusive: true }),
});

const ceresAnchors = requireRecord(SECTOR_ANCHORS[CERES_ACTIVITY_SECTOR_ID], 'Ceres sector anchors');
const ceresZones = requireArray(SECTOR_ZONES[CERES_ACTIVITY_SECTOR_ID], 'Ceres sector zones');

const stationCeres = findById(ceresAnchors.stations, 'station_ceres', 'Ceres station anchor');
const refineryZone = findById(ceresZones, 'zone_ceres_refinery', 'Ceres refinery zone');
const miningZone = findById(ceresZones, 'zone_ceres_belt', 'Ceres mining zone');
const throughlineZone = findById(ceresZones, 'zone_ceres_throughline', 'Ceres Throughline zone');
const throughlinePoi = findById(ceresAnchors.pois, 'poi_ceres_throughline', 'Ceres Throughline POI');
const cathedralPoi = findById(ceresAnchors.pois, 'world_site_wreck_cathedral', 'Ceres Cathedral POI');

assertSamePoint(stationCeres.pos, refineryZone.center, 'station_ceres / zone_ceres_refinery');
assertSamePoint(throughlinePoi.pos, CERES_THROUGHLINE_BEACON_LOCAL_POS, 'Throughline POI / beacon constant');
assertSamePoint(cathedralPoi.pos, CERES_WRECK_CATHEDRAL_LOCAL_POS, 'Cathedral POI / anchor constant');
if (CINDER_SLUICE_SECTOR_ID !== CERES_ACTIVITY_SECTOR_ID) {
  throw new Error(`Cinder Sluice belongs to ${CINDER_SLUICE_SECTOR_ID}, not ${CERES_ACTIVITY_SECTOR_ID}`);
}

// ── Route topology (PQ-045.route-topology) ──────────────────────────────────────────────────────
// Every route used to be built from one shared pair of cardinal marks, so four pockets with four
// different fictions all read as the same back-and-forth. A two-mark route only has two geometric
// degrees of freedom worth anything: the angle the two marks subtend at the pocket anchor (SWEEP)
// and how far apart they actually are (SPAN). Those are what a player sees — sweep is the shape the
// traffic traces, and span is the speed, because npcJobsRuntime derives speed as span/durationS and
// the durations are fixed. So each pocket is given its own sweep/span band, chosen from what that
// pocket's work IS:
//
//   Working Seam      tight wedge   ~60-75 deg    close, repetitive extraction beside one ore face
//   Cathedral Grave   quarter arc  ~100-110 deg   working and patrolling AROUND a grave, not through
//   Refinery Pocket   wide oblique ~135-150 deg   long call-outs across a yard between hub and client
//   Ambush Run        transit lane ~165-180 deg   the Throughline is a lane; you cross it end to end
//
// Bearings are taken from geography that already exists rather than chosen. A mark that names a real
// object is aimed from that object: on its true bearing where the mark is simply a destination (the
// cargo pod, the grave shard), and deliberately held around from it where the runtime physically
// drives the actor to the live entity (the disabled hull, the ore clast) — there, an on-bearing mark
// would make live-target tracking and authored-waypoint fallback indistinguishable, which is the
// defect PQ-045 has been unpicking all along. The Ambush lane axis is the bearing between the two
// authored collision anchors, (48,64)->(150,20). Both held-off separations are asserted, not assumed.
//
// Distinctness is not a claim made in this comment. It is computed from the marks and enforced at
// module load in CERES_ROUTE_TOPOLOGY below, and re-derived independently in
// test/ceres-active-pockets.test.mjs. Retuning a mark until two pockets collide fails both.

function point(x, z) {
  return Object.freeze({ x, z });
}

function mark(id, x, z, targetRef = null) {
  const offset = point(x, z);
  assertDistanceInBand(offset, CERES_ACTIVITY_BANDS.moving, `route mark ${id}`);
  return Object.freeze({ id, coordinateSpace: 'pocket_anchor_offset_v1', offset, targetRef });
}

function route({ id, owner = 'npcJobsRuntime', jobKind, durationS, marks, receiptType = null }) {
  return Object.freeze({
    id,
    inert: true,
    owner,
    jobKind,
    durationS,
    receiptType,
    marks: Object.freeze(marks),
  });
}

function actor({
  id,
  pocketId,
  presentationRole,
  jobKind,
  spawnOffset,
  route: jobRoute,
  identity = 'dedicated',
  lawful = false,
  passive = true,
  binding = null,
}) {
  assertDistanceInBand(spawnOffset, CERES_ACTIVITY_BANDS.immediate, `actor ${id} spawn`);
  return Object.freeze({
    id,
    pocketId,
    identity,
    presentationRole,
    jobKind,
    lawful,
    passive,
    coordinateSpace: 'pocket_anchor_offset_v1',
    spawnOffset,
    route: jobRoute,
    binding,
    worldRecordSlotId: `ceres:activity:${id}`,
    tombstonePolicy: 'no_refill_or_reassign',
    countsTowardPocketActorCensus: true,
    countsTowardAuthoredCapacity: true,
  });
}

function objectSlot({ id, pocketId, kind, offset, runtimeOwner, targetRef = null }) {
  assertDistanceInBand(offset, CERES_ACTIVITY_BANDS.immediate, `object ${id}`);
  return Object.freeze({
    id,
    pocketId,
    kind,
    coordinateSpace: 'pocket_anchor_offset_v1',
    offset,
    runtimeOwner,
    targetRef,
    inert: true,
  });
}

function collisionAnchorSlot({ id, pocketId, sourceFieldId, sourceIndex, offset }) {
  const distance = Math.hypot(offset.x, offset.z);
  if (!Number.isInteger(sourceIndex) || sourceIndex <= 0) {
    throw new Error(`collision anchor ${id} must bind a nonzero integer source index`);
  }
  if (distance > CERES_ACTIVITY_BANDS.speedRevealed.maxWU) {
    throw new Error(`collision anchor ${id} lies outside the accepted activity bands`);
  }
  return Object.freeze({
    id,
    pocketId,
    coordinateSpace: 'pocket_anchor_offset_v1',
    offset,
    sourceFieldId,
    sourceIndex,
    runtimeOwner: 'world',
    inert: true,
    countsTowardObjectSlotCensus: false,
    countsTowardAuthoredCapacity: false,
  });
}

function canonicalAnchor({ kind, id, zoneId = null, placeId = null, localPos }) {
  return Object.freeze({
    coordinateSpace: 'sector_local_v1',
    kind,
    id,
    zoneId,
    placeId,
    // Derive a frozen value from the canonical import instead of exporting its mutable object.
    localPos: point(localPos.x, localPos.z),
  });
}

function pocket({
  id,
  label,
  identity,
  anchor,
  actorSlots,
  objectSlots,
  collisionAnchorSlots = [],
  serviceSlotIds = [],
  externalSiteRefs = [],
}) {
  if (actorSlots.length !== 2) throw new Error(`${id} must declare exactly two pocket actors`);
  return Object.freeze({
    id,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    label,
    pq020Identity: identity,
    activityAnchor: anchor,
    bandOrigin: Object.freeze({ kind: 'activity_anchor', anchorId: anchor.id }),
    actorSlots: Object.freeze(actorSlots),
    objectSlots: Object.freeze(objectSlots),
    collisionAnchorSlots: Object.freeze(collisionAnchorSlots),
    serviceSlotIds: Object.freeze(serviceSlotIds),
    externalSiteRefs: Object.freeze(externalSiteRefs),
    authoredCapacityContribution: actorSlots.length + serviceSlotIds.length,
    runtimeStatus: 'descriptor_only',
  });
}

const refineryId = 'ceres_refinery_pocket';
const seamId = 'ceres_working_seam';
const ambushId = 'ceres_ambush_run';
const cathedralId = 'ceres_cathedral_grave';

const refineryObjects = Object.freeze([
  objectSlot({
    id: 'ceres_refinery_cargo_pod',
    pocketId: refineryId,
    kind: 'cargo_staging_pod',
    offset: point(68, -22),
    runtimeOwner: 'world',
    targetRef: 'object:ceres_refinery_cargo_pod',
  }),
  // The Pitborn yard tender's service client. Every other pocket object is scenery the cast works
  // beside; this one is the reason a tender exists at all, so it is a real logical slot rather than
  // an abstract `activity:` choreography mark. It sits inside the immediate band on the opposite
  // side of the anchor from the cargo pod, so the tender's berth->client leg reads as a call-out
  // across the refinery rather than a second approach to the freight staging area.
  //
  // Three constraints pin this offset, and it satisfies all of them at once with little room spare:
  //   1. 91.9 WU from the anchor — objectSlot() throws above the 95 WU immediate band, so retuning
  //      this outward is the failure a future edit is most likely to hit.
  //   2. 91.4 WU from the tender's own spawn at (-44, 24), which must exceed the derived work berth
  //      (42 + 24 + 12 = 78 WU). Closer in, the tender would materialize already inside its berth,
  //      and the controller's correct response — reverse out to clearance — would be the first thing
  //      a player entering Ceres ever saw it do.
  //   3. 0.59 rad off the bearing from that spawn to the authored client mark, so servicing the real
  //      casualty is visibly a different heading rather than an invisible refinement of the old one.
  //      PQ-045.route-topology re-aimed that client mark and deliberately did NOT move it onto the
  //      hull's own bearing, which would have collapsed this separation to 0.13 rad and quietly
  //      undone the reason the hull sits here. The separation is asserted, not just described.
  objectSlot({
    id: 'ceres_refinery_disabled_hull',
    pocketId: refineryId,
    kind: 'disabled_service_client',
    offset: point(-65, -65),
    runtimeOwner: 'world',
    targetRef: 'object:ceres_refinery_disabled_hull',
  }),
]);
const seamObjects = Object.freeze([
  objectSlot({
    id: 'ceres_seam_ore_clast',
    pocketId: seamId,
    kind: 'world_owned_asteroid_slot',
    offset: point(-64, 28),
    runtimeOwner: 'world',
    targetRef: 'field:slot:ceres_seam_ore_clast',
  }),
]);
const ambushObjects = Object.freeze([
  objectSlot({
    id: 'ceres_ambush_distress_beacon',
    pocketId: ambushId,
    kind: 'distress_beacon',
    offset: point(-72, 20),
    runtimeOwner: 'world',
  }),
  objectSlot({
    id: 'ceres_ambush_bait_wreck',
    pocketId: ambushId,
    kind: 'bait_wreck_visual',
    offset: point(82, -18),
    runtimeOwner: 'world',
  }),
]);
const ambushCollisionAnchors = Object.freeze([
  collisionAnchorSlot({
    id: 'ceres_throughline_collision_anchor',
    pocketId: ambushId,
    sourceFieldId: 'f_ceres_1',
    sourceIndex: 5,
    offset: point(48, 64),
  }),
  collisionAnchorSlot({
    id: 'ceres_ambush_collision_anchor',
    pocketId: ambushId,
    sourceFieldId: 'f_ceres_2',
    sourceIndex: 2,
    offset: point(150, 20),
  }),
]);
const cathedralObjects = Object.freeze([
  objectSlot({
    id: 'ceres_cathedral_grave_shard',
    pocketId: cathedralId,
    kind: 'grave_shard',
    offset: point(-70, 24),
    runtimeOwner: 'world',
    targetRef: 'object:ceres_cathedral_grave_shard',
  }),
]);

const refineryActors = Object.freeze([
  actor({
    id: 'ceres_refinery_hauler',
    pocketId: refineryId,
    presentationRole: 'hauler',
    jobKind: 'hauler',
    spawnOffset: point(52, -18),
    route: route({
      id: 'ceres_refinery_freight_loop',
      jobKind: 'hauler',
      durationS: 24,
      receiptType: 'freight:arrival',
      // Wide oblique, 135.6 deg / 206.3 WU. The approach mark sits on the cargo pod's true bearing
      // (-17.8 deg vs the pod's own -17.9); the station leg swings back across the yard rather than
      // running through the hub, so the freight run reads as a long call-out between two stations
      // of work instead of a shuttle that happens to pass the anchor.
      marks: [
        mark('refinery_cargo_approach', 112, -36, 'object:ceres_refinery_cargo_pod'),
        mark('refinery_station_approach', -49, 93, 'dest:station_ceres'),
      ],
    }),
  }),
  actor({
    id: 'ceres_refinery_tender',
    pocketId: refineryId,
    identity: 'reuse:factionPresence:pitborn:yardTender:sector_ceres_belt',
    presentationRole: 'tender',
    jobKind: 'tender',
    spawnOffset: point(-44, 24),
    binding: Object.freeze({
      owner: 'factionPresence',
      match: Object.freeze({
        sectorId: CERES_ACTIVITY_SECTOR_ID,
        factionId: 'faction_pitborn',
        yardTender: true,
      }),
      runtimeStatus: 'requires_world_record_adoption',
    }),
    route: route({
      id: 'ceres_refinery_tender_service',
      jobKind: 'tender',
      durationS: 28,
      // Wide oblique, 147.0 deg / 217.7 WU — the same yard-crossing family as the hauler but a
      // longer, slower swing, and aimed at the opposite quadrant because its client is. The berth
      // sits on the tender's own spawn side (127.8 deg vs a spawn bearing of 151.4), so it leaves
      // from where it lives. The client mark keeps its 0.59 rad offset from the real hull bearing.
      marks: [
        mark('refinery_tender_berth', -66, 85, 'station:station_ceres:service-berth'),
        mark('refinery_tender_client', 10, -119, 'object:ceres_refinery_disabled_hull'),
      ],
    }),
  }),
]);

const seamActors = Object.freeze([
  actor({
    id: 'ceres_seam_miner',
    pocketId: seamId,
    // Preserve the durable slot id for saves, but the shipped actor is the Ironback Ore Barge:
    // one heavy hull cuts a bounded parcel at the seam and physically carries that same lot back
    // to Ceres refinery. `jobKind: miner` deliberately reuses the extraction/work owner rather
    // than inventing an ore-carrier state machine.
    presentationRole: 'ore_carrier',
    jobKind: 'miner',
    spawnOffset: point(-42, -24),
    route: route({
      id: 'ceres_seam_extraction_loop',
      jobKind: 'miner',
      durationS: 24,
      receiptType: 'mining:npcExtraction',
      // The first mark resolves to the real refinery berth; the second resolves to the authored
      // physical clast. Their separation is the visible transport leg. The local offsets remain
      // deterministic fallback geometry while targetRef keeps live station/asteroid authority.
      marks: [
        mark('seam_miner_work_pad', -29, -117, 'dest:station_ceres'),
        mark('seam_miner_ore_face', -116, -29, 'field:slot:ceres_seam_ore_clast'),
      ],
    }),
  }),
  actor({
    id: 'ceres_seam_surveyor',
    pocketId: seamId,
    presentationRole: 'surveyor',
    jobKind: 'surveyor',
    spawnOffset: point(50, 20),
    route: route({
      id: 'ceres_seam_survey_sweep',
      jobKind: 'surveyor',
      durationS: 26,
      // Tight wedge, 71.9 deg / 143.8 WU — same close-work family as the miner, opened a little
      // wider and swept across the quadrant the miner is not in, so the two seam actors read as one
      // crew covering different ground rather than two copies of the same patrol.
      marks: [
        mark('seam_survey_mark_a', 123, 4, 'activity:scan-mark-a'),
        mark('seam_survey_mark_b', 34, 117, 'activity:scan-mark-b'),
      ],
    }),
  }),
]);

const ambushActors = Object.freeze([
  actor({
    id: 'ceres_ambush_loaded_hauler',
    pocketId: ambushId,
    presentationRole: 'hauler',
    jobKind: 'hauler',
    spawnOffset: point(-48, 20),
    route: route({
      id: 'ceres_ambush_loaded_crossing',
      jobKind: 'hauler',
      durationS: 22,
      // Transit lane, 180.0 deg / 243.7 WU — the only route at Ceres that still runs straight
      // through its anchor, because the Throughline is the one pocket where a lane IS the fiction.
      // Re-aimed off the cardinal axis onto the authored lane bearing: the two collision anchors at
      // (48,64) and (150,20) define -23.34 deg, and these marks run -23.20/156.80.
      marks: [
        mark('ambush_hauler_inbound', -112, 48, 'activity:throughline-inbound'),
        mark('ambush_hauler_outbound', 112, -48, 'activity:throughline-outbound'),
      ],
    }),
  }),
  actor({
    id: 'ceres_ambush_escort',
    pocketId: ambushId,
    presentationRole: 'escort',
    jobKind: 'patrol',
    lawful: true,
    spawnOffset: point(52, -18),
    route: route({
      id: 'ceres_ambush_escort_crossing',
      jobKind: 'patrol',
      durationS: 20,
      // Transit lane, 168.1 deg / 227.6 WU. The escort runs the same lane as its ward but not the
      // same line: 6 deg canted off the axis and pulled inside it, so it crosses the hauler's track
      // twice per pass instead of trailing it down an identical straight. Still the fastest pair at
      // Ceres, which is what an escort keeping station on a loaded hauler should look like.
      marks: [
        mark('ambush_escort_inbound', -109, 34, 'actor:ceres_ambush_loaded_hauler'),
        mark('ambush_escort_outbound', 100, -56, 'actor:ceres_ambush_loaded_hauler'),
      ],
    }),
  }),
]);

const cathedralActors = Object.freeze([
  actor({
    id: 'ceres_cathedral_salvor',
    pocketId: cathedralId,
    presentationRole: 'salvor',
    jobKind: 'salvor',
    spawnOffset: point(-38, 22),
    route: route({
      id: 'ceres_cathedral_salvage_loop',
      jobKind: 'salvor',
      durationS: 30,
      // Quarter arc, 101.0 deg / 182.8 WU. The salvor works its way AROUND the wreck rather than
      // across it — the shard mark is on the grave shard's true bearing (161.12 deg vs the shard's
      // 161.08) and the hulk leg turns a corner to reach the far face of the same site.
      marks: [
        mark('cathedral_salvor_shard', -114, 39, 'object:ceres_cathedral_grave_shard'),
        mark('cathedral_salvor_hulk', 58, 101, 'world-site:world_site_wreck_cathedral'),
      ],
    }),
  }),
  actor({
    id: 'ceres_cathedral_patrol',
    pocketId: cathedralId,
    presentationRole: 'patrol',
    jobKind: 'patrol',
    lawful: true,
    spawnOffset: point(46, -28),
    route: route({
      id: 'ceres_cathedral_patrol_perimeter',
      jobKind: 'patrol',
      durationS: 28,
      // Quarter arc, 107.9 deg / 197.2 WU — the widest beat that still goes around the grave instead
      // of through it, swung across the southern quadrants the salvor never enters. Same circling
      // family as the salvor, a longer and faster leg, which is what a perimeter should be next to
      // someone stopped and working.
      marks: [
        mark('cathedral_patrol_beat_a', 57, -108, 'activity:grave-perimeter-a'),
        mark('cathedral_patrol_beat_b', -120, -21, 'activity:grave-perimeter-b'),
      ],
    }),
  }),
]);

/** Existing hazard traffic remains the only phase/route owner for this ninth stable identity. */
export const CERES_ACTIVITY_SERVICE_SLOTS = Object.freeze([
  Object.freeze({
    id: 'ceres_cinder_service_hauler',
    pocketId: seamId,
    identity: 'reserved_slot:existing_traffic_hook',
    presentationRole: 'hauler',
    jobKind: null,
    binding: Object.freeze({
      owner: 'traffic',
      hookId: 'ceres_cinder_sluice_service',
      siteId: CINDER_SLUICE_SITE_ID,
      stagingSource: 'CINDER_SLUICE_TRAFFIC_STAGING_POS',
      currentPolicy: 'eligible_ambient_actor',
      targetPolicy: 'reserved_stable_slot',
      runtimeStatus: 'requires_r5d_hook_reconciliation',
    }),
    worldRecordSlotId: 'ceres:activity:ceres_cinder_service_hauler',
    countsTowardPocketActorCensus: false,
    countsTowardAuthoredCapacity: true,
    tombstonePolicy: 'no_refill_or_reassign_after_r5d_reconciliation',
  }),
]);

export const CERES_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: refineryId,
    label: 'Refinery Pocket',
    identity: Object.freeze({ zoneId: refineryZone.id, stationId: stationCeres.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationCeres.id, zoneId: refineryZone.id, placeId: stationCeres.id,
      localPos: stationCeres.pos,
    }),
    actorSlots: refineryActors,
    objectSlots: refineryObjects,
  }),
  pocket({
    id: seamId,
    label: 'Working Seam',
    identity: Object.freeze({ zoneId: miningZone.id }),
    anchor: canonicalAnchor({
      kind: 'zone', id: miningZone.id, zoneId: miningZone.id,
      placeId: null, localPos: miningZone.center,
    }),
    actorSlots: seamActors,
    objectSlots: seamObjects,
    serviceSlotIds: CERES_ACTIVITY_SERVICE_SLOTS.map((slot) => slot.id),
    externalSiteRefs: [Object.freeze({
      id: CINDER_SLUICE_SITE_ID,
      kind: 'external_service_site',
      coordinateSpace: 'sector_local_v1',
      localPos: point(CINDER_SLUICE_LOCAL_POS.x, CINDER_SLUICE_LOCAL_POS.z),
      countsTowardBandCensus: false,
    })],
  }),
  pocket({
    id: ambushId,
    label: 'Ambush Run',
    identity: Object.freeze({ zoneId: throughlineZone.id, placeId: throughlinePoi.id }),
    anchor: canonicalAnchor({
      kind: 'poi', id: throughlinePoi.id, zoneId: throughlineZone.id,
      placeId: throughlinePoi.id, localPos: throughlinePoi.pos,
    }),
    actorSlots: ambushActors,
    objectSlots: ambushObjects,
    collisionAnchorSlots: ambushCollisionAnchors,
  }),
  pocket({
    id: cathedralId,
    label: 'Cathedral Grave',
    identity: Object.freeze({ siteId: cathedralPoi.id, placeId: cathedralPoi.id }),
    anchor: canonicalAnchor({
      kind: 'world_site', id: cathedralPoi.id, placeId: cathedralPoi.id,
      localPos: CERES_WRECK_CATHEDRAL_LOCAL_POS,
    }),
    actorSlots: cathedralActors,
    objectSlots: cathedralObjects,
  }),
]);

export const CERES_ACTIVITY_POCKET_ORDER = Object.freeze(CERES_ACTIVITY_POCKETS.map((entry) => entry.id));
export const CERES_ACTIVITY_POCKETS_BY_ID = Object.freeze(Object.fromEntries(
  CERES_ACTIVITY_POCKETS.map((entry) => [entry.id, entry]),
));
export const CERES_POCKET_ACTOR_SLOT_ORDER = Object.freeze(CERES_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const CERES_AUTHORED_ACTIVITY_SLOT_ORDER = Object.freeze([
  ...CERES_POCKET_ACTOR_SLOT_ORDER,
  ...CERES_ACTIVITY_SERVICE_SLOTS.map((slot) => slot.id),
]);

// Topology classes are deliberately COARSE. A distinctness rule that compares exact floats is
// satisfied by noise — two routes 0.4 deg apart would "differ" while reading identically in play —
// so sweep is bucketed to 15 deg and span to 25 WU, and two routes only count as different when
// they are different to the eye. Every authored route sits at least 3.4 deg and 4.6 WU clear of a
// bucket edge, so this classifies a shape rather than a rounding.
const SWEEP_CLASS_STEP_DEG = 15;
const SPAN_CLASS_STEP_WU = 25;

function markBearingDeg(offset) {
  return (Math.atan2(offset.z, offset.x) * 180) / Math.PI;
}

/** The angle the two marks subtend at the pocket anchor: 0 = a radial poke, 180 = straight through. */
function routeSweepDeg(marks) {
  const spread = Math.abs(markBearingDeg(marks[1].offset) - markBearingDeg(marks[0].offset));
  return spread > 180 ? 360 - spread : spread;
}

/** How far the actor actually travels between marks. npcJobsRuntime turns this into its speed. */
function routeSpanWU(marks) {
  return Math.hypot(
    marks[1].offset.x - marks[0].offset.x,
    marks[1].offset.z - marks[0].offset.z,
  );
}

function routeTopology(slot) {
  const sweepDeg = routeSweepDeg(slot.route.marks);
  const spanWU = routeSpanWU(slot.route.marks);
  return Object.freeze({
    pocketId: slot.pocketId,
    actorSlotId: slot.id,
    routeId: slot.route.id,
    sweepDeg: Math.round(sweepDeg * 1000) / 1000,
    spanWU: Math.round(spanWU * 1000) / 1000,
    sweepClassDeg: Math.round(sweepDeg / SWEEP_CLASS_STEP_DEG) * SWEEP_CLASS_STEP_DEG,
    spanClassWU: Math.round(spanWU / SPAN_CLASS_STEP_WU) * SPAN_CLASS_STEP_WU,
    speedWUPerS: Math.round((spanWU / slot.route.durationS) * 1000) / 1000,
  });
}

/** Measured route shapes, derived from the marks themselves rather than declared alongside them. */
export const CERES_ROUTE_TOPOLOGY = Object.freeze(CERES_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));

export function ceresRouteTopologyClass(row) {
  return `${row.sweepClassDeg}deg/${row.spanClassWU}wu`;
}

// Ceres is the propagation template for every other sector, so it has to satisfy the
// no-two-places-share-a-topology rule against ITSELF first. This runs at module load, which means
// the required gates enforce it: check:pq020:ceres-topology imports world, world imports this file.
const routeTopologyClasses = CERES_ROUTE_TOPOLOGY.map(ceresRouteTopologyClass);
if (new Set(routeTopologyClasses).size !== routeTopologyClasses.length) {
  throw new Error(`Ceres routes share a topology class: ${CERES_ROUTE_TOPOLOGY
    .map((row) => `${row.routeId}=${ceresRouteTopologyClass(row)}`).join(', ')}`);
}
const pocketTopologyClasses = CERES_ACTIVITY_POCKETS.map((entry) => CERES_ROUTE_TOPOLOGY
  .filter((row) => row.pocketId === entry.id)
  .map(ceresRouteTopologyClass)
  .sort()
  .join('+'));
if (new Set(pocketTopologyClasses).size !== pocketTopologyClasses.length) {
  throw new Error(`Ceres pockets share a route topology: ${pocketTopologyClasses.join(', ')}`);
}
if (CERES_ROUTE_TOPOLOGY.length !== CERES_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('every Ceres pocket actor must contribute exactly one measured route topology');
}

/** Sandbox acceptance entry; production pockets remain ship-agnostic and acceptance remains open. */
export const CERES_REFERENCE_ACCEPTANCE_ENTRY = Object.freeze({
  scope: 'sandbox_acceptance_entry',
  sectorId: CERES_ACTIVITY_SECTOR_ID,
  pocketId: refineryId,
  shipId: 'ship_hornet',
  loadoutId: 'physics_toolkit',
  itemIds: Object.freeze([
    'wpn_concussion_cannon_m',
    'wpn_gravity_marker_s',
    'wpn_momentum_sink_s',
  ]),
  cameraZoomWU: 144,
  fixedSeed: 47,
  entryOffset: point(-72, 0),
  entryPipeline: Object.freeze(['requestSandboxGame', 'game:new', 'game:started', 'applySandboxSetup']),
  requiredSystemOperations: Object.freeze([
    'ships.buyShip',
    'ships.setActiveShip',
    'ships.grantModule',
    'ships.unfitModule',
    'ships.fitModule',
  ]),
  moduleGrantPolicy: 'named_loadout_only',
  runtimeStatus: 'wired_unaccepted',
});

if (CERES_POCKET_ACTOR_SLOT_ORDER.length !== 8) {
  throw new Error(`Ceres activity contract requires 8 pocket actors; got ${CERES_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (CERES_AUTHORED_ACTIVITY_SLOT_ORDER.length !== CERES_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Ceres authored capacity mismatch: ${CERES_AUTHORED_ACTIVITY_SLOT_ORDER.length}`);
}
if (new Set(CERES_AUTHORED_ACTIVITY_SLOT_ORDER).size !== CERES_AUTHORED_ACTIVITY_SLOT_ORDER.length) {
  throw new Error('Ceres authored activity slot ids must be unique');
}
const collisionAnchors = CERES_ACTIVITY_POCKETS.flatMap((pocketEntry) => pocketEntry.collisionAnchorSlots);
if (collisionAnchors.length !== 2) {
  throw new Error(`Ceres collision lane requires exactly 2 anchors; got ${collisionAnchors.length}`);
}
const collisionAnchorIds = collisionAnchors.map((slot) => slot.id);
const collisionAnchorSelectors = collisionAnchors.map((slot) => `${slot.sourceFieldId}:${slot.sourceIndex}`);
const logicalObjectIds = new Set(CERES_ACTIVITY_POCKETS.flatMap(
  (pocketEntry) => pocketEntry.objectSlots.map((slot) => slot.id),
));
const authoredSlotIds = new Set(CERES_AUTHORED_ACTIVITY_SLOT_ORDER);
if (new Set(collisionAnchorIds).size !== collisionAnchorIds.length
  || collisionAnchorIds.some((id) => logicalObjectIds.has(id) || authoredSlotIds.has(id))) {
  throw new Error('Ceres collision anchor ids must be unique and disjoint from authored activity slots');
}
if (new Set(collisionAnchorSelectors).size !== collisionAnchorSelectors.length) {
  throw new Error('Ceres collision anchors must use unique field/index selectors');
}

export function ceresActivityPocket(id) {
  return Object.prototype.hasOwnProperty.call(CERES_ACTIVITY_POCKETS_BY_ID, id)
    ? CERES_ACTIVITY_POCKETS_BY_ID[id]
    : null;
}

export function distanceFromPocketAnchor(offset) {
  if (!offset || !Number.isFinite(offset.x) || !Number.isFinite(offset.z)) return Infinity;
  return Math.hypot(offset.x, offset.z);
}

function assertDistanceInBand(offset, band, label) {
  const d = distanceFromPocketAnchor(offset);
  const aboveMin = band.minInclusive ? d >= band.minWU : d > band.minWU;
  const belowMax = band.maxInclusive ? d <= band.maxWU : d < band.maxWU;
  if (!aboveMin || !belowMax) throw new Error(`${label} is ${d.toFixed(3)} WU outside ${band.id}`);
}

function findById(rows, id, label) {
  const found = requireArray(rows, label).find((row) => row && row.id === id);
  if (!found) throw new Error(`Missing ${label}: ${id}`);
  return found;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object') throw new TypeError(`${label} must be an object`);
  return value;
}

function assertSamePoint(a, b, label) {
  if (!a || !b || a.x !== b.x || a.z !== b.z) {
    throw new Error(`${label} canonical anchors disagree`);
  }
}
