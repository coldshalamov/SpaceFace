// scripts/lib/sectorAnchors.mjs — ONE canon table of the six PQ-153 sector heroes.
//
// LANDMARK_ROWS is shared by test/pq-153-02-landmarks.test.mjs (live-route census) and
// scripts/capture-sector-identity.mjs --anchor=landmark (frame captures), so the canon
// sector→landmark mapping lives in exactly one place. HAZARD_ROWS names each sector's authored
// physical situation for --anchor=hazard, matching the motion fingerprints in
// test/pq-153-01-hazard-geometry.test.mjs.
//
// Anchor kinds resolve LIVE in the capture's page after world.enterSector, the same way the
// census test resolves them: 'station' picks the first non-gate station, 'poi' reads
// state.world.sectorContents[sector].pois, 'worldSite' finds the entity carrying
// data.worldSiteId, 'planet' reads state.planet. 'featureEdge' anchors park on the feature's
// own staging edge — center + dir*(extent + 96), the idiom the Cinder Sluice authors for its
// own service traffic (CINDER_SLUICE_TRAFFIC_STAGING_POS).

import {
  CINDER_SLUICE_SITE_ID,
  PALLAS_REEF_FIELD,
  WEATHER_VOLUMES,
} from '../../src/data/environmentalMachinery.js';
import { PLANET_SITE } from '../../src/data/planets.js';
import { SECTORS } from '../../src/data/sectors.js';
import { sectorLocalToGlobalForSector } from '../../src/data/sectorCoordinates.js';
import { zonesForSector } from '../../src/data/sectorZones.js';

// Canon mapping: the .00 way-of-life table names each sector's landmark; the depth program
// (design/depth-program/BUILD_PLAN.md) owns which hero landmark anchors each sector.
export const LANDMARK_ROWS = Object.freeze([
  Object.freeze({
    sector: 'sector_helios_prime', kind: 'poi', id: 'poi_memorial',
    name: 'The Candle Fleet', targetRef: 'landmark_c3_candle_fleet',
  }),
  Object.freeze({
    sector: 'sector_ceres_belt', kind: 'worldSite', id: 'world_site_wreck_cathedral',
    name: 'Wreck Cathedral', targetRef: 'landmark_c1_wreck_cathedral_concord_vigilant',
    glb: 'place_landmark_wreck_cathedral',
  }),
  Object.freeze({
    sector: 'sector_tethys_junction', kind: 'planet', id: 'zone_tethys_anvil',
    name: 'The Anvil', targetRef: null,
  }),
  Object.freeze({
    sector: 'sector_vesta_forge', kind: 'poi', id: 'poi_vesta_resonant_cathedral',
    name: 'The Resonant Cathedral', targetRef: 'landmark_c13e_resonant_cathedral',
    glb: 'place_maintenance_gantry',
  }),
  Object.freeze({
    sector: 'sector_pallas_drift', kind: 'poi', id: 'poi_quiessence',
    name: 'The Quiessence', targetRef: 'landmark_c14_quiessence',
  }),
  Object.freeze({
    sector: 'sector_sker_haven', kind: 'poi', id: 'poi_sker_throne',
    name: 'The Skerris Throne', targetRef: 'landmark_c13d_skerris_throne',
    glb: 'place_dead_hulk',
  }),
]);

export const LANDMARK_BY_SECTOR = new Map(LANDMARK_ROWS.map((row) => [row.sector, row]));

/** The six PQ-153 way-of-life sectors, canon order. */
export const WAY_OF_LIFE_SIX = Object.freeze(LANDMARK_ROWS.map((row) => row.sector));

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));

const VESTA_STORM = WEATHER_VOLUMES.find((volume) => volume.id === 'vesta_storm_lane');
const ANVIL_ZONE = zonesForSector('sector_tethys_junction')
  .find((zone) => zone.id === 'zone_tethys_anvil');

// Each hazard anchor is the authored situation its sector's motion fingerprint names
// (test/pq-153-01-hazard-geometry.test.mjs nameFromMotion). `edge` anchors park on
// center + dir*(extent + 96) — the staging-edge idiom, never inside the volume. Helios
// authors no hazard (the test asserts hazards: []) and falls back to its station.
export const HAZARD_ROWS = Object.freeze([
  Object.freeze({
    sector: 'sector_helios_prime', kind: 'station',
    name: 'calm-zero-field', fallback: true,
  }),
  Object.freeze({
    sector: 'sector_ceres_belt', kind: 'worldSite', id: CINDER_SLUICE_SITE_ID,
    name: 'cone-current-sluice',
  }),
  Object.freeze({
    sector: 'sector_tethys_junction', kind: 'planet', id: 'zone_tethys_anvil',
    name: 'annular-gravity-well',
  }),
  Object.freeze({
    sector: 'sector_vesta_forge', kind: 'featureEdge', id: VESTA_STORM.id,
    name: 'sheet-storm-plus-nebula-well',
    center: VESTA_STORM.globalPos, dir: VESTA_STORM.dir, extentWU: VESTA_STORM.field.radius,
  }),
  Object.freeze({
    sector: 'sector_pallas_drift', kind: 'featureEdge', id: PALLAS_REEF_FIELD.id,
    name: 'cone-current-reef-mines',
    center: PALLAS_REEF_FIELD.center, dir: PALLAS_REEF_FIELD.dir, extentWU: PALLAS_REEF_FIELD.radius,
  }),
  Object.freeze({
    sector: 'sector_sker_haven', kind: 'featureEdge', id: 'hazard:dense_asteroid:0',
    name: 'dense-rock-plus-bounty-wrecks',
    center: skerDenseZoneCenter(), dir: { x: 0, z: -1 }, extentWU: skerDenseZone().radius,
  }),
]);

export const HAZARD_BY_SECTOR = new Map(HAZARD_ROWS.map((row) => [row.sector, row]));

function skerDenseZone() {
  const hazard = (SECTOR_BY_ID.get('sector_sker_haven').hazards || [])
    .find((row) => row.type === 'dense_asteroid');
  if (!hazard) throw new Error('sector_sker_haven lost its authored dense_asteroid hazard');
  return hazard;
}

function skerDenseZoneCenter() {
  return sectorLocalToGlobalForSector(skerDenseZone().center, 'sector_sker_haven');
}

/**
 * Planet anchor standoff: outside the pull's influence edge. Every radius inside it either
 * drags the hull mid-capture (the well is live on the real route) or sits in a heat band.
 * @returns {number} WU from the site centre.
 */
export function planetAnchorStandoffWU() {
  return PLANET_SITE.bands.influence + 96;
}

/** The Anvil's global centre, resolved from its authored zone anchor (fallback when
 *  state.planet is not yet active at capture time). */
export function anvilGlobalCenter() {
  return sectorLocalToGlobalForSector(ANVIL_ZONE.center, 'sector_tethys_junction');
}
