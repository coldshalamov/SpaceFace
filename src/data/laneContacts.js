// src/data/laneContacts.js — gimmick-readable named lane contacts for core pocket sectors.
//
// These are NOT combat named hunters (those live in NAMED_CAPTAINS / named_hunter). They are
// civilian/economy freighter identities stamped onto ambient traffic so Helios (and other safe
// cores) always show at least one recognizable contact without inventing a parallel encounter
// authority. Pure data — traffic.js picks deterministically from seed + sectorId.

/** @typedef {{ id: string, name: string, callsign: string, role: string, gimmick: string, sectorIds: string[], ship?: string }} LaneContact */

/** Named freighter / courier identities that can appear on ambient traffic routes. */
export const NAMED_LANE_CONTACTS = Object.freeze([
  Object.freeze({
    id: 'lane_mira_bluepack',
    name: 'Mira Bluepack',
    callsign: 'BLUEPACK-7',
    role: 'hauler',
    gimmick: 'bulk-haul',
    ship: 'ship_mule',
    sectorIds: Object.freeze(['sector_helios_prime']),
  }),
  Object.freeze({
    id: 'lane_kess_span',
    name: 'Kess of the Span',
    callsign: 'SPAN-HOLD',
    role: 'courier',
    gimmick: 'priority-mail',
    ship: 'ship_kestrel',
    sectorIds: Object.freeze(['sector_helios_prime', 'sector_tethys_junction']),
  }),
  Object.freeze({
    id: 'lane_warden_keel',
    name: 'Warden Keel',
    callsign: 'KEEL-WATCH',
    role: 'patrol',
    gimmick: 'customs-scan',
    ship: 'ship_wasp',
    sectorIds: Object.freeze(['sector_helios_prime']),
  }),
  Object.freeze({
    // Drift worker voice on the lane: the audit wants the body under the load to have a face.
    // Voss of Shaft Seven is also a named ace; this is her sister-rig running the claim ore out.
    id: 'lane_rell_moisture',
    name: 'Rell of the Moisture Column',
    callsign: 'MOIST-LOG',
    role: 'miner',
    gimmick: 'ore-tally',
    ship: 'ship_mule',
    sectorIds: Object.freeze(['sector_ceres_belt', 'sector_pallas_drift']),
  }),
  Object.freeze({
    // Veil research-station supply run: the audit wants the silence-that-has-a-budget to have a courier.
    id: 'lane_venn_veil_run',
    name: 'Venn of the Sealed Manifest',
    callsign: 'VEIL-RUN',
    role: 'courier',
    gimmick: 'sealed-cargo',
    ship: 'ship_kestrel',
    sectorIds: Object.freeze(['sector_veil_nebula']),
  }),
  Object.freeze({
    // PQ-143.02 one-off "a courier far too fast": she flies the `express` role, whose live V3
    // boost intent really does carry a hull at liner sprint (247 WU/s) — far too fast for a
    // courier barge, which is the point. She is a DETERMINISTIC fixture of the start sector
    // (traffic.js stamps her own dedicated express slot every pass, never the seed-hash pick —
    // the pick pools of other sectors are untouched, see the Ceres authored-cast law), so she is
    // always on the default route. Keep her OUT of the generic pick pools: adding her to Ceres's
    // pool broke that sector's authored cast (the pool pick would sometimes displace the seam
    // miner's identity).
    id: 'lane_cinder_run_courier',
    name: 'The Cinder Run Courier',
    callsign: 'CINDER-RUN',
    role: 'express',
    gimmick: 'liner-sprint-courier',
    ship: 'ship_mule',
    sectorIds: Object.freeze(['sector_helios_prime']),
  }),
  Object.freeze({
    // Vesta foundry bulk freight: an industrial hauler moving heavy slag between the forge and depot.
    id: 'lane_tann_slag_carrier',
    name: 'Tann of the Slag Run',
    callsign: 'SLAG-RUN',
    role: 'hauler',
    gimmick: 'bulk-haul',
    ship: 'ship_mule',
    sectorIds: Object.freeze(['sector_vesta_forge']),
  }),
  Object.freeze({
    // Io Reach frontier mail: the contested floor changes hands by the week, so the one identity
    // that keeps running Reach Station's sealed packets on schedule is a fast courier who does not
    // care which flag flies over the dock. She is the only authored Io contact, so the generic
    // seed-hash pick (traffic._ensureNamedLaneContact) always returns her for that sector.
    id: 'lane_maro_keelwright',
    name: 'Maro Keelwright',
    callsign: 'REACH-MAIL',
    role: 'courier',
    gimmick: 'frontier-mail',
    ship: 'ship_kestrel',
    sectorIds: Object.freeze(['sector_io_reach']),
  }),
  Object.freeze({
    // Sker Haven tithe-runner: the Reach market keeps a standing levy on the lane it sells, so the
    // one identity the bazaar apron always shows is the hauler running the tithe crate back.
    // sector_sker_haven has trafficPerMin 9 and station_sker — the pick lands on the ordinary route.
    id: 'lane_vey_tithe',
    name: 'Vey Senna',
    callsign: 'TITHE-RUN',
    role: 'hauler',
    gimmick: 'tithe-run',
    ship: 'ship_mule',
    sectorIds: Object.freeze(['sector_sker_haven']),
  }),
  Object.freeze({
    // Charon Expanse claim face: one miner the seed-hash pick can always return, because this
    // sector had no authored lane identity. Not a claimable body and not a new encounter.
    id: 'lane_pell_claim_nine',
    name: 'Pell of Claim Nine',
    callsign: 'CLAIM-9',
    role: 'miner',
    gimmick: 'expanse-claim',
    ship: 'ship_pelican',
    sectorIds: Object.freeze(['sector_charon_expanse']),
  }),
]);

/** PQ-143.02: the one-off courier's contact id, exported for traffic.js's dedicated fixture slot. */
export const CINDER_RUN_COURIER_CONTACT_ID = 'lane_cinder_run_courier';

// PQ-048.09: one authored courier service, not a global scheduling vocabulary. Traffic owns the
// mutable per-leg timetable in the courier's durable itinerary; this record names the stable route
// and the bounded player-facing recovery terms.
export const PRIORITY_COURIER_ITINERARY_KIND = 'priority_courier_service';
export const PRIORITY_COURIER_SERVICE_SCHEMA = 'spaceface.priority-courier-service.v1';
export const PRIORITY_COURIER_JOB_SCHEMA = 'spaceface.priority-courier-job.v1';
export const PRIORITY_COURIER_SERVICE = Object.freeze({
  id: 'priority-kess-span',
  contactId: 'lane_kess_span',
  sectorId: 'sector_tethys_junction',
  stops: Object.freeze(['station_tethys', 'station_customs']),
  dwellS: 14,
  dueSlackS: 36,
  sprintSpeedWU: 96,
  escort: Object.freeze({
    minRangeWU: 120,
    maxRangeWU: 650,
    holdS: 8,
    recoveryCreditS: 24,
  }),
});

/** True only for the one saved Kess service identity this data file authors. */
export function isPriorityCourierItinerary(itinerary) {
  if (!itinerary || typeof itinerary !== 'object' || Array.isArray(itinerary)) return false;
  const [firstStop, secondStop] = PRIORITY_COURIER_SERVICE.stops;
  const origin = itinerary.originStationId;
  const destination = itinerary.destinationStationId;
  return itinerary.kind === PRIORITY_COURIER_ITINERARY_KIND
    && itinerary.schema === PRIORITY_COURIER_SERVICE_SCHEMA
    && itinerary.serviceId === PRIORITY_COURIER_SERVICE.id
    && itinerary.contactId === PRIORITY_COURIER_SERVICE.contactId
    && itinerary.sectorId === PRIORITY_COURIER_SERVICE.sectorId
    && (origin === firstStop || origin === secondStop)
    && (destination === firstStop || destination === secondStop)
    && origin !== destination
    && Number.isSafeInteger(itinerary.legSeq) && itinerary.legSeq >= 0
    && Number.isFinite(itinerary.departureAt)
    && Number.isFinite(itinerary.dueAt)
    && itinerary.dueAt >= itinerary.departureAt;
}

// PQ-048.10: a single civic passenger service inhabits the existing Helios express slot. The
// itinerary is deliberately passenger-only: no cargo manifest, market pressure, or reward surface
// is implied by a ticket.
export const PASSENGER_LINER_ITINERARY_KIND = 'passenger_liner_service';
export const PASSENGER_LINER_SERVICE_SCHEMA = 'spaceface.passenger-liner-service.v1';
export const PASSENGER_LINER_SERVICE = Object.freeze({
  id: 'helios-civic-liner',
  sectorId: 'sector_helios_prime',
  stops: Object.freeze(['station_helios', 'station_coalition']),
  dwellS: 14,
  assist: Object.freeze({
    minRangeWU: 120,
    maxRangeWU: 650,
    holdS: 8,
  }),
});

/** Strictly recognize the one durable passenger itinerary; malformed saves fail closed. */
export function isPassengerLinerItinerary(itinerary) {
  if (!itinerary || typeof itinerary !== 'object' || Array.isArray(itinerary)) return false;
  const [firstStop, secondStop] = PASSENGER_LINER_SERVICE.stops;
  const origin = itinerary.originStationId;
  const destination = itinerary.destinationStationId;
  const custody = itinerary.custody;
  return itinerary.kind === PASSENGER_LINER_ITINERARY_KIND
    && itinerary.schema === PASSENGER_LINER_SERVICE_SCHEMA
    && itinerary.serviceId === PASSENGER_LINER_SERVICE.id
    && itinerary.sectorId === PASSENGER_LINER_SERVICE.sectorId
    && (origin === firstStop || origin === secondStop)
    && (destination === firstStop || destination === secondStop)
    && origin !== destination
    && typeof itinerary.worldRecordId === 'string' && itinerary.worldRecordId
    && Number.isSafeInteger(itinerary.legSeq) && itinerary.legSeq >= 0
    && Number.isFinite(itinerary.departureAt)
    && Number.isFinite(itinerary.dwellUntil)
    && itinerary.dwellUntil >= itinerary.departureAt
    && typeof itinerary.state === 'string'
    && ['BOARDING', 'EN_ROUTE', 'DELAYED', 'DIVERTING', 'DELIVERED', 'RETURNED', 'LOST'].includes(itinerary.state)
    && custody && typeof custody === 'object' && !Array.isArray(custody)
    && typeof custody.ticketId === 'string' && custody.ticketId
    && typeof custody.passengerId === 'string' && custody.passengerId
    && typeof custody.receiptId === 'string' && custody.receiptId
    && custody.originStationId === origin
    && custody.destinationStationId === destination
    && ['AT_ORIGIN', 'ONBOARD', 'DELIVERED', 'RETURNED', 'LOST'].includes(custody.state);
}

/**
 * Deterministic pick of one named lane contact for a sector (or null if none authored).
 * @param {string} sectorId
 * @param {number} seed
 * @returns {LaneContact | null}
 */
export function pickNamedLaneContact(sectorId, seed) {
  if (!sectorId) return null;
  const pool = [];
  for (let i = 0; i < NAMED_LANE_CONTACTS.length; i++) {
    const c = NAMED_LANE_CONTACTS[i];
    if (c.sectorIds && c.sectorIds.includes(sectorId)) pool.push(c);
  }
  if (!pool.length) return null;
  // Stable pick from seed + sector (no Math.random).
  let h = (seed | 0) ^ 0x4c4e43; // 'LNC'
  const s = String(sectorId);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  const idx = (h >>> 0) % pool.length;
  return pool[idx];
}

/** Gimmick short labels for target panel (no portraits, no prose walls). */
export const LANE_GIMMICK_LABELS = Object.freeze({
  'bulk-haul': 'BULK HAUL',
  bulk_haul: 'BULK HAUL',
  'priority-mail': 'PRIORITY MAIL',
  priority_mail: 'PRIORITY MAIL',
  'customs-scan': 'CUSTOMS SCAN',
  customs_scan: 'CUSTOMS SCAN',
  'ore-tally': 'ORE TALLY',
  ore_tally: 'ORE TALLY',
  'sealed-cargo': 'SEALED CARGO',
  sealed_cargo: 'SEALED CARGO',
  // PQ-143.02 one-off courier (target-panel fallback label).
  'liner-sprint-courier': 'LINER SPRINT',
  liner_sprint_courier: 'LINER SPRINT',
  // WORLD-11 Io Reach frontier courier.
  'frontier-mail': 'FRONTIER MAIL',
  frontier_mail: 'FRONTIER MAIL',
  // Sker Haven market levy hauler.
  'tithe-run': 'TITHE RUN',
  tithe_run: 'TITHE RUN',
  // WORLD-12 Charon Expanse miner.
  'expanse-claim': 'CLAIM TALLY',
  expanse_claim: 'CLAIM TALLY',
});
