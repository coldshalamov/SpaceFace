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

const MARK_DISTANCE_WU = Object.freeze([102, 116]);

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
]);
const seamObjects = Object.freeze([
  objectSlot({
    id: 'ceres_seam_ore_clast',
    pocketId: seamId,
    kind: 'world_owned_asteroid_slot',
    offset: point(-64, 28),
    runtimeOwner: 'world',
    targetRef: 'field:<live-asteroid-id>',
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
      marks: [
        mark('refinery_cargo_approach', MARK_DISTANCE_WU[0], 0, 'object:ceres_refinery_cargo_pod'),
        mark('refinery_station_approach', -MARK_DISTANCE_WU[1], 0, 'dest:station_ceres'),
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
      marks: [
        mark('refinery_tender_berth', 0, MARK_DISTANCE_WU[0], 'station:station_ceres:service-berth'),
        mark('refinery_tender_client', 0, -MARK_DISTANCE_WU[1], 'activity:disabled-hull'),
      ],
    }),
  }),
]);

const seamActors = Object.freeze([
  actor({
    id: 'ceres_seam_miner',
    pocketId: seamId,
    presentationRole: 'miner',
    jobKind: 'miner',
    spawnOffset: point(-42, -24),
    route: route({
      id: 'ceres_seam_extraction_loop',
      jobKind: 'miner',
      durationS: 24,
      receiptType: 'mining:npcExtraction',
      marks: [
        mark('seam_miner_work_pad', MARK_DISTANCE_WU[0], 0, 'activity:seam-work-pad'),
        mark('seam_miner_ore_face', 0, MARK_DISTANCE_WU[1], 'field:<ceres_seam_ore_clast-live-id>'),
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
      marks: [
        mark('seam_survey_mark_a', -MARK_DISTANCE_WU[0], 0, 'activity:scan-mark-a'),
        mark('seam_survey_mark_b', 0, -MARK_DISTANCE_WU[1], 'activity:scan-mark-b'),
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
      marks: [
        mark('ambush_hauler_inbound', MARK_DISTANCE_WU[0], 0, 'activity:throughline-inbound'),
        mark('ambush_hauler_outbound', -MARK_DISTANCE_WU[1], 0, 'activity:throughline-outbound'),
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
      marks: [
        mark('ambush_escort_inbound', 0, MARK_DISTANCE_WU[0], 'actor:ceres_ambush_loaded_hauler'),
        mark('ambush_escort_outbound', 0, -MARK_DISTANCE_WU[1], 'actor:ceres_ambush_loaded_hauler'),
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
      marks: [
        mark('cathedral_salvor_shard', MARK_DISTANCE_WU[0], 0, 'object:ceres_cathedral_grave_shard'),
        mark('cathedral_salvor_hulk', -MARK_DISTANCE_WU[1], 0, 'world-site:world_site_wreck_cathedral'),
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
      marks: [
        mark('cathedral_patrol_beat_a', 0, MARK_DISTANCE_WU[0], 'activity:grave-perimeter-a'),
        mark('cathedral_patrol_beat_b', 0, -MARK_DISTANCE_WU[1], 'activity:grave-perimeter-b'),
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
