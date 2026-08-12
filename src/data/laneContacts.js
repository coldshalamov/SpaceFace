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
]);

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
});
