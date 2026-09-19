// The Arranger / grammar v1. Pure, immutable sector-local art direction.
// These are *relations*, not a second geography registry. IDs resolve against the actual
// sector passed by world. Stations, gates, field centres and POIs NEVER move.
// Units: world units (WU); field dimensions below are fractions of the existing cluster radius.
// Do not retune v1 in a shipped campaign: add a version and migrate explicitly.

export const ARRANGEMENT_VERSION = 1;
export const ARRANGEMENT_LIMITS = Object.freeze({
  motifCandidates: 32,
  repairCandidates: 24,
  rockGap: 5,
  spatialCell: 80,
  maxPeerChecksPerCandidate: 96,
});

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// All motifs have an asymmetric dense side and a readable aperture. angleDeg is an offset
// from the field -> focus bearing, unless axisDeg explicitly gives a sector-local bearing.
const DEFAULTS = {
  stationHalo: 150,
  gateHalo: 110,
  poiMargin: 22,
  routeHalfWidth: 24,
  spawnHalo: 58,
  motif: 'crescent',
  angleDeg: 0,
  thickness: 0.15,
  aperture: [0.28, 0.17],
  openingDeg: 88,
  aspect: 0.90,
  bias: 0.66,
  dressingAngleDeg: 24,
};

export const SECTOR_COMPOSITIONS = freeze({
  sector_helios_prime: {
    ...DEFAULTS,
    name: 'The Open Hand',
    focus: 'station_helios',
    intent: 'A sheltered working bay opens toward the station. The first ore reads as a place to enter, not a fog to cross.',
    stationHalo: 155,
    routeHalfWidth: 17,
    fields: {
      f_helios_starter: { motif: 'crescent', openingDeg: 100, thickness: 0.20, aperture: [0.26, 0.17], aspect: 0.88 },
      f_helios_outer: { motif: 'islands', angleDeg: 32, thickness: 0.18, aperture: [0.25, 0.16] },
    },
  },
  sector_ceres_belt: {
    ...DEFAULTS,
    name: 'The Quarry Cathedral',
    focus: 'station_ceres',
    intent: 'Broken strata frame the refinery. An empty industrial throat separates the working faces; the authored activity cast keeps its marks.',
    stationHalo: 205,
    routeHalfWidth: 32,
    motif: 'strata',
    dressingAngleDeg: 142,
    fields: {
      f_ceres_1: { motif: 'strata', axisDeg: 148, thickness: 0.15, aperture: [0.38, 0.16] },
      f_ceres_2: { motif: 'crescent', openingDeg: 116, thickness: 0.16, aperture: [0.33, 0.22] },
      f_ceres_3: { motif: 'strata', axisDeg: 148, thickness: 0.20, aperture: [0.31, 0.16] },
    },
  },
  sector_tethys_junction: {
    ...DEFAULTS,
    name: 'The Shipping Lanes',
    focus: 'station_tethys',
    intent: 'Two unequal banks describe a navigable channel. Civic space is open; the rocks never turn the trade hub into another rubble pile.',
    stationHalo: 205,
    routeHalfWidth: 38,
    motif: 'braid',
    dressingAngleDeg: 8,
    fields: {
      f_tethys_1: { motif: 'braid', thickness: 0.13, aperture: [0.37, 0.15], aspect: 0.91 },
    },
  },
  sector_vesta_forge: {
    ...DEFAULTS,
    name: 'The Slag Fans',
    focus: 'station_forge',
    intent: 'Oblique fans and fractured shelves suggest material pushed out of an industry. Repeated direction, deliberately broken spacing.',
    stationHalo: 180,
    routeHalfWidth: 26,
    motif: 'fan',
    dressingAngleDeg: -34,
    fields: {
      f_vesta_1: { motif: 'fan', axisDeg: -34, thickness: 0.17, aperture: [0.25, 0.16] },
      f_vesta_2: { motif: 'strata', axisDeg: -34, thickness: 0.17, aperture: [0.34, 0.16] },
      f_vesta_3: { motif: 'fan', axisDeg: -34, thickness: 0.21, aperture: [0.25, 0.15] },
    },
  },
  sector_pallas_drift: {
    ...DEFAULTS,
    name: 'The Smuggler\'s Archipelago',
    focus: 'station_smuggler',
    intent: 'Unequal islands make cover and revelation alternate. The black market is screened at the sides, not blocked at its docking face.',
    stationHalo: 145,
    routeHalfWidth: 21,
    motif: 'islands',
    dressingAngleDeg: 168,
    fields: {
      f_pallas_1: { motif: 'islands', angleDeg: 28, thickness: 0.20, aperture: [0.27, 0.17], bias: 0.72 },
      f_pallas_2: { motif: 'braid', angleDeg: -23, thickness: 0.18, aperture: [0.34, 0.16] },
      f_pallas_3: { motif: 'islands', angleDeg: -14, thickness: 0.21, aperture: [0.25, 0.17] },
    },
  },
  sector_io_reach: {
    ...DEFAULTS,
    name: 'The Last Anchorage',
    focus: 'station_reach',
    intent: 'One open lee and one long broken wake. Dense punctuation makes the intervening frontier feel empty without removing a single rock.',
    stationHalo: 170,
    routeHalfWidth: 27,
    motif: 'fan',
    dressingAngleDeg: 36,
    fields: {
      f_io_1: { motif: 'crescent', openingDeg: 134, thickness: 0.16, aperture: [0.32, 0.24] },
      f_io_2: { motif: 'fan', axisDeg: 36, thickness: 0.19, aperture: [0.26, 0.17] },
    },
  },
  sector_charon_expanse: {
    ...DEFAULTS,
    name: 'The Broken Procession',
    focus: 'station_expanse',
    intent: 'Long parallel fragments read as the aftermath of a common force. Wreck satellites point down the same wake instead of orbiting arbitrarily.',
    stationHalo: 185,
    motif: 'strata',
    dressingAngleDeg: -57,
    fields: {
      f_charon_1: { motif: 'strata', axisDeg: -57, thickness: 0.14, aperture: [0.38, 0.18] },
      f_charon_2: { motif: 'fan', axisDeg: -57, thickness: 0.18, aperture: [0.28, 0.18] },
      f_charon_3: { motif: 'strata', axisDeg: -57, thickness: 0.22, aperture: [0.32, 0.17] },
    },
  },
  sector_sker_haven: {
    ...DEFAULTS,
    name: 'The Concealed Harbour',
    focus: 'station_sker',
    intent: 'A lopsided broken enclosure creates a refuge. It is shelter with a mouth, not a perfect ring and not a wall.',
    stationHalo: 145,
    routeHalfWidth: 19,
    motif: 'crescent',
    dressingAngleDeg: 112,
    fields: {
      f_sker_1: { motif: 'crescent', openingDeg: 74, thickness: 0.19, aperture: [0.30, 0.21], bias: 0.76 },
    },
  },
  sector_veil_nebula: {
    ...DEFAULTS,
    name: 'The Missing Centre',
    focus: 'poi_anomaly',
    intent: 'Two offset, incomplete caustics orbit a conspicuous absence. Asymmetry makes the disturbance geological rather than a decorative magic circle.',
    stationHalo: 190,
    routeHalfWidth: 23,
    motif: 'rift',
    dressingAngleDeg: 76,
    fields: {
      f_veil_1: { motif: 'rift', angleDeg: 24, thickness: 0.14, aperture: [0.39, 0.24], aspect: 0.79 },
    },
  },
  sector_ashfall_reach: {
    ...DEFAULTS,
    name: 'The Severed Jaw',
    focus: 'poi_boss',
    intent: 'Opposed fractured banks point toward the confrontation. The opening is wide enough to read as a choice, never an inescapable collision funnel.',
    stationHalo: 155,
    routeHalfWidth: 25,
    motif: 'rift',
    dressingAngleDeg: -108,
    fields: {
      f_ash_1: { motif: 'rift', angleDeg: -22, thickness: 0.19, aperture: [0.35, 0.21] },
      f_ash_2: { motif: 'fan', angleDeg: 26, thickness: 0.21, aperture: [0.28, 0.17] },
    },
  },
});

/** Unknown/untuned sectors are deliberately identity transforms, not copy-pasted art direction. */
export function sectorCompositionFor(sectorId) {
  return Object.hasOwn(SECTOR_COMPOSITIONS, sectorId) ? SECTOR_COMPOSITIONS[sectorId] : null;
}

/** Save schema policy: no version on an old save means the exact legacy layout. */
export function readArrangementVersion(value, missing = 0) {
  const version = value == null ? missing : value;
  if (version !== 0 && version !== ARRANGEMENT_VERSION) {
    throw new RangeError(`Unsupported world arrangement version: ${String(version)}`);
  }
  return version;
}
