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
// CR-HOLLOW-3 — Sker Haven: the Bazaar's shift. Sker is not a hollow rim — trafficPerMin 9 keeps
// an apron of ambient haulers on the lanes — but the ambient scatter is anonymous, while the
// sector's own authored material already promised a working place nobody could see. The zone
// ledger says it outright: Skerris Deep is "an open pirate haven — the Reach fence stolen cargo
// and refit raiders here"; the belt zone is "Seams mined by press-ganged crews under Reach guns";
// and station_sker's berth is repGated — "you're vouched for or you're cargo" — which means the
// DOOR is a character in this sector, not a radius. These pockets are those three sentences made
// visible — not density: two pockets, four bodies. At the bazaar apron the fence's runner makes
// the off-manifest leg between the hold pod and the last straight into the berth while a Reach
// gun holds the vetting chord across the arrival face; out in the Press-Gang Seams a worked crew
// hull shuttles between the face and the tally crate while the gun that owns them flies the watch
// line back toward the camp that posted it. The Reach is not law — security 0.08, no lawful hulls,
// nobody arrives shooting (the gate-camp zone owns the hostile presence; these are working hulls).
// Same band and topology laws as Ceres; no earlier pocket id is copied. Bearings are taken from
// the geography that exists: the hold pod sits on the true bearing to poi_stash, the picket's
// pallas-face mark on the true bearing to the Pallas gate, the seam's face and the gun's camp line
// on the true bearing to zone_sker_gatecamp, and the tally crate under its own mark's bearing.
// ───────────────────────────────────────────────────────────────────────────────────────────────

export const SKER_ACTIVITY_SECTOR_ID = 'sector_sker_haven';
/** Two pockets × two actors: the fence's apron, the press-gang seam. */
export const SKER_AUTHORED_ACTIVITY_CAPACITY = 4;

const skerZones = requireArray(SECTOR_ZONES[SKER_ACTIVITY_SECTOR_ID], 'Sker sector zones');
const skerAnchors = requireRecord(SECTOR_ANCHORS[SKER_ACTIVITY_SECTOR_ID], 'Sker sector anchors');
const skerHavenZone = findById(skerZones, 'zone_sker_haven', 'Skerris Deep zone');
const skerBeltZone = findById(skerZones, 'zone_sker_belt', 'Press-Gang Seams zone');
// Gate-camp, stash, and Pallas-gate rows are loaded as existence proofs, not consumed directly —
// the comments below cite their true bearings, so a missing or renamed row must fail at load.
const skerGatecampZone = findById(skerZones, 'zone_sker_gatecamp', 'Reach Gate-Camp zone');
const stationSker = findById(skerAnchors.stations, 'station_sker', 'Sker Bazaar station anchor');
const stashPoi = findById(skerAnchors.pois, 'poi_stash', 'Sker stash POI');
const skerField = findById(skerAnchors.fields, 'f_sker_1', 'Sker seam field');
// Gate rows key on `to`, not `id` — the picket's pallas-face mark cites this bearing.
const pallasGate = requireRecord(
  requireArray(skerAnchors.gates, 'Sker gates').find((gate) => gate && gate.to === 'sector_pallas_drift'),
  'Sker Pallas gate',
);

// The Bazaar is the Deep's heart; the seam's zone heart IS the field it works.
assertSamePoint(stationSker.pos, skerHavenZone.center, 'station_sker / zone_sker_haven');
assertSamePoint(skerBeltZone.center, skerField.center, 'zone_sker_belt / f_sker_1');

const skerApronId = 'sker_bazaar_apron';
const skerSeamId = 'sker_press_gang_seam';

function skerActor(id, pocketId, role, jobKind, spawn, routeId, durationS, marks, { lawful = false, receiptType = null } = {}) {
  return actor({
    id,
    pocketId,
    namespace: 'sker',
    presentationRole: role,
    jobKind,
    lawful,
    passive: true,
    spawnOffset: spawn,
    route: route({ id: routeId, jobKind, durationS, receiptType, marks }),
  });
}

const skerApronObjects = Object.freeze([
  // The fence's hold pod: off-manifest freight sits just off the berth line on the true bearing
  // to the real stash at poi_stash — the pod is where the apron's goods actually live, and the
  // runner's far leg points through it stash-ward. Descriptor-only, like every non-Ceres object
  // slot: the targetRef gives the route marks a name to point at, not a materialized body.
  // Band-edge watch: the pod resolves at ~94.6 WU — a hair under the immediate band ceiling —
  // so any offset nudge positive pushes it out of the band the pocket asserts.
  objectSlot({
    id: 'sker_fence_hold_pod',
    pocketId: skerApronId,
    kind: 'cargo_staging_pod',
    offset: point(-55, -77),
    runtimeOwner: 'world',
    targetRef: 'object:sker_fence_hold_pod',
  }),
]);

const skerSeamObjects = Object.freeze([
  // The crate that tallies the take: a press-ganged crew's cut is not theirs to keep, so the seam
  // owns a count point — parked on the hulk side of the anchor under the toiler's tally mark.
  objectSlot({
    id: 'sker_seam_tally_crate',
    pocketId: skerSeamId,
    kind: 'cargo_staging_pod',
    offset: point(20, 82),
    runtimeOwner: 'world',
    targetRef: 'object:sker_seam_tally_crate',
  }),
]);

const skerApronActors = Object.freeze([
  // The fence's fetch: the off-manifest leg out toward the hold pod (on the stash's true bearing,
  // -125.5 deg) and back onto the apron's arrival leg. Transit-lane family, 165.7 deg / 223.7 WU
  // over 22 s — the fastest route in the sector, because a fence's run is a run, not a beat.
  skerActor('sker_apron_runner', skerApronId, 'smuggler', 'hauler', point(-50, -40),
    'sker_apron_fetch_run', 22, [
      mark('sker_runner_hold_leg', -67, -94, 'object:sker_fence_hold_pod'),
      mark('sker_runner_apron_leg', 84, 71, 'dest:station_sker'),
    ], { receiptType: 'freight:arrival' }),
  // The door vets standing: a Reach gun on the vetting chord across the arrival face — one end
  // on the Pallas approach bearing (-55.7 deg vs the gate's own -55.5), the other across the
  // north face the deep opens into. Wide chord, 90.7 deg / 156.5 WU over 44 s — the slowest
  // route in the sector, because a picket on the door is a held line, not a patrol.
  skerActor('sker_door_picket', skerApronId, 'pirate', 'patrol', point(50, 25),
    'sker_door_vetting_chord', 44, [
      mark('sker_picket_pallas_face', 62, -91, 'activity:sker-door-pallas-face'),
      mark('sker_picket_north_face', 90, 63, 'activity:sker-door-north-face'),
    ]),
]);

const skerSeamActors = Object.freeze([
  // The crew that is worked: a mining barge shuttling between the seam's face — on the true
  // bearing to the gate-camp whose guns cover it (-41.7 deg vs the camp's own -41.55) — and the
  // crate that tallies the take, parked under the tally mark's own bearing (+76.5 deg). Wedge
  // opened wide, 118.2 deg / 197.5 WU over 40 s — a worked pace between two fixed points of work.
  skerActor('sker_seam_toiler', skerSeamId, 'miner', 'miner', point(-42, -28),
    'sker_seam_tally_loop', 40, [
      mark('sker_toiler_face', 82, -73, 'field:f_sker_1'),
      mark('sker_toiler_tally', 28, 117, 'object:sker_seam_tally_crate'),
    ], { receiptType: 'mining:npcExtraction' }),
  // The gun the crew is worked under: a Reach raider flying the watch line — one end aimed back
  // at the camp that posted it (-41.6 deg, the same bearing as the face it covers), the other
  // swung across the seam's working side (+110.3 deg). Wide oblique, 151.9 deg / 223.3 WU over
  // 38 s — a covering arc over somebody else's work, distinct from the door's held chord.
  skerActor('sker_seam_gun', skerSeamId, 'pirate', 'patrol', point(46, 34),
    'sker_seam_watch_line', 38, [
      mark('sker_gun_camp_line', 90, -80, 'activity:sker-gun-camp-line'),
      mark('sker_gun_seam_side', -38, 103, 'activity:sker-gun-seam-side'),
    ]),
]);

export const SKER_ACTIVITY_POCKETS = Object.freeze([
  pocket({
    id: skerApronId,
    label: 'Bazaar Apron',
    identity: Object.freeze({ zoneId: skerHavenZone.id, stationId: stationSker.id }),
    anchor: canonicalAnchor({
      kind: 'station', id: stationSker.id, zoneId: skerHavenZone.id,
      placeId: stationSker.id, localPos: stationSker.pos,
    }),
    actorSlots: skerApronActors,
    objectSlots: skerApronObjects,
    sectorId: SKER_ACTIVITY_SECTOR_ID,
  }),
  pocket({
    id: skerSeamId,
    label: 'Press-Gang Seam',
    identity: Object.freeze({ zoneId: skerBeltZone.id, fieldId: 'f_sker_1' }),
    anchor: canonicalAnchor({
      kind: 'zone', id: skerBeltZone.id, zoneId: skerBeltZone.id,
      placeId: null, localPos: skerBeltZone.center,
    }),
    actorSlots: skerSeamActors,
    objectSlots: skerSeamObjects,
    sectorId: SKER_ACTIVITY_SECTOR_ID,
  }),
]);

export const SKER_ACTIVITY_POCKET_ORDER = Object.freeze(SKER_ACTIVITY_POCKETS.map((entry) => entry.id));
export const SKER_ACTIVITY_POCKETS_BY_ID = Object.freeze(Object.fromEntries(
  SKER_ACTIVITY_POCKETS.map((entry) => [entry.id, entry]),
));
export const SKER_POCKET_ACTOR_SLOT_ORDER = Object.freeze(SKER_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => slot.id),
));
export const SKER_ROUTE_TOPOLOGY = Object.freeze(SKER_ACTIVITY_POCKETS.flatMap(
  (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
));

if (SKER_POCKET_ACTOR_SLOT_ORDER.length !== SKER_AUTHORED_ACTIVITY_CAPACITY) {
  throw new Error(`Sker authored capacity mismatch: ${SKER_POCKET_ACTOR_SLOT_ORDER.length}`);
}
if (new Set(SKER_POCKET_ACTOR_SLOT_ORDER).size !== SKER_POCKET_ACTOR_SLOT_ORDER.length) {
  throw new Error('Sker authored activity slot ids must be unique');
}
assertDistinctRouteTopology(SKER_ACTIVITY_POCKETS, SKER_ROUTE_TOPOLOGY, 'Sker');

// ───────────────────────────────────────────────────────────────────────────────────────────────
// CR-HOLLOW-4 — the lived-in frontier. Eighteen of the twenty-five sectors had no authored shift:
// arriving in one meant anonymous ambient scatter (or, in the hollow rims, nothing at all). All
// eighteen now open with work already under way, the same way Ceres, Sker and Sedna do — two
// pockets, four hulls, every hull flying a job kind the runtime owns, nobody arriving shooting.
// The fiction per sector is lifted from the zone ledger and the station services, never invented
// against them:
//
//   Veil Nebula     a research post that works hushed: the instrument tender between the berth and
//                   the Anomaly, a dish listening along the revoked-gate chord, a prospector coring
//                   Quiet Ice under a hauler that carries the cores to the berth.
//   Ashfall Reach   the Ruined Cache's black-market apron (a salvor cutting the cache's own ruin, a
//                   runner fetching from the strongbox) and the Edge Seams' thin margins (a miner,
//                   a surveyor charting between the Maintenance machine and the Ossuary).
//   Io Reach        a contested waystation (a claim-run hauler, a tender tending the dead relay in
//                   the Shepherd's Ring) and the Cruiser Graveyard (salvors still combing the hull
//                   under a Concord picket).
//   Charon Expanse  the Cinder Refinery's yard (ore lane, the air tender) and the Colony Barge
//                   (scrap salvage, the air haul).
//   Dione Lane      the Exchange apron (lawful toll patrol, freight in) and the Lane Relay (the
//                   keeper, the southbound convoy hauler that prefers paperwork to pirates).
//   Nereid Shoal    the waystation apron and the Ice Shoal Seams (independents under a Collective
//                   cut, a collector hauling the cut).
//   Hyperion Cut    the Cut Refinery yard and the first Drift surveyors' seams.
//
// Same band, shape and topology laws as Ceres; no earlier pocket id is copied. Route shapes are
// authored as true bearings from the geography that exists (the first mark of each route aims at a
// named place) and swept to a clean 15-degree class, so the distinctness rule is satisfied by
// shape, not by rounding noise. This section is a factory over the Ceres helpers rather than seven
// copies of the Sker boilerplate; each set is still validated at module load by the same
// capacity, uniqueness and topology rules, and by test/lived-frontier-pockets.test.mjs.
// ───────────────────────────────────────────────────────────────────────────────────────────────

function livedAnchor(zones, anchors, spec, label) {
  if (spec.kind === 'station') {
    const station = findById(anchors.stations, spec.id, `${label} station anchor`);
    const zone = spec.zoneId ? findById(zones, spec.zoneId, `${label} station zone`) : null;
    if (zone) assertSamePoint(station.pos, zone.center, `${station.id} / ${zone.id}`);
    return {
      identity: Object.freeze(zone ? { zoneId: zone.id, stationId: station.id } : { stationId: station.id }),
      anchor: canonicalAnchor({
        kind: 'station', id: station.id, zoneId: zone ? zone.id : null,
        placeId: station.id, localPos: station.pos,
      }),
    };
  }
  if (spec.kind === 'zone') {
    const zone = findById(zones, spec.id, `${label} zone anchor`);
    if (spec.fieldId) {
      const field = findById(anchors.fields, spec.fieldId, `${label} zone field`);
      assertSamePoint(zone.center, field.center, `${zone.id} / ${field.id}`);
    }
    return {
      identity: Object.freeze(spec.fieldId ? { zoneId: zone.id, fieldId: spec.fieldId } : { zoneId: zone.id }),
      anchor: canonicalAnchor({
        kind: 'zone', id: zone.id, zoneId: zone.id, placeId: null, localPos: zone.center,
      }),
    };
  }
  if (spec.kind === 'poi') {
    const poi = findById(anchors.pois, spec.id, `${label} poi anchor`);
    return {
      identity: Object.freeze({ placeId: poi.id }),
      anchor: canonicalAnchor({
        kind: 'poi', id: poi.id, zoneId: null, placeId: poi.id, localPos: poi.pos,
      }),
    };
  }
  throw new Error(`${label}: unsupported lived-frontier anchor kind ${spec.kind}`);
}

/**
 * One sector's authored shift from a declarative spec. Each actor is
 * `{ id, role, kind, spawn: [x, z], routeId, durationS, marks: [[id, x, z, targetRef], ...] }`
 * plus optional `lawful` and `receipt`; each object is `{ id, kind, offset: [x, z], targetRef }`.
 */
function livedFrontierSet({ sectorId, namespace, label, pockets: pocketSpecs }) {
  const zones = requireArray(SECTOR_ZONES[sectorId], `${label} sector zones`);
  const anchors = requireRecord(SECTOR_ANCHORS[sectorId], `${label} sector anchors`);
  const pockets = Object.freeze(pocketSpecs.map((spec) => {
    const { identity, anchor } = livedAnchor(zones, anchors, spec.anchor, `${label}/${spec.id}`);
    return pocket({
      id: spec.id,
      label: spec.label,
      identity,
      anchor,
      actorSlots: spec.actors.map((a) => actor({
        id: a.id,
        pocketId: spec.id,
        namespace,
        presentationRole: a.role,
        jobKind: a.kind,
        lawful: a.lawful === true,
        passive: true,
        spawnOffset: point(a.spawn[0], a.spawn[1]),
        route: route({
          id: a.routeId,
          jobKind: a.kind,
          durationS: a.durationS,
          receiptType: a.receipt || null,
          marks: a.marks.map(([id, x, z, ref]) => mark(id, x, z, ref || null)),
        }),
      })),
      objectSlots: (spec.objects || []).map((o) => objectSlot({
        id: o.id,
        pocketId: spec.id,
        kind: o.kind,
        offset: point(o.offset[0], o.offset[1]),
        runtimeOwner: 'world',
        targetRef: o.targetRef || null,
      })),
      sectorId,
    });
  }));
  const pocketOrder = Object.freeze(pockets.map((entry) => entry.id));
  const actorSlotOrder = Object.freeze(pockets.flatMap((entry) => entry.actorSlots.map((slot) => slot.id)));
  const routeTopologyRows = Object.freeze(pockets.flatMap(
    (entry) => entry.actorSlots.map((slot) => routeTopology(slot)),
  ));
  if (new Set(actorSlotOrder).size !== actorSlotOrder.length) {
    throw new Error(`${label} authored activity slot ids must be unique`);
  }
  assertDistinctRouteTopology(pockets, routeTopologyRows, label);
  return Object.freeze({
    sectorId,
    namespace,
    pockets,
    pocketOrder,
    actorSlotOrder,
    capacity: actorSlotOrder.length,
    routeTopology: routeTopologyRows,
  });
}

const LIVED_FRONTIER_SET_LIST = [
  // ── Veil Nebula — a research post that works hushed. Free Frontier scientists study the
  // Anomaly; the Vael tolerate them, barely. trafficPerMin 0, so these four are the only life.
  livedFrontierSet({
    sectorId: 'sector_veil_nebula',
    namespace: 'veil',
    label: 'Veil',
    pockets: [
      {
        id: 'veil_research_rounds',
        label: 'Research Rounds',
        anchor: { kind: 'station', id: 'station_veil', zoneId: 'zone_veil_research' },
        actors: [
          // The instrument tender: a straight lane between the berth and the Anomaly's edge —
          // the Anomaly leg on its true bearing from the post (110.6 deg), the berth leg the
          // way back. Transit lane, 180 deg / 224 WU over 36 s.
          { id: 'veil_instrument_tender', role: 'tender', kind: 'surveyor', spawn: [34, -40],
            routeId: 'veil_instrument_run', durationS: 36,
            marks: [
              ['veil_tender_anomaly_leg', -39.3, 104.9, 'activity:veil-anomaly-run'],
              ['veil_tender_berth_leg', 39.3, -104.9, 'station:station_veil:service-berth'],
            ] },
          // The dish: a scan chord across the quarter the tender's lane never crosses, from the
          // Revoked Transit's bearing (-15.9 deg) to the Exception Chamber's (61.3 deg). Held
          // slow — 3 WU/s — because listening is not a beat.
          { id: 'veil_dish_listener', role: 'surveyor', kind: 'surveyor', spawn: [-38, 26],
            routeId: 'veil_dish_listen_chord', durationS: 44,
            marks: [
              ['veil_dish_revoked_face', 102.9, -29.4, 'activity:veil-revoked-face'],
              ['veil_dish_chamber_face', 56.6, 94.3, 'activity:veil-chamber-face'],
            ] },
        ],
      },
      {
        id: 'veil_quiet_ice_prospect',
        label: 'Quiet Ice',
        anchor: { kind: 'zone', id: 'zone_veil_quiet_ice' },
        // The rack the cores wait in: on the hauler's station-ward bearing (-100.4 deg).
        objects: [
          { id: 'veil_ice_core_rack', kind: 'cargo_staging_pod', offset: [-12.2, -66.9],
            targetRef: 'object:veil_ice_core_rack' },
        ],
        actors: [
          // "Spectral return says clean ice; subsurface pockets say otherwise" — a prospector
          // coring a tight wedge of cold rock, face turned toward the Blind Nebula (-143.9 deg).
          { id: 'veil_ice_prospector', role: 'miner', kind: 'miner', spawn: [-40, -30],
            routeId: 'veil_ice_core_loop', durationS: 40,
            marks: [
              ['veil_prospector_fog_face', -86.5, -63, 'activity:veil-ice-fog-face'],
              ['veil_prospector_core_face', 11.4, -107.4, 'activity:veil-ice-core-face'],
            ] },
          // The cores go to the post: rack first, then the lane out toward the Triton gate.
          { id: 'veil_ice_hauler', role: 'hauler', kind: 'hauler', spawn: [30, -45],
            routeId: 'veil_ice_core_haul', durationS: 30,
            marks: [
              ['veil_hauler_rack_leg', -19.8, -108.2, 'object:veil_ice_core_rack'],
              ['veil_hauler_gate_leg', 108.2, -19.8, 'activity:veil-ice-gate-leg'],
            ] },
        ],
      },
    ],
  }),
  // ── Ashfall Reach — the edge of known space. The Ruined Cache is a black market among the
  // dead; the Edge Seams are cold rock and thin margins. The Vael own the approach, so nobody
  // here is law and nobody is hurrying.
  livedFrontierSet({
    sectorId: 'sector_ashfall_reach',
    namespace: 'ashfall',
    label: 'Ashfall',
    pockets: [
      {
        id: 'ashfall_cache_apron',
        label: 'Cache Apron',
        anchor: { kind: 'station', id: 'station_ashcache' },
        // The strongbox the runner fetches from, on the true bearing to Kurtz's Cache (-166.4).
        objects: [
          { id: 'ashfall_cache_strongbox', kind: 'cargo_staging_pod', offset: [-66.1, -16],
            targetRef: 'object:ashfall_cache_strongbox' },
        ],
        actors: [
          // A salvor cutting the cache's own ruin: a tight wedge off the Vault Maw's bearing.
          { id: 'ashfall_cache_salvor', role: 'salvor', kind: 'salvor', spawn: [-30, 50],
            routeId: 'ashfall_cache_ruin_cut', durationS: 46,
            marks: [
              ['ashfall_salvor_maw_face', -21.8, 103.7, 'activity:ashfall-maw-face'],
              ['ashfall_salvor_far_face', 81.1, 72.8, 'activity:ashfall-ruin-far-face'],
            ] },
          // The fence's fetch: strongbox-ward, then the long way back to the berth.
          { id: 'ashfall_cache_runner', role: 'smuggler', kind: 'hauler', spawn: [45, -20],
            routeId: 'ashfall_cache_fetch_run', durationS: 26, receipt: 'freight:arrival',
            marks: [
              ['ashfall_runner_strongbox_leg', -106.9, -25.9, 'object:ashfall_cache_strongbox'],
              ['ashfall_runner_berth_leg', 110, -2.6, 'dest:station_ashcache'],
            ] },
        ],
      },
      {
        id: 'ashfall_edge_seams',
        label: 'Edge Seams',
        anchor: { kind: 'zone', id: 'zone_ashfall_belt' },
        actors: [
          { id: 'ashfall_seam_miner', role: 'miner', kind: 'miner', spawn: [-35, 40],
            routeId: 'ashfall_seam_thin_cut', durationS: 42,
            marks: [
              ['ashfall_miner_seam_face', 101.2, 34.8, 'activity:ashfall-seam-face'],
              ['ashfall_miner_far_face', -7.6, 109.7, 'activity:ashfall-seam-far-face'],
            ] },
          // The surveyor charts the margin between the Maintenance machine and the Ossuary.
          { id: 'ashfall_edge_surveyor', role: 'surveyor', kind: 'surveyor', spawn: [40, 30],
            routeId: 'ashfall_edge_chart_run', durationS: 34,
            marks: [
              ['ashfall_surveyor_maintenance_bearing', 36.6, -103.7, 'activity:ashfall-maintenance-bearing'],
              ['ashfall_surveyor_ossuary_bearing', -103.7, -36.6, 'activity:ashfall-ossuary-bearing'],
            ] },
        ],
      },
    ],
  }),
  // ── Io Reach — a waystation on contested ground: everyone docks, no one is in charge.
  livedFrontierSet({
    sectorId: 'sector_io_reach',
    namespace: 'io',
    label: 'Io',
    pockets: [
      {
        id: 'io_waystation_apron',
        label: 'Waystation Apron',
        anchor: { kind: 'station', id: 'station_reach', zoneId: 'zone_io_reach' },
        actors: [
          // The claim run: out toward the Pallas claim on its true bearing (18.1 deg), back
          // across the apron to the berth. Wide, 135 deg / 203 WU.
          { id: 'io_waystation_hauler', role: 'hauler', kind: 'hauler', spawn: [50, -30],
            routeId: 'io_waystation_claim_run', durationS: 28, receipt: 'freight:arrival',
            marks: [
              ['io_hauler_claim_leg', 104.6, 34.2, 'activity:io-claim-pallas-leg'],
              ['io_hauler_berth_leg', -49.8, -98.1, 'dest:station_reach'],
            ] },
          // A tender serving the dead relay in the Shepherd's Ring (true bearing -147.7 deg).
          { id: 'io_waystation_tender', role: 'tender', kind: 'surveyor', spawn: [-45, 30],
            routeId: 'io_waystation_ring_round', durationS: 40,
            marks: [
              ['io_tender_ring_leg', -93, -58.7, 'activity:io-shepherd-ring-leg'],
              ['io_tender_lane_leg', 80.8, -74.6, 'activity:io-contested-lane-leg'],
            ] },
        ],
      },
      {
        id: 'io_cruiser_graveyard',
        label: 'Cruiser Graveyard',
        anchor: { kind: 'zone', id: 'zone_io_derelict' },
        // The plate the crews are cutting: on the salvor's cutting-face bearing.
        objects: [
          { id: 'io_cruiser_cut_plate', kind: 'grave_shard', offset: [-39.3, 50.5],
            targetRef: 'object:io_cruiser_cut_plate' },
        ],
        actors: [
          // "Salvage crews still comb the hull" — a tight wedge between the station-ward face
          // (67.9 deg, the true bearing back to Reach Station) and the plate.
          { id: 'io_cruiser_salvor', role: 'salvor', kind: 'salvor', spawn: [30, 35],
            routeId: 'io_cruiser_cut_loop', durationS: 44,
            marks: [
              ['io_salvor_station_face', 40.3, 99.1, 'activity:io-cruiser-station-face'],
              ['io_salvor_plate_face', -66.3, 85.3, 'object:io_cruiser_cut_plate'],
            ] },
          // A Concord picket holding the claim: a short held chord toward the contested lane.
          { id: 'io_cruiser_picket', role: 'patrol', kind: 'patrol', lawful: true, spawn: [-40, -25],
            routeId: 'io_cruiser_watch_chord', durationS: 46,
            marks: [
              ['io_picket_lane_end', 94.6, 45.6, 'activity:io-picket-lane-end'],
              ['io_picket_hull_end', 36.3, 103.8, 'activity:io-picket-hull-end'],
            ] },
        ],
      },
    ],
  }),
  // ── Charon Expanse — Collective ore far from help, and a struggling colony that trades air
  // and salvage for anything it can get.
  livedFrontierSet({
    sectorId: 'sector_charon_expanse',
    namespace: 'charon',
    label: 'Charon',
    pockets: [
      {
        id: 'charon_refinery_yard',
        label: 'Cinder Refinery Yard',
        anchor: { kind: 'station', id: 'station_expanse', zoneId: 'zone_charon_refinery' },
        actors: [
          // The ore lane: straight through the yard, belt-ward on its true bearing (137 deg).
          { id: 'charon_ore_hauler', role: 'hauler', kind: 'hauler', spawn: [45, -35],
            routeId: 'charon_ore_lane_run', durationS: 26, receipt: 'freight:arrival',
            marks: [
              ['charon_hauler_belt_leg', -81.9, 76.4, 'activity:charon-belt-leg'],
              ['charon_hauler_berth_leg', 81.9, -76.4, 'dest:station_expanse'],
            ] },
          // "Pressurized air sold on the side": a tender making the colony round.
          { id: 'charon_air_tender', role: 'tender', kind: 'surveyor', spawn: [-38, 40],
            routeId: 'charon_air_tender_round', durationS: 38,
            marks: [
              ['charon_tender_colony_leg', -61.8, 84.9, 'activity:charon-colony-leg'],
              ['charon_tender_seam_leg', 17.1, 108.7, 'activity:charon-seam-leg'],
            ] },
        ],
      },
      {
        id: 'charon_colony_barge',
        label: 'Colony Barge',
        anchor: { kind: 'zone', id: 'zone_charon_colony' },
        // The air pod the colony pays for, on the hauler's refinery-ward bearing (-53.9 deg).
        objects: [
          { id: 'charon_colony_air_pod', kind: 'cargo_staging_pod', offset: [38.8, -53.4],
            targetRef: 'object:charon_colony_air_pod' },
        ],
        actors: [
          { id: 'charon_colony_salvor', role: 'salvor', kind: 'salvor', spawn: [35, -30],
            routeId: 'charon_colony_scrap_loop', durationS: 42,
            marks: [
              ['charon_salvor_freighter_face', -101.6, -33.5, 'activity:charon-warm-freighter-face'],
              ['charon_salvor_scrap_face', 6.2, -109.8, 'activity:charon-scrap-face'],
            ] },
          { id: 'charon_colony_hauler', role: 'hauler', kind: 'hauler', spawn: [-40, 45],
            routeId: 'charon_colony_air_run', durationS: 30,
            marks: [
              ['charon_colony_air_leg', 61.2, -84.1, 'object:charon_colony_air_pod'],
              ['charon_colony_barge_leg', -11.6, 109.4, 'activity:charon-colony-barge-leg'],
            ] },
        ],
      },
    ],
  }),
  // ── Dione Lane — Meridian's lawful southern spur: tolls fund the patrols, and the convoys
  // prefer paperwork to pirates. The Lane Customs disc belongs to the toll weir; these pockets
  // stay on the Exchange and the Relay.
  livedFrontierSet({
    sectorId: 'sector_dione_lane',
    namespace: 'dione',
    label: 'Dione',
    pockets: [
      {
        id: 'dione_exchange_apron',
        label: 'Exchange Apron',
        anchor: { kind: 'station', id: 'station_dione', zoneId: 'zone_dione_exchange' },
        actors: [
          // The relay-ward lane through the Exchange (true bearing -130.6 deg), end to end.
          { id: 'dione_exchange_hauler', role: 'hauler', kind: 'hauler', spawn: [50, -40],
            routeId: 'dione_exchange_lane_run', durationS: 24, receipt: 'freight:arrival',
            marks: [
              ['dione_hauler_relay_leg', -72.9, -85, 'activity:dione-relay-leg'],
              ['dione_hauler_berth_leg', 72.9, 85, 'dest:station_dione'],
            ] },
          // "Tolls fund the patrols": a lawful toll patrol on a short chord toward the customs.
          { id: 'dione_toll_patrol', role: 'patrol', kind: 'patrol', lawful: true, spawn: [-45, 35],
            routeId: 'dione_toll_patrol_chord', durationS: 40,
            marks: [
              ['dione_patrol_customs_end', -81.9, -68.8, 'activity:dione-customs-end'],
              ['dione_patrol_exchange_end', 18.8, -106.3, 'activity:dione-exchange-end'],
            ] },
        ],
      },
      {
        id: 'dione_lane_relay',
        label: 'Lane Relay',
        anchor: { kind: 'zone', id: 'zone_dione_relay' },
        // The manifest pod the southbound convoy stages from, customs-ward (-148.1 deg).
        objects: [
          { id: 'dione_relay_manifest_pod', kind: 'cargo_staging_pod', offset: [-56, -34.9],
            targetRef: 'object:dione_relay_manifest_pod' },
        ],
        actors: [
          { id: 'dione_relay_keeper', role: 'tender', kind: 'surveyor', spawn: [30, -35],
            routeId: 'dione_relay_keeper_loop', durationS: 36,
            marks: [
              ['dione_keeper_exchange_face', 69.6, 81.2, 'activity:dione-keeper-exchange-face'],
              ['dione_keeper_lane_face', 99.2, -47.5, 'activity:dione-keeper-lane-face'],
            ] },
          { id: 'dione_convoy_hauler', role: 'hauler', kind: 'hauler', spawn: [-40, 40],
            routeId: 'dione_convoy_staging_run', durationS: 32,
            marks: [
              ['dione_convoy_manifest_leg', -93.4, -58.1, 'object:dione_relay_manifest_pod'],
              ['dione_convoy_south_leg', 107.1, -24.9, 'activity:dione-south-leg'],
            ] },
        ],
      },
    ],
  }),
  // ── Nereid Shoal — a thin-law waystation and icy rock worked by independents under a
  // Collective cut.
  livedFrontierSet({
    sectorId: 'sector_nereid_shoal',
    namespace: 'nereid',
    label: 'Nereid',
    pockets: [
      {
        id: 'nereid_waystation_apron',
        label: 'Waystation Apron',
        anchor: { kind: 'station', id: 'station_nereid', zoneId: 'zone_nereid_core' },
        actors: [
          // The claim run: toward the Shoal Claim's bearing (143.2 deg) and back to the berth.
          { id: 'nereid_waystation_hauler', role: 'hauler', kind: 'hauler', spawn: [48, -30],
            routeId: 'nereid_waystation_claim_run', durationS: 26, receipt: 'freight:arrival',
            marks: [
              ['nereid_hauler_claim_leg', -88.1, 65.8, 'activity:nereid-claim-leg'],
              ['nereid_hauler_berth_leg', 68.1, -86.4, 'dest:station_nereid'],
            ] },
          { id: 'nereid_waystation_tender', role: 'tender', kind: 'surveyor', spawn: [-40, 30],
            routeId: 'nereid_waystation_wreck_round', durationS: 38,
            marks: [
              ['nereid_tender_wreck_leg', 30.7, 105.6, 'activity:nereid-wreck-leg'],
              ['nereid_tender_lane_leg', 105.6, -30.7, 'activity:nereid-lane-leg'],
            ] },
        ],
      },
      {
        id: 'nereid_ice_shoal',
        label: 'Ice Shoal Seams',
        anchor: { kind: 'zone', id: 'zone_nereid_shoal', fieldId: 'f_nereid_1' },
        // Where the Collective's cut is counted out, claim-ward (127.6 deg).
        objects: [
          { id: 'nereid_shoal_cut_pod', kind: 'cargo_staging_pod', offset: [-41.5, 53.9],
            targetRef: 'object:nereid_shoal_cut_pod' },
        ],
        actors: [
          { id: 'nereid_shoal_miner', role: 'miner', kind: 'miner', spawn: [-35, -40],
            routeId: 'nereid_shoal_ice_loop', durationS: 38, receipt: 'mining:npcExtraction',
            marks: [
              ['nereid_miner_face', 95.5, 46, 'field:f_nereid_1'],
              ['nereid_miner_waystation_leg', 90.1, -61.4, 'activity:nereid-miner-waystation-leg'],
            ] },
          { id: 'nereid_shoal_collector', role: 'hauler', kind: 'hauler', spawn: [40, 40],
            routeId: 'nereid_shoal_cut_run', durationS: 34,
            marks: [
              ['nereid_collector_pod_leg', -67.1, 87.2, 'object:nereid_shoal_cut_pod'],
              ['nereid_collector_claim_leg', -43.1, -104.5, 'activity:nereid-collector-claim-leg'],
            ] },
        ],
      },
    ],
  }),
  // ── Hyperion Cut — ore in, alloys out; the first Drift surveyors' seams are still the best
  // rock west of Ceres.
  livedFrontierSet({
    sectorId: 'sector_hyperion_cut',
    namespace: 'hyperion',
    label: 'Hyperion',
    pockets: [
      {
        id: 'hyperion_refinery_yard',
        label: 'Cut Refinery Yard',
        anchor: { kind: 'station', id: 'station_hyperion_cut', zoneId: 'zone_hyperion_refinery' },
        actors: [
          { id: 'hyperion_yard_hauler', role: 'hauler', kind: 'hauler', spawn: [45, -35],
            routeId: 'hyperion_yard_ore_run', durationS: 28, receipt: 'freight:arrival',
            marks: [
              ['hyperion_hauler_seam_leg', 70, -76.9, 'activity:hyperion-seam-leg'],
              ['hyperion_hauler_berth_leg', -23.5, 107.5, 'dest:station_hyperion_cut'],
            ] },
          { id: 'hyperion_yard_tender', role: 'tender', kind: 'surveyor', spawn: [-40, 35],
            routeId: 'hyperion_yard_claim_round', durationS: 40,
            marks: [
              ['hyperion_tender_claim_leg', 83.2, -67.2, 'activity:hyperion-claim-leg'],
              ['hyperion_tender_yard_leg', -44.6, -100.5, 'activity:hyperion-yard-leg'],
            ] },
        ],
      },
      {
        id: 'hyperion_first_seams',
        label: 'First Seams',
        anchor: { kind: 'zone', id: 'zone_hyperion_belt', fieldId: 'f_hyperion_1' },
        // The tally pod the cut is counted at, refinery-ward (132.3 deg).
        objects: [
          { id: 'hyperion_seam_tally_pod', kind: 'cargo_staging_pod', offset: [-45.8, 50.3],
            targetRef: 'object:hyperion_seam_tally_pod' },
        ],
        actors: [
          { id: 'hyperion_seam_miner', role: 'miner', kind: 'miner', spawn: [-38, -30],
            routeId: 'hyperion_seam_cut_loop', durationS: 36, receipt: 'mining:npcExtraction',
            marks: [
              ['hyperion_miner_pod_leg', -72.7, 79.8, 'object:hyperion_seam_tally_pod'],
              ['hyperion_miner_face', -104.5, -22.8, 'field:f_hyperion_1'],
            ] },
          { id: 'hyperion_seam_surveyor', role: 'surveyor', kind: 'surveyor', spawn: [40, 38],
            routeId: 'hyperion_seam_survey_sweep', durationS: 44,
            marks: [
              ['hyperion_surveyor_driller_leg', -27.6, -106.5, 'activity:hyperion-driller-leg'],
              ['hyperion_surveyor_beacon_leg', 110, 0.9, 'activity:hyperion-beacon-leg'],
            ] },
        ],
      },
    ],
  }),
  // ── Nyx March — contraband changes hands under Quiet charter, and Concord patrols do not come
  // this far west. The Reach skiffs skim the cut-lane for loaded smugglers.
  livedFrontierSet({
    sectorId: 'sector_nyx_march',
    namespace: 'nyx',
    label: 'Nyx',
    pockets: [
      {
        id: 'nyx_fence_apron',
        label: 'Fence Apron',
        anchor: { kind: 'station', id: 'station_nyx_march', zoneId: 'zone_nyx_fence' },
        actors: [
          // The fence's fetch: out toward the cache on its true bearing, back across the apron
          // to the berth.
          { id: 'nyx_fence_runner', role: 'smuggler', kind: 'hauler', spawn: [-13.5, 35.5],
            routeId: 'nyx_fence_fetch_run', durationS: 28, receipt: 'freight:arrival',
            marks: [
              ['nyx_runner_cache_leg', -61.4, -83.9, 'activity:nyx-cache-leg'],
              ['nyx_runner_berth_leg', 100.6, 44.4, 'dest:station_nyx_march'],
            ] },
          // The appraiser: a slow scan chord, cut-lane-ward — somebody has to price what comes
          // in.
          { id: 'nyx_fence_appraiser', role: 'surveyor', kind: 'surveyor', spawn: [-43.8, 10.3],
            routeId: 'nyx_fence_appraisal_chord', durationS: 44,
            marks: [
              ['nyx_appraiser_cutlane_face', 106.4, 11.7, 'activity:nyx-cutlane-face'],
              ['nyx_appraiser_apron_face', 39.9, -102.5, 'activity:nyx-apron-face'],
            ] },
        ],
      },
      {
        id: 'nyx_cutlane_watch',
        label: 'Cut-Lane Watch',
        anchor: { kind: 'zone', id: 'zone_nyx_cutlane' },
        // The plate the pickers are working, on the salvor's station-ward bearing.
        objects: [
          { id: 'nyx_cutlane_wreck_plate', kind: 'grave_shard', offset: [-63.6, -7],
            targetRef: 'object:nyx_cutlane_wreck_plate' },
        ],
        actors: [
          // A Reach skiff skimming the cut-lane — a held chord, not a hunt; nobody arrives
          // shooting.
          { id: 'nyx_cutlane_skiff', role: 'pirate', kind: 'patrol', spawn: [37.3, 7.1],
            routeId: 'nyx_cutlane_skim_chord', durationS: 46,
            marks: [
              ['nyx_skiff_fence_end', -104.4, -11.5, 'activity:nyx-skiff-fence-end'],
              ['nyx_skiff_lane_end', -68.8, -85.8, 'activity:nyx-skiff-lane-end'],
            ] },
          // A picker working the lane's old wreck, slow and without hurry.
          { id: 'nyx_cutlane_picker', role: 'salvor', kind: 'salvor', spawn: [44.8, -4.5],
            routeId: 'nyx_cutlane_pick_loop', durationS: 45,
            marks: [
              ['nyx_picker_plate_face', -108.3, -11.9, 'object:nyx_cutlane_wreck_plate'],
              ['nyx_picker_far_face', -62.7, 85.5, 'activity:nyx-picker-far-face'],
            ] },
        ],
      },
    ],
  }),
  // ── Kepler Scar — the Reach fence stolen cargo through a radiation scar: jump out fast or pay
  // their price. The hulk off the Bazaar is picked over by whoever can stand the glow.
  livedFrontierSet({
    sectorId: 'sector_kepler_scar',
    namespace: 'kepler',
    label: 'Kepler',
    pockets: [
      {
        id: 'kepler_bazaar_apron',
        label: 'Scar Bazaar Apron',
        anchor: { kind: 'station', id: 'station_kepler_scar', zoneId: 'zone_kepler_scar' },
        actors: [
          // The stash run: the long leg on the stash's true bearing, then the last straight into
          // the berth.
          { id: 'kepler_bazaar_runner', role: 'smuggler', kind: 'hauler', spawn: [-17.8, 33.6],
            routeId: 'kepler_bazaar_fetch_run', durationS: 29, receipt: 'freight:arrival',
            marks: [
              ['kepler_runner_stash_leg', -65.5, -88.4, 'activity:kepler-stash-leg'],
              ['kepler_runner_berth_leg', 86.1, 68.4, 'dest:station_kepler_scar'],
            ] },
          // A Reach picket holding the glow-ward face — the price is posted, not shouted.
          { id: 'kepler_scar_picket', role: 'pirate', kind: 'patrol', spawn: [-23, 38.7],
            routeId: 'kepler_scar_watch_chord', durationS: 46,
            marks: [
              ['kepler_picket_glow_end', 60.6, -85.8, 'activity:kepler-picket-glow-end'],
              ['kepler_picket_apron_end', -18.7, -108.4, 'activity:kepler-picket-apron-end'],
            ] },
        ],
      },
      {
        id: 'kepler_hulk_picking',
        label: 'Hulk Picking',
        anchor: { kind: 'poi', id: 'poi_kepler_hulk' },
        // The cut plate off the hulk, on the salvor's Bazaar-ward bearing.
        objects: [
          { id: 'kepler_hulk_cut_plate', kind: 'grave_shard', offset: [-66, 0],
            targetRef: 'object:kepler_hulk_cut_plate' },
        ],
        actors: [
          // Salvage by someone who can stand the glow: a tight wedge around one plate.
          { id: 'kepler_hulk_salvor', role: 'salvor', kind: 'salvor', spawn: [37.2, 7.9],
            routeId: 'kepler_hulk_cut_loop', durationS: 45,
            marks: [
              ['kepler_salvor_plate_face', -106, 0, 'object:kepler_hulk_cut_plate'],
              ['kepler_salvor_far_face', -54.5, -94.4, 'activity:kepler-salvor-far-face'],
            ] },
          // The glow reader: somebody has to know which side of the hulk is survivable.
          { id: 'kepler_glow_reader', role: 'surveyor', kind: 'surveyor', spawn: [14, 42.8],
            routeId: 'kepler_glow_read_sweep', durationS: 52,
            marks: [
              ['kepler_reader_glow_face', 17, -108.7, 'activity:kepler-reader-glow-face'],
              ['kepler_reader_hulk_face', -108.7, -17, 'activity:kepler-reader-hulk-face'],
            ] },
        ],
      },
    ],
  }),
  // ── Orcus Shadow — a thin Vael research outpost, the only dock for light-years if they let
  // you land. A hollow rim (trafficPerMin 0): these four are the only life.
  livedFrontierSet({
    sectorId: 'sector_orcus_shadow',
    namespace: 'orcus',
    label: 'Orcus',
    pockets: [
      {
        id: 'orcus_research_rounds',
        label: 'Research Rounds',
        anchor: { kind: 'station', id: 'station_orcus_shadow', zoneId: 'zone_orcus_research' },
        actors: [
          // The rare delivery: a supply hull out to the Plinth and back to the one dock there
          // is.
          { id: 'orcus_supply_hauler', role: 'hauler', kind: 'hauler', spawn: [-7.3, -37.3],
            routeId: 'orcus_supply_run', durationS: 24, receipt: 'freight:arrival',
            marks: [
              ['orcus_hauler_plinth_leg', 88, 66, 'activity:orcus-plinth-leg'],
              ['orcus_hauler_berth_leg', -103.9, 44.4, 'dest:station_orcus_shadow'],
            ] },
          // The listener: a held scan chord toward the anomaly the outpost exists to watch.
          { id: 'orcus_anomaly_listener', role: 'surveyor', kind: 'surveyor', spawn: [3.2, -44.9],
            routeId: 'orcus_anomaly_listen_chord', durationS: 44,
            marks: [
              ['orcus_listener_anomaly_face', -42.9, 98, 'activity:orcus-anomaly-face'],
              ['orcus_listener_post_face', 85.9, 68.7, 'activity:orcus-post-face'],
            ] },
        ],
      },
      {
        id: 'orcus_vault_approach',
        label: 'Vault Approach',
        anchor: { kind: 'poi', id: 'poi_orcus_vault' },
        actors: [
          // Somebody scanning a vault nobody opens: a tight, patient wedge.
          { id: 'orcus_vault_scanner', role: 'surveyor', kind: 'surveyor', spawn: [-35.2, 14.2],
            routeId: 'orcus_vault_scan_sweep', durationS: 36,
            marks: [
              ['orcus_scanner_post_face', 87.9, -59.2, 'activity:orcus-scanner-post-face'],
              ['orcus_scanner_vault_face', 97.9, 47.8, 'activity:orcus-scanner-vault-face'],
            ] },
          // A salvor working the vault's outer skin on the long quarter around, never through.
          { id: 'orcus_vault_salvor', role: 'salvor', kind: 'salvor', spawn: [-23.6, -38.3],
            routeId: 'orcus_vault_cut_loop', durationS: 73,
            marks: [
              ['orcus_salvor_dark_face', 107.5, -23.2, 'activity:orcus-salvor-dark-face'],
              ['orcus_salvor_vault_face', -5.4, 109.9, 'activity:orcus-salvor-vault-face'],
            ] },
        ],
      },
    ],
  }),
  // ── Rhea Cinder — Collective miners work scorched rock under thin escort this far north of
  // Sker; the slag from failed refining still glows.
  livedFrontierSet({
    sectorId: 'sector_rhea_cinder',
    namespace: 'rhea',
    label: 'Rhea',
    pockets: [
      {
        id: 'rhea_claim_yard',
        label: 'Cinder Claim Yard',
        anchor: { kind: 'station', id: 'station_rhea_cinder' },
        actors: [
          // The ore run: out toward the seam on its true bearing, back to the claim's one berth.
          { id: 'rhea_ore_hauler', role: 'hauler', kind: 'hauler', spawn: [20.3, 32.1],
            routeId: 'rhea_claim_ore_run', durationS: 25, receipt: 'freight:arrival',
            marks: [
              ['rhea_hauler_seam_leg', 88, -66, 'activity:rhea-seam-leg'],
              ['rhea_hauler_berth_leg', -108.9, -15.6, 'dest:station_rhea_cinder'],
            ] },
          // The yard tender: the round that keeps scorched equipment alive another shift.
          { id: 'rhea_yard_tender', role: 'tender', kind: 'surveyor', spawn: [-15.6, 42.2],
            routeId: 'rhea_yard_claim_round', durationS: 52,
            marks: [
              ['rhea_tender_claim_leg', -74.7, -80.8, 'activity:rhea-claim-leg'],
              ['rhea_tender_yard_leg', 80.8, -74.7, 'activity:rhea-yard-leg'],
            ] },
        ],
      },
      {
        id: 'rhea_slag_seam',
        label: 'Slag Seam',
        anchor: { kind: 'zone', id: 'zone_rhea_slag' },
        actors: [
          // A miner coring scorched rock beside the glow — shields thin out, the work does not.
          { id: 'rhea_seam_miner', role: 'miner', kind: 'miner', spawn: [-4.3, -37.8],
            routeId: 'rhea_seam_cut_loop', durationS: 38,
            marks: [
              ['rhea_miner_yard_face', -70.8, 80.2, 'activity:rhea-miner-yard-face'],
              ['rhea_miner_slag_face', 34.3, 102.4, 'activity:rhea-miner-slag-face'],
            ] },
          // The thin escort: one Collective hull holding a short chord toward the Sker approach.
          { id: 'rhea_thin_escort', role: 'patrol', kind: 'patrol', lawful: true, spawn: [3.5, 44.9],
            routeId: 'rhea_escort_watch_chord', durationS: 41,
            marks: [
              ['rhea_escort_ambush_end', -74.2, -74.2, 'activity:rhea-escort-ambush-end'],
              ['rhea_escort_seam_end', 0, -110, 'activity:rhea-escort-seam-end'],
            ] },
        ],
      },
    ],
  }),
  // ── Haumea Rift — Free Frontier scientists chart the ice fissures, traffic thin and cautious;
  // icy crystalline seams open where the rift shear cut the rock.
  livedFrontierSet({
    sectorId: 'sector_haumea_rift',
    namespace: 'haumea',
    label: 'Haumea',
    pockets: [
      {
        id: 'haumea_observatory_rounds',
        label: 'Observatory Rounds',
        anchor: { kind: 'station', id: 'station_haumea_rift', zoneId: 'zone_haumea_obs' },
        actors: [
          // The instrument run: straight out to the fissure line and back — a lane, not a beat.
          { id: 'haumea_instrument_tender', role: 'tender', kind: 'surveyor', spawn: [37.8, 3.7],
            routeId: 'haumea_instrument_run', durationS: 73,
            marks: [
              ['haumea_tender_fissure_leg', -44.1, 100.8, 'activity:haumea-fissure-leg'],
              ['haumea_tender_berth_leg', 44.1, -100.8, 'station:station_haumea_rift:service-berth'],
            ] },
          // Tracking the probe: a patient scan chord on the probe's true bearing.
          { id: 'haumea_probe_tracker', role: 'surveyor', kind: 'surveyor', spawn: [-44.8, 3.9],
            routeId: 'haumea_probe_track_chord', durationS: 44,
            marks: [
              ['haumea_tracker_probe_face', 103.6, 26.9, 'activity:haumea-probe-face'],
              ['haumea_tracker_post_face', 54.2, -95.7, 'activity:haumea-post-face'],
            ] },
        ],
      },
      {
        id: 'haumea_ice_seams',
        label: 'Ice Seams',
        anchor: { kind: 'zone', id: 'zone_haumea_ice' },
        // The core rack, on the hauler's observatory-ward bearing.
        objects: [
          { id: 'haumea_ice_core_rack', kind: 'cargo_staging_pod', offset: [12.7, -66.8],
            targetRef: 'object:haumea_ice_core_rack' },
        ],
        actors: [
          // Coring crystalline ice where the shear opened it: a tight wedge off the rift's face.
          { id: 'haumea_seam_miner', role: 'miner', kind: 'miner', spawn: [38, -1],
            routeId: 'haumea_seam_core_loop', durationS: 38,
            marks: [
              ['haumea_miner_rift_face', -104, 25.1, 'activity:haumea-rift-face'],
              ['haumea_miner_core_face', -74.4, -78.2, 'activity:haumea-core-face'],
            ] },
          // The cores go up to the observatory: rack first, then the lane back out.
          { id: 'haumea_core_hauler', role: 'hauler', kind: 'hauler', spawn: [-45, 1],
            routeId: 'haumea_core_haul', durationS: 24,
            marks: [
              ['haumea_hauler_rack_leg', 20.5, -108.1, 'object:haumea_ice_core_rack'],
              ['haumea_hauler_rift_leg', 85.6, 73.7, 'activity:haumea-hauler-rift-leg'],
            ] },
        ],
      },
    ],
  }),
  // ── Eris Margin — the Quiet fence contraband off the Ashfall approach and papers stop at the
  // gate; sensor-soft fog covers drop points and wrecks alike.
  livedFrontierSet({
    sectorId: 'sector_eris_margin',
    namespace: 'eris',
    label: 'Eris',
    pockets: [
      {
        id: 'eris_fence_apron',
        label: 'Margin Fence Apron',
        anchor: { kind: 'station', id: 'station_eris_margin', zoneId: 'zone_eris_fence' },
        actors: [
          // The drop run: the long leg on the drop's true bearing, then the last straight into
          // the berth.
          { id: 'eris_fence_runner', role: 'smuggler', kind: 'hauler', spawn: [-15.9, 34.5],
            routeId: 'eris_fence_drop_run', durationS: 29, receipt: 'freight:arrival',
            marks: [
              ['eris_runner_drop_leg', -70.4, -84.5, 'activity:eris-drop-leg'],
              ['eris_runner_berth_leg', 89.9, 63.4, 'dest:station_eris_margin'],
            ] },
          // The gate picket: papers stop here, so a hull holds the chord toward the Ashfall
          // approach.
          { id: 'eris_gate_picket', role: 'pirate', kind: 'patrol', spawn: [-32.6, 31],
            routeId: 'eris_gate_watch_chord', durationS: 46,
            marks: [
              ['eris_picket_gate_end', 81.6, -66.1, 'activity:eris-picket-gate-end'],
              ['eris_picket_apron_end', 11.5, -109.4, 'activity:eris-picket-apron-end'],
            ] },
        ],
      },
      {
        id: 'eris_fog_drops',
        label: 'Fog Drops',
        anchor: { kind: 'zone', id: 'zone_eris_fog' },
        actors: [
          // A picker working the fog's drop points — sensor-soft, so a slow tight wedge.
          { id: 'eris_drop_picker', role: 'salvor', kind: 'salvor', spawn: [-30.8, 22.2],
            routeId: 'eris_fog_pick_loop', durationS: 45,
            marks: [
              ['eris_picker_wreck_face', 104.6, 22.7, 'activity:eris-wreck-face'],
              ['eris_picker_fog_face', 72.6, -79.9, 'activity:eris-fog-face'],
            ] },
          // The metronome keeper: somebody still winds the beat the fog hides.
          { id: 'eris_metronome_keeper', role: 'surveyor', kind: 'surveyor', spawn: [45, 0.1],
            routeId: 'eris_metronome_keep_sweep', durationS: 58,
            marks: [
              ['eris_keeper_metronome_face', -36.9, 103.6, 'activity:eris-metronome-face'],
              ['eris_keeper_fog_face', -90.6, -62.5, 'activity:eris-keeper-fog-face'],
            ] },
        ],
      },
    ],
  }),
  // ── Phoebe Echo — the Vael watch a resonance; whatever answers the echo is not for sale. A
  // hollow rim: four quiet hulls and a yield with no rescue at the north rim.
  livedFrontierSet({
    sectorId: 'sector_phoebe_echo',
    namespace: 'phoebe',
    label: 'Phoebe',
    pockets: [
      {
        id: 'phoebe_shrine_rounds',
        label: 'Shrine Rounds',
        anchor: { kind: 'station', id: 'station_phoebe_echo' },
        actors: [
          // The shrine round: out toward the resonance on its true bearing and back, end to end.
          { id: 'phoebe_shrine_tender', role: 'tender', kind: 'surveyor', spawn: [38, -1.2],
            routeId: 'phoebe_shrine_run', durationS: 73,
            marks: [
              ['phoebe_tender_resonance_leg', -30.8, 105.6, 'activity:phoebe-resonance-leg'],
              ['phoebe_tender_berth_leg', 30.8, -105.6, 'station:station_phoebe_echo:service-berth'],
            ] },
          // The listener: a held chord toward the vault, patient, answering nothing.
          { id: 'phoebe_resonance_listener', role: 'surveyor', kind: 'surveyor', spawn: [22.8, -38.8],
            routeId: 'phoebe_listen_chord', durationS: 44,
            marks: [
              ['phoebe_listener_vault_face', -81.9, 68.9, 'activity:phoebe-vault-face'],
              ['phoebe_listener_shrine_face', 46.6, 99.6, 'activity:phoebe-shrine-face'],
            ] },
        ],
      },
      {
        id: 'phoebe_rim_edge',
        label: 'North Rim',
        anchor: { kind: 'zone', id: 'zone_phoebe_edge' },
        actors: [
          // Exotic rock at the north rim: high yield, no rescue — so one crew, working
          // carefully.
          { id: 'phoebe_rim_prospector', role: 'miner', kind: 'miner', spawn: [29.7, 23.7],
            routeId: 'phoebe_rim_core_loop', durationS: 38,
            marks: [
              ['phoebe_prospector_rock_face', -93.9, -47, 'activity:phoebe-rock-face'],
              ['phoebe_prospector_cloud_face', -6.6, -109.8, 'activity:phoebe-cloud-face'],
            ] },
          // The exotic cores go down to the shrine on a wide, slow lane — high yield, no rescue,
          // so nobody hurries.
          { id: 'phoebe_core_hauler', role: 'hauler', kind: 'hauler', spawn: [2.1, 45],
            routeId: 'phoebe_core_haul', durationS: 20,
            marks: [
              ['phoebe_hauler_shrine_leg', 45.4, -100.2, 'activity:phoebe-hauler-shrine-leg'],
              ['phoebe_hauler_rim_leg', -100.2, -45.4, 'activity:phoebe-hauler-rim-leg'],
            ] },
        ],
      },
    ],
  }),
  // ── Proteus Well — Quiet brokers fence east-run contraband off the books, and the seams are
  // worked by crews who do not ask questions.
  livedFrontierSet({
    sectorId: 'sector_proteus_well',
    namespace: 'proteus',
    label: 'Proteus',
    pockets: [
      {
        id: 'proteus_den_apron',
        label: 'Den Apron',
        anchor: { kind: 'station', id: 'station_proteus', zoneId: 'zone_proteus_den' },
        actors: [
          // The stash run, on the stash's true bearing, and back to the broker's berth.
          { id: 'proteus_den_runner', role: 'smuggler', kind: 'hauler', spawn: [-17.4, -33.8],
            routeId: 'proteus_den_stash_run', durationS: 27, receipt: 'freight:arrival',
            marks: [
              ['proteus_runner_stash_leg', 107.1, 25.2, 'activity:proteus-stash-leg'],
              ['proteus_runner_berth_leg', -93.6, 57.9, 'dest:station_proteus'],
            ] },
          // A picket on the choke-ward chord: whatever drops from Nereid is scanned, then sold
          // or stripped.
          { id: 'proteus_den_picket', role: 'pirate', kind: 'patrol', spawn: [-45, 0.8],
            routeId: 'proteus_den_watch_chord', durationS: 60,
            marks: [
              ['proteus_picket_choke_end', 104.1, 20.1, 'activity:proteus-picket-choke-end'],
              ['proteus_picket_den_end', 71.4, -82.3, 'activity:proteus-picket-den-end'],
            ] },
        ],
      },
      {
        id: 'proteus_quiet_seams',
        label: 'Quiet Seams',
        anchor: { kind: 'zone', id: 'zone_proteus_seams', fieldId: 'f_proteus_1' },
        // The off-the-books tally pod, on the hauler's buoy-ward bearing.
        objects: [
          { id: 'proteus_seam_tally_pod', kind: 'cargo_staging_pod', offset: [-36.7, -57.2],
            targetRef: 'object:proteus_seam_tally_pod' },
        ],
        actors: [
          // A crew that does not ask questions, coring the metallic crystal seam on the field's
          // face.
          { id: 'proteus_seam_crew', role: 'miner', kind: 'miner', spawn: [-0.6, -38],
            routeId: 'proteus_seam_cut_loop', durationS: 47, receipt: 'mining:npcExtraction',
            marks: [
              ['proteus_crew_face', -87.2, 62.1, 'field:f_proteus_1'],
              ['proteus_crew_den_leg', 38.4, 103.1, 'activity:proteus-crew-den-leg'],
            ] },
          // The crystal goes to the tally pod first and the books never see it.
          { id: 'proteus_seam_hauler', role: 'hauler', kind: 'hauler', spawn: [-39.1, 22.3],
            routeId: 'proteus_seam_tally_haul', durationS: 26,
            marks: [
              ['proteus_hauler_pod_leg', -56.2, -87.5, 'object:proteus_seam_tally_pod'],
              ['proteus_hauler_den_leg', 97.8, 50.4, 'activity:proteus-hauler-den-leg'],
            ] },
        ],
      },
    ],
  }),
  // ── Triton Wake — Free Frontier scientists study the wake under Vael sufferance. A hollow
  // rim: the lab's round, and one hull picking at a wreck nobody is hurrying.
  livedFrontierSet({
    sectorId: 'sector_triton_wake',
    namespace: 'triton',
    label: 'Triton',
    pockets: [
      {
        id: 'triton_lab_rounds',
        label: 'Lab Rounds',
        anchor: { kind: 'station', id: 'station_triton', zoneId: 'zone_triton_lab' },
        actors: [
          // The wake run: a straight lane to the anomaly's edge on its true bearing, and home.
          { id: 'triton_lab_tender', role: 'tender', kind: 'surveyor', spawn: [37.9, 2.5],
            routeId: 'triton_lab_run', durationS: 73,
            marks: [
              ['triton_tender_wake_leg', -40.9, 102.1, 'activity:triton-wake-leg'],
              ['triton_tender_berth_leg', 40.9, -102.1, 'station:station_triton:service-berth'],
            ] },
          // Sampling the radiation bloom along the wake spine, a short slow chord.
          { id: 'triton_wake_sampler', role: 'surveyor', kind: 'surveyor', spawn: [13.2, -43],
            routeId: 'triton_wake_sample_chord', durationS: 28,
            marks: [
              ['triton_sampler_glow_face', -38.6, 97.7, 'activity:triton-glow-face'],
              ['triton_sampler_lab_face', 43.8, 100.9, 'activity:triton-lab-face'],
            ] },
        ],
      },
      {
        id: 'triton_wreck_wake',
        label: 'Wreck Wake',
        anchor: { kind: 'poi', id: 'poi_triton_wreck' },
        // The cut plate off the wreck, on the salvor's lab-ward bearing.
        objects: [
          { id: 'triton_wreck_cut_plate', kind: 'grave_shard', offset: [-21.9, -62.2],
            targetRef: 'object:triton_wreck_cut_plate' },
        ],
        actors: [
          // A wreck nobody is hurrying: one salvor, a tight wedge, the plate first.
          { id: 'triton_wreck_salvor', role: 'salvor', kind: 'salvor', spawn: [4.9, 37.7],
            routeId: 'triton_wreck_cut_loop', durationS: 45,
            marks: [
              ['triton_salvor_plate_face', -34.9, -99, 'object:triton_wreck_cut_plate'],
              ['triton_salvor_far_face', 71.5, -83.6, 'activity:triton-salvor-far-face'],
            ] },
          // Samples between the lab's far watcher and the wreck on a wide slow lane.
          { id: 'triton_sample_courier', role: 'hauler', kind: 'hauler', spawn: [33.1, -30.5],
            routeId: 'triton_sample_haul', durationS: 20,
            marks: [
              ['triton_courier_watcher_leg', -105.9, 29.7, 'activity:triton-watcher-leg'],
              ['triton_courier_wreck_leg', 29.7, 105.9, 'activity:triton-wreck-leg'],
            ] },
        ],
      },
    ],
  }),
  // ── Eunomia Gulf — a Vael-licensed black fence linking Sedna dark to the east wake run; a
  // stripped freighter marks the choke and scavengers still pick the ribs.
  livedFrontierSet({
    sectorId: 'sector_eunomia_gulf',
    namespace: 'eunomia',
    label: 'Eunomia',
    pockets: [
      {
        id: 'eunomia_fence_apron',
        label: 'Fence Apron',
        anchor: { kind: 'station', id: 'station_eunomia', zoneId: 'zone_eunomia_fence' },
        actors: [
          // The licensed run: out toward the Hush on its true bearing and back to the fence.
          { id: 'eunomia_fence_runner', role: 'smuggler', kind: 'hauler', spawn: [-24.2, 29.3],
            routeId: 'eunomia_fence_run', durationS: 29, receipt: 'freight:arrival',
            marks: [
              ['eunomia_runner_hush_leg', -46.3, -99.8, 'activity:eunomia-hush-leg'],
              ['eunomia_runner_berth_leg', 70.5, 84.4, 'dest:station_eunomia'],
            ] },
          // A picket on the choke-ward chord: the gulf is licensed, not safe.
          { id: 'eunomia_choke_picket', role: 'pirate', kind: 'patrol', spawn: [-22.4, -39],
            routeId: 'eunomia_choke_watch_chord', durationS: 46,
            marks: [
              ['eunomia_picket_hulk_end', 44.9, 94.9, 'activity:eunomia-picket-hulk-end'],
              ['eunomia_picket_fence_end', 103.6, 37, 'activity:eunomia-picket-fence-end'],
            ] },
        ],
      },
      {
        id: 'eunomia_rib_picking',
        label: 'Rib Picking',
        anchor: { kind: 'zone', id: 'zone_eunomia_hulk' },
        // The rib the scavengers are picking, on the salvor's fence-ward bearing.
        objects: [
          { id: 'eunomia_hulk_rib_plate', kind: 'grave_shard', offset: [-28.2, -59.7],
            targetRef: 'object:eunomia_hulk_rib_plate' },
        ],
        actors: [
          // Scavengers still pick the ribs: a tight wedge around one plate.
          { id: 'eunomia_rib_salvor', role: 'salvor', kind: 'salvor', spawn: [8.8, 37],
            routeId: 'eunomia_rib_cut_loop', durationS: 45,
            marks: [
              ['eunomia_salvor_rib_face', -44.9, -94.9, 'object:eunomia_hulk_rib_plate'],
              ['eunomia_salvor_far_face', 62.5, -90.5, 'activity:eunomia-salvor-far-face'],
            ] },
          // The clerk tallying the pick against a ledger that is still out there.
          { id: 'eunomia_ledger_clerk', role: 'surveyor', kind: 'surveyor', spawn: [4.3, 44.8],
            routeId: 'eunomia_ledger_read_sweep', durationS: 64,
            marks: [
              ['eunomia_clerk_ledger_face', -109.3, -12.5, 'activity:eunomia-ledger-face'],
              ['eunomia_clerk_hulk_face', 67.2, -90.8, 'activity:eunomia-clerk-hulk-face'],
            ] },
        ],
      },
    ],
  }),
  // ── The Bolus — a digestive trench with a lane through its wall; cilia do the coasting if you
  // let them. A hollow rim with no hostiles: a rib that is tended, and a pile of what the gut
  // would not keep.
  livedFrontierSet({
    sectorId: 'sector_the_bolus',
    namespace: 'bolus',
    label: 'Bolus',
    pockets: [
      {
        id: 'bolus_rib_tending',
        label: 'Rib Tending',
        anchor: { kind: 'station', id: 'station_bolus_rib' },
        actors: [
          // Tending the Rib: the round out to the wall's lane and back, on the lane's true
          // bearing.
          { id: 'bolus_rib_tender', role: 'tender', kind: 'surveyor', spawn: [1.3, -38],
            routeId: 'bolus_rib_tender_round', durationS: 52,
            marks: [
              ['bolus_tender_wall_leg', 46.5, 99.7, 'activity:bolus-wall-leg'],
              ['bolus_tender_rib_leg', -99.7, 46.5, 'station:station_bolus_rib:service-berth'],
            ] },
          // Grit from the trench floor to the Rib's berth: the only freight the gut gives up.
          { id: 'bolus_grit_hauler', role: 'hauler', kind: 'hauler', spawn: [25.5, -37.1],
            routeId: 'bolus_grit_haul', durationS: 26, receipt: 'freight:arrival',
            marks: [
              ['bolus_hauler_grit_leg', 88.6, 54.4, 'activity:bolus-grit-leg'],
              ['bolus_hauler_berth_leg', -110, -3, 'dest:station_bolus_rib'],
            ] },
        ],
      },
      {
        id: 'bolus_cough_pile',
        label: 'The Cough',
        anchor: { kind: 'zone', id: 'zone_bolus_cough' },
        // The plate in the pile, on the salvor's Rib-ward bearing.
        objects: [
          { id: 'bolus_cough_pile_plate', kind: 'grave_shard', offset: [-55.4, -35.9],
            targetRef: 'object:bolus_cough_pile_plate' },
        ],
        actors: [
          // What the gut would not keep is piled here; one salvor takes it plate by plate.
          { id: 'bolus_pile_salvor', role: 'salvor', kind: 'salvor', spawn: [26.9, 26.8],
            routeId: 'bolus_pile_cut_loop', durationS: 45,
            marks: [
              ['bolus_salvor_plate_face', -89.8, -58.2, 'object:bolus_cough_pile_plate'],
              ['bolus_salvor_far_face', 5.5, -107.9, 'activity:bolus-salvor-far-face'],
            ] },
          // Reading the trench the chart calls radiation: a wide slow sweep.
          { id: 'bolus_lumen_reader', role: 'surveyor', kind: 'surveyor', spawn: [45, -0.6],
            routeId: 'bolus_lumen_read_sweep', durationS: 58,
            marks: [
              ['bolus_reader_lumen_face', -91.5, -61, 'activity:bolus-lumen-face'],
              ['bolus_reader_pile_face', -35.2, 104.2, 'activity:bolus-reader-pile-face'],
            ] },
        ],
      },
    ],
  }),
];

/** Sector id -> { pockets, pocketOrder, actorSlotOrder, capacity, routeTopology } for the lived frontier. */
export const LIVED_FRONTIER_SETS = Object.freeze(Object.fromEntries(
  LIVED_FRONTIER_SET_LIST.map((set) => [set.sectorId, set]),
));
export const LIVED_FRONTIER_SECTOR_IDS = Object.freeze(LIVED_FRONTIER_SET_LIST.map((set) => set.sectorId));

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
  [SKER_ACTIVITY_SECTOR_ID]: SKER_ACTIVITY_POCKETS,
  ...Object.fromEntries(LIVED_FRONTIER_SECTOR_IDS.map((id) => [id, LIVED_FRONTIER_SETS[id].pockets])),
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
