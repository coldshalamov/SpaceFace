// The Kettle Line — a follow-the-debris-trail discovery chain in Ceres Belt (WF-10).
//
// Every shipped discovery chain before this one is a ring search: a clue POI exposes a search
// disc and the player pulses inside it. The Kettle Line is a LINE: an ore convoy that broke up
// on the Helios-gate approach, its pieces strung along the drift. Each piece's scan tell reads
// the physical shear on the hull and names a compass bearing and rough range to the next piece
// — no waypoint, no marker. The player navigates the bearing themselves, piece by piece, to the
// drive stern at the end of the line, where the investigation pops the crew's clamped pay
// strongbox as a real, ropeable pod.
//
// OWNERSHIP (single-writer): this module owns only authored data and pure helpers. sectors.js
// appends KETTLE_LINE_POIS into the Ceres Belt poi list (plain data rows, the ordinary POI
// schema); scanner.js injects kettleLineSignalCopy at the established discovery-copy seam next
// to the Vesta/Pallas chains; world.js spawns the payoff pod when the stern is investigated,
// through the same spawnJettisonedCargoPod path the Candle Fleet rope cache uses. No system
// here becomes a second scanner, map, or cargo authority.
//
// Determinism: authored positions, no RNG, no wall time. Tells derive from the authored leg
// geometry, so the same save always reads the same bearing.

export const KETTLE_LINE = Object.freeze({
  schemaVersion: 1,
  sectorId: 'sector_ceres_belt',
  title: 'The Kettle Line',
  terminalPoiId: 'poi_kettle_stern',
  // Payoff: the crew's pay strongbox, still clamped to the stern frame. Ropeable and
  // splittable through the existing payload owner once the stern is investigated.
  payoff: Object.freeze({
    id: 'kettle_line_payoff',
    name: 'Kettle Line pay strongbox',
    commodityId: 'cmdty_luxury_goods',
    amount: 1,
    placeId: 'place_cargo_pod_standard',
    radius: 8,
    factionId: 'faction_dmc',
    // Sector-local offset from the authored stern position.
    offset: Object.freeze({ x: 26, z: -18 }),
  }),
});

// The trail, in drift order. Positions are sector-local, authored inline (the vesta cathedral
// precedent) so no scatter and no anchor table is involved. Leg spacing is kept above the
// scanner's POI signal radius (2000 WU) so pulsing at one piece cannot hand the player the
// next piece's row — the bearing has to be flown.
export const KETTLE_LINE_LEGS = Object.freeze([
  Object.freeze({
    poiId: 'poi_kettle_hopper',
    name: 'Kettle Line Shard',
    type: 'derelict',
    pos: Object.freeze({ x: 2520, z: -1250 }),
    // Chart-safe props: every landmarkGlb here is a parts_manifest place, so the atlas
    // proxy derives a real fallback instead of a bespoke-asset flag.
    landmarkGlb: 'place_ceres_grave_shard',
    visualRadius: 28,
    tell: 'A loaded seam-run piece torn clean off — pallet straps still knotted to nothing. '
      + 'Fresh shear faces trail {BEARING}; the next Line piece rides about {RANGE} WU that way.',
    discoveryPlate: Object.freeze({
      title: 'Kettle Line — First Overboard',
      body: 'A loaded piece of the Kettle Line, torn loose right off the gate approach with its '
        + 'pallet straps still knotted. The Line worked this seam for eleven years; this is the '
        + 'first piece the belt ever gave back.',
    }),
  }),
  Object.freeze({
    poiId: 'poi_kettle_ribs',
    name: 'Kettle Line Ribs',
    type: 'derelict',
    pos: Object.freeze({ x: 1120, z: 320 }),
    landmarkGlb: 'place_debris_chunk',
    visualRadius: 26,
    tell: 'Rib stock sheared inward, toward the Line\u2019s own waist — the hit came from open '
      + 'dark, no light, no hail. The drive section carried its momentum off {BEARING}, '
      + '{RANGE} WU or so.',
    discoveryPlate: Object.freeze({
      title: 'Kettle Line — Sheared Ribs',
      body: 'Rib clusters and pod frames sheared inward, against the convoy\u2019s own run. '
        + 'Whatever took the Kettle Line did it from open dark, without running a light or '
        + 'asking. The Belt Outpost logged nothing that night.',
    }),
  }),
  Object.freeze({
    poiId: 'poi_kettle_stern',
    name: 'Kettle Line Stern',
    type: 'wreck',
    pos: Object.freeze({ x: -160, z: -2080 }),
    landmarkGlb: 'place_ceres_bait_wreck',
    visualRadius: 48,
    tell: 'The Kettle Line\u2019s drive stern. Bell slagged from the inside — the engineers blew '
      + 'it rather than be towed. The pay strongbox is still clamped to the frame.',
    discoveryPlate: Object.freeze({
      title: 'Kettle Line — the Stern That Refused',
      body: 'The Kettle Line\u2019s drive stern, its bell slagged from the inside: the engineers '
        + 'blew the drive rather than let the attacker tow the convoy home. The pay strongbox '
        + 'is still clamped where the bosun welded it. The attacker got nothing; the belt kept '
        + 'the rest.',
    }),
  }),
]);

const LEG_BY_POI_ID = new Map(KETTLE_LINE_LEGS.map((leg) => [leg.poiId, leg]));

// Ordinary POI-schema rows for sectors.js to spread into Ceres Belt's poi list — one source of
// truth with the leg data above. `requiresActiveScan` + `manualInvestigation` make the tell an
// earned scan verb (no proximity freebie, no waypoint); the props themselves stay visible so a
// cold pilot can notice a piece the way they notice any wreck: by it being there.
export const KETTLE_LINE_POIS = Object.freeze(KETTLE_LINE_LEGS.map((leg) => Object.freeze({
  id: leg.poiId,
  type: leg.type,
  name: leg.name,
  factionId: 'faction_dmc',
  pos: Object.freeze({ x: leg.pos.x, z: leg.pos.z }),
  landmarkGlb: leg.landmarkGlb,
  visualRadius: leg.visualRadius,
  requiresActiveScan: true,
  manualInvestigation: true,
  scannerSignalKind: 'salvage',
  scannerSignalPriority: 96,
  discoveryPlate: leg.discoveryPlate,
})));

export function kettleLineLegFor(sourceId) {
  return LEG_BY_POI_ID.get(String(sourceId || '')) || null;
}

const OCTANT_NAMES = Object.freeze(['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east']);

function octantFor(dx, dz) {
  // Compass wording only; shares the convention of the frontier rumor bearing (z+ reads south).
  const angle = Math.atan2(-dz, dx);
  return OCTANT_NAMES[(Math.round(angle / (Math.PI / 4)) + 8) % 8];
}

/**
 * The authored bearing line from one leg to the next, or null from the terminal.
 * Pure: `{ octant, rangeWu }` from the frozen leg geometry.
 */
export function kettleLineBearingToNext(sourceId) {
  const leg = kettleLineLegFor(sourceId);
  if (!leg) return null;
  const index = KETTLE_LINE_LEGS.indexOf(leg);
  const next = KETTLE_LINE_LEGS[index + 1];
  if (!next) return null;
  const dx = next.pos.x - leg.pos.x;
  const dz = next.pos.z - leg.pos.z;
  return {
    octant: octantFor(dx, dz),
    rangeWu: Math.round(Math.sqrt(dx * dx + dz * dz) / 50) * 50,
  };
}

/**
 * Scanner discovery copy for a Kettle Line piece, or null for anything else.
 * Same seam and shape as the Vesta/Pallas chain copy: an investigated-classified row names
 * the site and — for non-terminal pieces — the authored bearing to the next one.
 */
export function kettleLineSignalCopy(sourceId) {
  const leg = kettleLineLegFor(sourceId);
  if (!leg) return null;
  const bearing = kettleLineBearingToNext(sourceId);
  const detail = bearing
    ? leg.tell
      .replace('{BEARING}', bearing.octant)
      .replace('{RANGE}', String(bearing.rangeWu))
    : leg.tell;
  return {
    classification: leg.name.toUpperCase(),
    detail,
  };
}
