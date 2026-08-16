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

// One shoal in the whole graph, carried by the canonical Orcus eddy instead of a private force.
// The bodies are transient neutral wildlife; their stable slot identities make re-entry/Continue
// deterministic without turning the observation into a collectible or farm.
export const ORCUS_DRIFTER_SHOAL = Object.freeze({
  id: 'wildlife_orcus_drifter_shoal',
  name: 'Orcus Drifter Shoal',
  sectorId: ORCUS_GRAVITY_EDDY.sectorId,
  zoneId: ORCUS_GRAVITY_EDDY.zoneId,
  fieldId: ORCUS_GRAVITY_EDDY.field.id,
  count: 9,
  radiusMin: 4.2,
  radiusMax: 6.4,
  mass: 2.4,
  ringRadiusMin: 150,
  ringRadiusMax: 285,
  tangentialSpeedMin: 19,
  tangentialSpeedMax: 31,
  uglinessBark: 'ANCHOR: Easy. They were not hurting anybody.',
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

// Small drones-of-no-one may gather only around a newly made battle wreck in these three authored
// rough-space sectors. A seed gate in anomalyRuntime narrows this already-minority list per run;
// no ambient spawn roll is consumed and only one wreck can own a live swarm at a time.
export const SCAVENGER_SWARM = Object.freeze({
  id: 'wildlife_scavenger_swarm',
  sectorIds: Object.freeze([
    'sector_ceres_belt',
    'sector_charon_expanse',
    'sector_ashfall_reach',
  ]),
  admissionModulo: 3,
  count: 5,
  droneRadius: 1.35,
  droneMass: 2.5,
  slotRadiusMin: 20,
  slotRadiusStep: 4,
  scatterRadius: 105,
  returnRadius: 165,
  scatterSpeed: 32,
  returnSpeed: 20,
  impulseCadenceS: 0.35,
});

// One canonical pocket, bound to the existing Blind Nebula Atlas zone. Runtime reads that zone's
// centre/radius rather than copying coordinates here, so removing or renaming the canonical place
// makes the anomaly fail closed. The marker is transient; only this stable identity crosses the
// simulation/presentation boundary.
export const ION_STORM_POCKET = Object.freeze({
  id: 'anomaly_veil_ion_storm',
  name: 'Veil Ion Storm',
  sectorId: 'sector_veil_nebula',
  zoneId: 'zone_veil_fog',
  markerStableId: 'anomaly-marker:veil-ion-storm',
  radar: Object.freeze({
    maxSmearWU: 210,
    truthRadiusWU: 240,
  }),
  shieldRechargeMultiplier: 0.42,
  lightning: Object.freeze({
    cadenceS: 1.4,
    reachFraction: 0.72,
    altitudeWU: 78,
  }),
});

/** The exact authored anomaly for a sector, or null when that sector has none. */
export function anomalySiteForSector(sectorId) {
  return sectorId === ORCUS_GRAVITY_EDDY.sectorId ? ORCUS_GRAVITY_EDDY : null;
}

/** The one authored living shoal, or null outside its rare canonical sector. */
export function drifterShoalForSector(sectorId) {
  return sectorId === ORCUS_DRIFTER_SHOAL.sectorId ? ORCUS_DRIFTER_SHOAL : null;
}

/** The one authored moving debris site for a sector, or null outside its rare canonical sector. */
export function debrisRiverForSector(sectorId) {
  return sectorId === ASHFALL_DEBRIS_RIVER.sectorId ? ASHFALL_DEBRIS_RIVER : null;
}

/** The one canonical ion-storm pocket, or null outside its rare authored sector. */
export function ionStormForSector(sectorId) {
  return sectorId === ION_STORM_POCKET.sectorId ? ION_STORM_POCKET : null;
}
