import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

const axisLength = Math.hypot(3966, -2530);
const axis = Object.freeze({ x: 3966 / axisLength, z: -2530 / axisLength });
const station = sectorLocalToGlobalForSector({ x: -1100, z: 620 }, 'sector_ceres_belt');

// Three real cylinders on Ceres' Helios approach. The first is the existing Ceres sling.
export const FREIGHT_SPINE = Object.freeze([320, 960, 1600].map((along, index) => Object.freeze({
  id: index === 0 ? 'sling_ring_ceres_approach' : `sling_ring_ceres_spine_${index + 1}`,
  sectorId: 'sector_ceres_belt', index, axis,
  globalPos: Object.freeze({ x: station.x + axis.x * along, z: station.z + axis.z * along }),
  throwPerp: Object.freeze({ x: -axis.z, z: axis.x }), length: 96, radius: 48,
})));

export function gateTollFor(sector) {
  return sector?.security > 0.6 ? Math.round(50 + 200 * sector.security) : 0;
}

export function spineFix(index, offset = 0) {
  const ring = FREIGHT_SPINE[index];
  return { x: ring.globalPos.x + axis.x * offset, z: ring.globalPos.z + axis.z * offset };
}
