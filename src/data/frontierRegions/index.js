// Canonical M2b frontier aggregation boundary.
// Cluster authoring files stay independently testable; live registries consume only these exports.

import {
  WEST_REGION_IDS,
  westSectorCards,
  westGlobalOrigins,
  westAnchors,
  westZones,
} from './west.js';
import {
  NORTH_SECTOR_IDS,
  NORTH_SECTORS,
  NORTH_ORIGINS,
  NORTH_ANCHORS,
  NORTH_ZONES,
} from './north.js';
import {
  EAST_SECTOR_IDS,
  EAST_SECTORS,
  EAST_ORIGINS,
  EAST_ANCHORS,
  EAST_ZONES,
} from './east.js';
import {
  SOUTH_SECTOR_IDS,
  SOUTH_SECTORS,
  SOUTH_ORIGINS,
  SOUTH_ANCHORS,
  SOUTH_ZONES,
} from './south.js';

export const FRONTIER_SECTOR_IDS = Object.freeze([
  ...WEST_REGION_IDS,
  ...NORTH_SECTOR_IDS,
  ...EAST_SECTOR_IDS,
  ...SOUTH_SECTOR_IDS,
]);

const authoredSectorById = new Map([
  ...westSectorCards(),
  ...NORTH_SECTORS,
  ...EAST_SECTORS,
  ...SOUTH_SECTORS,
].map((sector) => [sector.id, sector]));

export const FRONTIER_SECTORS = Object.freeze(
  FRONTIER_SECTOR_IDS.map((id) => authoredSectorById.get(id)),
);

export const FRONTIER_ORIGINS = Object.freeze({
  ...westGlobalOrigins(),
  ...NORTH_ORIGINS,
  ...EAST_ORIGINS,
  ...SOUTH_ORIGINS,
});

export const FRONTIER_ANCHORS = Object.freeze({
  ...westAnchors(),
  ...NORTH_ANCHORS,
  ...EAST_ANCHORS,
  ...SOUTH_ANCHORS,
});

export const FRONTIER_ZONES = Object.freeze({
  ...westZones(),
  ...NORTH_ZONES,
  ...EAST_ZONES,
  ...SOUTH_ZONES,
});

// Additive story-spine links. Existing neighbors/anchors remain untouched; only new reciprocal
// frontier exits are appended at deterministic bearings.
export const FRONTIER_CORE_NEIGHBOR_PATCHES = Object.freeze({
  sector_ceres_belt: Object.freeze(['sector_hyperion_cut']),
  sector_pallas_drift: Object.freeze(['sector_nyx_march']),
  sector_sker_haven: Object.freeze(['sector_kepler_scar', 'sector_rhea_cinder']),
  sector_ashfall_reach: Object.freeze(['sector_eris_margin', 'sector_sedna_dark']),
  sector_io_reach: Object.freeze(['sector_nereid_shoal']),
  sector_tethys_junction: Object.freeze(['sector_nereid_shoal', 'sector_dione_lane']),
  sector_veil_nebula: Object.freeze(['sector_proteus_well', 'sector_triton_wake']),
});

export const FRONTIER_CORE_GATE_PATCHES = Object.freeze({
  sector_ceres_belt: Object.freeze([
    Object.freeze({ to: 'sector_hyperion_cut', pos: Object.freeze({ x: -3080, z: -1540 }) }),
  ]),
  sector_pallas_drift: Object.freeze([
    Object.freeze({ to: 'sector_nyx_march', pos: Object.freeze({ x: -3580, z: -895 }) }),
  ]),
  sector_sker_haven: Object.freeze([
    Object.freeze({ to: 'sector_kepler_scar', pos: Object.freeze({ x: -3978, z: -994 }) }),
    Object.freeze({ to: 'sector_rhea_cinder', pos: Object.freeze({ x: 994, z: 3978 }) }),
  ]),
  sector_ashfall_reach: Object.freeze([
    Object.freeze({ to: 'sector_eris_margin', pos: Object.freeze({ x: -3189, z: 3189 }) }),
    Object.freeze({ to: 'sector_sedna_dark', pos: Object.freeze({ x: 1094, z: 4375 }) }),
  ]),
  sector_io_reach: Object.freeze([
    Object.freeze({ to: 'sector_nereid_shoal', pos: Object.freeze({ x: 3374, z: -1687 }) }),
  ]),
  sector_tethys_junction: Object.freeze([
    Object.freeze({ to: 'sector_nereid_shoal', pos: Object.freeze({ x: 3235, z: 539 }) }),
    Object.freeze({ to: 'sector_dione_lane', pos: Object.freeze({ x: 2813, z: -1688 }) }),
  ]),
  sector_veil_nebula: Object.freeze([
    Object.freeze({ to: 'sector_proteus_well', pos: Object.freeze({ x: 3411, z: -2558 }) }),
    Object.freeze({ to: 'sector_triton_wake', pos: Object.freeze({ x: 4181, z: 836 }) }),
  ]),
});

if (FRONTIER_SECTORS.some((sector) => !sector)) {
  throw new Error('[frontierRegions] sector aggregation is incomplete');
}
