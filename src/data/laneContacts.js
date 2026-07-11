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
]);

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
});
