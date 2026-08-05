// Fixed geography anchors for all sectors — merged into SECTORS at load time.
// Procedural scatter is NOT used for stations, gates, fields, or POIs when anchors exist.
// Gate positions are deterministic bearings toward neighbor star-map nodes (no RNG jitter).

import { FRONTIER_ANCHORS, FRONTIER_CORE_GATE_PATCHES } from './frontierRegions/index.js';
import { PQ019_FACILITY_ANCHORS } from './heistFacilities.js';

const GATE_R = 0.82;

export const CERES_WRECK_CATHEDRAL_LOCAL_POS = Object.freeze({ x: 300, z: 2700 });
export const CERES_THROUGHLINE_BEACON_LOCAL_POS = Object.freeze({ x: 3040, z: -920 });

function bearingGate(sector, neighbor) {
  const wr = sector.worldRadius || 4000;
  const dx = (neighbor.position.x - sector.position.x);
  const dz = (neighbor.position.y - sector.position.y);
  const ang = Math.atan2(dz, dx);
  const r = wr * GATE_R;
  return { x: Math.round(Math.cos(ang) * r), z: Math.round(Math.sin(ang) * r) };
}

/** @type {Record<string, { stations?: object[], gates?: object[], fields?: object[], pois?: object[] }>} */
const CORE_SECTOR_ANCHORS = {
  sector_helios_prime: {
    stations: [
      { id: 'station_helios', pos: { x: 1280, z: -420 }, archetypeGlb: 'place_station_trade_hub', landmark: true },
      { id: 'station_coalition', pos: { x: -920, z: 1080 }, archetypeGlb: 'place_station_military' },
    ],
    gates: [
      { to: 'sector_ceres_belt', pos: { x: -2388, z: 1592 } },
      { to: 'sector_tethys_junction', pos: { x: 2388, z: 1592 } },
      { to: 'sector_vesta_forge', pos: { x: 0, z: 2870 } },
    ],
    fields: [
      { id: 'f_helios_starter', center: { x: 720, z: -260 }, clusterRadius: 240 },
    ],
    pois: [
      { id: 'poi_tutorial', pos: { x: 380, z: -120 }, landmarkGlb: 'place_lane_beacon' },
      {
        id: 'poi_memorial',
        pos: { x: 1680, z: -820 },
        landmarkGlb: 'place_memorial_array',
        landmark: true,
        visualRadius: 28,
      },
      { id: 'poi_helios_yard', pos: { x: -1760, z: -1260 }, landmarkGlb: 'place_debris_chunk' },
    ],
  },
  sector_ceres_belt: {
    stations: [
      { id: 'station_ceres', pos: { x: -1100, z: 620 }, archetypeGlb: 'place_station_refinery', landmark: true },
      { id: 'station_beltout', pos: { x: 780, z: -940 }, archetypeGlb: 'place_station_mining' },
    ],
    gates: [
      { to: 'sector_helios_prime', pos: { x: 2866, z: -1910 } },
      { to: 'sector_tethys_junction', pos: { x: 3444, z: 0 } },
      { to: 'sector_pallas_drift', pos: { x: -1910, z: 2866 } },
    ],
    fields: [
      { id: 'f_ceres_1', center: { x: 420, z: -720 }, clusterRadius: 480 },
      { id: 'f_ceres_2', center: { x: -680, z: 240 }, clusterRadius: 420 },
      { id: 'f_ceres_3', center: { x: 920, z: 860 }, clusterRadius: 380 },
    ],
    pois: [
      { id: 'poi_driller', pos: { x: 240, z: -1180 }, landmarkGlb: 'place_dead_hulk', landmark: true },
      { id: 'poi_survey', pos: { x: -1240, z: -320 }, landmarkGlb: 'place_debris_chunk' },
      {
        id: 'poi_ceres_throughline',
        pos: CERES_THROUGHLINE_BEACON_LOCAL_POS,
        position: CERES_THROUGHLINE_BEACON_LOCAL_POS,
        landmarkGlb: 'place_lane_beacon',
        landmark: true,
      },
      { id: 'world_site_wreck_cathedral', pos: CERES_WRECK_CATHEDRAL_LOCAL_POS, landmark: true },
    ],
  },
  sector_tethys_junction: {
    stations: [
      { id: 'station_tethys', pos: { x: 1050, z: 380 }, archetypeGlb: 'place_station_trade_hub', landmark: true },
      { id: 'station_customs', pos: { x: -640, z: -1180 }, archetypeGlb: 'place_station_military' },
    ],
    gates: [
      { to: 'sector_helios_prime', pos: { x: -2729, z: -1819 } },
      { to: 'sector_ceres_belt', pos: { x: -3280, z: 0 } },
      { to: 'sector_vesta_forge', pos: { x: -2729, z: 1819 } },
      { to: 'sector_io_reach', pos: { x: 1819, z: 2729 } },
    ],
    fields: [
      { id: 'f_tethys_1', center: { x: -520, z: 680 }, clusterRadius: 400 },
    ],
    pois: [
      { id: 'poi_blackmkt', pos: { x: -1380, z: 420 }, landmarkGlb: 'place_nav_buoy' },
      { id: 'poi_tethys_weigh', pos: { x: 720, z: -980 }, landmarkGlb: 'place_lane_beacon' },
      { id: 'poi_tethys_customs_log', pos: { x: -920, z: -640 }, landmarkGlb: 'place_nav_buoy' },
      ...PQ019_FACILITY_ANCHORS,
    ],
  },
  sector_vesta_forge: {
    stations: [
      { id: 'station_forge', pos: { x: -480, z: 720 }, archetypeGlb: 'place_station_fab', landmark: true },
      { id: 'station_depot3', pos: { x: 1120, z: -560 }, archetypeGlb: 'place_station_mining' },
    ],
    gates: [
      { to: 'sector_helios_prime', pos: { x: 0, z: -3526 } },
      { to: 'sector_tethys_junction', pos: { x: 2934, z: -1956 } },
      { to: 'sector_charon_expanse', pos: { x: 1956, z: 2934 } },
    ],
    fields: [
      { id: 'f_vesta_1', center: { x: -540, z: -480 }, clusterRadius: 450 },
      { id: 'f_vesta_2', center: { x: 680, z: 320 }, clusterRadius: 420 },
      { id: 'f_vesta_3', center: { x: 120, z: 980 }, clusterRadius: 360 },
    ],
    pois: [
      { id: 'poi_freighter', pos: { x: 860, z: -1240 }, landmarkGlb: 'place_dead_hulk', landmark: true },
      { id: 'poi_vesta_slag_relay', pos: { x: -980, z: 420 }, landmarkGlb: 'place_nav_buoy' },
      { id: 'poi_vesta_ore_cache', pos: { x: 540, z: 1100 }, landmarkGlb: 'place_debris_chunk' },
    ],
  },
  sector_pallas_drift: {
    stations: [
      { id: 'station_drift', pos: { x: 620, z: -880 }, archetypeGlb: 'place_station_trade_hub' },
      { id: 'station_smuggler', pos: { x: -1080, z: 540 }, archetypeGlb: 'place_station_blackmarket', landmark: true },
    ],
    gates: [
      { to: 'sector_ceres_belt', pos: { x: 2047, z: -3070 } },
      { to: 'sector_io_reach', pos: { x: 3690, z: 0 } },
      { to: 'sector_sker_haven', pos: { x: -2047, z: 3070 } },
    ],
    fields: [
      { id: 'f_pallas_1', center: { x: -320, z: -620 }, clusterRadius: 460 },
      { id: 'f_pallas_2', center: { x: 980, z: 420 }, clusterRadius: 400 },
      { id: 'f_pallas_3', center: { x: -840, z: 1180 }, clusterRadius: 380 },
    ],
    pois: [
      { id: 'poi_pwreck', pos: { x: 1420, z: 760 }, landmarkGlb: 'place_dead_hulk' },
      { id: 'poi_hcache', pos: { x: -1560, z: -280 }, landmarkGlb: 'place_debris_chunk' },
    ],
  },
  sector_io_reach: {
    stations: [
      { id: 'station_reach', pos: { x: -720, z: 940 }, archetypeGlb: 'place_station_trade_hub', landmark: true },
    ],
    gates: [
      { to: 'sector_tethys_junction', pos: { x: -2092, z: -3138 } },
      { to: 'sector_pallas_drift', pos: { x: -3772, z: 0 } },
      { to: 'sector_charon_expanse', pos: { x: -3138, z: 2092 } },
      { to: 'sector_veil_nebula', pos: { x: 1687, z: 3374 } },
    ],
    fields: [
      { id: 'f_io_1', center: { x: 540, z: -480 }, clusterRadius: 440 },
      { id: 'f_io_2', center: { x: -1180, z: -320 }, clusterRadius: 400 },
    ],
    pois: [
      { id: 'poi_merc', pos: { x: 1280, z: 620 }, landmarkGlb: 'place_nav_buoy' },
      { id: 'poi_cruiser', pos: { x: -1420, z: -780 }, landmarkGlb: 'place_dead_hulk', landmark: true },
      { id: 'poi_claim_pallas', pos: { x: 320, z: 1280 }, landmarkGlb: 'place_asteroid_seamed' },
    ],
  },
  sector_charon_expanse: {
    stations: [
      { id: 'station_expanse', pos: { x: 880, z: -640 }, archetypeGlb: 'place_station_refinery', landmark: true },
    ],
    gates: [
      { to: 'sector_vesta_forge', pos: { x: -2183, z: -3275 } },
      { to: 'sector_io_reach', pos: { x: 3275, z: -2183 } },
      { to: 'sector_ashfall_reach', pos: { x: 1760, z: 3520 } },
    ],
    fields: [
      { id: 'f_charon_1', center: { x: -420, z: 820 }, clusterRadius: 420 },
      { id: 'f_charon_2', center: { x: 1120, z: 280 }, clusterRadius: 480 },
      { id: 'f_charon_3', center: { x: -980, z: -540 }, clusterRadius: 400 },
    ],
    pois: [
      { id: 'poi_colony', pos: { x: -620, z: 1420 }, landmarkGlb: 'place_conveyor_barge', landmark: true },
      { id: 'poi_charon_lung_marker', pos: { x: 480, z: -1100 }, landmarkGlb: 'place_lane_beacon' },
      { id: 'poi_charon_tether_wreck', pos: { x: -1280, z: 360 }, landmarkGlb: 'place_dead_hulk' },
    ],
  },
  sector_sker_haven: {
    stations: [
      { id: 'station_sker', pos: { x: -540, z: 680 }, archetypeGlb: 'place_station_blackmarket', landmark: true },
    ],
    gates: [
      { to: 'sector_pallas_drift', pos: { x: 2274, z: -3411 } },
      { to: 'sector_veil_nebula', pos: { x: 4090, z: 292 } },
    ],
    fields: [
      { id: 'f_sker_1', center: { x: 720, z: -420 }, clusterRadius: 380 },
    ],
    pois: [
      { id: 'poi_bounty', pos: { x: 1180, z: 920 }, landmarkGlb: 'place_dead_hulk' },
      { id: 'poi_stash', pos: { x: -1280, z: -360 }, landmarkGlb: 'place_debris_chunk' },
    ],
  },
  sector_veil_nebula: {
    stations: [
      { id: 'station_veil', pos: { x: 420, z: -1120 }, archetypeGlb: 'place_station_research', landmark: true },
    ],
    gates: [
      { to: 'sector_io_reach', pos: { x: -1907, z: -3814 } },
      { to: 'sector_sker_haven', pos: { x: -4253, z: -304 } },
      { to: 'sector_ashfall_reach', pos: { x: 680, z: 4120 }, wormhole: true },
    ],
    fields: [
      { id: 'f_veil_1', center: { x: -280, z: 640 }, clusterRadius: 520 },
    ],
    pois: [
      { id: 'poi_anomaly', pos: { x: 0, z: 0 }, landmarkGlb: 'place_asteroid_seamed', landmark: true },
      { id: 'poi_wormhole', pos: { x: 680, z: 4120 }, landmarkGlb: 'place_gate_jump_ring' },
    ],
  },
  sector_ashfall_reach: {
    stations: [
      { id: 'station_ashcache', pos: { x: -820, z: 480 }, archetypeGlb: 'place_station_blackmarket', landmark: true },
    ],
    gates: [
      { to: 'sector_charon_expanse', pos: { x: -2017, z: -4034 } },
    ],
    fields: [
      { id: 'f_ash_1', center: { x: 640, z: -280 }, clusterRadius: 400 },
      { id: 'f_ash_2', center: { x: -1120, z: -920 }, clusterRadius: 420 },
    ],
    pois: [
      { id: 'poi_boss', pos: { x: 240, z: 1180 }, landmarkGlb: 'place_nav_buoy', landmark: true },
      { id: 'poi_vault', pos: { x: -1480, z: 320 }, landmarkGlb: 'place_debris_chunk' },
    ],
  },
};

export const SECTOR_ANCHORS = {
  ...Object.fromEntries(Object.entries(CORE_SECTOR_ANCHORS).map(([sectorId, anchor]) => {
    const additions = FRONTIER_CORE_GATE_PATCHES[sectorId];
    return [sectorId, additions
      ? { ...anchor, gates: [...(anchor.gates || []), ...additions] }
      : anchor];
  })),
  ...FRONTIER_ANCHORS,
};

/** Merge anchor overlays into a sector definition (pure data). */
export function applySectorAnchors(sector) {
  const anchor = SECTOR_ANCHORS[sector.id];
  if (!anchor) return sector;
  const out = { ...sector };
  if (anchor.stations) {
    out.stations = (sector.stations || []).map((st) => {
      const a = anchor.stations.find((x) => x.id === st.id);
      return a ? { ...st, ...a } : st;
    });
  }
  if (anchor.gates) out.gates = anchor.gates.map((g) => ({ ...g }));
  if (anchor.fields) {
    out.fields = (sector.fields || []).map((f) => {
      const a = anchor.fields.find((x) => x.id === f.id);
      return a ? { ...f, ...a } : f;
    });
  }
  if (anchor.pois) {
    out.pois = (sector.pois || []).map((p) => {
      const a = anchor.pois.find((x) => x.id === p.id);
      return a ? { ...p, ...a } : p;
    });
  }
  return out;
}

export { bearingGate, GATE_R };
