// src/data/frontierRegions/west.js — M2b WEST frontier cluster (additive pack).
//
// Self-contained pure data for four stable frontier regions. Not yet merged into
// SECTORS / SECTOR_GLOBAL_ORIGINS / SECTOR_ANCHORS / SECTOR_ZONES — later canonical
// integration will splice these records without rewriting story geography.
//
// Contract:
//   * Deterministic: no unseeded RNG, wall-clock, or runtime deps/imports.
//   * Additive: freezes the original 10 authored story-sector identities.
//   * Lattice: globalOrigin = originCell * 4096 (map.x → globalX, map.y → globalZ).
//   * Canonical-compatible sector cards + local anchors + named zones.
//   * Reciprocal internal gate descriptors; bridge gates to story graph recorded
//     with matching reverse patches for later integration only.
//
// Schema: spaceface.frontierCluster.v1

/** Documented lattice spacing (world units) — matches sectorCoordinates.SECTOR_ORIGIN_LATTICE_WU. */
export const SECTOR_ORIGIN_LATTICE_WU = 4096;

/** Original 10 story-region IDs — frozen; this pack must not redefine or collide with them. */
export const FROZEN_STORY_SECTOR_IDS = Object.freeze([
  'sector_helios_prime',
  'sector_ceres_belt',
  'sector_tethys_junction',
  'sector_vesta_forge',
  'sector_pallas_drift',
  'sector_io_reach',
  'sector_charon_expanse',
  'sector_sker_haven',
  'sector_veil_nebula',
  'sector_ashfall_reach',
]);

/** Stable WEST region IDs in deterministic order. */
export const WEST_REGION_IDS = Object.freeze([
  'sector_nyx_march',
  'sector_hyperion_cut',
  'sector_kepler_scar',
  'sector_orcus_shadow',
]);

/** Assigned origin cells (map-graph units). globalX = x * LATTICE, globalZ = y * LATTICE. */
export const WEST_ORIGIN_CELLS = Object.freeze({
  sector_nyx_march: Object.freeze({ x: -9, y: 4 }),
  sector_hyperion_cut: Object.freeze({ x: -7, y: 0 }),
  sector_kepler_scar: Object.freeze({ x: -11, y: 7 }),
  sector_orcus_shadow: Object.freeze({ x: -10, y: 11 }),
});

// Inlined from sectors.js SECTOR_PALETTE_CLASSES — existing vocab only, no import.
const PALETTE = Object.freeze({
  core: Object.freeze({
    key: 0xd8e8ff, rim: 0x7a6cff, fill: 0x4ad8ff, ambient: 0x384868,
    fog: 0x05070b, fogDensity: 0, nebulaTint: 0x2450a0, dust: 0x8ec0e8,
  }),
  belt: Object.freeze({
    key: 0xffd59a, rim: 0xb56d2f, fill: 0xffb13d, ambient: 0x594a42,
    fog: 0x090705, fogDensity: 0.00002, nebulaTint: 0x8a4a1e, dust: 0xc0793d,
  }),
  fringe: Object.freeze({
    key: 0xffb07a, rim: 0xff3f2d, fill: 0xffaa66, ambient: 0x584343,
    fog: 0x090504, fogDensity: 0.00003, nebulaTint: 0x8a1e1e, dust: 0xc15032,
  }),
  anomaly: Object.freeze({
    key: 0xc8b6ff, rim: 0x54ffb0, fill: 0x4ddc92, ambient: 0x494760,
    fog: 0x08050d, fogDensity: 0.00012, nebulaTint: 0x5a1e8a, dust: 0x79ffc8,
  }),
});

/** Canonical vocabulary mirrors (for validators; keep in sync with sectors.js / sectorZones.js). */
export const STATION_TYPES = Object.freeze([
  'trade_hub', 'refinery', 'mining', 'fab', 'military', 'blackmarket', 'research',
]);
export const HAZARD_TYPES = Object.freeze(['dense_asteroid', 'nebula', 'radiation', 'debris']);
export const POI_TYPES = Object.freeze([
  'beacon', 'derelict', 'cache', 'colony', 'anomaly', 'wormhole', 'wreck',
]);
export const ZONE_TYPES = Object.freeze([
  'civilian_core', 'trade_lane', 'patrol_corridor', 'border_checkpoint',
  'refinery_approach', 'mining_belt', 'colony', 'derelict_field', 'outlaw_zone',
  'radiation_field', 'nebula_fog', 'ambush_lane', 'anomaly_deep',
]);
export const FACTION_IDS = Object.freeze([
  'faction_scn', 'faction_mts', 'faction_dmc', 'faction_reach',
  'faction_quiet', 'faction_vael', 'faction_free', 'faction_choir', 'faction_helix',
]);
export const PALETTE_KEYS = Object.freeze(['core', 'belt', 'fringe', 'anomaly']);

function cellOrigin(cell) {
  return Object.freeze({
    x: cell.x * SECTOR_ORIGIN_LATTICE_WU,
    z: cell.y * SECTOR_ORIGIN_LATTICE_WU,
  });
}

function freezeRegion(record) {
  return Object.freeze({
    id: record.id,
    originCell: Object.freeze({ x: record.originCell.x, y: record.originCell.y }),
    globalOrigin: Object.freeze({ x: record.globalOrigin.x, z: record.globalOrigin.z }),
    sector: Object.freeze(record.sector),
    anchors: Object.freeze({
      stations: Object.freeze(record.anchors.stations.map((s) => Object.freeze({ ...s, pos: Object.freeze({ ...s.pos }) }))),
      gates: Object.freeze(record.anchors.gates.map((g) => Object.freeze({ ...g, pos: Object.freeze({ ...g.pos }) }))),
      fields: Object.freeze(record.anchors.fields.map((f) => Object.freeze({
        ...f,
        center: Object.freeze({ ...f.center }),
      }))),
      pois: Object.freeze(record.anchors.pois.map((p) => Object.freeze({ ...p, pos: Object.freeze({ ...p.pos }) }))),
    }),
    zones: Object.freeze(record.zones.map((z) => Object.freeze({
      ...z,
      center: Object.freeze({ ...z.center }),
      presence: z.presence ? Object.freeze({ ...z.presence, archetypes: Object.freeze([...(z.presence.archetypes || [])]), size: Object.freeze([...(z.presence.size || [])]) }) : undefined,
    }))),
  });
}

// ── Region records ──────────────────────────────────────────────────────────
// Gate positions use GATE_R=0.82 bearing math (sectorAnchors.bearingGate) precomputed
// from origin cells — no RNG jitter.

const NYX_CELL = WEST_ORIGIN_CELLS.sector_nyx_march;
const HYPERION_CELL = WEST_ORIGIN_CELLS.sector_hyperion_cut;
const KEPLER_CELL = WEST_ORIGIN_CELLS.sector_kepler_scar;
const ORCUS_CELL = WEST_ORIGIN_CELLS.sector_orcus_shadow;

const REGION_NYX = freezeRegion({
  id: 'sector_nyx_march',
  originCell: NYX_CELL,
  globalOrigin: cellOrigin(NYX_CELL),
  sector: {
    id: 'sector_nyx_march',
    name: 'Nyx March',
    tier: 2,
    security: 0.28,
    charted: false,
    factionId: 'faction_quiet',
    position: { x: NYX_CELL.x, y: NYX_CELL.y },
    worldRadius: 5000,
    palette: PALETTE.fringe,
    paletteKey: 'fringe',
    trafficPerMin: 4,
    enemyDensity: 0.48,
    enemyLevel: [5, 9],
    neighbors: [
      'sector_hyperion_cut',
      'sector_kepler_scar',
      'sector_pallas_drift', // bridge → story (later reciprocal patch)
    ],
    stations: [
      {
        id: 'station_nyx_march',
        name: 'Nyx Fence',
        type: 'blackmarket',
        factionId: 'faction_quiet',
        size: 'M',
        services: ['black_market', 'trade', 'refuel', 'repair', 'missions'],
        chartNote: 'Quiet papers end here. Contraband, fuel, and repairs move without Concord questions.',
        repGated: true,
      },
    ],
    fields: [
      { id: 'f_nyx_1', type: 'ast_icy', countWeight: 1.0 },
      { id: 'f_nyx_2', type: 'ast_metallic', countWeight: 0.75 },
    ],
    hazards: [
      { type: 'nebula', center: { x: 520, z: -640 }, radius: 780, intensity: 0.45 },
    ],
    pois: [
      { id: 'poi_nyx_cache', type: 'cache', name: 'March Drop Cache', hidden: true },
      { id: 'poi_nyx_wreck', type: 'wreck', name: 'Cut-Runner Wreck' },
    ],
  },
  anchors: {
    stations: [
      {
        id: 'station_nyx_march',
        pos: { x: -880, z: 540 },
        archetypeGlb: 'place_station_blackmarket',
        landmark: true,
      },
    ],
    gates: [
      { to: 'sector_hyperion_cut', pos: { x: 1834, z: -3667 } },
      { to: 'sector_kepler_scar', pos: { x: -2274, z: 3411 } },
      { to: 'sector_pallas_drift', pos: { x: 3978, z: 994 }, bridge: true },
    ],
    fields: [
      { id: 'f_nyx_1', center: { x: 420, z: -780 }, clusterRadius: 440 },
      { id: 'f_nyx_2', center: { x: -640, z: 320 }, clusterRadius: 380 },
    ],
    pois: [
      { id: 'poi_nyx_cache', pos: { x: -1480, z: -280 }, landmarkGlb: 'place_debris_chunk' },
      { id: 'poi_nyx_wreck', pos: { x: 1120, z: 760 }, landmarkGlb: 'place_dead_hulk', landmark: true },
    ],
  },
  zones: [
    {
      id: 'zone_nyx_fence',
      name: 'The Quiet Fence',
      type: 'outlaw_zone',
      factionId: 'faction_quiet',
      reason: 'Contraband changes hands under Quiet charter; Concord patrols do not come this far west.',
      center: { x: -880, z: 540 },
      radius: 900,
      threat: 2,
      presence: {
        role: 'smugglers',
        archetypes: ['reaver_pirate'],
        size: [1, 3],
        doctrine: 'scavenger',
        formation: 'loose',
        context: 'zone_hostile',
        hostile: true,
        factionId: 'faction_quiet',
      },
    },
    {
      id: 'zone_nyx_cutlane',
      name: 'Hyperion Cut Lane',
      type: 'ambush_lane',
      factionId: 'faction_reach',
      reason: 'Reach skiffs skim the cut-lane for loaded smugglers headed south to Hyperion.',
      center: { x: 1120, z: 760 },
      radius: 620,
      threat: 3,
      presence: {
        role: 'pirates',
        archetypes: ['corsair_raider', 'reaver_pirate', 'wasp_swarmer'],
        size: [2, 4],
        doctrine: 'scavenger',
        formation: 'wedge',
        context: 'zone_hostile',
        hostile: true,
      },
    },
  ],
});

const REGION_HYPERION = freezeRegion({
  id: 'sector_hyperion_cut',
  originCell: HYPERION_CELL,
  globalOrigin: cellOrigin(HYPERION_CELL),
  sector: {
    id: 'sector_hyperion_cut',
    name: 'Hyperion Cut',
    tier: 2,
    security: 0.38,
    charted: false,
    factionId: 'faction_dmc',
    position: { x: HYPERION_CELL.x, y: HYPERION_CELL.y },
    worldRadius: 4800,
    palette: PALETTE.belt,
    paletteKey: 'belt',
    trafficPerMin: 5,
    enemyDensity: 0.40,
    enemyLevel: [4, 8],
    neighbors: [
      'sector_nyx_march',
      'sector_ceres_belt', // bridge → story
    ],
    stations: [
      {
        id: 'station_hyperion_cut',
        name: 'Cut Refinery',
        type: 'refinery',
        factionId: 'faction_dmc',
        size: 'M',
        services: ['ore_buy', 'refine', 'trade', 'refuel', 'repair'],
        chartNote: 'West-cut ore intake, alloy exchange, and repairs on the Collective line.',
      },
      {
        id: 'station_hyperion_claim',
        name: 'Cut Claim Outpost',
        type: 'mining',
        factionId: 'faction_dmc',
        size: 'S',
        services: ['trade', 'ore_buy', 'missions'],
        chartNote: 'Claim crews buy ore at the seam and post dangerous short-haul work.',
      },
    ],
    fields: [
      { id: 'f_hyperion_1', type: 'ast_metallic', countWeight: 1.0 },
      { id: 'f_hyperion_2', type: 'ast_common_rock', countWeight: 0.9 },
      { id: 'f_hyperion_3', type: 'ast_crystalline', countWeight: 0.55 },
    ],
    hazards: [
      { type: 'dense_asteroid', center: { x: 600, z: -420 }, radius: 720, intensity: 0.55 },
    ],
    pois: [
      {
        id: 'poi_hyperion_driller',
        type: 'derelict',
        name: 'The Caved Shaft',
        scannerSignalKind: 'archive',
        repeatableScannerSignal: true,
        flavorTargetRef: 'landmark_c6_caved_shaft',
        discoveryPlate: {
          title: 'The Caved Shaft',
          body: 'The drill mast fell inward through a hollow asteroid. Ordinary probes return without telemetry; the snapped auger is folded against something harder than drill-steel.',
        },
      },
      { id: 'poi_hyperion_beacon', type: 'beacon', name: 'Cut Lane Beacon' },
    ],
  },
  anchors: {
    stations: [
      {
        id: 'station_hyperion_cut',
        pos: { x: -640, z: 480 },
        archetypeGlb: 'place_station_refinery',
        landmark: true,
      },
      {
        id: 'station_hyperion_claim',
        pos: { x: 920, z: -780 },
        archetypeGlb: 'place_station_mining',
      },
    ],
    gates: [
      { to: 'sector_nyx_march', pos: { x: -1760, z: 3520 } },
      { to: 'sector_ceres_belt', pos: { x: 3520, z: 1760 }, bridge: true },
    ],
    fields: [
      { id: 'f_hyperion_1', center: { x: 380, z: -640 }, clusterRadius: 460 },
      { id: 'f_hyperion_2', center: { x: -820, z: 220 }, clusterRadius: 400 },
      { id: 'f_hyperion_3', center: { x: 1040, z: 560 }, clusterRadius: 340 },
    ],
    pois: [
      {
        id: 'poi_hyperion_driller',
        pos: { x: 240, z: -1180 },
        landmarkGlb: 'place_dead_hulk',
        landmark: true,
      },
      {
        id: 'poi_hyperion_beacon',
        pos: { x: -320, z: 1280 },
        landmarkGlb: 'place_lane_beacon',
      },
    ],
  },
  zones: [
    {
      id: 'zone_hyperion_refinery',
      name: 'Cut Refinery Approach',
      type: 'refinery_approach',
      factionId: 'faction_dmc',
      reason: 'Ore in, alloys out — Collective crews keep the cut open against west-march raiders.',
      center: { x: -640, z: 480 },
      radius: 780,
      threat: 1,
      presence: {
        role: 'patrol',
        archetypes: ['patrol_lawman'],
        size: [1, 2],
        doctrine: 'official',
        formation: 'wedge',
        context: 'patrol',
        hostile: false,
        factionId: 'faction_scn',
      },
    },
    {
      id: 'zone_hyperion_belt',
      name: 'Hyperion Seams',
      type: 'mining_belt',
      factionId: 'faction_dmc',
      reason: 'Metallic seams cut open by the first Drift surveyors — still the best rock west of Ceres.',
      center: { x: 380, z: -640 },
      radius: 1000,
      threat: 1,
    },
  ],
});

const REGION_KEPLER = freezeRegion({
  id: 'sector_kepler_scar',
  originCell: KEPLER_CELL,
  globalOrigin: cellOrigin(KEPLER_CELL),
  sector: {
    id: 'sector_kepler_scar',
    name: 'Kepler Scar',
    tier: 3,
    security: 0.12,
    charted: false,
    factionId: 'faction_reach',
    position: { x: KEPLER_CELL.x, y: KEPLER_CELL.y },
    worldRadius: 5200,
    palette: PALETTE.fringe,
    paletteKey: 'fringe',
    trafficPerMin: 1,
    enemyDensity: 0.68,
    enemyLevel: [7, 12],
    neighbors: [
      'sector_nyx_march',
      'sector_orcus_shadow',
      'sector_sker_haven', // bridge → story pirate haven
    ],
    stations: [
      {
        id: 'station_kepler_scar',
        name: 'Scar Bazaar',
        type: 'blackmarket',
        factionId: 'faction_reach',
        size: 'M',
        services: ['black_market', 'repair', 'refuel', 'missions'],
        chartNote: 'The Bazaar shelters under the capsized Void-Reach: stolen cargo in, carrier surplus out, and every favor has a price.',
        repGated: true,
      },
    ],
    fields: [
      { id: 'f_kepler_1', type: 'ast_rare_exotic', countWeight: 0.85 },
      { id: 'f_kepler_2', type: 'ast_metallic', countWeight: 0.7 },
    ],
    hazards: [
      { type: 'radiation', center: { x: 200, z: -300 }, radius: 900, intensity: 0.65 },
      { type: 'debris', center: { x: -700, z: 500 }, radius: 700, intensity: 0.5 },
    ],
    pois: [
      {
        id: 'poi_kepler_hulk',
        type: 'derelict',
        name: 'The Flight Deck',
        scannerSignalKind: 'archive',
        flavorTargetRef: 'landmark_c8_flight_deck',
        discoveryPlate: {
          title: 'The Flight Deck',
          body: 'The carrier Void-Reach died upside-down. Reach stalls now crowd its upturned belly while launch rails hang over the market like teeth.',
        },
      },
      { id: 'poi_kepler_stash', type: 'cache', name: 'Raider Stash', hidden: true },
    ],
  },
  anchors: {
    stations: [
      {
        id: 'station_kepler_scar',
        pos: { x: -520, z: 720 },
        archetypeGlb: 'place_station_blackmarket',
        landmark: true,
      },
    ],
    gates: [
      { to: 'sector_nyx_march', pos: { x: 2365, z: -3548 } },
      { to: 'sector_orcus_shadow', pos: { x: 1034, z: 4137 } },
      { to: 'sector_sker_haven', pos: { x: 4137, z: 1034 }, bridge: true },
    ],
    fields: [
      { id: 'f_kepler_1', center: { x: 680, z: -420 }, clusterRadius: 420 },
      { id: 'f_kepler_2', center: { x: -980, z: 280 }, clusterRadius: 380 },
    ],
    pois: [
      {
        id: 'poi_kepler_hulk',
        // The station grew around this hull. Keep the two physical carriers distinct, but close
        // enough that arriving at either reveals one market-under-a-dead-carrier composition.
        pos: { x: 40, z: 720 },
        landmarkGlb: 'place_dead_hulk',
        landmark: true,
      },
      {
        id: 'poi_kepler_stash',
        pos: { x: -1320, z: -360 },
        landmarkGlb: 'place_debris_chunk',
      },
    ],
  },
  zones: [
    {
      id: 'zone_kepler_scar',
      name: 'The Scar Bazaar',
      type: 'outlaw_zone',
      factionId: 'faction_reach',
      reason: 'Reach fence stolen cargo through the radiation scar — jump out fast or pay their price.',
      center: { x: -520, z: 720 },
      radius: 1200,
      threat: 3,
      presence: {
        role: 'pirates',
        archetypes: ['corsair_raider', 'reaver_pirate', 'wasp_swarmer'],
        size: [3, 5],
        doctrine: 'scavenger',
        formation: 'wedge',
        context: 'zone_hostile',
        hostile: true,
        // The Bazaar is Reach territory, not a perpetual ambush. Neutral visitors may dock;
        // negative standing (or direct provocation) turns the same local squad hostile.
        standingHostileBelow: 0,
        // Patrol the outer approach rather than spawning inside the station's berth safety bubble.
        spawnCenter: { x: -520, z: -650 },
      },
    },
    {
      id: 'zone_kepler_glow',
      name: 'Scar Radiation Field',
      type: 'radiation_field',
      factionId: 'faction_reach',
      reason: 'Old warheads and torn reactor mass — shields degrade fast in the glow.',
      center: { x: 200, z: -300 },
      radius: 900,
      threat: 2,
    },
  ],
});

const REGION_ORCUS = freezeRegion({
  id: 'sector_orcus_shadow',
  originCell: ORCUS_CELL,
  globalOrigin: cellOrigin(ORCUS_CELL),
  sector: {
    id: 'sector_orcus_shadow',
    name: 'Orcus Shadow',
    tier: 4,
    security: 0.06,
    charted: false,
    factionId: 'faction_vael',
    position: { x: ORCUS_CELL.x, y: ORCUS_CELL.y },
    worldRadius: 5400,
    palette: PALETTE.anomaly,
    paletteKey: 'anomaly',
    trafficPerMin: 0,
    enemyDensity: 0.75,
    enemyLevel: [9, 14],
    neighbors: [
      'sector_kepler_scar',
    ],
    stations: [
      {
        id: 'station_orcus_shadow',
        name: 'Shadow Cache',
        type: 'research',
        factionId: 'faction_vael',
        size: 'S',
        services: ['scan_tech', 'repair', 'refuel', 'missions'],
        chartNote: 'The only Vael dock in the dark. Scan work goes only to pilots they admit.',
        repGated: true,
      },
    ],
    fields: [
      { id: 'f_orcus_1', type: 'ast_rare_exotic', countWeight: 1.0 },
      { id: 'f_orcus_2', type: 'ast_gas_cloud', countWeight: 0.8 },
    ],
    hazards: [
      { type: 'radiation', center: { x: 0, z: 0 }, radius: 1600, intensity: 0.75 },
      { type: 'nebula', center: { x: -500, z: 800 }, radius: 1100, intensity: 0.55 },
    ],
    pois: [
      { id: 'poi_orcus_anomaly', type: 'anomaly', name: 'Orcus Signal' },
      { id: 'poi_orcus_vault', type: 'cache', name: 'Shadow Vault', hidden: true },
      { id: 'poi_orcus_plinth', type: 'beacon', name: 'Shadow Plinth', factionId: 'faction_vael' },
    ],
  },
  anchors: {
    stations: [
      {
        id: 'station_orcus_shadow',
        pos: { x: 420, z: -960 },
        archetypeGlb: 'place_station_research',
        landmark: true,
      },
    ],
    gates: [
      { to: 'sector_kepler_scar', pos: { x: -1074, z: -4296 } },
    ],
    fields: [
      { id: 'f_orcus_1', center: { x: 720, z: -280 }, clusterRadius: 420 },
      { id: 'f_orcus_2', center: { x: -880, z: 640 }, clusterRadius: 480 },
    ],
    pois: [
      {
        id: 'poi_orcus_anomaly',
        pos: { x: 0, z: 0 },
        landmarkGlb: 'place_asteroid_seamed',
        landmark: true,
      },
      {
        id: 'poi_orcus_vault',
        pos: { x: -1480, z: 320 },
        landmarkGlb: 'place_debris_chunk',
      },
      {
        id: 'poi_orcus_plinth',
        pos: { x: 980, z: -540 },
        landmarkGlb: 'place_nav_buoy',
      },
    ],
  },
  zones: [
    {
      id: 'zone_orcus_shadow',
      name: 'The Shadow Threshold',
      type: 'anomaly_deep',
      factionId: 'faction_vael',
      reason: 'Sensors ghost and autopilot drifts; the Vael guard whatever waits in the dark.',
      center: { x: 0, z: 0 },
      radius: 1000,
      threat: 4,
      presence: {
        role: 'vael',
        archetypes: ['lancer_sniper', 'bruiser_brawler'],
        size: [1, 3],
        doctrine: 'balanced',
        formation: 'ring',
        context: 'zone_hostile',
        hostile: true,
        factionId: 'faction_vael',
      },
    },
    {
      id: 'zone_orcus_research',
      name: 'Shadow Cache',
      type: 'civilian_core',
      factionId: 'faction_vael',
      reason: 'A thin Vael research outpost — the only dock for light-years, if they let you land.',
      center: { x: 420, z: -960 },
      radius: 720,
      threat: 2,
    },
  ],
});

/**
 * Pending reverse gate patches for story sectors (NOT applied by this pack).
 * Positions from the same GATE_R=0.82 bearing math so later canonical integration
 * can add reciprocal edges without inventing new geometry.
 */
export const WEST_PENDING_STORY_GATE_PATCHES = Object.freeze([
  Object.freeze({
    sectorId: 'sector_ceres_belt',
    neighborId: 'sector_hyperion_cut',
    gate: Object.freeze({ to: 'sector_hyperion_cut', pos: Object.freeze({ x: -3080, z: -1540 }) }),
  }),
  Object.freeze({
    sectorId: 'sector_pallas_drift',
    neighborId: 'sector_nyx_march',
    gate: Object.freeze({ to: 'sector_nyx_march', pos: Object.freeze({ x: -3580, z: -895 }) }),
  }),
  Object.freeze({
    sectorId: 'sector_sker_haven',
    neighborId: 'sector_kepler_scar',
    gate: Object.freeze({ to: 'sector_kepler_scar', pos: Object.freeze({ x: -3978, z: -994 }) }),
  }),
]);

/** Ordered region records (deterministic). */
export const WEST_REGIONS = Object.freeze([
  REGION_HYPERION,
  REGION_NYX,
  REGION_KEPLER,
  REGION_ORCUS,
]);

/** Lookup map by sector id. */
export const WEST_REGIONS_BY_ID = Object.freeze(
  Object.fromEntries(WEST_REGIONS.map((r) => [r.id, r])),
);

/**
 * Self-contained WEST frontier cluster export.
 * @type {Readonly<{
 *   schema: string,
 *   id: string,
 *   cardinal: string,
 *   latticeWu: number,
 *   freezesStorySectorIds: ReadonlyArray<string>,
 *   regionIds: ReadonlyArray<string>,
 *   originCells: Readonly<Record<string,{x:number,y:number}>>,
 *   regions: ReadonlyArray<object>,
 *   regionsById: Readonly<Record<string,object>>,
 *   pendingStoryGatePatches: ReadonlyArray<object>,
 * }>}
 */
export const WEST_FRONTIER_CLUSTER = Object.freeze({
  schema: 'spaceface.frontierCluster.v1',
  id: 'frontier_cluster_west',
  cardinal: 'west',
  latticeWu: SECTOR_ORIGIN_LATTICE_WU,
  freezesStorySectorIds: FROZEN_STORY_SECTOR_IDS,
  regionIds: WEST_REGION_IDS,
  originCells: WEST_ORIGIN_CELLS,
  regions: WEST_REGIONS,
  regionsById: WEST_REGIONS_BY_ID,
  pendingStoryGatePatches: WEST_PENDING_STORY_GATE_PATCHES,
});

// ── Projection helpers (pure; for later canonical integration / tests) ──────

/** @returns {string[]} */
export function listWestRegionIds() {
  return WEST_REGION_IDS.slice();
}

/** @param {string} sectorId */
export function getWestRegion(sectorId) {
  return WEST_REGIONS_BY_ID[sectorId] || null;
}

/** Sector cards in canonical SECTORS shape (pre-anchor-merge fields + neighbors). */
export function westSectorCards() {
  return WEST_REGIONS.map((r) => r.sector);
}

/** Global origins map compatible with SECTOR_GLOBAL_ORIGINS entries. */
export function westGlobalOrigins() {
  const out = {};
  for (const r of WEST_REGIONS) out[r.id] = { x: r.globalOrigin.x, z: r.globalOrigin.z };
  return out;
}

/** Anchor overlays compatible with SECTOR_ANCHORS entries. */
export function westAnchors() {
  const out = {};
  for (const r of WEST_REGIONS) {
    out[r.id] = {
      stations: r.anchors.stations.map((s) => ({ ...s, pos: { ...s.pos } })),
      gates: r.anchors.gates.map((g) => ({ ...g, pos: { ...g.pos } })),
      fields: r.anchors.fields.map((f) => ({ ...f, center: { ...f.center } })),
      pois: r.anchors.pois.map((p) => ({ ...p, pos: { ...p.pos } })),
    };
  }
  return out;
}

/** Zone arrays compatible with SECTOR_ZONES entries. */
export function westZones() {
  const out = {};
  for (const r of WEST_REGIONS) {
    out[r.id] = r.zones.map((z) => ({
      ...z,
      center: { ...z.center },
      presence: z.presence ? { ...z.presence, archetypes: [...(z.presence.archetypes || [])], size: [...(z.presence.size || [])] } : undefined,
    }));
  }
  return out;
}

// Security helpers — same pure math as sectors.js / ARCHITECTURE §0.8.
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function dangerTier(sector) {
  return clamp(Math.round((1 - sector.security) * 5), 0, 5);
}

export function wealthIndex(sector) {
  const tier = sector.tier;
  return clamp(0.3 + 0.16 * tier + 0.10 * (1 - sector.security), 0.3, 1.6);
}

export function dangerIndex(sector) {
  const tier = sector.tier;
  return clamp(0.05 + 0.22 * tier + 0.25 * (1 - sector.security), 0, 1.0);
}

export default WEST_FRONTIER_CLUSTER;
