// PQ-022.gold-corridor-required-assets — the authoritative required visual-asset set for the
// final three Gold Corridor careers (hauler / hunter / prospector) across Helios -> Ceres -> Tethys.
//
// WHY THIS MODULE EXISTS. The milestone's question is "which distinct visual asset identities does a
// player actually encounter on the corridor, and is each one real?". Answering that in prose rots
// the moment somebody adds a POI. So the set lives here as data, and
// `scripts/check-pq022-corridor-assets.mjs` both (a) reconciles every row against the manifests and
// the on-disk artifacts, and (b) RE-DERIVES the machine-derivable rows from the live data modules
// and fails if the static set and the live derivation disagree in either direction.
//
// WHAT THIS MODULE IS NOT. It is not a second asset registry. It carries no paths, hashes, or
// runtime bindings of its own: every path in the gate is resolved from `parts_manifest.json` /
// `release_manifest.json`, which remain the identity authority. This module carries only the
// *membership claim* (this asset is on the corridor) and the *derivation evidence* (how we know).
//
// INCLUSION RULE. An asset is required when it is ROUTED, not merely present: some live data table
// places or selects it inside one of the three corridor sectors, or the runtime is fail-closed on it
// for the player's own ship. Assets that exist in the library but are deliberately unrouted
// (`place_dock_interior_military`, `place_dock_interior_grit`) are excluded, and the exclusion is
// recorded in EXCLUDED_WITH_REASON so the decision is auditable rather than an omission.
//
// HORIZON. Rows are tagged `30` or `90`. `30` is claimed only where the corridor's own definition
// forces it (Helios start, the first dock, the first asteroid field). Everything else defaults to
// `90`. We do not model precisely what a 30-minute player reaches — that is unknowable without
// PQ-025 pilot data, and inventing it is exactly what the program's receipts exist to prevent.
//
// Determinism: pure data plus pure derivation helpers. No RNG, no Date, no filesystem, no side
// effects. The gate owns all I/O.

export const PQ022_CORRIDOR_ASSET_SET_SCHEMA_ID = 'spaceface.pq022.corridorAssetSet.v1';

/** The three Gold Corridor sectors. `02_GOLD_CORRIDOR.md` — Helios -> Ceres -> Tethys. */
export const CORRIDOR_SECTOR_IDS = Object.freeze([
  'sector_helios_prime',
  'sector_ceres_belt',
  'sector_tethys_junction',
]);

/** The three careers whose routes this set must cover. Source: PQ-025 attempt identity schema. */
export const CORRIDOR_CAREER_IDS = Object.freeze(['hauler', 'hunter', 'prospector']);

/**
 * How a row's membership is known. Kinds marked `machine` are re-derived by the gate from live data;
 * kinds marked `traced` are hand-traced through runtime code and carry a `detail` naming the seam.
 */
export const DERIVATION_KINDS = Object.freeze({
  'sector-anchor-station': 'machine',
  'sector-anchor-gate': 'machine',
  'sector-anchor-poi': 'machine',
  'field-asteroid-lead': 'machine',
  'claimable-body': 'machine',
  'world-site-stage': 'machine',
  'pq019-facility': 'machine',
  'pq019-capsule': 'machine',
  'world-site-binding': 'machine',
  'player-hull': 'traced',
  'hostile-wholeship': 'traced',
  'traffic-wholeship': 'traced',
  'production-wholeship': 'traced',
  'modular-hull-slot': 'traced',
  'modular-part-slot': 'traced',
  'ui-preview-backdrop': 'traced',
});

/**
 * Acceptance status vocabulary, reconciled from the receipts and `design/program/NOW.md`.
 *
 * `accepted`               — identity + release + runtime + independent visual verdict all closed.
 * `focused-green`          — structural/headless proofs closed; headed verdict not claimed.
 * `offline-checkpoint`     — offline source/release checkpoint integrated; blocked at live G5/G6/G7.
 * `awaiting-re-authoring`  — the artifact itself is known-inadequate and named for re-authoring.
 * `never-touched`          — no leaf has ever claimed this asset; status genuinely unknown.
 */
export const ACCEPTANCE_STATUSES = Object.freeze([
  'accepted',
  'focused-green',
  'offline-checkpoint',
  'awaiting-re-authoring',
  'never-touched',
]);

const d = (kind, source, detail) => Object.freeze({ kind, source, detail });

function row({
  assetId,
  family,
  derivations,
  horizon = 90,
  status,
  openIssues = [],
  ownerLane = null,
  note = null,
}) {
  return Object.freeze({
    assetId,
    family,
    derivations: Object.freeze(derivations.map((entry) => Object.freeze({ ...entry }))),
    horizon,
    status,
    openIssues: Object.freeze(openIssues.slice()),
    ownerLane,
    note,
  });
}

// ---------------------------------------------------------------------------------------------
// FAMILY: place — authored world props, stations, gates, landmarks.
// Every row here is machine-derived; the gate re-derives the whole family and diffs both ways.
// ---------------------------------------------------------------------------------------------

const PLACE_ROWS = [
  row({
    assetId: 'place_station_trade_hub',
    family: 'place-station',
    horizon: 30,
    status: 'never-touched',
    derivations: [
      d('sector-anchor-station', 'SECTOR_ANCHORS.sector_helios_prime.stations', 'station_helios'),
      d('sector-anchor-station', 'SECTOR_ANCHORS.sector_tethys_junction.stations', 'station_tethys'),
    ],
    note: 'The first station all three careers dock at. No leaf has ever claimed it.',
  }),
  row({
    assetId: 'place_station_refinery',
    family: 'place-station',
    status: 'never-touched',
    derivations: [
      d('sector-anchor-station', 'SECTOR_ANCHORS.sector_ceres_belt.stations', 'station_ceres'),
    ],
  }),
  row({
    assetId: 'place_station_military',
    family: 'place-station',
    status: 'never-touched',
    derivations: [
      d('sector-anchor-station', 'SECTOR_ANCHORS.sector_helios_prime.stations', 'station_coalition'),
      d('sector-anchor-station', 'SECTOR_ANCHORS.sector_tethys_junction.stations', 'station_customs'),
    ],
  }),
  row({
    assetId: 'place_station_mining',
    family: 'place-station',
    status: 'never-touched',
    derivations: [
      d('sector-anchor-station', 'SECTOR_ANCHORS.sector_ceres_belt.stations', 'station_beltout'),
    ],
  }),
  row({
    assetId: 'place_gate_jump_ring',
    family: 'place-infrastructure',
    horizon: 30,
    status: 'never-touched',
    derivations: [
      d('sector-anchor-gate', 'SECTOR_ANCHORS.*.gates', '13 corridor gate instances; world.js:1210 default archetype'),
    ],
    note: 'Highest instance count on the corridor (13). Every inter-sector transition shows it.',
  }),
  row({
    assetId: 'place_lane_beacon',
    family: 'place-infrastructure',
    horizon: 30,
    status: 'focused-green',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_helios_prime.pois', 'poi_tutorial'),
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_ceres_belt.pois', 'poi_ceres_throughline'),
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_tethys_junction.pois', 'poi_tethys_weigh'),
    ],
    ownerLane: 'PQ-020',
    note: 'PQ-020 placed the Ceres throughline beacon and judged the existing asset adequate.',
  }),
  row({
    assetId: 'place_nav_buoy',
    family: 'place-infrastructure',
    status: 'never-touched',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_tethys_junction.pois', 'poi_blackmkt'),
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_tethys_junction.pois', 'poi_tethys_customs_log'),
    ],
  }),
  row({
    assetId: 'place_memorial_array',
    family: 'place-infrastructure',
    horizon: 30,
    status: 'focused-green',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_helios_prime.pois', 'poi_memorial'),
    ],
    ownerLane: 'PQ-022 navigation-infrastructure',
    note: 'Replaced place_station_billboard at poi_memorial. Material-truth V2 keep; live G1/G2/G4 not claimed as accepted.',
  }),
  row({
    assetId: 'place_lane_pin',
    family: 'place-infrastructure',
    horizon: 30,
    status: 'focused-green',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_helios_prime.pois', 'poi_helios_lane_pin'),
    ],
    ownerLane: 'Helios lane furniture still panel (2026-08-18)',
    note: 'A/B/C WIRE. Routed through PLACE_FILES. G1/G2/G4 stay OPEN.',
  }),
  row({
    assetId: 'place_tally_post',
    family: 'place-infrastructure',
    status: 'awaiting-re-authoring',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_helios_prime.pois', 'poi_helios_tally'),
    ],
    ownerLane: 'Helios lane furniture still panel (2026-08-18)',
    note: 'A: LEGO slats/cubes at the deck. Released on disk; deliberately not in PLACE_FILES.',
  }),
  row({
    assetId: 'place_claim_mark',
    family: 'place-infrastructure',
    status: 'awaiting-re-authoring',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_helios_prime.pois', 'poi_helios_claim_mark'),
    ],
    ownerLane: 'Helios lane furniture still panel (2026-08-18)',
    note: 'A: brick-rubble foot. Released on disk; deliberately not in PLACE_FILES.',
  }),
  row({
    assetId: 'place_cold_locker',
    family: 'place-infrastructure',
    horizon: 30,
    status: 'focused-green',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_helios_prime.pois', 'poi_helios_locker'),
    ],
    ownerLane: 'Helios lane furniture still panel (2026-08-18)',
    note: 'A/B/C WIRE. Routed through PLACE_FILES. G1/G2/G4 stay OPEN.',
  }),
  row({
    assetId: 'place_ash_pin',
    family: 'place-infrastructure',
    status: 'awaiting-re-authoring',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_helios_prime.pois', 'poi_helios_ash_pin'),
    ],
    ownerLane: 'Helios lane furniture still panel (2026-08-18)',
    note: 'A: plaque cubes + pad scatter. Released on disk; deliberately not in PLACE_FILES.',
  }),
  row({
    assetId: 'place_whistle',
    family: 'place-infrastructure',
    status: 'awaiting-re-authoring',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_helios_prime.pois', 'poi_helios_whistle'),
    ],
    ownerLane: 'Helios lane furniture still panel (2026-08-18)',
    note: 'A: stray foot brick + cube lantern. Released on disk; deliberately not in PLACE_FILES.',
  }),
  row({
    assetId: 'place_debris_chunk',
    family: 'place-wreck',
    horizon: 30,
    status: 'offline-checkpoint',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_helios_prime.pois', 'poi_helios_yard'),
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_ceres_belt.pois', 'poi_survey'),
    ],
    openIssues: ['blocked-g5-g6-g7'],
    ownerLane: 'primary-checkout-remaster (blocked behind PQ-034)',
    note: 'Rebuilt at 8450287f as one ruptured pressure module. Offline keep; live verdict open.',
  }),
  row({
    assetId: 'place_dead_hulk',
    family: 'place-wreck',
    status: 'offline-checkpoint',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_ceres_belt.pois', 'poi_driller'),
    ],
    openIssues: ['blocked-g5-g6-g7'],
    ownerLane: 'primary-checkout-remaster (blocked behind PQ-034)',
    note: 'Replaces iter219 with one continuous carrier/drill-tender rupture. Offline keep.',
  }),
  row({
    assetId: 'place_asteroid_seamed',
    family: 'place-geology',
    horizon: 30,
    status: 'never-touched',
    derivations: [
      d('field-asteroid-lead', 'SECTORS.sector_helios_prime.fields', 'f_helios_starter (ast_common_rock)'),
      d('field-asteroid-lead', 'SECTORS.sector_helios_prime.fields', 'f_helios_outer (ast_common_rock)'),
      d('field-asteroid-lead', 'SECTORS.sector_ceres_belt.fields', 'f_ceres_2 (ast_common_rock)'),
      d('field-asteroid-lead', 'SECTORS.sector_tethys_junction.fields', 'f_tethys_1 (ast_common_rock)'),
    ],
    note: 'The most-seen authored rock: ast_common_rock leads 4 of the 6 corridor fields.',
  }),
  row({
    assetId: 'place_asteroid_rock_a',
    family: 'place-geology',
    status: 'awaiting-re-authoring',
    derivations: [
      d('field-asteroid-lead', 'SECTORS.sector_ceres_belt.fields', 'f_ceres_1 (ast_metallic)'),
      d('field-asteroid-lead', 'SECTORS.sector_ceres_belt.fields', 'f_ceres_3 (ast_metallic)'),
      d('claimable-body', 'CLAIMABLE_BODY_SITES', 'sector_ceres_belt/poi_claim_rookery'),
    ],
    openIssues: ['awaiting-re-authoring', 'asset-receipt-byte-drift'],
    ownerLane: 'visual production lane (NOW.md row: not yet started)',
    note: 'ON the corridor via both Ceres metallic fields and the Rookery claim. '
      + 'check:graphics:asset-receipts is red on its live-source byte count.',
  }),
  row({
    assetId: 'place_claim_outpost_relay',
    family: 'place-infrastructure',
    horizon: 30,
    status: 'focused-green',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_tethys_junction.pois', 'heist_launcher'),
      d('pq019-facility', 'PQ019_FACILITIES', 'heist_launcher (placeScale 0.14)'),
      d('world-site-stage', 'WORLD_SITE_MANIFESTS', 'sector_helios_prime site / stage "damaged"'),
      d('world-site-binding', 'WORLD_SITE_ASSET_BINDINGS', 'place_claim_outpost_relay'),
    ],
    openIssues: ['grey-primitives-reservation'],
    ownerLane: 'PQ-022.exterior-relay-collar (headed verdict behind PQ-034)',
    note: 'Accepted structurally as-is with a recorded reservation: reads as generic grey primitives '
      + 'at game camera. Blocks PQ-024 until it upgrades to route_accepted.',
  }),
  row({
    assetId: 'place_claim_outpost_base',
    family: 'place-infrastructure',
    status: 'never-touched',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_tethys_junction.pois', 'lawful_catcher'),
      d('pq019-facility', 'PQ019_FACILITIES', 'lawful_catcher'),
      d('world-site-stage', 'WORLD_SITE_MANIFESTS', 'sector_helios_prime site / stages "powered","opened"'),
      d('world-site-binding', 'WORLD_SITE_ASSET_BINDINGS', 'place_claim_outpost_base'),
    ],
    note: 'Shares the relay-collar grey-primitives family risk; no leaf has judged it.',
  }),
  row({
    assetId: 'place_claim_outpost_refinery',
    family: 'place-infrastructure',
    status: 'never-touched',
    derivations: [
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_tethys_junction.pois', 'fence_receiver'),
      d('pq019-facility', 'PQ019_FACILITIES', 'fence_receiver'),
      d('world-site-stage', 'WORLD_SITE_MANIFESTS', 'sector_helios_prime site / stage "recovered"'),
      d('world-site-binding', 'WORLD_SITE_ASSET_BINDINGS', 'place_claim_outpost_refinery'),
    ],
    note: 'Shares the relay-collar grey-primitives family risk; no leaf has judged it.',
  }),
  row({
    assetId: 'place_landmark_wreck_cathedral',
    family: 'place-landmark',
    status: 'focused-green',
    derivations: [
      d('world-site-stage', 'WORLD_SITE_MANIFESTS', 'sector_ceres_belt site / all 4 stages'),
      d('world-site-binding', 'WORLD_SITE_ASSET_BINDINGS', 'place_landmark_wreck_cathedral'),
      d('sector-anchor-poi', 'SECTOR_ANCHORS.sector_ceres_belt.pois', 'world_site_wreck_cathedral (reserved coords)'),
    ],
    openIssues: ['phase4-headed-open'],
    ownerLane: 'PQ-018 (Phase 4 relocated into PQ-020 matched Ceres route)',
    note: 'Phases 0-3 integrated at aef540d3; seven components, five evidence pages.',
  }),
  row({
    assetId: 'place_dock_interior',
    family: 'place-interior',
    horizon: 30,
    status: 'offline-checkpoint',
    derivations: [
      d('ui-preview-backdrop', 'src/ui/shipPreviewMount.js:52', 'default station hangar backdrop for every dock'),
    ],
    openIssues: ['blocked-g5-g6-g7'],
    ownerLane: 'primary-checkout-remaster (blocked behind PQ-034)',
    note: 'Not in the PART_LIBRARY_CONTRACT place slot — reached through the preview mount, not the '
      + 'flight place path. Rebuilt as an open-front H-04 service bay; 0/18,000 dock intersections.',
  }),
];

// ---------------------------------------------------------------------------------------------
// FAMILY: wholeship — complete authored bodies. Selection is unconditional for hostile/traffic
// roles (partsLibrary.js:471-492) and fail-closed for the player (resolveRequiredWholeShipRecord
// THROWS when the record is absent), so these are hard requirements, not upgrades.
// ---------------------------------------------------------------------------------------------

const WHOLESHIP_ROWS = [
  row({
    assetId: 'kestrel',
    family: 'wholeship-player',
    horizon: 30,
    status: 'offline-checkpoint',
    derivations: [
      d('player-hull', 'partsLibrary.WHOLE_SHIP_FILE_BY_DEF_ID.ship_kestrel',
        'NEW_GAME.shipId === ship_kestrel; visualOverrides.requiresProductionWholeShip -> requiredWholeShip:true; fail-closed'),
    ],
    openIssues: ['runtime-g5-g6-open'],
    ownerLane: 'Kestrel material-truth remediation (blocked behind PQ-034)',
    note: 'All three careers share NEW_GAME.shipId, so this is the single most-seen asset on every '
      + 'corridor route. Remastered in place at a23d09b9; 3/3 focused + 22/22 inherited contracts.',
  }),
  row({
    assetId: 'kestrel_lod1',
    family: 'wholeship-player',
    horizon: 30,
    status: 'offline-checkpoint',
    derivations: [
      d('player-hull', 'partsLibrary.WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID.ship_kestrel.lod1',
        'catalogued LOD family member; lodFamily (partsLibrary.js:499) has NO consumer, so LOD0 is canonical live truth'),
    ],
    openIssues: ['runtime-g5-g6-open'],
    ownerLane: 'Kestrel material-truth remediation (blocked behind PQ-034)',
  }),
  row({
    assetId: 'kestrel_lod2',
    family: 'wholeship-player',
    horizon: 30,
    status: 'offline-checkpoint',
    derivations: [
      d('player-hull', 'partsLibrary.WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID.ship_kestrel.lod2',
        'catalogued LOD family member; lodFamily (partsLibrary.js:499) has NO consumer, so LOD0 is canonical live truth'),
    ],
    openIssues: ['runtime-g5-g6-open'],
    ownerLane: 'Kestrel material-truth remediation (blocked behind PQ-034)',
  }),
  row({
    assetId: 'wasp_production_v1',
    family: 'wholeship-production',
    status: 'never-touched',
    derivations: [
      d('production-wholeship', 'visualOverrides.requiresProductionWholeShip',
        "defId === 'ship_wasp' forces the production body; TRAFFIC_ROLES.patrol/escort both use ship_wasp"),
    ],
    note: 'Helios security 0.98 multiplies patrol x2.5 and escort x1.8, so the production Wasp is '
      + 'near-guaranteed in the first sector.',
  }),
  row({
    assetId: 'wasp_production_v1_lod1',
    family: 'wholeship-production',
    status: 'never-touched',
    derivations: [d('production-wholeship', 'partsLibrary.WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID.ship_wasp.lod1',
      'catalogued LOD family member; lodFamily (partsLibrary.js:499) has NO consumer, so LOD0 is canonical live truth')],
  }),
  row({
    assetId: 'wasp_production_v1_lod2',
    family: 'wholeship-production',
    status: 'never-touched',
    derivations: [d('production-wholeship', 'partsLibrary.WHOLE_SHIP_LOD_FAMILY_BY_DEF_ID.ship_wasp.lod2',
      'catalogued LOD family member; lodFamily (partsLibrary.js:499) has NO consumer, so LOD0 is canonical live truth')],
  }),
  row({
    assetId: 'ashline_dart',
    family: 'wholeship-hostile',
    status: 'never-touched',
    derivations: [
      d('hostile-wholeship', 'partsLibrary.WHOLE_SHIP_FILE_BY_HOSTILE_ID.wasp_swarmer', 'ENEMIES.wasp_swarmer'),
    ],
    openIssues: ['superseded-live-pair'],
    ownerLane: 'Ashline V2 portrait/surface lane (deliberately unwired; promotion behind PQ-034)',
    note: 'The LIVE Dart is the superseded family. V2 exists, is structurally valid, and is '
      + 'deliberately not wired. Combat exposure is the hunter career.',
  }),
  row({
    assetId: 'ashline_lode',
    family: 'wholeship-hostile',
    status: 'never-touched',
    derivations: [
      d('hostile-wholeship', 'partsLibrary.WHOLE_SHIP_FILE_BY_HOSTILE_ID.bruiser_brawler', 'ENEMIES.bruiser_brawler'),
    ],
    openIssues: ['superseded-live-pair'],
    ownerLane: 'Ashline V2 portrait/surface lane (deliberately unwired; promotion behind PQ-034)',
  }),
  row({
    assetId: 'ashline_rig',
    family: 'wholeship-hostile',
    status: 'never-touched',
    derivations: [
      d('hostile-wholeship', 'partsLibrary.WHOLE_SHIP_FILE_BY_HOSTILE_ID.reaver_pirate', 'ENEMIES.reaver_pirate'),
      d('hostile-wholeship', 'partsLibrary.WHOLE_SHIP_FILE_BY_HOSTILE_ID.corsair_raider', 'ENEMIES.corsair_raider'),
    ],
    openIssues: ['superseded-live-pair'],
    ownerLane: 'Ashline V2 portrait/surface lane (deliberately unwired; promotion behind PQ-034)',
  }),
  row({
    assetId: 'helios_lark',
    family: 'wholeship-traffic',
    horizon: 30,
    status: 'never-touched',
    derivations: [
      d('traffic-wholeship', 'partsLibrary.WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.courier', 'TRAFFIC_ROLES.courier weight 18'),
    ],
    note: 'Ambient civilian traffic is present in Helios from the first minute.',
  }),
  row({
    assetId: 'helios_cradle',
    family: 'wholeship-traffic',
    status: 'never-touched',
    derivations: [
      d('traffic-wholeship', 'partsLibrary.WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.miner', 'TRAFFIC_ROLES.miner weight 16, x2.5 in mining/refinery sectors'),
    ],
    note: 'Ceres is a refinery/mining sector, so the miner role is amplified there.',
  }),
  row({
    assetId: 'helios_span',
    family: 'wholeship-traffic',
    horizon: 30,
    status: 'never-touched',
    derivations: [
      d('traffic-wholeship', 'partsLibrary.WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE.hauler', 'TRAFFIC_ROLES.hauler weight 30 (highest)'),
    ],
    note: 'Highest-weight traffic role in the game.',
  }),
];

// ---------------------------------------------------------------------------------------------
// FAMILY: modular — seeded assembly parts. `authoredPreloadPlanForEntity` picks cockpit/engine/fin/
// weapon/pod/gear/greeble uniformly from the contract slot by entity-id hash, so EVERY file in those
// slots is reachable by ordinary corridor traffic. Hulls are enumerated as the full regular-hull
// slot because an unmapped defId falls back to a uniform pick over all ten.
// ---------------------------------------------------------------------------------------------

const MODULAR_HULL_IDS = Object.freeze([
  'hull_starter', 'hull_fighter', 'hull_miner', 'hull_freighter', 'hull_interceptor',
  'hull_corvette', 'hull_frigate', 'hull_capital', 'hull_multirole', 'hull_gunship',
]);

const MODULAR_PART_SLOTS = Object.freeze({
  cockpit: ['cockpit_dome', 'cockpit_slab', 'cockpit_recessed'],
  engine: ['engine_ion_small', 'engine_ion_twin', 'engine_industrial', 'engine_resonator', 'engine_vector', 'engine_plasma_ring'],
  fin: ['fin_wedge', 'fin_radiator_grid', 'fin_swept_smuggler', 'fin_crystalline', 'fin_delta', 'fin_stabilator'],
  weapon: ['weapon_pulse_cannon', 'weapon_heavy_cannon', 'weapon_turret_dual', 'weapon_lance', 'weapon_gatling', 'weapon_railgun'],
  greeble: ['greeble_vents', 'greeble_hatches', 'greeble_pipes', 'greeble_rcs', 'greeble_antennas', 'greeble_nav_lights', 'greeble_armor_plates'],
  gear: ['skid_trio', 'skid_quad'],
  pod: ['pod_utility', 'pod_cargo_container', 'pod_repair_patch'],
});

const MODULAR_ROWS = [
  ...MODULAR_HULL_IDS.map((assetId) => row({
    assetId,
    family: 'modular-hull',
    status: 'never-touched',
    derivations: [
      d('modular-hull-slot', 'partsLibrary.PART_LIBRARY_CONTRACT.slots.hull',
        'seeded uniform pick for any corridor ship without a wholeship (express/smuggler/rescue/pirate roles and most ENEMIES)'),
    ],
    openIssues: ['texture-role-repair-offline'],
    ownerLane: 'modular-hull texture-role correction (offline checkpoint; live acceptance open)',
    note: 'The ten canonical hull GLBs moved 34 errors/27 warnings -> 0/0 at 2ca2d94d; 44/44 focused.',
  })),
  ...Object.entries(MODULAR_PART_SLOTS).flatMap(([slot, ids]) => ids.map((assetId) => row({
    assetId,
    family: `modular-${slot}`,
    status: 'never-touched',
    derivations: [
      d('modular-part-slot', `partsLibrary.PART_LIBRARY_CONTRACT.slots.${slot}`,
        'seeded uniform pick in authoredPreloadPlanForEntity — every slot file is reachable'),
    ],
  }))),
];

// `pod_cargo_container` carries a second, stronger derivation: PQ-019's capsule names it directly.
const POD_CAPSULE_INDEX = MODULAR_ROWS.findIndex((entry) => entry.assetId === 'pod_cargo_container');
if (POD_CAPSULE_INDEX >= 0) {
  const base = MODULAR_ROWS[POD_CAPSULE_INDEX];
  MODULAR_ROWS[POD_CAPSULE_INDEX] = row({
    assetId: base.assetId,
    family: base.family,
    horizon: base.horizon,
    status: 'focused-green',
    derivations: [
      ...base.derivations,
      d('pq019-capsule', 'PQ019_CAPSULE.authoredPayloadAssetId', 'the physical heist payload the player actually catches'),
    ],
    ownerLane: 'PQ-019A (facility embodiment 12/12; headed acceptance open)',
    note: 'Real capsule contact and custody filtering proven headless at 272e63b4 + b66f2255.',
  });
}

/** The authoritative required set. */
export const CORRIDOR_ASSET_SET = Object.freeze([
  ...PLACE_ROWS,
  ...WHOLESHIP_ROWS,
  ...MODULAR_ROWS,
]);

/**
 * Deliberate exclusions. Recorded so a reviewer can audit the decision instead of guessing whether
 * an absent asset was considered.
 */
export const EXCLUDED_WITH_REASON = Object.freeze([
  Object.freeze({
    assetId: 'place_dock_interior_military',
    reason: 'NOW.md: deliberately unrouted until it passes the neutral bay composition gate.',
  }),
  Object.freeze({
    assetId: 'place_dock_interior_grit',
    reason: 'NOW.md: deliberately unrouted until it passes the neutral bay composition gate.',
  }),
  Object.freeze({
    assetId: 'place_asteroid_rock_b',
    reason: 'Bound to ast_icy, which is not a declared field type in any corridor sector. '
      + 'Reachable only through the tier weight table in other sectors.',
  }),
  Object.freeze({
    assetId: 'place_asteroid_rock_c',
    reason: 'Bound to ast_crystalline, which is not a declared field type in any corridor sector.',
  }),
  Object.freeze({
    assetId: 'place_asteroid_graffiti',
    reason: 'In the contract place slot but no corridor anchor, field, or world site selects it.',
  }),
  Object.freeze({
    assetId: 'place_conveyor_barge',
    reason: 'In the contract place slot but no corridor anchor selects it.',
  }),
  Object.freeze({
    assetId: 'place_mining_drone',
    reason: 'In the contract place slot but no corridor anchor selects it.',
  }),
  Object.freeze({
    assetId: 'place_station_blackmarket',
    reason: 'No corridor station anchor uses it; poi_blackmkt resolves to place_nav_buoy.',
  }),
  Object.freeze({
    assetId: 'place_station_billboard',
    reason: 'Previously the poi_memorial landmark; that POI now routes place_memorial_array. '
      + 'No corridor sector-anchor, field, or world site selects the billboard. '
      + 'Still resolvable in PLACE_FILES and still used as core-station dressing in world.js, '
      + 'which this gate does not count as corridor routing.',
  }),
  Object.freeze({
    assetId: 'place_station_fab',
    reason: 'No corridor station anchor uses it.',
  }),
  Object.freeze({
    assetId: 'place_station_research',
    reason: 'No corridor station anchor uses it.',
  }),
  Object.freeze({
    assetId: 'place_claim_outpost_bastion',
    reason: 'Reachable only through the spec_bastion claim specialization, which no corridor '
      + 'claimable-body site selects.',
  }),
  Object.freeze({
    assetId: 'pelican',
    reason: 'A vendored wholeship GLB that is deliberately NOT in WHOLE_SHIP_FILE_BY_DEF_ID — '
      + 'partsLibrary only wires production-validated complete bodies. ship_pelican renders modular.',
  }),
  Object.freeze({
    assetId: 'wasp',
    reason: 'Superseded by wasp_production_v1; not referenced by any selection table.',
  }),
]);

// ---------------------------------------------------------------------------------------------
// Live re-derivation. The gate calls this and diffs against the static set in BOTH directions, so
// the required set cannot silently rot when content moves.
// ---------------------------------------------------------------------------------------------

/**
 * Re-derive the machine-derivable place set from the live data modules.
 * @param {object} modules injected live modules (the gate passes real imports).
 * @returns {Map<string, Array<{kind:string,source:string,detail:string}>>}
 */
export function derivePlaceAssets(modules) {
  const {
    SECTOR_ANCHORS, SECTORS, ASTEROIDS, CLAIMABLE_BODY_SITES,
    PQ019_FACILITIES, PQ019_CAPSULE, WORLD_SITE_MANIFESTS, WORLD_SITE_ASSET_BINDINGS,
  } = modules;
  const out = new Map();
  const add = (assetId, kind, source, detail) => {
    if (!assetId) return;
    if (!out.has(assetId)) out.set(assetId, []);
    out.get(assetId).push({ kind, source, detail });
  };
  const astById = new Map(ASTEROIDS.map((a) => [a.id, a]));

  for (const sectorId of CORRIDOR_SECTOR_IDS) {
    const anchors = SECTOR_ANCHORS[sectorId] || {};
    const sector = SECTORS.find((s) => s.id === sectorId);
    for (const station of anchors.stations || []) {
      add(station.archetypeGlb, 'sector-anchor-station', `SECTOR_ANCHORS.${sectorId}.stations`, station.id);
    }
    for (const gate of anchors.gates || []) {
      // world.js:1210 — gates default to place_gate_jump_ring when the anchor names no archetype.
      add(gate.archetypeGlb || 'place_gate_jump_ring', 'sector-anchor-gate', `SECTOR_ANCHORS.${sectorId}.gates`, `->${gate.to}`);
    }
    for (const poi of anchors.pois || []) {
      add(poi.landmarkGlb, 'sector-anchor-poi', `SECTOR_ANCHORS.${sectorId}.pois`, poi.id);
    }
    for (const field of (sector && sector.fields) || []) {
      const def = astById.get(field.type);
      // world.js:1127 — only the FIRST asteroid of each field receives the authored geology skin.
      add(def && def.authoredPlaceId, 'field-asteroid-lead', `SECTORS.${sectorId}.fields`, `${field.id} (${field.type})`);
    }
  }

  for (const site of CLAIMABLE_BODY_SITES) {
    if (CORRIDOR_SECTOR_IDS.includes(site.sectorId)) {
      add(site.landmarkGlb, 'claimable-body', 'CLAIMABLE_BODY_SITES', `${site.sectorId}/${site.id}`);
    }
  }

  for (const [facilityId, facility] of Object.entries(PQ019_FACILITIES)) {
    if (CORRIDOR_SECTOR_IDS.includes(facility.sectorId)) {
      add(facility.placeId, 'pq019-facility', 'PQ019_FACILITIES', facilityId);
    }
  }

  for (const manifest of WORLD_SITE_MANIFESTS) {
    if (!CORRIDOR_SECTOR_IDS.includes(manifest.sectorId)) continue;
    for (const stage of manifest.stages || []) {
      add(stage.placeId, 'world-site-stage', 'WORLD_SITE_MANIFESTS', `${manifest.sectorId} site / stage "${stage.id}"`);
    }
    if (manifest.place && manifest.place.placeId) {
      add(manifest.place.placeId, 'world-site-stage', 'WORLD_SITE_MANIFESTS', `${manifest.sectorId} site / place`);
    }
  }

  for (const placeId of Object.keys(WORLD_SITE_ASSET_BINDINGS)) {
    if (out.has(placeId)) {
      add(placeId, 'world-site-binding', 'WORLD_SITE_ASSET_BINDINGS', placeId);
    }
  }

  add(PQ019_CAPSULE.authoredPayloadAssetId, 'pq019-capsule', 'PQ019_CAPSULE.authoredPayloadAssetId', 'heist payload');

  return out;
}

/**
 * Re-derive the modular slot membership from the live part-library contract. The static MODULAR_*
 * lists above are a transcription of this; the gate diffs them so a contract edit cannot silently
 * change what the corridor requires.
 * @param {object} contract PART_LIBRARY_CONTRACT from src/render/partsLibrary.js
 * @returns {{hulls: string[], slots: Record<string, string[]>}}
 */
export function deriveModularSlots(contract) {
  const idOf = (file) => String(file).split('/').pop().replace(/\.glb$/, '');
  const slots = {};
  for (const [slot, files] of Object.entries(contract.slots || {})) {
    if (slot === 'place' || slot === 'hull') continue;
    slots[slot] = files.map(idOf);
  }
  // REGULAR_HULL_FILES: the hull slot minus the whole-ship bodies (partsLibrary.js:261).
  const hulls = (contract.slots.hull || [])
    .filter((file) => !String(file).startsWith('wholeships/'))
    .map(idOf);
  return { hulls, slots };
}

/** The static modular transcription, exposed so the gate can diff it against deriveModularSlots. */
export const MODULAR_TRANSCRIPTION = Object.freeze({
  hulls: MODULAR_HULL_IDS,
  slots: MODULAR_PART_SLOTS,
});

/** Rows whose membership the gate must re-derive (i.e. every derivation kind is `machine`). */
export function machineDerivedAssetIds() {
  return CORRIDOR_ASSET_SET
    .filter((entry) => entry.derivations.some((dv) => DERIVATION_KINDS[dv.kind] === 'machine'))
    .map((entry) => entry.assetId);
}

export function assetRow(assetId) {
  return CORRIDOR_ASSET_SET.find((entry) => entry.assetId === assetId) || null;
}

export function familyBreakdown() {
  const out = new Map();
  for (const entry of CORRIDOR_ASSET_SET) out.set(entry.family, (out.get(entry.family) || 0) + 1);
  return out;
}

export default CORRIDOR_ASSET_SET;
