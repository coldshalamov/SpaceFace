import { createHash } from 'node:crypto';

import { CERES_WRECK_CATHEDRAL_LOCAL_POS } from '../../src/data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../../src/data/sectorCoordinates.js';
import { SECTORS } from '../../src/data/sectors.js';

export const PQ018_COORDINATE_RESERVATION_SCHEMA =
  'spaceface.pq018-coordinate-reservation.v1';
export const PQ018_COORDINATE_ENVELOPE_RADIUS_WU = 620;
export const PQ018_LANE_HALF_WIDTH_WU = 200;

const STATION_SAFE_RADIUS_WU = 1100;
const GATE_SAFE_RADIUS_WU = 900;
const OTHER_PLACE_RADIUS_WU = 200;

export function evaluatePq018CoordinateReservation() {
  const sector = SECTORS.find((candidate) => candidate.id === 'sector_ceres_belt');
  if (!sector) {
    return {
      schema: PQ018_COORDINATE_RESERVATION_SCHEMA,
      pass: false,
      failures: ['sector_ceres_belt missing'],
    };
  }
  const center = { ...CERES_WRECK_CATHEDRAL_LOCAL_POS };
  const global = sectorLocalToGlobalForSector(center, sector.id);
  const envelopeRadius = PQ018_COORDINATE_ENVELOPE_RADIUS_WU;
  const constraints = [];
  const addCircle = (kind, id, pos, reservedRadius) => {
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
    const centerDistance = Math.hypot(center.x - pos.x, center.z - pos.z);
    constraints.push({
      kind,
      id,
      geometry: 'circle',
      centerDistance: round(centerDistance),
      reservedRadius,
      clearance: round(centerDistance - envelopeRadius - reservedRadius),
    });
  };

  for (const station of sector.stations || []) {
    addCircle(
      'station-safe-body',
      station.id,
      station.pos,
      STATION_SAFE_RADIUS_WU,
    );
  }
  for (const gate of sector.gates || []) {
    addCircle('gate-safe-body', `gate:${gate.to}`, gate.pos, GATE_SAFE_RADIUS_WU);
  }
  for (const field of sector.fields || []) {
    addCircle('asteroid-field', field.id, field.center, Number(field.clusterRadius) || 450);
  }
  for (let index = 0; index < (sector.hazards || []).length; index += 1) {
    const hazard = sector.hazards[index];
    addCircle(
      'hazard-body',
      `hazard:${index}:${hazard.type || 'unknown'}`,
      hazard.center,
      Number(hazard.radius) || 0,
    );
  }
  for (const poi of sector.pois || []) {
    if (poi.id === 'world_site_wreck_cathedral') continue;
    addCircle(
      'canonical-place',
      poi.id,
      poi.pos || poi.anchor,
      Math.max(OTHER_PLACE_RADIUS_WU, Number(poi.visualRadius) || 0),
    );
  }

  // Traffic currently runs station-to-station. Reserve that exact segment and a conservative
  // superset of possible arrival/transit corridors between every authored gate and station/gate.
  // PQ-020 may choose a smaller topology, but it cannot consume this already-reserved envelope.
  const laneNodes = [
    ...(sector.stations || []).map((station) => ({
      id: `station:${station.id}`,
      kind: 'station',
      pos: station.pos,
    })),
    ...(sector.gates || []).map((gate) => ({
      id: `gate:${gate.to}`,
      kind: 'gate',
      pos: gate.pos,
    })),
  ];
  for (let left = 0; left < laneNodes.length; left += 1) {
    for (let right = left + 1; right < laneNodes.length; right += 1) {
      const a = laneNodes[left];
      const b = laneNodes[right];
      if (a.kind === 'station' && b.kind === 'station'
          || a.kind === 'gate' || b.kind === 'gate') {
        const centerDistance = pointSegmentDistance(center, a.pos, b.pos);
        constraints.push({
          kind: a.kind === 'station' && b.kind === 'station'
            ? 'current-traffic-lane'
            : 'conservative-transit-lane',
          id: `${a.id}>${b.id}`,
          geometry: 'segment',
          centerDistance: round(centerDistance),
          reservedRadius: PQ018_LANE_HALF_WIDTH_WU,
          clearance: round(centerDistance - envelopeRadius - PQ018_LANE_HALF_WIDTH_WU),
        });
      }
    }
  }
  constraints.push({
    kind: 'sector-boundary',
    id: sector.id,
    geometry: 'disc-boundary',
    centerDistance: round(Math.hypot(center.x, center.z)),
    reservedRadius: Number(sector.worldRadius),
    clearance: round(Number(sector.worldRadius) - Math.hypot(center.x, center.z) - envelopeRadius),
  });

  constraints.sort((a, b) => a.clearance - b.clearance || a.id.localeCompare(b.id));
  const failures = constraints
    .filter((constraint) => !Number.isFinite(constraint.clearance) || constraint.clearance < 0)
    .map((constraint) => `${constraint.kind}:${constraint.id}:${constraint.clearance}`);
  const receiptCore = {
    schema: PQ018_COORDINATE_RESERVATION_SCHEMA,
    sectorId: sector.id,
    local: center,
    global,
    envelopeRadius,
    laneHalfWidth: PQ018_LANE_HALF_WIDTH_WU,
    constraints,
    minimumClearance: constraints[0]?.clearance ?? null,
    minimumConstraint: constraints[0]?.id ?? null,
    pass: failures.length === 0,
    failures,
  };
  return {
    ...receiptCore,
    receiptDigest: createHash('sha256')
      .update(JSON.stringify(receiptCore))
      .digest('hex'),
  };
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, (
      (point.x - start.x) * dx + (point.z - start.z) * dz
    ) / lengthSquared))
    : 0;
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.z - (start.z + dz * t),
  );
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
