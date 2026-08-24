// PQ-136.01 — everyday-space kit ordinary-sector dressing.
//
// The incubator pack is 62 GLBs: 46 source identities + 16 production copies of the
// PQ-045 selected sixteen. Those sixteen already have release/place bodies and
// render-package routes. The other thirty source identities were never promoted:
// they have no spacefaceAsset extras, no release GLB, and the live loader refuses
// them. This table records that refusal and places only the sixteen legal bodies
// through world dressing. Do not stamp extras into incubator GLBs.

import { OCCUPATIONAL_PLACE_RADIUS } from './occupationalYardDressing.js';

export const EVERYDAY_SPACE_KIT_SALT = 'everydaySpaceKit';
export const EVERYDAY_SPACE_KIT_MAX_PER_SECTOR = 6;
export const EVERYDAY_SPACE_KIT_MAX_CORE_PER_SECTOR = 4;

const KIT_SOURCE_DIR = 'assets/incubator/everyday_space_kit/source';
const RELEASE_PLACES_DIR = 'assets/ships/release/parts/places';

function kitSourceGlb(stem) {
  return `${KIT_SOURCE_DIR}/${stem}.glb`;
}

function releasePlaceGlb(placeId) {
  return `${RELEASE_PLACES_DIR}/${placeId}.glb`;
}

function legal(id, family, anchor, label) {
  return Object.freeze({
    id,
    stem: id.replace(/^place_/, ''),
    family,
    anchor,
    label,
    live: true,
    file: `places/${id}.glb`,
    releaseUrl: releasePlaceGlb(id),
    radius: OCCUPATIONAL_PLACE_RADIUS[id] || 12,
  });
}

function unused(stem, family, anchor, label, longestM) {
  const id = `place_${stem}`;
  const radius = Math.max(8, Math.min(36, Math.round(Number(longestM) * 0.5) || 12));
  return Object.freeze({
    id,
    stem,
    family,
    anchor,
    label,
    live: false,
    file: null,
    sourceFile: kitSourceGlb(stem),
    radius,
    refuse: 'authored-loader: missing spacefaceAsset extras and no release/place family',
  });
}

// Sixteen PQ-045 production identities. Release GLBs already exist and already
// appear as sourceUrl literals in the render-package manifest.
export const EVERYDAY_SPACE_KIT_LEGAL_MODELS = Object.freeze([
  legal('place_cargo_pod_standard', 'cargo', 'station', 'Yard Cargo Pod'),
  legal('place_container_rack', 'cargo', 'station', 'Apron Container Rack'),
  legal('place_freight_platform', 'cargo', 'station', 'Freight Apron'),
  legal('place_transfer_arm', 'cargo', 'station', 'Transfer Arm'),
  legal('place_maintenance_gantry', 'service', 'station', 'Service Gantry'),
  legal('place_worklight_tower', 'service', 'station', 'Yard Worklight'),
  legal('place_transponder_gate', 'law', 'lane', 'Transponder Gate'),
  legal('place_interdiction_buoy', 'law', 'lane', 'Interdiction Buoy'),
  legal('place_sensor_mast', 'law', 'lane', 'Watch Mast'),
  legal('place_drill_platform', 'mining', 'work', 'Seam Drill'),
  legal('place_extraction_mast', 'mining', 'work', 'Extraction Mast'),
  legal('place_conveyor_truss', 'mining', 'work', 'Ore Conveyor'),
  legal('place_slurry_tank', 'mining', 'work', 'Slurry Bank'),
  legal('place_radiator_bank', 'mining', 'work', 'Heat Bank'),
  legal('place_scrap_cage', 'salvage', 'work', 'Scrap Cage'),
  legal('place_improvised_dock', 'salvage', 'station', 'Improvised Dock'),
]);

// Thirty source identities with no promoted release family. Recorded, not spawned.
export const EVERYDAY_SPACE_KIT_UNUSED_MODELS = Object.freeze([
  unused('cargo_pod_hazmat', 'cargo', 'station', 'Hazmat Pod', 6.12),
  unused('cargo_pod_standard_breached', 'cargo', 'work', 'Breached Pod', 6.12),
  unused('ore_bulk_container', 'cargo', 'work', 'Ore Bulk Box', 10.2),
  unused('container_rack_abandoned', 'cargo', 'station', 'Abandoned Rack', 14.06),
  unused('tanker_coupling', 'cargo', 'station', 'Tanker Coupling', 12.2),
  unused('drill_platform_cold', 'mining', 'work', 'Cold Drill', 14.6),
  unused('crusher_module', 'mining', 'work', 'Jaw Crusher', 11.95),
  unused('ore_sorter', 'mining', 'work', 'Ore Sorter', 9.7),
  unused('repair_scaffold', 'service', 'station', 'Repair Scaffold', 7.52),
  unused('repair_scaffold_bent', 'service', 'work', 'Bent Scaffold', 7.4),
  unused('construction_frame', 'service', 'station', 'Keel Frame', 27.22),
  unused('welding_drone', 'service', 'station', 'Welding Drone', 2.06),
  unused('parts_rack', 'service', 'station', 'Parts Rack', 8.62),
  unused('power_skid', 'service', 'work', 'Power Skid', 8.25),
  unused('customs_pylon', 'law', 'lane', 'Customs Pylon', 3.4),
  unused('inspection_platform', 'law', 'lane', 'Inspection Dock', 20.4),
  unused('traffic_signal', 'law', 'lane', 'Lane Signal', 4.75),
  unused('habitat_pod', 'civic', 'station', 'Crew Habitat', 11.78),
  unused('habitat_pod_derelict', 'civic', 'work', 'Derelict Habitat', 11.78),
  unused('shuttle_dock', 'civic', 'station', 'Shuttle Cradle', 27.39),
  unused('observation_blister', 'civic', 'station', 'Observation Blister', 6.29),
  unused('comms_array', 'civic', 'station', 'Comms Array', 7.39),
  unused('solar_array', 'civic', 'station', 'Solar Array', 21.46),
  unused('utility_module', 'civic', 'station', 'Utility Module', 6.12),
  unused('passenger_platform', 'civic', 'station', 'Passenger Walk', 16.5),
  unused('salvage_clamp', 'salvage', 'work', 'Salvage Clamp', 5.6),
  unused('hull_rack', 'salvage', 'work', 'Hull Rack', 17.12),
  unused('illicit_transfer_frame', 'salvage', 'station', 'Illicit Transfer', 9.39),
  unused('pirate_sensor_mast', 'salvage', 'lane', 'Pirate Ear', 5.97),
  unused('power_skid_patched', 'salvage', 'work', 'Patched Power Skid', 8.25),
]);

export const EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID = Object.freeze({
  place_cargo_pod_standard: 'places/place_cargo_pod_standard.glb',
  place_container_rack: 'places/place_container_rack.glb',
  place_freight_platform: 'places/place_freight_platform.glb',
  place_transfer_arm: 'places/place_transfer_arm.glb',
  place_maintenance_gantry: 'places/place_maintenance_gantry.glb',
  place_worklight_tower: 'places/place_worklight_tower.glb',
  place_transponder_gate: 'places/place_transponder_gate.glb',
  place_interdiction_buoy: 'places/place_interdiction_buoy.glb',
  place_sensor_mast: 'places/place_sensor_mast.glb',
  place_drill_platform: 'places/place_drill_platform.glb',
  place_extraction_mast: 'places/place_extraction_mast.glb',
  place_conveyor_truss: 'places/place_conveyor_truss.glb',
  place_slurry_tank: 'places/place_slurry_tank.glb',
  place_radiator_bank: 'places/place_radiator_bank.glb',
  place_scrap_cage: 'places/place_scrap_cage.glb',
  place_improvised_dock: 'places/place_improvised_dock.glb',
});

export const EVERYDAY_SPACE_KIT_MODEL_BY_ID = Object.freeze(Object.fromEntries(
  EVERYDAY_SPACE_KIT_LEGAL_MODELS.map((model) => [model.id, model]),
));

export const EVERYDAY_SPACE_KIT_UNUSED_IDS = Object.freeze(
  EVERYDAY_SPACE_KIT_UNUSED_MODELS.map((model) => model.id),
);

export const EVERYDAY_SPACE_KIT_LEGAL_IDS = Object.freeze(
  EVERYDAY_SPACE_KIT_LEGAL_MODELS.map((model) => model.id),
);

export function isEverydaySpaceKitPlaceId(placeId) {
  return Object.prototype.hasOwnProperty.call(
    EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID,
    String(placeId || ''),
  );
}

export function everydaySpaceKitFileForPlaceId(placeId) {
  return EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID[String(placeId || '')] || null;
}

// Still-panel checkpoint: these two Ceres IDs and two Tethys IDs must not appear
// as live placeIds (test/unused-model-live-wire.test.mjs).
const SECTOR_SKIP_IDS = Object.freeze({
  sector_ceres_belt: Object.freeze(['place_slurry_tank', 'place_sensor_mast']),
  sector_tethys_junction: Object.freeze(['place_transponder_gate', 'place_interdiction_buoy']),
});

function allowedModels(sectorId, paletteClass) {
  const skip = new Set(SECTOR_SKIP_IDS[sectorId] || []);
  const klass = String(paletteClass || 'belt');
  return EVERYDAY_SPACE_KIT_LEGAL_MODELS.filter((model) => {
    if (skip.has(model.id)) return false;
    if (klass === 'core') return model.anchor === 'station' || model.anchor === 'lane';
    if (klass === 'belt') return model.anchor === 'work' || model.anchor === 'station';
    if (klass === 'fringe') return true;
    if (klass === 'anomaly') return model.anchor === 'work' || model.anchor === 'station';
    return true;
  });
}

function pickMany(rng, list, count) {
  const pool = list.slice();
  const out = [];
  while (pool.length && out.length < count) {
    const index = Math.floor(rng() * pool.length) % pool.length;
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

function offsetFrom(origin, angle, distance) {
  return {
    x: origin.x + Math.cos(angle) * distance,
    z: origin.z + Math.sin(angle) * distance,
  };
}

function asRow(model, pos, rot, anchor, anchorPos) {
  return Object.freeze({
    placeId: model.id,
    pos: Object.freeze({ x: pos.x, z: pos.z }),
    rot,
    name: model.label,
    radius: model.radius,
    anchor,
    anchorPos: Object.freeze({ x: anchorPos.x, z: anchorPos.z }),
    everydaySpaceKit: true,
  });
}

function finitePos(value) {
  return value
    && Number.isFinite(Number(value.x))
    && Number.isFinite(Number(value.z))
    ? { x: Number(value.x), z: Number(value.z) }
    : null;
}

/**
 * Deterministic kit dressing for one sector. `rng` must be the dedicated
 * everydaySpaceKit stream — never the world dressing/combat stream.
 */
export function everydaySpaceKitDressingForSector(sectorId, paletteClass, rng, anchors = {}) {
  const klass = String(paletteClass || 'belt');
  const cap = klass === 'core'
    ? EVERYDAY_SPACE_KIT_MAX_CORE_PER_SECTOR
    : EVERYDAY_SPACE_KIT_MAX_PER_SECTOR;
  const models = allowedModels(sectorId, klass);
  const stations = (anchors.stations || []).map((row) => finitePos(row && (row.pos || row))).filter(Boolean);
  const gates = (anchors.gates || []).map((row) => finitePos(row && (row.pos || row))).filter(Boolean);
  const fields = (anchors.fields || []).map((row) => finitePos(row && (row.center || row.pos || row))).filter(Boolean);

  const stationPool = models.filter((model) => model.anchor === 'station');
  const lanePool = models.filter((model) => model.anchor === 'lane');
  const workPool = models.filter((model) => model.anchor === 'work');

  const wanted = [];
  if (stations.length && stationPool.length) wanted.push({ kind: 'station', pool: stationPool, sites: stations, dist: () => 90 + rng() * 80 });
  if (gates.length && lanePool.length) wanted.push({ kind: 'lane', pool: lanePool, sites: gates, dist: () => 85 + rng() * 55 });
  if (fields.length && workPool.length) wanted.push({ kind: 'work', pool: workPool, sites: fields, dist: () => 190 + rng() * 90 });
  if (!wanted.length) return Object.freeze([]);

  const used = new Set();
  const rows = [];
  const perKind = Math.max(1, Math.floor(cap / wanted.length));
  for (const slot of wanted) {
    const take = Math.min(perKind, slot.pool.length, cap - rows.length);
    const chosen = pickMany(rng, slot.pool.filter((model) => !used.has(model.id)), take);
    for (let i = 0; i < chosen.length; i += 1) {
      const model = chosen[i];
      used.add(model.id);
      const site = slot.sites[i % slot.sites.length];
      const ang = rng() * Math.PI * 2;
      rows.push(asRow(model, offsetFrom(site, ang, slot.dist()), ang + Math.PI * 0.5, slot.kind, site));
    }
  }

  if (rows.length < cap) {
    const leftover = models.filter((model) => !used.has(model.id));
    const extraSites = stations[0] || gates[0] || fields[0];
    if (leftover.length && extraSites) {
      const more = pickMany(rng, leftover, cap - rows.length);
      for (let i = 0; i < more.length; i += 1) {
        const model = more[i];
        const site = (model.anchor === 'lane' && gates[0])
          || (model.anchor === 'work' && fields[0])
          || extraSites;
        const ang = rng() * Math.PI * 2;
        const dist = model.anchor === 'work' ? 210 + rng() * 70 : 100 + rng() * 70;
        rows.push(asRow(model, offsetFrom(site, ang, dist), ang, model.anchor, site));
      }
    }
  }

  return Object.freeze(rows.slice(0, cap));
}

