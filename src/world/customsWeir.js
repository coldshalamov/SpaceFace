// Customs as a place, not a disc painted on the whole zone.
// Helios is a corridor across the named lane. Tethys is a cone at the checkpoint.
// Dione is a funnel whose sweep arms narrow to the toll gap. None matches the
// patrol-zone radius, and none is a copy of another.

import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';

const HELIOS_LANE_LOCAL = Object.freeze({ x: 0, z: 1900 });
const TETHYS_CHECKPOINT_LOCAL = Object.freeze({ x: -640, z: -1180 });
const DIONE_CHECKPOINT_LOCAL = Object.freeze({ x: -580, z: -980 });

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
  // The corridor's gate booths belong to Helios Station. A hull that holds under
  // the beam for a beat gets its manifest read; a hull that runs the corridor
  // fast outruns the read.
  stationId: 'station_helios',
  readDwellS: 1.6,
  readSpeed: 34,
  readText: 'CUSTOMS CORRIDOR: manifest read — transit logged.',
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
  // The cone pins a berth at the Customs Gate: a shorter hold, but only a hull
  // nearly stopped inside it can be read.
  stationId: 'station_customs',
  readDwellS: 1.1,
  readSpeed: 22,
  readText: 'CUSTOMS GATE: manifest read — transit logged.',
});

// The Dione lane bends at the checkpoint: the Tethys gate sits at (-3024, 1814) local,
// Lane Customs at (-580, -980), the exchange at (920, 280). The funnel's axis is the
// inbound bearing gate→checkpoint — the wide mouth faces arriving hulls and the arms
// close toward the booth end. Downstream the same shape points at the exchange leg.
const DIONE_AXIS = (() => {
  const dx = -580 - (-3024);
  const dz = -980 - 1814;
  const len = Math.hypot(dx, dz);
  return Object.freeze({ x: dx / len, z: dz / len });
})();

export const DIONE_CUSTOMS_WEIR = Object.freeze({
  id: 'dione_customs_weir',
  sectorId: 'sector_dione_lane',
  shape: 'funnel',
  // A trapezoid bracketing the lane through the 720-radius checkpoint zone: the
  // 460-wide mouth opens upstream and the arms narrow to a 140 toll gap beside the
  // booth. Enter the funnel at all and the booth saw you; hold slow inside and the
  // manifest reads before the gap; cross an arm fast and the transit logs unread.
  center: worldPoint('sector_dione_lane', DIONE_CHECKPOINT_LOCAL),
  axis: DIONE_AXIS,
  length: 380,
  mouthHalf: 230,
  gapHalf: 70,
  zoneRadius: 720,
  dwellS: 0.7,
  stationId: 'station_dione_customs',
  readDwellS: 1.3,
  readSpeed: 30,
  readText: 'LANE CUSTOMS: manifest read — transit logged.',
});

export const CUSTOMS_WEIRS = Object.freeze([HELIOS_CUSTOMS_WEIR, TETHYS_CUSTOMS_WEIR, DIONE_CUSTOMS_WEIR]);

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
  if (weir.shape === 'funnel') return insideFunnel(weir, point);
  return false;
}

export function customsWeirSegments(weir) {
  if (!weir) return [];
  if (weir.shape === 'corridor') return corridorSegments(weir);
  if (weir.shape === 'cone') return coneSegments(weir);
  if (weir.shape === 'funnel') return funnelSegments(weir);
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

function insideFunnel(weir, point) {
  // Trapezoid: measured from the mouth edge toward the gap. The allowed half-width
  // interpolates mouthHalf → gapHalf with depth, so a hull deep in the funnel is
  // inside only when it is actually threading the narrowing lane.
  const mx = weir.center.x - weir.axis.x * weir.length / 2;
  const mz = weir.center.z - weir.axis.z * weir.length / 2;
  const dx = point.x - mx;
  const dz = point.z - mz;
  const along = dx * weir.axis.x + dz * weir.axis.z;
  // Epsilon at the ends: a hull sitting exactly on the mouth or gap edge rides the
  // float error of the axis normalization and must still count as inside.
  if (along < -1e-6 || along > weir.length + 1e-6) return false;
  const across = dx * -weir.axis.z + dz * weir.axis.x;
  const t = Math.min(1, Math.max(0, along / weir.length));
  const half = weir.mouthHalf + (weir.gapHalf - weir.mouthHalf) * t;
  return Math.abs(across) <= half;
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

function funnelSegments(weir) {
  const ax = weir.axis;
  const px = -ax.z;
  const pz = ax.x;
  const mx = weir.center.x - ax.x * weir.length / 2;
  const mz = weir.center.z - ax.z * weir.length / 2;
  const gx = weir.center.x + ax.x * weir.length / 2;
  const gz = weir.center.z + ax.z * weir.length / 2;
  const segments = [];
  for (const side of [-1, 1]) {
    segments.push(Object.freeze({
      x0: mx + px * weir.mouthHalf * side,
      z0: mz + pz * weir.mouthHalf * side,
      x1: gx + px * weir.gapHalf * side,
      z1: gz + pz * weir.gapHalf * side,
    }));
  }
  return segments;
}
