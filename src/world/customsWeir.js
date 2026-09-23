// Customs as a place, not a disc painted on the whole zone.
// Helios is a corridor across the named lane. Tethys is a cone at the checkpoint.
// Neither matches the patrol-zone radius, and neither is a copy of the other.

import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';

const HELIOS_LANE_LOCAL = Object.freeze({ x: 0, z: 1900 });
const TETHYS_CHECKPOINT_LOCAL = Object.freeze({ x: -640, z: -1180 });

function worldPoint(sectorId, local) {
  return Object.freeze(sectorLocalToGlobalForSector(local, sectorId));
}

export const HELIOS_CUSTOMS_WEIR = Object.freeze({
  id: 'helios_customs_weir',
  sectorId: 'sector_helios_prime',
  shape: 'corridor',
  // The named Customs Corridor zone is a 1300-radius disc. The weir is the gate
  // across that lane: 160 wide, 420 long, facing inbound.
  center: worldPoint('sector_helios_prime', HELIOS_LANE_LOCAL),
  axis: Object.freeze({ x: 0, z: 1 }),
  halfLength: 210,
  halfWidth: 80,
  zoneRadius: 1300,
  dwellS: 0.7,
});

const TETHYS_HEADING = Math.atan2(1180, 640);

export const TETHYS_CUSTOMS_WEIR = Object.freeze({
  id: 'tethys_customs_weir',
  sectorId: 'sector_tethys_junction',
  shape: 'cone',
  origin: worldPoint('sector_tethys_junction', TETHYS_CHECKPOINT_LOCAL),
  heading: TETHYS_HEADING,
  range: 280,
  halfAngle: 0.42,
  zoneRadius: 820,
  dwellS: 0.7,
});

export const CUSTOMS_WEIRS = Object.freeze([HELIOS_CUSTOMS_WEIR, TETHYS_CUSTOMS_WEIR]);

export function customsWeirForSector(sectorId) {
  for (let i = 0; i < CUSTOMS_WEIRS.length; i++) {
    if (CUSTOMS_WEIRS[i].sectorId === sectorId) return CUSTOMS_WEIRS[i];
  }
  return null;
}

export function pointInsideCustomsWeir(weir, point) {
  if (!weir || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  if (weir.shape === 'corridor') return insideCorridor(weir, point);
  if (weir.shape === 'cone') return insideCone(weir, point);
  return false;
}

export function customsWeirSegments(weir) {
  if (!weir) return [];
  if (weir.shape === 'corridor') return corridorSegments(weir);
  if (weir.shape === 'cone') return coneSegments(weir);
  return [];
}

function insideCorridor(weir, point) {
  const dx = point.x - weir.center.x;
  const dz = point.z - weir.center.z;
  const along = dx * weir.axis.x + dz * weir.axis.z;
  const across = dx * -weir.axis.z + dz * weir.axis.x;
  return Math.abs(along) <= weir.halfLength && Math.abs(across) <= weir.halfWidth;
}

function insideCone(weir, point) {
  const dx = point.x - weir.origin.x;
  const dz = point.z - weir.origin.z;
  const dist = Math.hypot(dx, dz);
  if (!(dist > 1e-6) || dist > weir.range) return false;
  const forward = (dx * Math.cos(weir.heading) + dz * Math.sin(weir.heading)) / dist;
  if (forward <= 0) return false;
  return Math.acos(Math.min(1, forward)) < weir.halfAngle;
}

function corridorSegments(weir) {
  const ax = weir.axis;
  const px = -ax.z;
  const pz = ax.x;
  const segments = [];
  for (const side of [-1, 1]) {
    const ox = weir.center.x + px * weir.halfWidth * side;
    const oz = weir.center.z + pz * weir.halfWidth * side;
    segments.push(Object.freeze({
      x0: ox - ax.x * weir.halfLength,
      z0: oz - ax.z * weir.halfLength,
      x1: ox + ax.x * weir.halfLength,
      z1: oz + ax.z * weir.halfLength,
    }));
  }
  return segments;
}

function coneSegments(weir) {
  const segments = [];
  for (const side of [-1, 1]) {
    const heading = weir.heading + side * weir.halfAngle;
    segments.push(Object.freeze({
      x0: weir.origin.x,
      z0: weir.origin.z,
      x1: weir.origin.x + Math.cos(heading) * weir.range,
      z1: weir.origin.z + Math.sin(heading) * weir.range,
    }));
  }
  return segments;
}
