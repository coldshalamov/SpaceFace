// PR95 Plan 19 — authored anomaly sites.
//
// These are exact one-off authored sites, not a procedural anomaly framework. Runtime resolves
// their positions against canonical Atlas sector/zone/hazard records and fails closed when that
// identity disappears rather than silently falling back to a private coordinate.

export const ORCUS_GRAVITY_EDDY = Object.freeze({
  id: 'anomaly_orcus_gravity_eddy',
  name: 'Orcus Gravity Eddy',
  sectorId: 'sector_orcus_shadow',
  zoneId: 'zone_orcus_shadow',
  poiId: 'poi_orcus_anomaly',
  field: Object.freeze({
    id: 'environment_orcus_gravity_eddy',
    kind: 'well',
    radius: 420,
    strength: 68,
    damping: 0,
    falloff: 1.3,
    maxAffected: 20,
  }),
});

// One authored river in the whole graph. The endpoints straddle Ashfall's existing debris hazard;
// runtime verifies that canonical hazard before materializing anything. Each body owns a fixed,
// existing commodity pool. No roll is performed on entry, load, or lap, so the moving landmark can
// never become a sector-transition farm.
export const ASHFALL_DEBRIS_RIVER = Object.freeze({
  id: 'anomaly_ashfall_debris_river',
  name: 'Ashfall Debris River',
  sectorId: 'sector_ashfall_reach',
  hazard: Object.freeze({
    type: 'debris',
    center: Object.freeze({ x: 400, z: 300 }),
    radius: 800,
  }),
  start: Object.freeze({ x: -720, z: -110 }),
  end: Object.freeze({ x: 1520, z: 710 }),
  speed: 18,
  wrapMargin: 90,
  salvageTimeS: 8,
  bodies: Object.freeze([
    Object.freeze({ id: 'keel', t: 0.03, lateral: -92, radius: 12, mass: 360, pool: Object.freeze({ cmdty_scrap_metal: 2 }) }),
    Object.freeze({ id: 'spar', t: 0.17, lateral: 54, radius: 8, mass: 150, pool: Object.freeze({ cmdty_scrap_metal: 1 }) }),
    Object.freeze({ id: 'dish', t: 0.31, lateral: -28, radius: 9, mass: 190, pool: Object.freeze({ cmdty_salvage_electronics: 1 }) }),
    Object.freeze({ id: 'plate', t: 0.46, lateral: 105, radius: 11, mass: 290, pool: Object.freeze({ cmdty_scrap_metal: 2 }) }),
    Object.freeze({ id: 'truss', t: 0.61, lateral: -118, radius: 10, mass: 240, pool: Object.freeze({ cmdty_scrap_metal: 1, cmdty_ore_iron: 1 }) }),
    Object.freeze({ id: 'pod', t: 0.76, lateral: 30, radius: 7, mass: 110, pool: Object.freeze({ cmdty_salvage_electronics: 1 }) }),
    Object.freeze({ id: 'rib', t: 0.91, lateral: 86, radius: 9, mass: 205, pool: Object.freeze({ cmdty_scrap_metal: 1 }) }),
  ]),
});

/** The exact authored anomaly for a sector, or null when that sector has none. */
export function anomalySiteForSector(sectorId) {
  return sectorId === ORCUS_GRAVITY_EDDY.sectorId ? ORCUS_GRAVITY_EDDY : null;
}

/** The one authored moving debris site for a sector, or null outside its rare canonical sector. */
export function debrisRiverForSector(sectorId) {
  return sectorId === ASHFALL_DEBRIS_RIVER.sectorId ? ASHFALL_DEBRIS_RIVER : null;
}
