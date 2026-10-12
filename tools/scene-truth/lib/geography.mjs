import { SECTORS } from '../../../src/data/sectors.js';
import { ASTEROIDS } from '../../../src/data/mining.js';
import { CERES_WRECK_CATHEDRAL_LOCAL_POS } from '../../../src/data/sectorAnchors.js';
import { modelTruthFlightTolerance, modelTruthPlanarRadius } from '../../../src/data/modelTruth.js';
import { SHIPS } from '../../../src/data/ships.js';

/**
 * Collider radii copied from the live world spawner
 * (src/systems/world.js station loop and DRESSING_RADIUS).
 * tools/scene-truth/test/inventory.test.mjs locks the numbers to that source.
 */
export const STATION_SIZE = Object.freeze({
  L: Object.freeze({ dockRadius: 90, collisionRadius: 42 }),
  M: Object.freeze({ dockRadius: 72, collisionRadius: 34 }),
  S: Object.freeze({ dockRadius: 60, collisionRadius: 26 }),
});

export const GATE_COLLIDER = Object.freeze({ dockRadius: 70, collisionRadius: 32 });

export const PLACE_COLLIDER = Object.freeze({
  place_lane_beacon: 18,
  place_nav_buoy: 12,
  place_mining_drone: 8,
  place_station_billboard: 28,
  place_conveyor_barge: 48,
  place_dead_hulk: 42,
  place_debris_chunk: 26,
  place_ceres_bait_wreck: 48,
  place_ceres_grave_shard: 28,
  place_asteroid_seamed: 18,
  place_asteroid_rock_a: 15,
  place_asteroid_rock_b: 18,
  place_asteroid_rock_c: 10,
  place_asteroid_graffiti: 16,
});

const AST_BY_ID = new Map(ASTEROIDS.map((row) => [row.id, row]));
const KESTREL_R = SHIPS.find((ship) => ship.id === 'ship_kestrel').collisionRadius;

export function sectorById(sectorId) {
  const sector = SECTORS.find((row) => row.id === sectorId);
  if (!sector) throw new Error(`scene-truth: missing sector ${sectorId}`);
  return sector;
}

export function stationRecord(sectorId, stationId) {
  const station = (sectorById(sectorId).stations || []).find((row) => row.id === stationId);
  if (!station || !station.pos || !Number.isFinite(station.pos.x)) {
    throw new Error(`scene-truth: ${stationId} has no authored position`);
  }
  return station;
}

export function poiRecord(sectorId, poiId) {
  const poi = (sectorById(sectorId).pois || []).find((row) => row.id === poiId);
  if (!poi || !poi.pos || !Number.isFinite(poi.pos.x)) {
    throw new Error(`scene-truth: ${poiId} has no authored position`);
  }
  return poi;
}

export function fieldRecord(sectorId, fieldId) {
  const field = (sectorById(sectorId).fields || []).find((row) => row.id === fieldId);
  if (!field || !field.center) throw new Error(`scene-truth: ${fieldId} has no authored center`);
  return field;
}

export function gateRecord(sectorId, toSectorId) {
  const gate = (sectorById(sectorId).gates || []).find((row) => row.to === toSectorId);
  if (!gate || !gate.pos) throw new Error(`scene-truth: gate ${sectorId} -> ${toSectorId} missing`);
  return gate;
}

export function stationSizeOf(station) {
  const size = station && station.size;
  if (size && STATION_SIZE[size]) return STATION_SIZE[size];
  return STATION_SIZE.M;
}

export function placeKeepOut(placeId, colliderRadius, extra = {}) {
  const entity = {
    type: extra.type || 'prop',
    radius: colliderRadius,
    pos: { x: 0, z: 0 },
    rot: 0,
    alive: true,
    data: {
      placeId,
      archetypeGlb: placeId,
      dockRadius: extra.dockRadius,
      isGate: extra.isGate === true,
      stationTypeId: extra.stationTypeId || null,
    },
  };
  const planar = modelTruthPlanarRadius(entity);
  const tolerance = modelTruthFlightTolerance(entity);
  const keep = Math.max(
    Number.isFinite(planar) ? planar : 0,
    Number.isFinite(colliderRadius) ? colliderRadius : 0,
    Number(extra.dockRadius) || 0,
  );
  const stick = Number.isFinite(tolerance) ? tolerance : 2;
  return { keep, tolerance: stick, standOff: keep + KESTREL_R + stick + 20 };
}

export function offsetFrom(pos, standOff) {
  return { x: round3(pos.x + standOff), z: round3(pos.z) };
}

export function asteroidPlaceForField(field) {
  const def = AST_BY_ID.get(field && field.type);
  return (def && def.authoredPlaceId) || 'place_asteroid_seamed';
}

export function asteroidSizeRange(field) {
  const def = AST_BY_ID.get(field && field.type);
  return (def && def.sizeRange) || [6, 14];
}

export const WRECK_CATHEDRAL_POS = CERES_WRECK_CATHEDRAL_LOCAL_POS;

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
