// AEP U1 — NPC-path unit roster (ASSET_EXPERIENCE_PROGRAM §3.5, scope card §5/U1).
//
// Six occupational traffic units. Each owns a placement hook — a job-site beat, a lane
// run, a zone orbit, or a zone orbit plus an encounter — so no ambient ordering can
// strand it as dressing. `gate` states where the unit is legal to exist (sector, plus
// service/faction conditions where the table demanded them) and `behaviorOwner` names
// the runtime consumer that makes the placement honest: a unit with no functioning
// consumer fails review the same way an unwired asset does.
//
// Hull sources are reuse-first per §3.5: every `craftId` resolves to an already-released
// wholeship package (see WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE in src/render/partsLibrary.js).
// The diplomat yacht rides the massline liner class until the pilgrim-hulk family lands
// under its own commission — the liner IS the pilgrim-transport silhouette in the
// released fleet.
//
// Ambient weight for every U1 role is 0: these units enter only through
// `Traffic._ensureNpcUnitFixtures`, which spawns each gated unit exactly once per sector
// enter and never rewrites a live cast.

export const NPC_UNIT_PLACEMENT_KINDS = Object.freeze([
  'job-site',   // beat anchored on a station meeting the service/faction clause
  'lane',       // timed leg between two lane endpoints in-sector
  'zone-orbit', // patrol beat centered on an authored zone/poi/station anchor
]);

export const NPC_UNITS = Object.freeze([
  {
    unitId: 'npc_customs_interceptor',
    role: 'customs_interceptor',
    craftId: 'hornet_scn_interdictor',
    jobKind: 'patrol',
    factionId: 'faction_scn',
    placement: {
      kind: 'job-site', stationService: 'scan', stationFactionId: 'faction_scn',
      // Helios has no scan-service post — its customs authority is Coalition HQ (SCN military).
      fallbackStationType: 'military', orbitRadius: 140,
    }, 
    gate: { sectorIds: ['sector_tethys_junction', 'sector_dione_lane', 'sector_helios_prime'] },
    whyHere: 'SCN/MTS customs lanes: the interdictor owns the inspection pocket at the sector customs post — Tethys, Dione, and the Helios home lane (spec §3.5).',
    behaviorOwner: 'npcJobs patrol beat anchored on the customs station; lawful hull inside lawSecurity station-jurisdiction pursuit break.',
    hail: 'Customs hold. Keep your manifest open and your burn slow.',
  },
  {
    unitId: 'npc_fuel_tender',
    role: 'fuel_tender',
    craftId: 'volatiles_tanker',
    jobKind: 'tender',
    factionId: null, // takes the anchor station's faction
    placement: { kind: 'job-site', stationService: 'refuel' },
    gate: { sectorIds: ['sector_pallas_drift', 'sector_charon_expanse', 'sector_io_reach'], service: 'refuel', maxSecurity: 0.6 },
    whyHere: 'Pallas fog edge, Charon, rim lanes (spec §3.5): a refuel service on a low-security dock is a real fuel run, not set dressing.',
    behaviorOwner: 'npcJobs tender kernel — berth out to the client post and back; CIVILIAN_ALARM_HOLD_ROLE so any nearby fight holds its route.',
    hail: 'Volatiles tender. Keep your arcs clear of the feed lines.',
  },
  {
    unitId: 'npc_courier_relay',
    role: 'courier_relay',
    craftId: 'apron_shuttle',
    jobKind: 'hauler',
    factionId: null,
    placement: { kind: 'lane' },
    gate: { sectorIds: ['sector_io_reach', 'sector_dione_lane'], minStations: 2 },
    whyHere: 'Io mail lanes and the Dione express lane (spec §3.5): a timed manifest run between the sector pair of berths — promote the courier lane to a manifest run.',
    behaviorOwner: 'npcJobs hauler leg on a timed run (data.timedRun: departureAt/dueAt/legs); manifest is interceptable like any freighter manifest.',
    hail: 'Relay packet on a clock. Dockside signature or it moves on.',
  },
  {
    unitId: 'npc_media_drone',
    role: 'media_drone',
    craftId: 'survey_pin',
    jobKind: 'patrol',
    factionId: null,
    placement: { kind: 'zone-orbit', orbitRadius: 120 },
    gate: { sectorIds: ['sector_tethys_junction', 'sector_ceres_belt', 'sector_helios_prime'] },
    anchorBySector: {
      // Camera pockets (audit Z.1): a slow orbit above an authored work/memorial scene.
      sector_tethys_junction: { zoneId: 'zone_tethys_driftmark' },
      sector_ceres_belt: { zoneId: 'zone_ceres_prism_gallery' },
      sector_helios_prime: { stationId: 'station_coalition' },
    },
    whyHere: 'Core sectors with camera pockets (spec §3.5): the drone is the live-feed hull Z.1 chatter refers to, orbiting authored scenes instead of the lane.',
    behaviorOwner: 'npcJobs patrol beat centered on the zone/station anchor; data.hail feeds the contact-hail seam (C12 owns the chatter corpus).',
    hail: 'Relay feed live. Signal credit goes to the gallery.',
  },
  {
    unitId: 'npc_quarantine_corvette',
    role: 'quarantine_corvette',
    craftId: 'inspection_cutter',
    jobKind: 'patrol',
    factionId: 'faction_verge_layers', // the pylon field's owning faction (authoredPlaces)
    placement: { kind: 'zone-orbit', zoneId: 'zone_charon_pylon_field', orbitRadius: 240 },
    gate: { sectorIds: ['sector_charon_expanse'] },
    encounterId: 'quarantine_cordon',
    whyHere: 'Charon quarantine fields (spec §3.5): the Quarantine Pylon Field is an authored zone; the corvette is the institutional hull walking the line.',
    behaviorOwner: 'npcJobs patrol beat on the pylon field + encounter quarantine_cordon fields corvette squads under the same gate.',
    hail: 'Quarantine cordon. This field is sealed — turn back or be turned.',
  },
  {
    unitId: 'npc_diplomat_yacht',
    role: 'diplomat_yacht',
    craftId: 'massline_express_liner_v1',
    jobKind: 'hauler',
    factionId: null, // per-sector charter (factionBySector)
    placement: { kind: 'lane' },
    gate: { sectorIds: ['sector_helios_prime', 'sector_tethys_junction', 'sector_veil_nebula'] },
    laneBySector: {
      sector_helios_prime: { from: 'station_helios', to: 'station_coalition', factionId: 'faction_scn' },
      sector_tethys_junction: { from: 'station_tethys', to: 'station_customs', factionId: 'faction_scn' },
      sector_veil_nebula: { from: 'station_veil', to: 'poi_veil_far_sounding', factionId: 'faction_choir' },
    },
    whyHere: 'Helios↔Tethys corridor and the Veil pilgrim lanes (spec §3.5): escorted VIP transit whose kill cost lands on the chartering faction.',
    behaviorOwner: 'npcJobs hauler leg between lane endpoints; protected civilian — a kill opens a player_piracy incident carrying the charter faction.',
    hail: 'Diplomatic packet. Weapons cold, please.',
  },
]);

const NPC_UNIT_BY_ID = new Map(NPC_UNITS.map((unit) => [unit.unitId, unit]));
const NPC_UNIT_BY_ROLE = new Map(NPC_UNITS.map((unit) => [unit.role, unit]));

export const NPC_UNIT_ROLES = Object.freeze(NPC_UNITS.map((unit) => unit.role));

export function npcUnitById(unitId) {
  return NPC_UNIT_BY_ID.get(unitId) || null;
}

export function npcUnitByRole(role) {
  return NPC_UNIT_BY_ROLE.get(role) || null;
}

/**
 * Units gated into `sector`. `sector` is the live sector def (security is read for
 * maxSecurity clauses); pass a bare `{id}` for a sectorIds-only check. Returns rows
 * in roster order so spawning is deterministic.
 */
export function npcUnitsForSector(sectorId, sector = null) {
  return NPC_UNITS.filter((unit) => {
    const gate = unit.gate || {};
    if (gate.sectorIds && !gate.sectorIds.includes(sectorId)) return false;
    if (typeof gate.maxSecurity === 'number') {
      const security = sector && typeof sector.security === 'number' ? sector.security : null;
      if (security == null || security > gate.maxSecurity) return false;
    }
    if (gate.service && sector && Array.isArray(sector.stations)) {
      // The service clause is enforced against the sector's station list: a sector that
      // lost its refuel/refinery dock loses the unit too — the gate is real, not a label.
      const offered = sector.stations.some((st) => (st.services || []).includes(gate.service));
      if (!offered) return false;
    }
    if (typeof gate.minStations === 'number' && sector && Array.isArray(sector.stations)) {
      if (sector.stations.length < gate.minStations) return false;
    }
    return true;
  });
}
