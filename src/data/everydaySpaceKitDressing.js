// PQ-136.01 / PQ-136.00 — everyday-space kit ordinary-sector dressing.
//
// The incubator pack is 62 GLBs / 46 identities. Sixteen production bodies were
// already legal; the remaining thirty now have release/place bodies (PQ-136.00
// promotion). All forty-six place through the same world-dressing path: service
// and civic at stations, law at gates, mining at fields, salvage near wreck
// fields. Ceres/Tethys still-panel skips stay in force.

import { OCCUPATIONAL_PLACE_RADIUS } from './occupationalYardDressing.js';

export const EVERYDAY_SPACE_KIT_SALT = 'everydaySpaceKit';
export const EVERYDAY_SPACE_KIT_MAX_PER_SECTOR = 6;
export const EVERYDAY_SPACE_KIT_MAX_CORE_PER_SECTOR = 4;

const RELEASE_PLACES_DIR = 'assets/ships/release/parts/places';

function releasePlaceGlb(placeId) {
  return `${RELEASE_PLACES_DIR}/${placeId}.glb`;
}

function legal(id, family, anchor, label, extra = {}) {
  return Object.freeze({
    id,
    stem: id.replace(/^place_/, ''),
    family,
    anchor,
    label,
    live: true,
    file: `places/${id}.glb`,
    releaseUrl: extra.releaseUrl || releasePlaceGlb(id),
    radius: extra.radius || OCCUPATIONAL_PLACE_RADIUS[id] || 12,
  });
}

function kitRadius(longestM) {
  return Math.max(8, Math.min(36, Math.round(Number(longestM) * 0.5) || 12));
}

// Sixteen PQ-045 production identities. Release GLBs already exist and already
// appear as sourceUrl literals in the render-package manifest.
export const EVERYDAY_SPACE_KIT_ORIGINAL_MODELS = Object.freeze([
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
  legal('place_scrap_cage', 'salvage', 'wreck', 'Scrap Cage'),
  legal('place_improvised_dock', 'salvage', 'station', 'Improvised Dock'),
]);

// Complete `assets/...glb` literals so the thirty newly-legal bodies become
// runtime-referenced. The original sixteen already live in the render package.
export const EVERYDAY_SPACE_KIT_PROMOTED_RELEASE_URL_BY_ID = Object.freeze({
  place_cargo_pod_hazmat: 'assets/ships/release/parts/places/place_cargo_pod_hazmat.glb',
  place_cargo_pod_standard_breached: 'assets/ships/release/parts/places/place_cargo_pod_standard_breached.glb',
  place_ore_bulk_container: 'assets/ships/release/parts/places/place_ore_bulk_container.glb',
  place_container_rack_abandoned: 'assets/ships/release/parts/places/place_container_rack_abandoned.glb',
  place_tanker_coupling: 'assets/ships/release/parts/places/place_tanker_coupling.glb',
  place_drill_platform_cold: 'assets/ships/release/parts/places/place_drill_platform_cold.glb',
  place_crusher_module: 'assets/ships/release/parts/places/place_crusher_module.glb',
  place_ore_sorter: 'assets/ships/release/parts/places/place_ore_sorter.glb',
  place_repair_scaffold: 'assets/ships/release/parts/places/place_repair_scaffold.glb',
  place_repair_scaffold_bent: 'assets/ships/release/parts/places/place_repair_scaffold_bent.glb',
  place_construction_frame: 'assets/ships/release/parts/places/place_construction_frame.glb',
  place_welding_drone: 'assets/ships/release/parts/places/place_welding_drone.glb',
  place_parts_rack: 'assets/ships/release/parts/places/place_parts_rack.glb',
  place_power_skid: 'assets/ships/release/parts/places/place_power_skid.glb',
  place_customs_pylon: 'assets/ships/release/parts/places/place_customs_pylon.glb',
  place_inspection_platform: 'assets/ships/release/parts/places/place_inspection_platform.glb',
  place_traffic_signal: 'assets/ships/release/parts/places/place_traffic_signal.glb',
  place_habitat_pod: 'assets/ships/release/parts/places/place_habitat_pod.glb',
  place_habitat_pod_derelict: 'assets/ships/release/parts/places/place_habitat_pod_derelict.glb',
  place_shuttle_dock: 'assets/ships/release/parts/places/place_shuttle_dock.glb',
  place_observation_blister: 'assets/ships/release/parts/places/place_observation_blister.glb',
  place_comms_array: 'assets/ships/release/parts/places/place_comms_array.glb',
  place_solar_array: 'assets/ships/release/parts/places/place_solar_array.glb',
  place_utility_module: 'assets/ships/release/parts/places/place_utility_module.glb',
  place_passenger_platform: 'assets/ships/release/parts/places/place_passenger_platform.glb',
  place_salvage_clamp: 'assets/ships/release/parts/places/place_salvage_clamp.glb',
  place_hull_rack: 'assets/ships/release/parts/places/place_hull_rack.glb',
  place_illicit_transfer_frame: 'assets/ships/release/parts/places/place_illicit_transfer_frame.glb',
  place_pirate_sensor_mast: 'assets/ships/release/parts/places/place_pirate_sensor_mast.glb',
  place_power_skid_patched: 'assets/ships/release/parts/places/place_power_skid_patched.glb',
});

function promoted(id, family, anchor, label, longestM) {
  return legal(id, family, anchor, label, {
    radius: kitRadius(longestM),
    releaseUrl: EVERYDAY_SPACE_KIT_PROMOTED_RELEASE_URL_BY_ID[id],
  });
}

export const EVERYDAY_SPACE_KIT_PROMOTED_MODELS = Object.freeze([
  promoted('place_cargo_pod_hazmat', 'cargo', 'station', 'Hazmat Pod', 6.12),
  promoted('place_cargo_pod_standard_breached', 'cargo', 'work', 'Breached Pod', 6.12),
  promoted('place_ore_bulk_container', 'cargo', 'work', 'Ore Bulk Box', 10.2),
  promoted('place_container_rack_abandoned', 'cargo', 'station', 'Abandoned Rack', 14.06),
  promoted('place_tanker_coupling', 'cargo', 'station', 'Tanker Coupling', 12.2),
  promoted('place_drill_platform_cold', 'mining', 'work', 'Cold Drill', 14.6),
  promoted('place_crusher_module', 'mining', 'work', 'Jaw Crusher', 11.95),
  promoted('place_ore_sorter', 'mining', 'work', 'Ore Sorter', 9.7),
  promoted('place_repair_scaffold', 'service', 'station', 'Repair Scaffold', 7.52),
  promoted('place_repair_scaffold_bent', 'service', 'work', 'Bent Scaffold', 7.4),
  promoted('place_construction_frame', 'service', 'station', 'Keel Frame', 27.22),
  promoted('place_welding_drone', 'service', 'station', 'Welding Drone', 2.06),
  promoted('place_parts_rack', 'service', 'station', 'Parts Rack', 8.62),
  promoted('place_power_skid', 'service', 'work', 'Power Skid', 8.25),
  promoted('place_customs_pylon', 'law', 'lane', 'Customs Pylon', 3.4),
  promoted('place_inspection_platform', 'law', 'lane', 'Inspection Dock', 20.4),
  promoted('place_traffic_signal', 'law', 'lane', 'Lane Signal', 4.75),
  promoted('place_habitat_pod', 'civic', 'station', 'Crew Habitat', 11.78),
  promoted('place_habitat_pod_derelict', 'civic', 'work', 'Derelict Habitat', 11.78),
  promoted('place_shuttle_dock', 'civic', 'station', 'Shuttle Cradle', 27.39),
  promoted('place_observation_blister', 'civic', 'station', 'Observation Blister', 6.29),
  promoted('place_comms_array', 'civic', 'station', 'Comms Array', 7.39),
  promoted('place_solar_array', 'civic', 'station', 'Solar Array', 21.46),
  promoted('place_utility_module', 'civic', 'station', 'Utility Module', 6.12),
  promoted('place_passenger_platform', 'civic', 'station', 'Passenger Walk', 16.5),
  promoted('place_salvage_clamp', 'salvage', 'wreck', 'Salvage Clamp', 5.6),
  promoted('place_hull_rack', 'salvage', 'wreck', 'Hull Rack', 17.12),
  promoted('place_illicit_transfer_frame', 'salvage', 'station', 'Illicit Transfer', 9.39),
  promoted('place_pirate_sensor_mast', 'salvage', 'lane', 'Pirate Ear', 5.97),
  promoted('place_power_skid_patched', 'salvage', 'wreck', 'Patched Power Skid', 8.25),
]);

export const EVERYDAY_SPACE_KIT_LEGAL_MODELS = Object.freeze([
  ...EVERYDAY_SPACE_KIT_ORIGINAL_MODELS,
  ...EVERYDAY_SPACE_KIT_PROMOTED_MODELS,
]);

export const EVERYDAY_SPACE_KIT_UNUSED_MODELS = Object.freeze([]);

export const EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID = Object.freeze(Object.fromEntries(
  EVERYDAY_SPACE_KIT_LEGAL_MODELS.map((model) => [model.id, model.file]),
));

export const EVERYDAY_SPACE_KIT_MODEL_BY_ID = Object.freeze(Object.fromEntries(
  EVERYDAY_SPACE_KIT_LEGAL_MODELS.map((model) => [model.id, model]),
));

export const EVERYDAY_SPACE_KIT_UNUSED_IDS = Object.freeze(
  EVERYDAY_SPACE_KIT_UNUSED_MODELS.map((model) => model.id),
);

export const EVERYDAY_SPACE_KIT_LEGAL_IDS = Object.freeze(
  EVERYDAY_SPACE_KIT_LEGAL_MODELS.map((model) => model.id),
);

export const EVERYDAY_SPACE_KIT_PROMOTED_IDS = Object.freeze(
  EVERYDAY_SPACE_KIT_PROMOTED_MODELS.map((model) => model.id),
);

export const EVERYDAY_SPACE_KIT_ORIGINAL_IDS = Object.freeze(
  EVERYDAY_SPACE_KIT_ORIGINAL_MODELS.map((model) => model.id),
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
    if (klass === 'core') {
      return model.anchor === 'station' || model.anchor === 'lane' || model.anchor === 'wreck';
    }
    if (klass === 'belt') {
      return model.anchor === 'work' || model.anchor === 'station' || model.anchor === 'wreck';
    }
    if (klass === 'fringe') return true;
    if (klass === 'anomaly') {
      return model.anchor === 'work' || model.anchor === 'station' || model.anchor === 'wreck';
    }
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
  const wrecks = (anchors.wrecks || [])
    .filter((row) => {
      const id = String((row && (row.poiId || row.id)) || '');
      return !/lane_pin|tally|claim_mark|locker|ash_pin|whistle/.test(id);
    })
    .map((row) => finitePos(row && (row.pos || row)))
    .filter(Boolean);

  const stationPool = models.filter((model) => model.anchor === 'station');
  const lanePool = models.filter((model) => model.anchor === 'lane');
  const workPool = models.filter((model) => model.anchor === 'work');
  const wreckPool = models.filter((model) => model.anchor === 'wreck');

  const wanted = [];
  if (stations.length && stationPool.length) wanted.push({ kind: 'station', pool: stationPool, sites: stations, dist: () => 90 + rng() * 80 });
  if (gates.length && lanePool.length) wanted.push({ kind: 'lane', pool: lanePool, sites: gates, dist: () => 85 + rng() * 55 });
  if (fields.length && workPool.length) wanted.push({ kind: 'work', pool: workPool, sites: fields, dist: () => 190 + rng() * 90 });
  if (wrecks.length && wreckPool.length) wanted.push({ kind: 'wreck', pool: wreckPool, sites: wrecks, dist: () => 70 + rng() * 80 });
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
    const extraSites = stations[0] || gates[0] || fields[0] || wrecks[0];
    if (leftover.length && extraSites) {
      const more = pickMany(rng, leftover, cap - rows.length);
      for (let i = 0; i < more.length; i += 1) {
        const model = more[i];
        const site = (model.anchor === 'lane' && gates[0])
          || (model.anchor === 'work' && fields[0])
          || (model.anchor === 'wreck' && wrecks[0])
          || extraSites;
        const ang = rng() * Math.PI * 2;
        const dist = model.anchor === 'work' ? 210 + rng() * 70
          : (model.anchor === 'wreck' ? 90 + rng() * 70 : 100 + rng() * 70);
        rows.push(asRow(model, offsetFrom(site, ang, dist), ang, model.anchor, site));
      }
    }
  }

  return Object.freeze(rows.slice(0, cap));
}

