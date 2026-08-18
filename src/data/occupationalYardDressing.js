// Occupational yard dressing — packaged everyday-space props kept on disk.
// A 2026-08-18 still panel left blocking toy / open-cage / LEGO notes, so
// the sixteen yard IDs stay out of PLACE_FILES and world.js does not spawn them.
// Lane furniture: only the corridor pin and cold locker cleared every reviewer.
// Tally, claim, ash, and whistle stay on disk (release included) until a panel
// leaves no blocking LEGO-foot note. Authored Ceres offsets stay unwired.

export const LANE_FURNITURE_PLACE_IDS = Object.freeze([
  'place_lane_pin',
  'place_tally_post',
  'place_claim_mark',
  'place_cold_locker',
  'place_ash_pin',
  'place_whistle',
]);

export const ADMITTED_LANE_FURNITURE_PLACE_IDS = Object.freeze([
  'place_lane_pin',
  'place_cold_locker',
]);

export const CHECKPOINTED_LANE_FURNITURE_PLACE_IDS = Object.freeze(
  LANE_FURNITURE_PLACE_IDS.filter((id) => !ADMITTED_LANE_FURNITURE_PLACE_IDS.includes(id)),
);

export const OCCUPATIONAL_YARD_PLACE_IDS = Object.freeze([
  'place_cargo_pod_standard',
  'place_container_rack',
  'place_conveyor_truss',
  'place_drill_platform',
  'place_extraction_mast',
  'place_freight_platform',
  'place_improvised_dock',
  'place_interdiction_buoy',
  'place_maintenance_gantry',
  'place_radiator_bank',
  'place_scrap_cage',
  'place_sensor_mast',
  'place_slurry_tank',
  'place_transfer_arm',
  'place_transponder_gate',
  'place_worklight_tower',
]);

export const ADMITTED_UNUSED_PLACE_IDS = Object.freeze([
  ...ADMITTED_LANE_FURNITURE_PLACE_IDS,
]);

/** Visual radii for world dressing / POI markers. Sized from the production envelopes. */
export const OCCUPATIONAL_PLACE_RADIUS = Object.freeze({
  place_lane_pin: 6,
  place_tally_post: 8,
  place_claim_mark: 5,
  place_cold_locker: 10,
  place_ash_pin: 6,
  place_whistle: 6,
  place_cargo_pod_standard: 10,
  place_container_rack: 16,
  place_conveyor_truss: 20,
  place_drill_platform: 22,
  place_extraction_mast: 18,
  place_freight_platform: 28,
  place_improvised_dock: 20,
  place_interdiction_buoy: 12,
  place_maintenance_gantry: 18,
  place_radiator_bank: 16,
  place_scrap_cage: 16,
  place_sensor_mast: 14,
  place_slurry_tank: 20,
  place_transfer_arm: 16,
  place_transponder_gate: 18,
  place_worklight_tower: 12,
});

function prop(placeId, x, z, rot, name) {
  return Object.freeze({
    placeId,
    localPos: Object.freeze({ x, z }),
    rot,
    name,
    radius: OCCUPATIONAL_PLACE_RADIUS[placeId] || 12,
  });
}

/**
 * Ceres yard only. Named worksites around the refinery, working seam, and cathedral
 * so the sixteen production props read as trades, not a dump in every belt.
 */
export const OCCUPATIONAL_YARD_BY_SECTOR = Object.freeze({
  sector_ceres_belt: Object.freeze([
    // Refinery apron — slurry, freight, transfer, heat, lamps, pods.
    prop('place_slurry_tank', -1184, 548, 0.35, 'Refinery Slurry Bank'),
    prop('place_freight_platform', -1012, 688, -0.9, 'Refinery Freight Apron'),
    prop('place_transfer_arm', -1072, 576, 1.15, 'Refinery Transfer Arm'),
    prop('place_radiator_bank', -1236, 652, 0.2, 'Refinery Heat Bank'),
    prop('place_worklight_tower', -1148, 708, 0.6, 'Yard Worklight'),
    prop('place_cargo_pod_standard', -1056, 528, 0.1, 'Staged Ore Pod'),
    prop('place_container_rack', -980, 604, -0.4, 'Empty Plate Rack'),
    prop('place_maintenance_gantry', -1165, 555, 0.25, 'Tender Service Gantry'),
    // Working seam — extraction plant on the first belt field.
    prop('place_extraction_mast', 458, -688, 0.8, 'Seam Extraction Mast'),
    prop('place_drill_platform', 470, -700, -1.2, 'Claim Drill Platform'),
    prop('place_conveyor_truss', 492, -710, 0.45, 'Ore Conveyor Truss'),
    // Abandoned Driller — crooked salvage, keep the live hulk as the noun.
    prop('place_scrap_cage', 258, -1168, 0.3, 'Driller Scrap Cage'),
    prop('place_improvised_dock', 224, -1196, -0.38, 'Stolen Berth'),
  ]),
});

export function occupationalYardDressingForSector(sectorId) {
  const rows = OCCUPATIONAL_YARD_BY_SECTOR[sectorId];
  return rows || Object.freeze([]);
}
