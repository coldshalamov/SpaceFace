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
  namespace = 'ceres',
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
    worldRecordSlotId: `${namespace}:activity:${id}`,
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
  sectorId = CERES_ACTIVITY_SECTOR_ID,
}) {
  if (actorSlots.length !== 2) throw new Error(`${id} must declare exactly two pocket actors`);
  return Object.freeze({
    id,
    sectorId,
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

/** Sector-agnostic form of the same coarse shape class. */
export function routeTopologyClass(row) {
  return `${row.sweepClassDeg}deg/${row.spanClassWU}wu`;
}

/**
 * Every sector's pockets must satisfy the no-two-places-share-a-topology rule against THEMSELVES.
 * Ceres runs first because it is the propagation template for every other sector. This runs at
 * module load, which means the required gates enforce it: check:pq020:ceres-topology imports
 * world, world imports this file.
 */
function assertDistinctRouteTopology(pockets, rows, label) {
  const classes = rows.map(routeTopologyClass);
  if (new Set(classes).size !== classes.length) {
    throw new Error(`${label} routes share a topology class: ${rows
      .map((row) => `${row.routeId}=${routeTopologyClass(row)}`).join(', ')}`);
  }
  const pocketClasses = pockets.map((entry) => rows
    .filter((row) => row.pocketId === entry.id)
    .map(routeTopologyClass)
    .sort()
    .join('+'));
  if (new Set(pocketClasses).size !== pocketClasses.length) {
    throw new Error(`${label} pockets share a route topology: ${pocketClasses.join(', ')}`);
  }
  const actorSlotCount = pockets.reduce((total, entry) => total + entry.actorSlots.length, 0);
  if (rows.length !== actorSlotCount) {
    throw new Error(`every ${label} pocket actor must contribute exactly one measured route topology`);
  }
}

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

// The same rule, applied per sector, is what lets a second sector join this module at all.

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

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CV-DAY — the module stops being Ceres-only. Ceres stays the reference pocket set; a named sector
// may now declare its own pockets against the same band, route-topology and slot laws. The fiction
// is per sector: a sector's pockets describe what its JOB is, never a density slider over Ceres.
//
// Helios Prime is the starter harbour, and its job is the one the CV-DAY brief names: a miner is on
// a seam, material is coming off it, a hauler is coming or going with it, somebody wants that cargo,
// and a patrol has a route. That is one causal chain in one neighbourhood, present with no accept.
// ───────────────────────────────────────────────────────────────────────────────────────────────

export const HELIOS_ACTIVITY_SECTOR_ID = 'sector_helios_prime';
/** Four pocket actors across two pockets: the work, and the movement. */
export const HELIOS_AUTHORED_ACTIVITY_CAPACITY = 4;

const heliosAnchors = requireRecord(SECTOR_ANCHORS[HELIOS_ACTIVITY_SECTOR_ID], 'Helios sector anchors');
const heliosZones = requireArray(SECTOR_ZONES[HELIOS_ACTIVITY_SECTOR_ID], 'Helios sector zones');
const heliosClaimZone = findById(heliosZones, 'zone_helios_claim', 'Helios claim zone');
// P10: the movement half of the Helios chain hangs off the freight-spine tally, one hop from the
// opening position, so the neighbourhood is already working when you wake up. The tally POI sits
// inside zone_helios_freight, which is the freight leg's actual fiction.
const heliosFreightZone = findById(heliosZones, 'zone_helios_freight', 'Helios freight spine zone');
const heliosTallyPoi = findById(heliosAnchors.pois, 'poi_helios_tally', 'Helios tally post POI');

const heliosSeamId = 'helios_starter_seam';
const heliosLegId = 'helios_freight_leg';

const heliosSeamObjects = Object.freeze([
  objectSlot({
    id: 'helios_seam_ore_face',
    pocketId: heliosSeamId,
    kind: 'world_owned_asteroid_slot',
    offset: point(-62, 24),
    runtimeOwner: 'world',
    targetRef: 'field:f_helios_starter',
  }),
]);

const heliosLegObjects = Object.freeze([
  objectSlot({
    id: 'helios_freight_staging_pod',
    pocketId: heliosLegId,
    kind: 'cargo_staging_pod',
    // P10: origin-side of the tally so the pod itself sits inside two screen-depths of the
    // opening position (144,146) → 205 WU, not just the pocket anchor.
    offset: point(24, -34),
    runtimeOwner: 'world',
    targetRef: 'object:helios_freight_staging_pod',
  }),
]);

const heliosSeamActors = Object.freeze([
  actor({
    id: 'helios_seam_miner',
    pocketId: heliosSeamId,
    namespace: 'helios',
    presentationRole: 'miner',
    jobKind: 'miner',
    spawnOffset: point(30, -20),
    route: route({
      id: 'helios_seam_extraction_loop',
      jobKind: 'miner',
      durationS: 20,
      receiptType: 'mining:npcExtraction',
      // Tight wedge, 76.7 deg / 124.4 WU - the close, repetitive extraction family. The ore-face
      // mark resolves to the starter field's live rocks; the pad mark resolves to the real Helios
      // berth, so the transport leg off the seam is physical rather than a mark that happens to
      // point at the station on paper.
      marks: [
        mark('helios_seam_pad', 3, -100, 'dest:station_helios'),
        mark('helios_seam_ore_face', -97, -26, 'field:slot:helios_seam_ore_face'),
      ],
    }),
  }),
  actor({
    id: 'helios_seam_fence',
    pocketId: heliosSeamId,
    namespace: 'helios',
    // Not a second miner and not a hostile: the party who WANTS that cargo. It hangs on the same
    // claim, passive, unlicensed, and shadows the loaded run instead of cutting rock of its own.
    presentationRole: 'salvor',
    jobKind: 'salvor',
    passive: true,
    spawnOffset: point(-38, 26),
    route: route({
      id: 'helios_seam_fence_run',
      jobKind: 'salvor',
      durationS: 26,
      // Wide oblique, 149.9 deg / 227.7 WU - a long swing across the claim that crosses the miner's
      // close wedge rather than repeating it. The shadow mark tracks the miner's live hull; the
      // offload mark resolves to Helios, which is where that cargo is going whether or not the
      // fence is the one carrying it.
      marks: [
        mark('helios_fence_shadow', -111, 40, 'actor:helios_seam_miner'),
        mark('helios_fence_offload', 76, -90, 'dest:station_helios'),
      ],
    }),
  }),
]);

const heliosLegActors = Object.freeze([
  actor({
    id: 'helios_freight_hauler',
    pocketId: heliosLegId,
    namespace: 'helios',
    presentationRole: 'hauler',
    jobKind: 'hauler',
    // P10: origin-side spawn so the working hauler body itself sits inside two screen-depths of
    // the opening position (94,160) → 186 WU, not only the pocket anchor.
    spawnOffset: point(-26, -20),
    route: route({
      id: 'helios_freight_inbound_run',
      jobKind: 'hauler',
      durationS: 22,
      receiptType: 'freight:arrival',
      // Transit lane, 180.0 deg / 223.3 WU - the only Helios route that runs straight through its
      // anchor, because the freight leg IS the fiction. Inbound resolves to the real Helios berth
      // (it is coming); outbound resolves to the authored spine mark (it is going). The loop
      // swings past two screen-depths at its far end and comes back — coming or going is the
      // read; the working body lives inside the opening frame.
      marks: [
        mark('helios_freight_inbound', -105, -38, 'dest:station_helios'),
        mark('helios_freight_outbound', 105, 38, 'activity:helios-freight-outbound'),
      ],
    }),
  }),
  actor({
    id: 'helios_customs_patrol',
    pocketId: heliosLegId,
    namespace: 'helios',
    presentationRole: 'patrol',
    jobKind: 'patrol',
    lawful: true,
    spawnOffset: point(-28, -30),
    route: route({
      id: 'helios_spine_beat',
      jobKind: 'patrol',
      durationS: 28,
      // Quarter arc, 104.9 deg / 182.5 WU - the Concord walks the arrival end of the freight
      // spine where green pilots wake up, so the beat goes AROUND the tally instead of through
      // it. The only lawful body in the neighbourhood, and the only one whose route never
      // resolves to a cargo.
      marks: [
        mark('helios_spine_beat_a', -58, 100, 'activity:helios-spine-beat-a'),
        mark('helios_spine_beat_b', -81, -81, 'activity:helios-spine-beat-b'),
      ],
    }),
  }),
]);

export const HELIOS_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: heliosSeamId,
    label: 'Sanctioned Claim',
    identity: Object.freeze({ zoneId: heliosClaimZone.id, fieldId: 'f_helios_starter' }),
    anchor: canonicalAnchor({
      kind: 'zone', id: heliosClaimZone.id, zoneId: heliosClaimZone.id,
      placeId: null, localPos: heliosClaimZone.center,
    }),
    actorSlots: heliosSeamActors,
    objectSlots: heliosSeamObjects,
    sectorId: HELIOS_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: heliosLegId,
    label: 'Freight Leg',
    // P10: the movement half hangs off the freight-spine tally (216 WU from the opening
    // position), not the claim mark (671 WU out). The work stays at the seam; the movement is
    // what you see first. zone_helios_freight is the leg's own fiction — the spine the tally
    // counts freight on — not a claim-margin borrow.
    identity: Object.freeze({ zoneId: heliosFreightZone.id, placeId: heliosTallyPoi.id }),
    anchor: canonicalAnchor({
      kind: 'poi', id: heliosTallyPoi.id, zoneId: heliosFreightZone.id,
      placeId: heliosTallyPoi.id, localPos: heliosTallyPoi.pos,
    }),
    actorSlots: heliosLegActors,
    objectSlots: heliosLegObjects,
    sectorId: HELIOS_ACTIVITY_SECTOR_ID,
  }),
]);

export const HELIOS_ACTIVITY_POCKET_ORDER = Object.freeze(HELIOS_ACTIVITY_POCKETS.map((entry) => entry.id));
export const HELIOS_ACTIVITY_POCKETS_BY_ID = Object.freeze(Object.fromEntries(
  HELIOS_ACTIVITY_POCKETS.map((entry) => [entry.id, entry]),
));
export const HELIOS_POCKET_ACTOR_SLOT_ORDER = Object.freeze(HELIOS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const HELIOS_ROUTE_TOPOLOGY = Object.freeze(HELIOS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));

if (HELIOS_POCKET_ACTOR_SLOT_ORDER.length !== HELIOS_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Helios authored capacity mismatch: ${HELIOS_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(HELIOS_POCKET_ACTOR_SLOT_ORDER).size !== HELIOS_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Helios authored activity slot ids must be unique');
}
assertDistinctRouteTopology(HELIOS_ACTIVITY_POCKETS, HELIOS_ROUTE_TOPOLOGY, 'Helios');

// ───────────────────────────────────────────────────────────────────────────────────────────────
// FB-030 — Pallas Drift works a seam, a hub, an ambush, and a grave. Same band and topology
// laws as Ceres. No Ceres pocket id is copied.
// ───────────────────────────────────────────────────────────────────────────────────────────────

export const PALLAS_ACTIVITY_SECTOR_ID = 'sector_pallas_drift';
export const PALLAS_AUTHORED_ACTIVITY_CAPACITY = 8;

const pallasZones = requireArray(SECTOR_ZONES[PALLAS_ACTIVITY_SECTOR_ID], 'Pallas sector zones');
const pallasAnchors = requireRecord(SECTOR_ANCHORS[PALLAS_ACTIVITY_SECTOR_ID], 'Pallas sector anchors');
const pallasBelt = findById(pallasZones, 'zone_pallas_belt', 'Pallas belt zone');
const pallasDrift = findById(pallasZones, 'zone_pallas_drift', 'Pallas drift zone');
const pallasAmbushZone = findById(pallasZones, 'zone_pallas_ambush', 'Pallas ambush zone');
const pallasGraveField = findById(pallasAnchors.fields, 'f_pallas_3', 'Pallas grave field');

const pallasSeamId = 'pallas_working_seam';
const pallasHubId = 'pallas_hub_pocket';
const pallasAmbushId = 'pallas_ambush_run';
const pallasGraveId = 'pallas_nebula_grave';

function pallasActor(id, pocketId, role, jobKind, spawn, routeId, durationS, marks, lawful = false) {
  return actor({
    id,
    pocketId,
    namespace: 'pallas',
    presentationRole: role,
    jobKind,
    lawful,
    passive: true,
    spawnOffset: spawn,
    route: route({ id: routeId, jobKind, durationS, marks }),
  });
}

export const PALLAS_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: pallasSeamId,
    label: 'Independent Seam',
    identity: Object.freeze({ zoneId: pallasBelt.id, fieldId: 'f_pallas_1' }),
    anchor: canonicalAnchor({
      kind: 'zone', id: pallasBelt.id, zoneId: pallasBelt.id, localPos: pallasBelt.center,
    }),
    actorSlots: Object.freeze([
      pallasActor('pallas_seam_miner', pallasSeamId, 'miner', 'miner', point(30, -20),
        'pallas_seam_extraction', 24, [
          mark('pallas_miner_a', 103.4, 37.6),
          mark('pallas_miner_b', -9.2, 104.6),
        ]),
      pallasActor('pallas_seam_surveyor', pallasSeamId, 'miner', 'miner', point(-24, 18),
        'pallas_seam_survey', 28, [
          mark('pallas_survey_a', -91.9, 77.1),
          mark('pallas_survey_b', -34.2, -94),
        ]),
    ]),
    objectSlots: Object.freeze([
      objectSlot({
        id: 'pallas_seam_ore_face', pocketId: pallasSeamId, kind: 'world_owned_asteroid_slot',
        offset: point(-40, 20), runtimeOwner: 'world', targetRef: 'field:f_pallas_1',
      }),
    ]),
    sectorId: PALLAS_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: pallasHubId,
    label: 'Hollow Hub',
    identity: Object.freeze({ zoneId: pallasDrift.id, placeId: 'station_smuggler' }),
    anchor: canonicalAnchor({
      kind: 'zone', id: pallasDrift.id, zoneId: pallasDrift.id, localPos: pallasDrift.center,
    }),
    actorSlots: Object.freeze([
      pallasActor('pallas_hub_hauler', pallasHubId, 'hauler', 'hauler', point(40, 10),
        'pallas_hub_haul', 26, [
          mark('pallas_haul_a', 115, 0),
          mark('pallas_haul_b', -115, 0),
        ]),
      // The tender flies the proven survey kernel (a hub check is a scan loop — the Vesta relay
      // pattern): 'tender' as the runtime jobKind is outside CERES_ACTIVITY_JOB_KINDS, so the
      // slot materialized jobless — a named hull parked with no work.
      pallasActor('pallas_hub_tender', pallasHubId, 'tender', 'surveyor', point(-20, 28),
        'pallas_hub_tender_loop', 22, [
          mark('pallas_tender_a', 86.6, 50),
          mark('pallas_tender_b', -60, 103.9),
        ]),
    ]),
    objectSlots: Object.freeze([
      objectSlot({
        id: 'pallas_hub_pod', pocketId: pallasHubId, kind: 'cargo_staging_pod',
        offset: point(50, -16), runtimeOwner: 'world',
      }),
    ]),
    sectorId: PALLAS_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: pallasAmbushId,
    label: 'Sker-Run Ambush',
    identity: Object.freeze({ zoneId: pallasAmbushZone.id }),
    anchor: canonicalAnchor({
      kind: 'zone', id: pallasAmbushZone.id, zoneId: pallasAmbushZone.id, localPos: pallasAmbushZone.center,
    }),
    actorSlots: Object.freeze([
      pallasActor('pallas_ambush_hauler', pallasAmbushId, 'hauler', 'hauler', point(22, -30),
        'pallas_ambush_run_loop', 24, [
          mark('pallas_ambush_a', 98.5, 17.4),
          mark('pallas_ambush_b', -90.6, 42.3),
        ]),
      pallasActor('pallas_ambush_escort', pallasAmbushId, 'patrol', 'patrol', point(-36, 12),
        'pallas_ambush_escort_loop', 26, [
          mark('pallas_escort_a', 85.8, 72),
          mark('pallas_escort_b', -92.1, 33.5),
        ], true),
    ]),
    objectSlots: Object.freeze([
      objectSlot({
        id: 'pallas_ambush_bait', pocketId: pallasAmbushId, kind: 'bait_wreck_visual',
        offset: point(60, 12), runtimeOwner: 'world',
      }),
    ]),
    sectorId: PALLAS_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: pallasGraveId,
    label: 'Grave Drift',
    identity: Object.freeze({ fieldId: pallasGraveField.id }),
    anchor: canonicalAnchor({
      kind: 'field', id: pallasGraveField.id, localPos: pallasGraveField.center,
    }),
    actorSlots: Object.freeze([
      pallasActor('pallas_grave_salvor', pallasGraveId, 'salvor', 'salvor', point(18, 24),
        'pallas_grave_salvor_loop', 30, [
          mark('pallas_salvor_a', 42.4, 116.5),
          mark('pallas_salvor_b', -88.3, -51),
        ]),
      pallasActor('pallas_grave_patrol', pallasGraveId, 'patrol', 'patrol', point(-16, -22),
        'pallas_grave_patrol_loop', 28, [
          mark('pallas_patrol_a', 98.5, 17.4),
          mark('pallas_patrol_b', 28.5, 106.3),
        ], true),
    ]),
    objectSlots: Object.freeze([
      objectSlot({
        id: 'pallas_grave_shard', pocketId: pallasGraveId, kind: 'grave_shard',
        offset: point(-28, 40), runtimeOwner: 'world',
      }),
    ]),
    sectorId: PALLAS_ACTIVITY_SECTOR_ID,
  }),
]);

export const PALLAS_ROUTE_TOPOLOGY = Object.freeze(PALLAS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));
export const PALLAS_POCKET_ACTOR_SLOT_ORDER = Object.freeze(PALLAS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));

if (PALLAS_POCKET_ACTOR_SLOT_ORDER.length !== PALLAS_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Pallas authored capacity mismatch: ${PALLAS_POCKET_ACTOR_SLOT_ORDER.length}`);
}
assertDistinctRouteTopology(PALLAS_ACTIVITY_POCKETS, PALLAS_ROUTE_TOPOLOGY, 'Pallas');

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CV-DAY — Vesta Forge: the feedstock day. Two gates from the start on the default route, and its
// zone copy already promises a working day nobody could see: "Ore haulers shuttle from these seams
// to the foundry lines around the clock" (zone_vesta_belt); "A freighter died at the sector edge;
// its manifest was never recovered" (zone_vesta_derelict). These pockets are that promise made
// visible — arriving mid-shift: a seam miner cutting the Feedstock Belt while a hauler runs ore to
// station_forge's foundry approach, scavenger cutters working the Dead Freighter Drift around
// poi_freighter, and a slag-relay tender holding its loop past the Slag Radiation Field. The chain
// continues whether or not you touch it, and every actor flies a job kind the runtime already owns.
// Same band and topology laws as Ceres; no Ceres pocket id is copied. Bearings are taken from the
// geography that exists: the miner's offload leg aims at the foundry's true bearing, the drift
// cutter works around the dead hulk's own shard bearing, the relay's legs aim at the outlying
// yard's service side and the dump-run edge.
// ───────────────────────────────────────────────────────────────────────────────────────────────

export const VESTA_ACTIVITY_SECTOR_ID = 'sector_vesta_forge';
/** Four pockets × two actors: the seam, the haul, the drift, and the relay. */
export const VESTA_AUTHORED_ACTIVITY_CAPACITY = 8;

const vestaZones = requireArray(SECTOR_ZONES[VESTA_ACTIVITY_SECTOR_ID], 'Vesta sector zones');
const vestaAnchors = requireRecord(SECTOR_ANCHORS[VESTA_ACTIVITY_SECTOR_ID], 'Vesta sector anchors');
const vestaBeltZone = findById(vestaZones, 'zone_vesta_belt', 'Vesta feedstock belt zone');
const vestaForgeZone = findById(vestaZones, 'zone_vesta_forge', 'Vesta foundry zone');
const vestaDerelictZone = findById(vestaZones, 'zone_vesta_derelict', 'Vesta derelict zone');
const stationForge = findById(vestaAnchors.stations, 'station_forge', 'Vesta foundry station anchor');
const stationVestaYard = findById(vestaAnchors.stations, 'station_vesta_outlying_yard', 'Vesta outlying yard anchor');
const freighterPoi = findById(vestaAnchors.pois, 'poi_freighter', 'Vesta dead freighter POI');
const slagRelayPoi = findById(vestaAnchors.pois, 'poi_vesta_slag_relay', 'Vesta slag relay POI');

// The freighter died where the drift says it did, and the foundry stands at its own zone's heart.
assertSamePoint(freighterPoi.pos, vestaDerelictZone.center, 'poi_freighter / zone_vesta_derelict');
assertSamePoint(stationForge.pos, vestaForgeZone.center, 'station_forge / zone_vesta_forge');

const vestaSeamId = 'vesta_feedstock_seam';
const vestaHaulId = 'vesta_forge_haul';
const vestaDriftId = 'vesta_derelict_drift';
const vestaRelayId = 'vesta_slag_relay';

function vestaActor(id, pocketId, role, jobKind, spawn, routeId, durationS, marks, { lawful = false, receiptType = null } = {}) {
  return actor({
    id,
    pocketId,
    namespace: 'vesta',
    presentationRole: role,
    jobKind,
    lawful,
    passive: true,
    spawnOffset: spawn,
    route: route({ id: routeId, jobKind, durationS, receiptType, marks }),
  });
}

const vestaSeamObjects = Object.freeze([
  objectSlot({
    id: 'vesta_seam_ore_clast',
    pocketId: vestaSeamId,
    kind: 'world_owned_asteroid_slot',
    offset: point(-45, -54),
    runtimeOwner: 'world',
    targetRef: 'field:slot:vesta_seam_ore_clast',
  }),
]);

const vestaHaulObjects = Object.freeze([
  objectSlot({
    id: 'vesta_forge_ore_pod',
    pocketId: vestaHaulId,
    kind: 'cargo_staging_pod',
    offset: point(62, 30),
    runtimeOwner: 'world',
    targetRef: 'object:vesta_forge_ore_pod',
  }),
]);

const vestaDriftObjects = Object.freeze([
  objectSlot({
    id: 'vesta_derelict_hulk_shard',
    pocketId: vestaDriftId,
    kind: 'grave_shard',
    offset: point(-30, 44),
    runtimeOwner: 'world',
    targetRef: 'object:vesta_derelict_hulk_shard',
  }),
]);

const vestaRelayObjects = Object.freeze([
  objectSlot({
    id: 'vesta_relay_slag_skip',
    pocketId: vestaRelayId,
    kind: 'cargo_staging_pod',
    offset: point(-52, 18),
    runtimeOwner: 'world',
    targetRef: 'object:vesta_relay_slag_skip',
  }),
]);

const vestaSeamActors = Object.freeze([
  // The belt's own sentence: a miner cutting a bounded parcel while the haulers shuttle past.
  vestaActor('vesta_seam_miner', vestaSeamId, 'miner', 'miner', point(-42, 24),
    'vesta_seam_extraction', 24, [
      mark('vesta_seam_ore_face', -71, -84, 'field:slot:vesta_seam_ore_clast'),
      mark('vesta_seam_offload_pad', -85, 70, 'dest:station_forge'),
    ], { receiptType: 'mining:npcExtraction' }),
  vestaActor('vesta_seam_surveyor', vestaSeamId, 'surveyor', 'surveyor', point(50, 30),
    'vesta_seam_survey', 26, [
      mark('vesta_seam_scan_a', 108, 38, 'activity:vesta-seam-scan-a'),
      mark('vesta_seam_scan_b', 18, 119, 'activity:vesta-seam-scan-b'),
    ]),
]);

const vestaHaulActors = Object.freeze([
  // The other half of the belt's sentence: ore arriving at the foundry approach, around the clock.
  vestaActor('vesta_forge_hauler', vestaHaulId, 'hauler', 'hauler', point(-30, -20),
    'vesta_forge_haul_run', 22, [
      mark('vesta_haul_belt_leg', 89, -73, 'activity:vesta-foundry-run-inbound'),
      mark('vesta_haul_berth_leg', -89, 73, 'dest:station_forge'),
    ], { receiptType: 'freight:arrival' }),
  // The foundry's own authored presence (zone_vesta_forge patrols) walking its home approach.
  vestaActor('vesta_forge_patrol', vestaHaulId, 'patrol', 'patrol', point(40, -28),
    'vesta_forge_beat', 28, [
      mark('vesta_forge_beat_a', -105, 42, 'activity:vesta-forge-beat-a'),
      mark('vesta_forge_beat_b', -38, -112, 'activity:vesta-forge-beat-b'),
    ], { lawful: true }),
]);

const vestaDriftActors = Object.freeze([
  // The derelict's sentence: scavengers working the hulk the manifest never left. Both passive
  // cutters — the drift is Reach ground, but these pockets author work, not hostility.
  vestaActor('vesta_drift_cutter', vestaDriftId, 'salvor', 'salvor', point(18, -26),
    'vesta_drift_salvage_loop', 30, [
      mark('vesta_drift_hull_face', -63, 92, 'object:vesta_derelict_hulk_shard'),
      mark('vesta_drift_far_plate', 105, 38, 'activity:vesta-drift-far-plate'),
    ]),
  vestaActor('vesta_drift_prowler', vestaDriftId, 'salvor', 'salvor', point(-36, 14),
    'vesta_drift_sweep_run', 26, [
      mark('vesta_drift_sweep_a', -101, -55, 'activity:vesta-drift-sweep-a'),
      mark('vesta_drift_sweep_b', 66, 98, 'activity:vesta-drift-sweep-b'),
    ]),
]);

const vestaRelayActors = Object.freeze([
  // The tender holds its loop past the radiation field: one leg to the outlying yard's service
  // side, one to the dump-run edge. The `tender` hull flies the proven survey kernel — a relay
  // check is a scan loop — so the shift is a real job, not a loiter.
  vestaActor('vesta_relay_tender', vestaRelayId, 'tender', 'surveyor', point(24, 30),
    'vesta_relay_service_loop', 28, [
      mark('vesta_relay_yard_leg', 84, -74, 'station:station_vesta_outlying_yard:service-berth'),
      mark('vesta_relay_field_edge', 29, 115, 'activity:vesta-slag-field-edge'),
    ]),
  // Slag runs out from the forge past the relay toward the dump field — the corner the relay marks.
  vestaActor('vesta_slag_runner', vestaRelayId, 'hauler', 'hauler', point(-28, -34),
    'vesta_slag_dump_run', 26, [
      mark('vesta_slag_forge_leg', 96, 58, 'dest:station_forge'),
      mark('vesta_slag_field_leg', 104, -49, 'activity:vesta-slag-dump-run'),
    ], { receiptType: 'freight:arrival' }),
]);

export const VESTA_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: vestaSeamId,
    label: 'Feedstock Seam',
    identity: Object.freeze({ zoneId: vestaBeltZone.id, fieldId: 'f_vesta_1' }),
    anchor: canonicalAnchor({
      kind: 'zone', id: vestaBeltZone.id, zoneId: vestaBeltZone.id,
      placeId: null, localPos: vestaBeltZone.center,
    }),
    actorSlots: vestaSeamActors,
    objectSlots: vestaSeamObjects,
    sectorId: VESTA_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: vestaHaulId,
    label: 'Foundry Run',
    identity: Object.freeze({ zoneId: vestaForgeZone.id, stationId: stationForge.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationForge.id, zoneId: vestaForgeZone.id,
      placeId: stationForge.id, localPos: stationForge.pos,
    }),
    actorSlots: vestaHaulActors,
    objectSlots: vestaHaulObjects,
    sectorId: VESTA_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: vestaDriftId,
    label: 'Dead Freighter Drift',
    identity: Object.freeze({ zoneId: vestaDerelictZone.id, placeId: freighterPoi.id }),
    anchor: canonicalAnchor({
      kind: 'poi', id: freighterPoi.id, zoneId: vestaDerelictZone.id,
      placeId: freighterPoi.id, localPos: freighterPoi.pos,
    }),
    actorSlots: vestaDriftActors,
    objectSlots: vestaDriftObjects,
    sectorId: VESTA_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: vestaRelayId,
    label: 'Slag Relay',
    identity: Object.freeze({ zoneId: vestaForgeZone.id, placeId: slagRelayPoi.id }),
    anchor: canonicalAnchor({
      kind: 'poi', id: slagRelayPoi.id, zoneId: vestaForgeZone.id,
      placeId: slagRelayPoi.id, localPos: slagRelayPoi.pos,
    }),
    actorSlots: vestaRelayActors,
    objectSlots: vestaRelayObjects,
    sectorId: VESTA_ACTIVITY_SECTOR_ID,
  }),
]);

export const VESTA_ACTIVITY_POCKET_ORDER = Object.freeze(VESTA_ACTIVITY_POCKETS.map((entry) => entry.id));
export const VESTA_ACTIVITY_POCKETS_BY_ID = Object.freeze(Object.fromEntries(
  VESTA_ACTIVITY_POCKETS.map((entry) => [entry.id, entry]),
));
export const VESTA_POCKET_ACTOR_SLOT_ORDER = Object.freeze(VESTA_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const VESTA_ROUTE_TOPOLOGY = Object.freeze(VESTA_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));

if (VESTA_POCKET_ACTOR_SLOT_ORDER.length !== VESTA_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Vesta authored capacity mismatch: ${VESTA_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(VESTA_POCKET_ACTOR_SLOT_ORDER).size !== VESTA_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Vesta authored activity slot ids must be unique');
}
assertDistinctRouteTopology(VESTA_ACTIVITY_POCKETS, VESTA_ROUTE_TOPOLOGY, 'Vesta');

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CV-DAY / CR-WEIR — Tethys Junction: the checkpoint day. The same registry that just gained Vesta,
// opposite flavor: Vesta's day is foundry work at the sector's heart; Tethys's day is the border.
// Its authored material already promised it with no pockets: "Concord scans inbound cargo here;
// contraband is seized, smugglers are flagged" (zone_tethys_checkpoint); "Convoys run this line
// between Helios, Ceres and Io — the arteries of the core economy" (zone_tethys_lane); "Contraband
// changes hands off the exchange lanes, away from Meridian eyes" (zone_tethys_blackmkt); and
// station_customs — toll, scan, refuel — whose own chart line is the day: "Everything transits;
// nothing transits unread." These pockets are that promise made visible — arriving mid-shift at the
// border: a toll hauler holding in the checkpoint queue at station_customs, an scn patrol walking
// the trade lane, and a Quiet Cache runner whose route slides past the checkpoint — lawful-lane
// work and outlaw-lane work sharing the same water, neither a hostile spawn. That is the CR-WEIR /
// CV-DAY overlap: law you can fly, arriving mid-shift. The chain continues whether or not you touch
// it, and every actor flies a job kind the runtime already owns. Same band and topology laws as
// Ceres; no Ceres pocket id is copied. Bearings are taken from the geography that exists: the toll
// hauler's hold mark sits on the true bearing of the tally queue head, the lane convoy's outbound
// leg aims at the Io gate's own bearing, the Quiet runner's transit leg aims at the checkpoint's
// true bearing, and the log cutter's yard leg aims at the customs station it sells to.
// ───────────────────────────────────────────────────────────────────────────────────────────────

export const TETHYS_ACTIVITY_SECTOR_ID = 'sector_tethys_junction';
/** Four pockets × two actors: the queue, the lane, the cache, and the log. */
export const TETHYS_AUTHORED_ACTIVITY_CAPACITY = 8;

const tethysZones = requireArray(SECTOR_ZONES[TETHYS_ACTIVITY_SECTOR_ID], 'Tethys sector zones');
const tethysAnchors = requireRecord(SECTOR_ANCHORS[TETHYS_ACTIVITY_SECTOR_ID], 'Tethys sector anchors');
const tethysCheckpointZone = findById(tethysZones, 'zone_tethys_checkpoint', 'Tethys checkpoint zone');
const tethysLaneZone = findById(tethysZones, 'zone_tethys_lane', 'Tethys trade lane zone');
const tethysBlackmktZone = findById(tethysZones, 'zone_tethys_blackmkt', 'Tethys Quiet Cache zone');
const stationCustoms = findById(tethysAnchors.stations, 'station_customs', 'Tethys customs station anchor');
const blackmktPoi = findById(tethysAnchors.pois, 'poi_blackmkt', 'Tethys black market POI');
const customsLogPoi = findById(tethysAnchors.pois, 'poi_tethys_customs_log', 'Tethys customs log POI');

// The checkpoint is where its gate station stands, and the cache is where its buoy floats.
assertSamePoint(stationCustoms.pos, tethysCheckpointZone.center, 'station_customs / zone_tethys_checkpoint');
assertSamePoint(blackmktPoi.pos, tethysBlackmktZone.center, 'poi_blackmkt / zone_tethys_blackmkt');

const tethysQueueId = 'tethys_checkpoint_queue';
const tethysLaneId = 'tethys_lane_patrol';
const tethysCacheId = 'tethys_quiet_cache';
const tethysLogId = 'tethys_customs_log';

function tethysActor(id, pocketId, role, jobKind, spawn, routeId, durationS, marks, { lawful = false, receiptType = null } = {}) {
  return actor({
    id,
    pocketId,
    namespace: 'tethys',
    presentationRole: role,
    jobKind,
    lawful,
    passive: true,
    spawnOffset: spawn,
    route: route({ id: routeId, jobKind, durationS, receiptType, marks }),
  });
}

const tethysQueueObjects = Object.freeze([
  objectSlot({
    id: 'tethys_customs_hold_pod',
    pocketId: tethysQueueId,
    kind: 'cargo_staging_pod',
    offset: point(-58, 34),
    runtimeOwner: 'world',
    targetRef: 'object:tethys_customs_hold_pod',
  }),
]);

const tethysLaneObjects = Object.freeze([
  objectSlot({
    id: 'tethys_lane_weigh_pod',
    pocketId: tethysLaneId,
    kind: 'cargo_staging_pod',
    offset: point(44, 26),
    runtimeOwner: 'world',
    targetRef: 'object:tethys_lane_weigh_pod',
  }),
]);

const tethysCacheObjects = Object.freeze([
  objectSlot({
    id: 'tethys_quiet_cache_pod',
    pocketId: tethysCacheId,
    kind: 'cargo_staging_pod',
    offset: point(-36, 20),
    runtimeOwner: 'world',
    targetRef: 'object:tethys_quiet_cache_pod',
  }),
]);

const tethysLogObjects = Object.freeze([
  objectSlot({
    id: 'tethys_log_hull_shard',
    pocketId: tethysLogId,
    kind: 'grave_shard',
    offset: point(-30, 44),
    runtimeOwner: 'world',
    targetRef: 'object:tethys_log_hull_shard',
  }),
]);

const tethysQueueActors = Object.freeze([
  // The gate's own sentence: a toll hauler holding in the queue that runs in past the tally to
  // the Customs Gate scan face. The hold mark sits on the true bearing of the tally queue head;
  // the cleared leg resolves to the real customs berth. Slow — a queue is a place you wait.
  tethysActor('tethys_toll_hauler', tethysQueueId, 'hauler', 'hauler', point(-48, 22),
    'tethys_queue_hold_run', 30, [
      mark('tethys_queue_hold', -92.89, 36.97, 'activity:tethys-queue-hold'),
      mark('tethys_queue_gate_leg', 82.3, 75.96, 'dest:station_customs'),
    ], { receiptType: 'freight:arrival' }),
  // The scn walk between the gate face and the Helios approach side — the law in the checkpoint
  // is present and patrolling, not hunting: same passive kernel as every other actor here.
  tethysActor('tethys_customs_patrol', tethysQueueId, 'patrol', 'patrol', point(30, -26),
    'tethys_gate_beat', 26, [
      mark('tethys_gate_beat_a', -104.39, -18.41, 'activity:tethys-gate-beat-a'),
      mark('tethys_gate_beat_b', 18.41, -104.39, 'activity:tethys-gate-beat-b'),
    ], { lawful: true }),
]);

const tethysLaneActors = Object.freeze([
  // The lane's own sentence: convoys run this line. Inbound leg resolves to the real hub berth;
  // the outbound leg sits on the Io gate's true bearing — the artery, end to end.
  tethysActor('tethys_lane_convoy', tethysLaneId, 'hauler', 'hauler', point(-26, 18),
    'tethys_lane_run', 24, [
      mark('tethys_lane_io_leg', 80.47, 74.98, 'activity:tethys-lane-io-leg'),
      mark('tethys_lane_hub_leg', 47.61, -96.94, 'dest:station_tethys'),
    ], { receiptType: 'freight:arrival' }),
  // The patrol walking the lane while the convoy runs it: a beat across the artery's quadrants,
  // never through it — the widest read of "law you can fly" without a single hostile hull.
  tethysActor('tethys_lane_patrol', tethysLaneId, 'patrol', 'patrol', point(24, -30),
    'tethys_lane_beat', 28, [
      mark('tethys_lane_beat_a', 3.66, 104.94, 'activity:tethys-lane-beat-a'),
      mark('tethys_lane_beat_b', -76.79, -71.61, 'activity:tethys-lane-beat-b'),
    ], { lawful: true }),
]);

const tethysCacheActors = Object.freeze([
  // The Quiet's sentence: contraband changes hands off the exchange lanes. The runner loads at
  // the cache and its transit leg slides out on the checkpoint's true bearing — past the law,
  // not at it. A smuggler hull flying the proven haul kernel: outlaw-lane work, not a hostile
  // spawn; it never arrives shooting, and the checkpoint patrol never arrives swinging.
  tethysActor('tethys_quiet_runner', tethysCacheId, 'smuggler', 'hauler', point(-30, -24),
    'tethys_quiet_transit_run', 26, [
      mark('tethys_cache_hold', -83.87, 54.46, 'activity:tethys-cache-hold'),
      mark('tethys_quiet_transit_leg', 47, -101.66, 'activity:tethys-quiet-transit'),
    ], { receiptType: 'freight:arrival' }),
  // The cache keeper holds the dark side of the buoy, checking stashes on the scan kernel —
  // a relay check is a scan loop, so the cache has a working body, not a loiter.
  tethysActor('tethys_quiet_keeper', tethysCacheId, 'tender', 'surveyor', point(26, 30),
    'tethys_cache_stash_sweep', 30, [
      mark('tethys_cache_stash_a', 72.13, 72.13, 'activity:tethys-cache-stash-a'),
      mark('tethys_cache_stash_b', -51, 88.33, 'activity:tethys-cache-stash-b'),
    ]),
]);

const tethysLogActors = Object.freeze([
  // The log relay's own scavengers: the last log before the line sits where seized hulks were
  // scanned and left, and a cutter picks them — unlicensed ground work, but passive, the same
  // work-not-hostility law as Vesta's drift. The yard leg aims at the customs station the cut
  // plate sells to.
  tethysActor('tethys_log_salvor', tethysLogId, 'salvor', 'salvor', point(18, -22),
    'tethys_log_salvage_run', 30, [
      mark('tethys_log_yard_leg', 52.96, -102.13, 'dest:station_customs'),
      mark('tethys_log_hulk_face', -52.5, 90.93, 'activity:tethys-log-hulk'),
    ]),
  // The count's own rig: cataloging the hulk field so the tally stays honest. The tightest
  // wedge at Tethys — close, repetitive scan work beside one hull face.
  tethysActor('tethys_log_surveyor', tethysLogId, 'surveyor', 'surveyor', point(-20, -18),
    'tethys_log_scan_sweep', 28, [
      mark('tethys_log_scan_a', -93.97, -34.2, 'activity:tethys-log-scan-a'),
      mark('tethys_log_scan_b', -17.37, -98.48, 'activity:tethys-log-scan-b'),
    ]),
]);

export const TETHYS_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: tethysQueueId,
    label: 'Checkpoint Queue',
    identity: Object.freeze({ zoneId: tethysCheckpointZone.id, stationId: stationCustoms.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationCustoms.id, zoneId: tethysCheckpointZone.id,
      placeId: stationCustoms.id, localPos: stationCustoms.pos,
    }),
    actorSlots: tethysQueueActors,
    objectSlots: tethysQueueObjects,
    sectorId: TETHYS_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: tethysLaneId,
    label: 'Junction Lane',
    identity: Object.freeze({ zoneId: tethysLaneZone.id }),
    anchor: canonicalAnchor({
      kind: 'zone', id: tethysLaneZone.id, zoneId: tethysLaneZone.id,
      placeId: null, localPos: tethysLaneZone.center,
    }),
    actorSlots: tethysLaneActors,
    objectSlots: tethysLaneObjects,
    sectorId: TETHYS_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: tethysCacheId,
    label: 'The Quiet Cache',
    identity: Object.freeze({ zoneId: tethysBlackmktZone.id, placeId: blackmktPoi.id }),
    anchor: canonicalAnchor({
      kind: 'poi', id: blackmktPoi.id, zoneId: tethysBlackmktZone.id,
      placeId: blackmktPoi.id, localPos: blackmktPoi.pos,
    }),
    actorSlots: tethysCacheActors,
    objectSlots: tethysCacheObjects,
    sectorId: TETHYS_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: tethysLogId,
    label: 'Customs Log Relay',
    identity: Object.freeze({ zoneId: tethysCheckpointZone.id, placeId: customsLogPoi.id }),
    anchor: canonicalAnchor({
      kind: 'poi', id: customsLogPoi.id, zoneId: tethysCheckpointZone.id,
      placeId: customsLogPoi.id, localPos: customsLogPoi.pos,
    }),
    actorSlots: tethysLogActors,
    objectSlots: tethysLogObjects,
    sectorId: TETHYS_ACTIVITY_SECTOR_ID,
  }),
]);

export const TETHYS_ACTIVITY_POCKET_ORDER = Object.freeze(TETHYS_ACTIVITY_POCKETS.map((entry) => entry.id));
export const TETHYS_ACTIVITY_POCKETS_BY_ID = Object.freeze(Object.fromEntries(
  TETHYS_ACTIVITY_POCKETS.map((entry) => [entry.id, entry]),
));
export const TETHYS_POCKET_ACTOR_SLOT_ORDER = Object.freeze(TETHYS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const TETHYS_ROUTE_TOPOLOGY = Object.freeze(TETHYS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));

if (TETHYS_POCKET_ACTOR_SLOT_ORDER.length !== TETHYS_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Tethys authored capacity mismatch: ${TETHYS_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(TETHYS_POCKET_ACTOR_SLOT_ORDER).size !== TETHYS_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Tethys authored activity slot ids must be unique');
}
assertDistinctRouteTopology(TETHYS_ACTIVITY_POCKETS, TETHYS_ROUTE_TOPOLOGY, 'Tethys');

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CR-HOLLOW — Sedna Dark: the occupied-quiet day. The last frontier sector runs trafficPerMin 0 —
// authored silence — yet its own material already promised a watch nobody could see: the Sedna
// Survey Post is Helix's sensor desk at the dark rim, charted "Sensors and hull patches at the
// dark rim; no fuel, no rescue, few questions" (station_sedna), and past every authored zone the
// Ringworld Arc waits — "a colossal arc segment of an ancient orbital megastructure orbiting the
// frozen dark" (poi_sedna_ringworld). These pockets are that promise made visible — not density:
// two pockets, four bodies. A repair tender and a survey rig make the survey rounds out of the
// post toward the arc, and at the rim a drift-watcher holds the post's bearing while a salvage
// cutter works a sheared plate off the dead megastructure — a wreck nobody is hurrying. The
// hush is authored: nothing here is lawful (Helix is paper; its presence is the audit desk, not
// a hull), nothing arrives shooting, and the watcher's crawl is deliberately the slowest route
// in the module — parked is a speed, not a missing route. Same band and topology laws as Ceres;
// no earlier pocket id is copied. Bearings are taken from the geography that exists: the tender's
// arc leg aims from station_sedna at the Ringworld Arc's true bearing, and the watcher's post-line
// mark aims back down the same line at the post's true bearing — the rounds are one string.
// ───────────────────────────────────────────────────────────────────────────────────────────────

export const SEDNA_ACTIVITY_SECTOR_ID = 'sector_sedna_dark';
/** Two pockets × two actors: the rounds at the post, the watch at the rim. Quiet by count. */
export const SEDNA_AUTHORED_ACTIVITY_CAPACITY = 4;

const sednaZones = requireArray(SECTOR_ZONES[SEDNA_ACTIVITY_SECTOR_ID], 'Sedna sector zones');
const sednaAnchors = requireRecord(SECTOR_ANCHORS[SEDNA_ACTIVITY_SECTOR_ID], 'Sedna sector anchors');
const sednaSurveyZone = findById(sednaZones, 'zone_sedna_survey', 'Sedna survey zone');
const stationSedna = findById(sednaAnchors.stations, 'station_sedna', 'Sedna survey post anchor');
const ringworldPoi = findById(sednaAnchors.pois, 'poi_sedna_ringworld', 'Sedna Ringworld Arc POI');

// The post stands at its zone's heart; the arc stands past every zone — the rim is the point.
assertSamePoint(stationSedna.pos, sednaSurveyZone.center, 'station_sedna / zone_sedna_survey');

const sednaRoundsId = 'sedna_survey_rounds';
const sednaRimId = 'sedna_rim_watch';

function sednaActor(id, pocketId, role, jobKind, spawn, routeId, durationS, marks, { lawful = false, receiptType = null } = {}) {
  return actor({
    id,
    pocketId,
    namespace: 'sedna',
    presentationRole: role,
    jobKind,
    lawful,
    passive: true,
    spawnOffset: spawn,
    route: route({ id: routeId, jobKind, durationS, receiptType, marks }),
  });
}

const sednaRoundsObjects = Object.freeze([
  objectSlot({
    id: 'sedna_post_supply_pod',
    pocketId: sednaRoundsId,
    kind: 'cargo_staging_pod',
    offset: point(55, -40),
    runtimeOwner: 'world',
    targetRef: 'object:sedna_post_supply_pod',
  }),
]);

const sednaRimObjects = Object.freeze([
  // The plate the cutter is working: a sheared fragment of the arc, close in on the post side —
  // the wreck nobody is hurrying. Descriptor-only, like every non-Ceres object slot: the
  // targetRef gives the route marks a name to point at, not a materialized body.
  objectSlot({
    id: 'sedna_arc_sheared_plate',
    pocketId: sednaRimId,
    kind: 'grave_shard',
    offset: point(-48, 30),
    runtimeOwner: 'world',
    targetRef: 'object:sedna_arc_sheared_plate',
  }),
]);

const sednaRoundsActors = Object.freeze([
  // The post's own sentence: a survey tender making the rounds between the post and the arc.
  // Transit lane, 179.6 deg / 224.9 WU — the one route at Sedna that still runs straight through
  // its anchor, because the round between two fixed points IS a lane. The arc leg sits on the
  // Ringworld Arc's true bearing from the post (12.9 deg vs the arc's own 13.0); the post leg
  // resolves to the service berth the chart note sells — sensors and hull patches.
  sednaActor('sedna_rounds_tender', sednaRoundsId, 'tender', 'surveyor', point(40, -30),
    'sedna_rounds_tender_run', 34, [
      mark('sedna_tender_arc_leg', 109, 25, 'activity:sedna-arc-run'),
      mark('sedna_tender_post_leg', -110, -26, 'station:station_sedna:service-berth'),
    ]),
  // The dishes half: "Sensors" is the post's first service, and a sensor post earns it by walking
  // a scan wedge across the quiet quadrant the tender's lane does not cross. Tight wedge,
  // 71.3 deg / 132.0 WU — close, repetitive scan work beside one hull of air.
  sednaActor('sedna_rounds_dish', sednaRoundsId, 'surveyor', 'surveyor', point(-35, 45),
    'sedna_dish_sweep_loop', 30, [
      mark('sedna_dish_sweep_a', 66, 92, 'activity:sedna-dish-sweep-a'),
      mark('sedna_dish_sweep_b', -66, 92, 'activity:sedna-dish-sweep-b'),
    ]),
]);

const sednaRimActors = Object.freeze([
  // The rim's own sentence: a drift-watcher parked at the arc, holding the post's line. Tightest
  // wedge and shortest span in the sector, 42.7 deg / 81.6 WU over 44 s — under 2 WU/s, because a
  // parked watch is work at walking pace, not a loiter. The post-line mark sits on station_sedna's
  // true bearing back from the arc (-166.7 deg vs the post's own -167.0); the dark leg turns a
  // corner toward the empty rim the cadence pin still points into.
  sednaActor('sedna_drift_watcher', sednaRimId, 'surveyor', 'surveyor', point(-30, 20),
    'sedna_rim_watch_loop', 44, [
      mark('sedna_watch_post_line', -110, -26, 'activity:sedna-watch-post-line'),
      mark('sedna_watch_dark_leg', -62, -92, 'activity:sedna-watch-dark'),
    ]),
  // The wreck nobody is hurrying: a cutter working the arc's sheared plate on a long, slow
  // quarter around the curve — 118.9 deg / 200.0 WU — the widest sweep that still goes around
  // the hulk instead of through it. The face mark's targetRef names the plate (descriptor-only,
  // so the cut is presentation work — no custody); the far leg is the arc's far curve, the same
  // site one corner on.
  sednaActor('sedna_arc_salvor', sednaRimId, 'salvor', 'salvor', point(30, 40),
    'sedna_arc_salvage_loop', 40, [
      mark('sedna_arc_cut_face', 100, 60, 'object:sedna_arc_sheared_plate'),
      mark('sedna_arc_far_face', -100, 58, 'activity:sedna-arc-far-face'),
    ]),
]);

export const SEDNA_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: sednaRoundsId,
    label: 'Survey Rounds',
    identity: Object.freeze({ zoneId: sednaSurveyZone.id, stationId: stationSedna.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationSedna.id, zoneId: sednaSurveyZone.id,
      placeId: stationSedna.id, localPos: stationSedna.pos,
    }),
    actorSlots: sednaRoundsActors,
    objectSlots: sednaRoundsObjects,
    sectorId: SEDNA_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: sednaRimId,
    label: 'Rim Watch',
    // The arc is past every authored zone — the rim is why the pocket exists, so the anchor
    // claims the landmark POI itself and no zone it does not sit in.
    identity: Object.freeze({ placeId: ringworldPoi.id }),
    anchor: canonicalAnchor({
      kind: 'poi', id: ringworldPoi.id, zoneId: null,
      placeId: ringworldPoi.id, localPos: ringworldPoi.pos,
    }),
    actorSlots: sednaRimActors,
    objectSlots: sednaRimObjects,
    sectorId: SEDNA_ACTIVITY_SECTOR_ID,
  }),
]);

export const SEDNA_ACTIVITY_POCKET_ORDER = Object.freeze(SEDNA_ACTIVITY_POCKETS.map((entry) => entry.id));
export const SEDNA_ACTIVITY_POCKETS_BY_ID = Object.freeze(Object.fromEntries(
  SEDNA_ACTIVITY_POCKETS.map((entry) => [entry.id, entry]),
));
export const SEDNA_POCKET_ACTOR_SLOT_ORDER = Object.freeze(SEDNA_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const SEDNA_ROUTE_TOPOLOGY = Object.freeze(SEDNA_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));

if (SEDNA_POCKET_ACTOR_SLOT_ORDER.length !== SEDNA_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Sedna authored capacity mismatch: ${SEDNA_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(SEDNA_POCKET_ACTOR_SLOT_ORDER).size !== SEDNA_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Sedna authored activity slot ids must be unique');
}
assertDistinctRouteTopology(SEDNA_ACTIVITY_POCKETS, SEDNA_ROUTE_TOPOLOGY, 'Sedna');

// ───────────────────────────────────────────────────────────────────────────────────────────────
// AEP PR-2 — rim signature pockets, wave 2. One camera-scale pocket per wave-2 rim sector,
// two bodies each: the crew the sector's way-of-life verb already promised, working the toy's
// site or the fence/lane that hosts it. Same band and topology laws as Ceres and Sedna; every
// anchor is authored geography (each station sits at its named zone's heart). The pocket's
// object slot is the descriptor the toy's operator job reads — the manifest lot, the saw head,
// the lamp shelf — not a materialized body.
// ───────────────────────────────────────────────────────────────────────────────────────────────

// Nyx March — the burn shift: a manifest runner and the tender who walks the ash line.
export const NYX_ACTIVITY_SECTOR_ID = 'sector_nyx_march';
export const NYX_AUTHORED_ACTIVITY_CAPACITY = 2;

const nyxZones = requireArray(SECTOR_ZONES[NYX_ACTIVITY_SECTOR_ID], 'Nyx sector zones');
const nyxAnchors = requireRecord(SECTOR_ANCHORS[NYX_ACTIVITY_SECTOR_ID], 'Nyx sector anchors');
const nyxFenceZone = findById(nyxZones, 'zone_nyx_fence', 'Nyx fence zone');
const stationNyx = findById(nyxAnchors.stations, 'station_nyx_march', 'Nyx fence station anchor');
assertSamePoint(stationNyx.pos, nyxFenceZone.center, 'station_nyx_march / zone_nyx_fence');

const nyxBurnShiftId = 'nyx_burn_shift';

const nyxBurnShiftObjects = Object.freeze([
  objectSlot({
    id: 'nyx_manifest_lot',
    pocketId: nyxBurnShiftId,
    kind: 'cargo_staging_pod',
    offset: point(55, -40),
    runtimeOwner: 'world',
    targetRef: 'object:nyx_manifest_lot',
  }),
]);

const nyxBurnShiftActors = Object.freeze([
  // Transit lane, ~170 deg — the sealed lot runs berth to burn line and back.
  actor({
    id: 'nyx_manifest_runner', pocketId: nyxBurnShiftId, namespace: 'nyx',
    presentationRole: 'courier', jobKind: 'hauler', passive: true, spawnOffset: point(40, -30),
    route: route({ id: 'nyx_manifest_run', jobKind: 'hauler', durationS: 30, marks: [
      mark('nyx_run_lot_leg', -100, 35, 'object:nyx_manifest_lot'),
      mark('nyx_run_berth_leg', 108, -25, 'station:station_nyx_march:service-berth'),
    ] }),
  }),
  // Tight wedge, ~70 deg — the burn line is short, close, repetitive work.
  actor({
    id: 'nyx_ash_tender', pocketId: nyxBurnShiftId, namespace: 'nyx',
    presentationRole: 'tender', jobKind: 'surveyor', passive: true, spawnOffset: point(-35, 40),
    route: route({ id: 'nyx_ash_line_walk', jobKind: 'surveyor', durationS: 26, marks: [
      mark('nyx_ash_line_a', 70, 80, 'activity:nyx-ash-line-a'),
      mark('nyx_ash_line_b', -70, 80, 'activity:nyx-ash-line-b'),
    ] }),
  }),
]);

export const NYX_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: nyxBurnShiftId,
    label: 'Burn Shift',
    identity: Object.freeze({ zoneId: nyxFenceZone.id, stationId: stationNyx.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationNyx.id, zoneId: nyxFenceZone.id,
      placeId: stationNyx.id, localPos: stationNyx.pos,
    }),
    actorSlots: nyxBurnShiftActors,
    objectSlots: nyxBurnShiftObjects,
    sectorId: NYX_ACTIVITY_SECTOR_ID,
  }),
]);

export const NYX_POCKET_ACTOR_SLOT_ORDER = Object.freeze(NYX_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const NYX_ROUTE_TOPOLOGY = Object.freeze(NYX_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));
if (NYX_POCKET_ACTOR_SLOT_ORDER.length !== NYX_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Nyx authored capacity mismatch: ${NYX_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(NYX_POCKET_ACTOR_SLOT_ORDER).size !== NYX_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Nyx authored activity slot ids must be unique');
}
assertDistinctRouteTopology(NYX_ACTIVITY_POCKETS, NYX_ROUTE_TOPOLOGY, 'Nyx');

// Hyperion Cut — the saw shift: the operator who rides the kerf and the hauler who runs
// the claim scale to the refinery.
export const HYPERION_ACTIVITY_SECTOR_ID = 'sector_hyperion_cut';
export const HYPERION_AUTHORED_ACTIVITY_CAPACITY = 2;

const hyperionZones = requireArray(SECTOR_ZONES[HYPERION_ACTIVITY_SECTOR_ID], 'Hyperion sector zones');
const hyperionAnchors = requireRecord(SECTOR_ANCHORS[HYPERION_ACTIVITY_SECTOR_ID], 'Hyperion sector anchors');
const hyperionRefineryZone = findById(hyperionZones, 'zone_hyperion_refinery', 'Hyperion refinery zone');
const stationHyperion = findById(hyperionAnchors.stations, 'station_hyperion_cut', 'Hyperion cut station anchor');
assertSamePoint(stationHyperion.pos, hyperionRefineryZone.center, 'station_hyperion_cut / zone_hyperion_refinery');

const hyperionSawShiftId = 'hyperion_saw_shift';

const hyperionSawShiftObjects = Object.freeze([
  objectSlot({
    id: 'hyp_saw_head',
    pocketId: hyperionSawShiftId,
    kind: 'grave_shard',
    offset: point(-50, 45),
    runtimeOwner: 'world',
    targetRef: 'object:hyp_saw_head',
  }),
]);

const hyperionSawShiftActors = Object.freeze([
  // Quarter arc, ~110 deg — the operator works around the saw track, never through it.
  actor({
    id: 'hyp_saw_operator', pocketId: hyperionSawShiftId, namespace: 'hyperion',
    presentationRole: 'operator', jobKind: 'miner', passive: true, spawnOffset: point(-40, 50),
    route: route({ id: 'hyp_saw_operator_walk', jobKind: 'miner', durationS: 34, marks: [
      mark('hyp_op_track_face', -85, 60, 'activity:hyperion-saw-track'),
      mark('hyp_op_head_check', 60, -95, 'object:hyp_saw_head'),
    ] }),
  }),
  // Transit lane, ~160 deg — ore off the saw to the claim scale and out.
  actor({
    id: 'hyp_ore_runner', pocketId: hyperionSawShiftId, namespace: 'hyperion',
    presentationRole: 'hauler', jobKind: 'hauler', passive: true, spawnOffset: point(50, -35),
    route: route({ id: 'hyp_ore_scale_run', jobKind: 'hauler', durationS: 28, marks: [
      mark('hyp_run_claim_leg', 110, 20, 'station:station_hyperion_claim'),
      mark('hyp_run_saw_leg', -95, -40, 'activity:hyperion-saw-claim-scale'),
    ] }),
  }),
]);

export const HYPERION_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: hyperionSawShiftId,
    label: 'Saw Shift',
    identity: Object.freeze({ zoneId: hyperionRefineryZone.id, stationId: stationHyperion.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationHyperion.id, zoneId: hyperionRefineryZone.id,
      placeId: stationHyperion.id, localPos: stationHyperion.pos,
    }),
    actorSlots: hyperionSawShiftActors,
    objectSlots: hyperionSawShiftObjects,
    sectorId: HYPERION_ACTIVITY_SECTOR_ID,
  }),
]);

export const HYPERION_POCKET_ACTOR_SLOT_ORDER = Object.freeze(HYPERION_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const HYPERION_ROUTE_TOPOLOGY = Object.freeze(HYPERION_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));
if (HYPERION_POCKET_ACTOR_SLOT_ORDER.length !== HYPERION_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Hyperion authored capacity mismatch: ${HYPERION_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(HYPERION_POCKET_ACTOR_SLOT_ORDER).size !== HYPERION_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Hyperion authored activity slot ids must be unique');
}
assertDistinctRouteTopology(HYPERION_ACTIVITY_POCKETS, HYPERION_ROUTE_TOPOLOGY, 'Hyperion');

// Orcus Shadow — the shelf watch: a lamp reader and the record carrier between the posts.
export const ORCUS_ACTIVITY_SECTOR_ID = 'sector_orcus_shadow';
export const ORCUS_AUTHORED_ACTIVITY_CAPACITY = 2;

const orcusZones = requireArray(SECTOR_ZONES[ORCUS_ACTIVITY_SECTOR_ID], 'Orcus sector zones');
const orcusAnchors = requireRecord(SECTOR_ANCHORS[ORCUS_ACTIVITY_SECTOR_ID], 'Orcus sector anchors');
const orcusResearchZone = findById(orcusZones, 'zone_orcus_research', 'Orcus research zone');
const stationOrcus = findById(orcusAnchors.stations, 'station_orcus_shadow', 'Orcus shadow station anchor');
assertSamePoint(stationOrcus.pos, orcusResearchZone.center, 'station_orcus_shadow / zone_orcus_research');

const orcusShelfWatchId = 'orcus_shelf_watch';

const orcusShelfWatchObjects = Object.freeze([
  objectSlot({
    id: 'orcus_lamp_shelf',
    pocketId: orcusShelfWatchId,
    kind: 'cargo_staging_pod',
    offset: point(45, -55),
    runtimeOwner: 'world',
    targetRef: 'object:orcus_lamp_shelf',
  }),
]);

const orcusShelfWatchActors = Object.freeze([
  // Slow wide oblique, ~140 deg — the reader walks the shelf line between the two lamp posts.
  actor({
    id: 'orcus_lamp_reader', pocketId: orcusShelfWatchId, namespace: 'orcus',
    presentationRole: 'reader', jobKind: 'surveyor', passive: true, spawnOffset: point(-45, 35),
    route: route({ id: 'orcus_shelf_walk', jobKind: 'surveyor', durationS: 38, marks: [
      mark('orcus_shelf_lamp_a', -80, 75, 'object:orcus_lamp_shelf'),
      mark('orcus_shelf_lamp_b', 95, -55, 'activity:orcus-far-lamp'),
    ] }),
  }),
  // Tight wedge, ~65 deg — the record carrier cycles the near shelf only.
  actor({
    id: 'orcus_record_carrier', pocketId: orcusShelfWatchId, namespace: 'orcus',
    presentationRole: 'courier', jobKind: 'hauler', passive: true, spawnOffset: point(35, -45),
    route: route({ id: 'orcus_record_loop', jobKind: 'hauler', durationS: 24, marks: [
      mark('orcus_record_shelf_leg', 105, 55, 'object:orcus_lamp_shelf'),
      mark('orcus_record_post_leg', -30, 115, 'activity:orcus-lamp-post'),
    ] }),
  }),
]);

export const ORCUS_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: orcusShelfWatchId,
    label: 'Shelf Watch',
    identity: Object.freeze({ zoneId: orcusResearchZone.id, stationId: stationOrcus.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationOrcus.id, zoneId: orcusResearchZone.id,
      placeId: stationOrcus.id, localPos: stationOrcus.pos,
    }),
    actorSlots: orcusShelfWatchActors,
    objectSlots: orcusShelfWatchObjects,
    sectorId: ORCUS_ACTIVITY_SECTOR_ID,
  }),
]);

export const ORCUS_POCKET_ACTOR_SLOT_ORDER = Object.freeze(ORCUS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const ORCUS_ROUTE_TOPOLOGY = Object.freeze(ORCUS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));
if (ORCUS_POCKET_ACTOR_SLOT_ORDER.length !== ORCUS_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Orcus authored capacity mismatch: ${ORCUS_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(ORCUS_POCKET_ACTOR_SLOT_ORDER).size !== ORCUS_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Orcus authored activity slot ids must be unique');
}
assertDistinctRouteTopology(ORCUS_ACTIVITY_POCKETS, ORCUS_ROUTE_TOPOLOGY, 'Orcus');

// Haumea Rift — the rift watch: a fissure reader and the ice cutter who keeps the lip clear.
export const HAUMEA_ACTIVITY_SECTOR_ID = 'sector_haumea_rift';
export const HAUMEA_AUTHORED_ACTIVITY_CAPACITY = 2;

const haumeaZones = requireArray(SECTOR_ZONES[HAUMEA_ACTIVITY_SECTOR_ID], 'Haumea sector zones');
const haumeaAnchors = requireRecord(SECTOR_ANCHORS[HAUMEA_ACTIVITY_SECTOR_ID], 'Haumea sector anchors');
const haumeaObsZone = findById(haumeaZones, 'zone_haumea_obs', 'Haumea observatory zone');
const stationHaumea = findById(haumeaAnchors.stations, 'station_haumea_rift', 'Haumea rift station anchor');
assertSamePoint(stationHaumea.pos, haumeaObsZone.center, 'station_haumea_rift / zone_haumea_obs');

const haumeaRiftWatchId = 'haumea_rift_watch';

const haumeaRiftWatchObjects = Object.freeze([
  objectSlot({
    id: 'haumea_fracture_pod',
    pocketId: haumeaRiftWatchId,
    kind: 'cargo_staging_pod',
    offset: point(-55, -35),
    runtimeOwner: 'world',
    targetRef: 'object:haumea_fracture_pod',
  }),
]);

const haumeaRiftWatchActors = Object.freeze([
  // Wide oblique, ~135 deg — the reader's pulse circuit walks observatory to fissure bearing.
  actor({
    id: 'haumea_fissure_reader', pocketId: haumeaRiftWatchId, namespace: 'haumea',
    presentationRole: 'reader', jobKind: 'surveyor', passive: true, spawnOffset: point(45, 40),
    route: route({ id: 'haumea_pulse_circuit', jobKind: 'surveyor', durationS: 36, marks: [
      mark('haumea_pulse_fissure_leg', -115, 35, 'activity:haumea-fissure-bearing'),
      mark('haumea_pulse_obs_leg', 100, -50, 'station:station_haumea_rift:service-berth'),
    ] }),
  }),
  // Tight wedge, ~75 deg — the cutter works the ice lip in close, repeated bites.
  actor({
    id: 'haumea_ice_cutter', pocketId: haumeaRiftWatchId, namespace: 'haumea',
    presentationRole: 'cutter', jobKind: 'miner', passive: true, spawnOffset: point(-30, -50),
    route: route({ id: 'haumea_lip_cut_loop', jobKind: 'miner', durationS: 27, marks: [
      mark('haumea_lip_cut_a', 60, 95, 'activity:haumea-lip-face'),
      mark('haumea_lip_cut_b', -95, 65, 'activity:haumea-lip-face-b'),
    ] }),
  }),
]);

export const HAUMEA_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: haumeaRiftWatchId,
    label: 'Rift Watch',
    identity: Object.freeze({ zoneId: haumeaObsZone.id, stationId: stationHaumea.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationHaumea.id, zoneId: haumeaObsZone.id,
      placeId: stationHaumea.id, localPos: stationHaumea.pos,
    }),
    actorSlots: haumeaRiftWatchActors,
    objectSlots: haumeaRiftWatchObjects,
    sectorId: HAUMEA_ACTIVITY_SECTOR_ID,
  }),
]);

export const HAUMEA_POCKET_ACTOR_SLOT_ORDER = Object.freeze(HAUMEA_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const HAUMEA_ROUTE_TOPOLOGY = Object.freeze(HAUMEA_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));
if (HAUMEA_POCKET_ACTOR_SLOT_ORDER.length !== HAUMEA_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Haumea authored capacity mismatch: ${HAUMEA_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(HAUMEA_POCKET_ACTOR_SLOT_ORDER).size !== HAUMEA_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Haumea authored activity slot ids must be unique');
}
assertDistinctRouteTopology(HAUMEA_ACTIVITY_POCKETS, HAUMEA_ROUTE_TOPOLOGY, 'Haumea');

// Eris Margin — the sweep timing crew: a beat-keeper and the runner who crosses on the down.
export const ERIS_ACTIVITY_SECTOR_ID = 'sector_eris_margin';
export const ERIS_AUTHORED_ACTIVITY_CAPACITY = 2;

const erisZones = requireArray(SECTOR_ZONES[ERIS_ACTIVITY_SECTOR_ID], 'Eris sector zones');
const erisAnchors = requireRecord(SECTOR_ANCHORS[ERIS_ACTIVITY_SECTOR_ID], 'Eris sector anchors');
const erisFenceZone = findById(erisZones, 'zone_eris_fence', 'Eris fence zone');
const stationEris = findById(erisAnchors.stations, 'station_eris_margin', 'Eris margin station anchor');
assertSamePoint(stationEris.pos, erisFenceZone.center, 'station_eris_margin / zone_eris_fence');

const erisSweepShiftId = 'eris_sweep_shift';

const erisSweepShiftObjects = Object.freeze([
  objectSlot({
    id: 'eris_tally_buoy',
    pocketId: erisSweepShiftId,
    kind: 'distress_beacon',
    offset: point(-45, 50),
    runtimeOwner: 'world',
    targetRef: 'object:eris_tally_buoy',
  }),
]);

const erisSweepShiftActors = Object.freeze([
  // Parked wedge, ~50 deg — the beat-keeper barely moves; timing is the job, not the mileage.
  actor({
    id: 'eris_beat_keeper', pocketId: erisSweepShiftId, namespace: 'eris',
    presentationRole: 'watcher', jobKind: 'patrol', passive: true, spawnOffset: point(-35, 30),
    route: route({ id: 'eris_beat_watch', jobKind: 'patrol', durationS: 44, marks: [
      mark('eris_beat_metronome_line', -60, 95, 'object:eris_tally_buoy'),
      mark('eris_beat_down_leg', -95, 70, 'activity:eris-down-beat'),
    ] }),
  }),
  // Transit lane, ~175 deg — the margin runner times the sweep and crosses full-length.
  actor({
    id: 'eris_margin_runner', pocketId: erisSweepShiftId, namespace: 'eris',
    presentationRole: 'courier', jobKind: 'hauler', passive: true, spawnOffset: point(50, -30),
    route: route({ id: 'eris_margin_crossing', jobKind: 'hauler', durationS: 25, marks: [
      mark('eris_cross_fence_leg', 105, -40, 'station:station_eris_margin:service-berth'),
      mark('eris_cross_fog_leg', -110, 30, 'activity:eris-fog-crossing'),
    ] }),
  }),
]);

export const ERIS_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: erisSweepShiftId,
    label: 'Sweep Shift',
    identity: Object.freeze({ zoneId: erisFenceZone.id, stationId: stationEris.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationEris.id, zoneId: erisFenceZone.id,
      placeId: stationEris.id, localPos: stationEris.pos,
    }),
    actorSlots: erisSweepShiftActors,
    objectSlots: erisSweepShiftObjects,
    sectorId: ERIS_ACTIVITY_SECTOR_ID,
  }),
]);

export const ERIS_POCKET_ACTOR_SLOT_ORDER = Object.freeze(ERIS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const ERIS_ROUTE_TOPOLOGY = Object.freeze(ERIS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));
if (ERIS_POCKET_ACTOR_SLOT_ORDER.length !== ERIS_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Eris authored capacity mismatch: ${ERIS_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(ERIS_POCKET_ACTOR_SLOT_ORDER).size !== ERIS_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Eris authored activity slot ids must be unique');
}
assertDistinctRouteTopology(ERIS_ACTIVITY_POCKETS, ERIS_ROUTE_TOPOLOGY, 'Eris');

// Nereid Shoal — the sled shift: the runner who takes the channel and the cutter who feeds it.
export const NEREID_ACTIVITY_SECTOR_ID = 'sector_nereid_shoal';
export const NEREID_AUTHORED_ACTIVITY_CAPACITY = 2;

const nereidZones = requireArray(SECTOR_ZONES[NEREID_ACTIVITY_SECTOR_ID], 'Nereid sector zones');
const nereidAnchors = requireRecord(SECTOR_ANCHORS[NEREID_ACTIVITY_SECTOR_ID], 'Nereid sector anchors');
const nereidCoreZone = findById(nereidZones, 'zone_nereid_core', 'Nereid core zone');
const stationNereid = findById(nereidAnchors.stations, 'station_nereid', 'Nereid waystation anchor');
assertSamePoint(stationNereid.pos, nereidCoreZone.center, 'station_nereid / zone_nereid_core');

const nereidSledShiftId = 'nereid_sled_shift';

const nereidSledShiftObjects = Object.freeze([
  objectSlot({
    id: 'nereid_scale_pod',
    pocketId: nereidSledShiftId,
    kind: 'cargo_staging_pod',
    offset: point(60, -45),
    runtimeOwner: 'world',
    targetRef: 'object:nereid_scale_pod',
  }),
]);

const nereidSledShiftActors = Object.freeze([
  // Transit lane, ~175 deg — the sled run is one straight channel, scale to cut face.
  actor({
    id: 'nereid_sled_runner', pocketId: nereidSledShiftId, namespace: 'nereid',
    presentationRole: 'hauler', jobKind: 'hauler', passive: true, spawnOffset: point(40, -40),
    route: route({ id: 'nereid_sled_channel_run', jobKind: 'hauler', durationS: 26, marks: [
      mark('nereid_sled_scale_leg', 115, -20, 'object:nereid_scale_pod'),
      mark('nereid_sled_face_leg', -105, 45, 'activity:nereid-ice-face'),
    ] }),
  }),
  // Tight wedge, ~80 deg — the cutter works the face the sled just emptied.
  actor({
    id: 'nereid_ice_cutter', pocketId: nereidSledShiftId, namespace: 'nereid',
    presentationRole: 'cutter', jobKind: 'miner', passive: true, spawnOffset: point(-45, -30),
    route: route({ id: 'nereid_face_cut_loop', jobKind: 'miner', durationS: 31, marks: [
      mark('nereid_face_bite_a', -70, -90, 'activity:nereid-ice-face'),
      mark('nereid_face_bite_b', -20, -115, 'activity:nereid-ice-face-b'),
    ] }),
  }),
]);

export const NEREID_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: nereidSledShiftId,
    label: 'Sled Shift',
    identity: Object.freeze({ zoneId: nereidCoreZone.id, stationId: stationNereid.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationNereid.id, zoneId: nereidCoreZone.id,
      placeId: stationNereid.id, localPos: stationNereid.pos,
    }),
    actorSlots: nereidSledShiftActors,
    objectSlots: nereidSledShiftObjects,
    sectorId: NEREID_ACTIVITY_SECTOR_ID,
  }),
]);

export const NEREID_POCKET_ACTOR_SLOT_ORDER = Object.freeze(NEREID_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const NEREID_ROUTE_TOPOLOGY = Object.freeze(NEREID_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));
if (NEREID_POCKET_ACTOR_SLOT_ORDER.length !== NEREID_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Nereid authored capacity mismatch: ${NEREID_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(NEREID_POCKET_ACTOR_SLOT_ORDER).size !== NEREID_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Nereid authored activity slot ids must be unique');
}
assertDistinctRouteTopology(NEREID_ACTIVITY_POCKETS, NEREID_ROUTE_TOPOLOGY, 'Nereid');

// Proteus Well — the well sound: the pulse reader and the den runner who files the echo.
export const PROTEUS_ACTIVITY_SECTOR_ID = 'sector_proteus_well';
export const PROTEUS_AUTHORED_ACTIVITY_CAPACITY = 2;

const proteusZones = requireArray(SECTOR_ZONES[PROTEUS_ACTIVITY_SECTOR_ID], 'Proteus sector zones');
const proteusAnchors = requireRecord(SECTOR_ANCHORS[PROTEUS_ACTIVITY_SECTOR_ID], 'Proteus sector anchors');
const proteusDenZone = findById(proteusZones, 'zone_proteus_den', 'Proteus den zone');
const stationProteus = findById(proteusAnchors.stations, 'station_proteus', 'Proteus den station anchor');
assertSamePoint(stationProteus.pos, proteusDenZone.center, 'station_proteus / zone_proteus_den');

const proteusWellSoundId = 'proteus_well_sound';

const proteusWellSoundObjects = Object.freeze([
  objectSlot({
    id: 'proteus_echo_log',
    pocketId: proteusWellSoundId,
    kind: 'cargo_staging_pod',
    offset: point(-50, 55),
    runtimeOwner: 'world',
    targetRef: 'object:proteus_echo_log',
  }),
]);

const proteusWellSoundActors = Object.freeze([
  // Quarter arc, ~105 deg — the reader circles the well mouth; you sound around a well,
  // never down it.
  actor({
    id: 'proteus_well_reader', pocketId: proteusWellSoundId, namespace: 'proteus',
    presentationRole: 'reader', jobKind: 'surveyor', passive: true, spawnOffset: point(-40, 45),
    route: route({ id: 'proteus_well_circle', jobKind: 'surveyor', durationS: 37, marks: [
      mark('proteus_sound_mouth_leg', -85, 70, 'activity:proteus-well-mouth'),
      mark('proteus_sound_den_leg', 100, 55, 'object:proteus_echo_log'),
    ] }),
  }),
  // Transit lane, ~165 deg — the den run: findings filed before anyone else hears them.
  actor({
    id: 'proteus_den_runner', pocketId: proteusWellSoundId, namespace: 'proteus',
    presentationRole: 'courier', jobKind: 'hauler', passive: true, spawnOffset: point(50, -35),
    route: route({ id: 'proteus_den_filing_run', jobKind: 'hauler', durationS: 29, marks: [
      mark('proteus_den_desk_leg', 110, -30, 'station:station_proteus:service-berth'),
      mark('proteus_den_well_leg', -105, -45, 'activity:proteus-well-mouth'),
    ] }),
  }),
]);

export const PROTEUS_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: proteusWellSoundId,
    label: 'Well Sound',
    identity: Object.freeze({ zoneId: proteusDenZone.id, stationId: stationProteus.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationProteus.id, zoneId: proteusDenZone.id,
      placeId: stationProteus.id, localPos: stationProteus.pos,
    }),
    actorSlots: proteusWellSoundActors,
    objectSlots: proteusWellSoundObjects,
    sectorId: PROTEUS_ACTIVITY_SECTOR_ID,
  }),
]);

export const PROTEUS_POCKET_ACTOR_SLOT_ORDER = Object.freeze(PROTEUS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const PROTEUS_ROUTE_TOPOLOGY = Object.freeze(PROTEUS_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));
if (PROTEUS_POCKET_ACTOR_SLOT_ORDER.length !== PROTEUS_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Proteus authored capacity mismatch: ${PROTEUS_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(PROTEUS_POCKET_ACTOR_SLOT_ORDER).size !== PROTEUS_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Proteus authored activity slot ids must be unique');
}
assertDistinctRouteTopology(PROTEUS_ACTIVITY_POCKETS, PROTEUS_ROUTE_TOPOLOGY, 'Proteus');

// Triton Wake — the kite watch: the keeper who minds the kite line and the courier who rides
// the glow band off the lane.
export const TRITON_ACTIVITY_SECTOR_ID = 'sector_triton_wake';
export const TRITON_AUTHORED_ACTIVITY_CAPACITY = 2;

const tritonZones = requireArray(SECTOR_ZONES[TRITON_ACTIVITY_SECTOR_ID], 'Triton sector zones');
const tritonAnchors = requireRecord(SECTOR_ANCHORS[TRITON_ACTIVITY_SECTOR_ID], 'Triton sector anchors');
const tritonLabZone = findById(tritonZones, 'zone_triton_lab', 'Triton lab zone');
const stationTriton = findById(tritonAnchors.stations, 'station_triton', 'Triton research post anchor');
assertSamePoint(stationTriton.pos, tritonLabZone.center, 'station_triton / zone_triton_lab');

const tritonKiteWatchId = 'triton_kite_watch';

const tritonKiteWatchObjects = Object.freeze([
  objectSlot({
    id: 'triton_kite_anchor',
    pocketId: tritonKiteWatchId,
    kind: 'distress_beacon',
    offset: point(55, 50),
    runtimeOwner: 'world',
    targetRef: 'object:triton_kite_anchor',
  }),
]);

const tritonKiteWatchActors = Object.freeze([
  // Tight wedge, ~60 deg — the kite keeper minds the line anchor; the kite does the flying.
  actor({
    id: 'triton_kite_keeper', pocketId: tritonKiteWatchId, namespace: 'triton',
    presentationRole: 'keeper', jobKind: 'surveyor', passive: true, spawnOffset: point(35, 45),
    route: route({ id: 'triton_kite_line_walk', jobKind: 'surveyor', durationS: 40, marks: [
      mark('triton_kite_line_a', 95, 70, 'object:triton_kite_anchor'),
      mark('triton_kite_line_b', 30, 115, 'activity:triton-glow-band'),
    ] }),
  }),
  // Wide oblique, ~150 deg — the wake courier rides the glow band's long diagonal.
  actor({
    id: 'triton_wake_courier', pocketId: tritonKiteWatchId, namespace: 'triton',
    presentationRole: 'courier', jobKind: 'hauler', passive: true, spawnOffset: point(-50, -40),
    route: route({ id: 'triton_wake_band_run', jobKind: 'hauler', durationS: 32, marks: [
      mark('triton_band_up_leg', -115, -25, 'activity:triton-glow-band'),
      mark('triton_band_post_leg', 118, 32, 'station:station_triton:service-berth'),
    ] }),
  }),
]);

export const TRITON_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: tritonKiteWatchId,
    label: 'Kite Watch',
    identity: Object.freeze({ zoneId: tritonLabZone.id, stationId: stationTriton.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationTriton.id, zoneId: tritonLabZone.id,
      placeId: stationTriton.id, localPos: stationTriton.pos,
    }),
    actorSlots: tritonKiteWatchActors,
    objectSlots: tritonKiteWatchObjects,
    sectorId: TRITON_ACTIVITY_SECTOR_ID,
  }),
]);

export const TRITON_POCKET_ACTOR_SLOT_ORDER = Object.freeze(TRITON_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const TRITON_ROUTE_TOPOLOGY = Object.freeze(TRITON_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));
if (TRITON_POCKET_ACTOR_SLOT_ORDER.length !== TRITON_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Triton authored capacity mismatch: ${TRITON_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(TRITON_POCKET_ACTOR_SLOT_ORDER).size !== TRITON_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Triton authored activity slot ids must be unique');
}
assertDistinctRouteTopology(TRITON_ACTIVITY_POCKETS, TRITON_ROUTE_TOPOLOGY, 'Triton');

// Eunomia Gulf — the license shift: the cutter who plates the wreck and the clerk whose
// stamp makes it nobody's dispute.
export const EUNOMIA_ACTIVITY_SECTOR_ID = 'sector_eunomia_gulf';
export const EUNOMIA_AUTHORED_ACTIVITY_CAPACITY = 2;

const eunomiaZones = requireArray(SECTOR_ZONES[EUNOMIA_ACTIVITY_SECTOR_ID], 'Eunomia sector zones');
const eunomiaAnchors = requireRecord(SECTOR_ANCHORS[EUNOMIA_ACTIVITY_SECTOR_ID], 'Eunomia sector anchors');
const eunomiaFenceZone = findById(eunomiaZones, 'zone_eunomia_fence', 'Eunomia fence zone');
const stationEunomia = findById(eunomiaAnchors.stations, 'station_eunomia', 'Eunomia fence station anchor');
assertSamePoint(stationEunomia.pos, eunomiaFenceZone.center, 'station_eunomia / zone_eunomia_fence');

const eunomiaLicenseShiftId = 'eunomia_license_shift';

const eunomiaLicenseShiftObjects = Object.freeze([
  objectSlot({
    id: 'eunomia_stamp_block',
    pocketId: eunomiaLicenseShiftId,
    kind: 'cargo_staging_pod',
    offset: point(-55, -50),
    runtimeOwner: 'world',
    targetRef: 'object:eunomia_stamp_block',
  }),
]);

const eunomiaLicenseShiftActors = Object.freeze([
  // Quarter arc, ~115 deg — the plate cutter works around the block, wreck side to seal side.
  actor({
    id: 'eunomia_plate_cutter', pocketId: eunomiaLicenseShiftId, namespace: 'eunomia',
    presentationRole: 'cutter', jobKind: 'salvor', passive: true, spawnOffset: point(-45, -40),
    route: route({ id: 'eunomia_plate_cut_loop', jobKind: 'salvor', durationS: 35, marks: [
      mark('eunomia_cut_wreck_leg', -100, 60, 'activity:eunomia-wreck-side'),
      mark('eunomia_cut_block_leg', 90, -70, 'object:eunomia_stamp_block'),
    ] }),
  }),
  // Tight wedge, ~55 deg — the stamp never travels: the clerk checks each plate on the block.
  actor({
    id: 'eunomia_stamp_clerk', pocketId: eunomiaLicenseShiftId, namespace: 'eunomia',
    presentationRole: 'clerk', jobKind: 'patrol', passive: true, spawnOffset: point(30, -55),
    route: route({ id: 'eunomia_stamp_walk', jobKind: 'patrol', durationS: 42, marks: [
      mark('eunomia_stamp_ledger_leg', 115, 30, 'activity:eunomia-ledger-poi'),
      mark('eunomia_stamp_seal_leg', -75, -90, 'object:eunomia_stamp_block'),
    ] }),
  }),
]);

export const EUNOMIA_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: eunomiaLicenseShiftId,
    label: 'License Shift',
    identity: Object.freeze({ zoneId: eunomiaFenceZone.id, stationId: stationEunomia.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationEunomia.id, zoneId: eunomiaFenceZone.id,
      placeId: stationEunomia.id, localPos: stationEunomia.pos,
    }),
    actorSlots: eunomiaLicenseShiftActors,
    objectSlots: eunomiaLicenseShiftObjects,
    sectorId: EUNOMIA_ACTIVITY_SECTOR_ID,
  }),
]);

export const EUNOMIA_POCKET_ACTOR_SLOT_ORDER = Object.freeze(EUNOMIA_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const EUNOMIA_ROUTE_TOPOLOGY = Object.freeze(EUNOMIA_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));
if (EUNOMIA_POCKET_ACTOR_SLOT_ORDER.length !== EUNOMIA_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Eunomia authored capacity mismatch: ${EUNOMIA_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(EUNOMIA_POCKET_ACTOR_SLOT_ORDER).size !== EUNOMIA_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Eunomia authored activity slot ids must be unique');
}
assertDistinctRouteTopology(EUNOMIA_ACTIVITY_POCKETS, EUNOMIA_ROUTE_TOPOLOGY, 'Eunomia');

// ───────────────────────────────────────────────────────────────────────────────────────────────
// The registry. Everything downstream reads this instead of a Ceres constant, which is the whole
// reason a second sector can exist here at all.
// ───────────────────────────────────────────────────────────────────────────────────────────────

const EMPTY_POCKETS = Object.freeze([]);

export const ACTIVITY_POCKETS_BY_SECTOR = Object.freeze({
  [CERES_ACTIVITY_SECTOR_ID]: CERES_ACTIVITY_POCKETS,
  [HELIOS_ACTIVITY_SECTOR_ID]: HELIOS_ACTIVITY_POCKETS,
  [PALLAS_ACTIVITY_SECTOR_ID]: PALLAS_ACTIVITY_POCKETS,
  [VESTA_ACTIVITY_SECTOR_ID]: VESTA_ACTIVITY_POCKETS,
  [TETHYS_ACTIVITY_SECTOR_ID]: TETHYS_ACTIVITY_POCKETS,
  [SEDNA_ACTIVITY_SECTOR_ID]: SEDNA_ACTIVITY_POCKETS,
  [NYX_ACTIVITY_SECTOR_ID]: NYX_ACTIVITY_POCKETS,
  [HYPERION_ACTIVITY_SECTOR_ID]: HYPERION_ACTIVITY_POCKETS,
  [ORCUS_ACTIVITY_SECTOR_ID]: ORCUS_ACTIVITY_POCKETS,
  [HAUMEA_ACTIVITY_SECTOR_ID]: HAUMEA_ACTIVITY_POCKETS,
  [ERIS_ACTIVITY_SECTOR_ID]: ERIS_ACTIVITY_POCKETS,
  [NEREID_ACTIVITY_SECTOR_ID]: NEREID_ACTIVITY_POCKETS,
  [PROTEUS_ACTIVITY_SECTOR_ID]: PROTEUS_ACTIVITY_POCKETS,
  [TRITON_ACTIVITY_SECTOR_ID]: TRITON_ACTIVITY_POCKETS,
  [EUNOMIA_ACTIVITY_SECTOR_ID]: EUNOMIA_ACTIVITY_POCKETS,
});

export const ACTIVITY_POCKET_SECTOR_IDS = Object.freeze(Object.keys(ACTIVITY_POCKETS_BY_SECTOR));

export const ACTIVITY_POCKETS = Object.freeze(ACTIVITY_POCKET_SECTOR_IDS.flatMap(
  (sectorId) => ACTIVITY_POCKETS_BY_SECTOR[sectorId],
));

export const ACTIVITY_POCKETS_BY_ID = Object.freeze(Object.fromEntries(
  ACTIVITY_POCKETS.map((entry) => [entry.id, entry]),
));

/** Authored activity pockets declared for `sectorId`, or an empty list. */
export function activityPocketsForSector(sectorId) {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_POCKETS_BY_SECTOR, sectorId)
    ? ACTIVITY_POCKETS_BY_SECTOR[sectorId]
    : EMPTY_POCKETS;
}

/** The pocket with this id in any sector, or null. */
export function activityPocketById(id) {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_POCKETS_BY_ID, id)
    ? ACTIVITY_POCKETS_BY_ID[id]
    : null;
}

/** The actor slot with this id in any sector, or null. */
export function activityActorSlotById(id) {
  for (const pocketEntry of ACTIVITY_POCKETS) {
    const slot = pocketEntry.actorSlots.find((candidate) => candidate.id === id);
    if (slot) return slot;
  }
  return null;
}

/** Measured route shapes for every sector, keyed by pocket id. */
export function activityRouteTopologyForSector(sectorId) {
  return activityPocketsForSector(sectorId).flatMap((entry) => entry.actorSlots.map((slot) => routeTopology(slot)));
}
