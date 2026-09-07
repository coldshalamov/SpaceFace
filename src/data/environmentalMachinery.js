// PQ-027 / SF-22 — the one authored environmental machinery/current slice.
//
// The Cinder Sluice is deliberately data-small: one persistent World Site record owns its
// operations, while this module derives the transient current phase from that durable record and
// the saved simulation clock. No timer, random source, or visit-local state can reset the cycle.

import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

export const CINDER_SLUICE_SITE_ID = 'world_site_ceres_cinder_sluice';
export const CINDER_SLUICE_SECTOR_ID = 'sector_ceres_belt';
export const CINDER_SLUICE_OPERATIONS = Object.freeze({
  regulate: 'repair_phase_regulator',
  release: 'cut_ballast_clamp',
  settle: 'settle_sluice_ballast',
});

export const CINDER_SLUICE_LOCAL_POS = Object.freeze({ x: 1950, z: -1250 });
export const CINDER_SLUICE_GLOBAL_POS = Object.freeze(
  sectorLocalToGlobalForSector(CINDER_SLUICE_LOCAL_POS, CINDER_SLUICE_SECTOR_ID),
);

// The machine faces back into the belt, while its current exhausts toward the Helios arrival side.
// The root is the apex: cutting the ballast ejects it downstream, so returning it to the receiver
// requires reading the warning/calm cycle instead of holding the site beam at a safe boundary.
const ROT = Math.PI - 0.18;
const ROOT_FORWARD = Object.freeze({ x: Math.cos(ROT), z: Math.sin(ROT) });
const DIR = Object.freeze({ x: -ROOT_FORWARD.x, z: -ROOT_FORWARD.z });

export const CINDER_SLUICE_PLACEMENT = Object.freeze({
  coordinateSpace: 'global_v1',
  pos: CINDER_SLUICE_GLOBAL_POS,
  rot: ROT,
});

export const CINDER_SLUICE_FIELD = Object.freeze({
  id: 'environment_ceres_cinder_sluice_current',
  kind: 'cone',
  center: CINDER_SLUICE_GLOBAL_POS,
  dir: DIR,
  radius: 620,
  strength: 150,
  falloff: 1.15,
  halfAngleRad: 0.32,
  edgeSoftRad: 0.12,
  sourceId: CINDER_SLUICE_SITE_ID,
  team: null,
});

// Service traffic approaches from the current's downstream side and waits here until the field is
// calm. The point sits beyond the soft cone boundary, so the same physical law that moves the
// player and ballast cannot shove a waiting hauler while it demonstrates the safe approach.
export const CINDER_SLUICE_TRAFFIC_STAGING_POS = Object.freeze({
  x: CINDER_SLUICE_FIELD.center.x + CINDER_SLUICE_FIELD.dir.x * (CINDER_SLUICE_FIELD.radius + 96),
  z: CINDER_SLUICE_FIELD.center.z + CINDER_SLUICE_FIELD.dir.z * (CINDER_SLUICE_FIELD.radius + 96),
});

const UNREGULATED_CYCLE = Object.freeze({ warningS: 2, surgeS: 7, calmS: 3 });
const REGULATED_CYCLE = Object.freeze({ warningS: 3, surgeS: 5, calmS: 7 });

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function operationTimeS(record, operationId, fallback) {
  const completed = record && record.completedOperations && record.completedOperations[operationId];
  if (!completed) return fallback;
  if (Number.isFinite(completed.earnedAtS)) return Math.max(0, completed.earnedAtS);
  return Math.max(0, finite(completed.tick) / 60);
}

function positiveModulo(value, modulus) {
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

/**
 * Derive the current's exact state from durable operation receipts plus saved simulation time.
 * Repair starts a fresh, longer warning window; ballast settlement permanently removes the field.
 */
export function cinderSluicePhase(record, simTime, out = null) {
  const result = out || {};
  const completed = record && record.completedOperations || {};
  const regulated = !!completed[CINDER_SLUICE_OPERATIONS.regulate];
  const createdS = Math.max(0, finite(record && record.createdTick) / 60);
  const anchorS = regulated
    ? operationTimeS(record, CINDER_SLUICE_OPERATIONS.regulate, createdS)
    : createdS;

  if (completed[CINDER_SLUICE_OPERATIONS.settle]) {
    result.phase = 'quiet';
    result.regulated = true;
    result.fieldActive = false;
    result.fieldStrength = 0;
    result.anchorS = anchorS;
    result.cycleS = 0;
    result.elapsedS = 0;
    result.remainingS = Infinity;
    return result;
  }

  const cycle = regulated ? REGULATED_CYCLE : UNREGULATED_CYCLE;
  const cycleS = cycle.warningS + cycle.surgeS + cycle.calmS;
  const elapsedS = positiveModulo(finite(simTime) - anchorS, cycleS);
  let phase;
  let remainingS;
  if (elapsedS < cycle.warningS) {
    phase = 'warning';
    remainingS = cycle.warningS - elapsedS;
  } else if (elapsedS < cycle.warningS + cycle.surgeS) {
    phase = 'surge';
    remainingS = cycle.warningS + cycle.surgeS - elapsedS;
  } else {
    phase = 'calm';
    remainingS = cycleS - elapsedS;
  }
  result.phase = phase;
  result.regulated = regulated;
  result.fieldActive = phase !== 'calm';
  result.fieldStrength = phase === 'surge' ? CINDER_SLUICE_FIELD.strength : 0;
  result.anchorS = anchorS;
  result.cycleS = cycleS;
  result.elapsedS = elapsedS;
  result.remainingS = remainingS;
  return result;
}

/** Geometry predicate shared by the warning/hazard boundary and the authored Cone field. */
export function pointInsideCinderSluice(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const dx = point.x - CINDER_SLUICE_FIELD.center.x;
  const dz = point.z - CINDER_SLUICE_FIELD.center.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= CINDER_SLUICE_FIELD.radius) return false;
  if (distance < 1e-6) return true;
  const forward = (dx * CINDER_SLUICE_FIELD.dir.x + dz * CINDER_SLUICE_FIELD.dir.z) / distance;
  if (forward <= 0) return false;
  const angle = Math.acos(Math.max(-1, Math.min(1, forward)));
  return angle < CINDER_SLUICE_FIELD.halfAngleRad + CINDER_SLUICE_FIELD.edgeSoftRad;
}

export const CINDER_SLUICE_CYCLES = Object.freeze({
  unregulated: UNREGULATED_CYCLE,
  regulated: REGULATED_CYCLE,
});

// PQ-027.00 — three Ceres machines that kill by moving mass into an anvil, then letting
// PQ-137.06's terrain crumple law finish the hull. Warning is geometry with no force; surge is
// the bite; calm is the safe window. None of these is a damage aura.
export const KILL_MACHINE_SECTOR_ID = CINDER_SLUICE_SECTOR_ID;
const KILL_MACHINE_CYCLE = Object.freeze({ warningS: 2, surgeS: 3.5, calmS: 6.5 });

function freezeVec(x, z) {
  return Object.freeze({ x, z });
}

function buildKillMachine({
  id, hazardType, placeId, localPos, rot, phaseOffsetS, anvil, fields, hazardRadius,
}) {
  const dir = freezeVec(Math.cos(rot), Math.sin(rot));
  const perp = freezeVec(-dir.z, dir.x);
  const globalPos = Object.freeze(sectorLocalToGlobalForSector(localPos, KILL_MACHINE_SECTOR_ID));
  const anvilAlong = finite(anvil.along);
  const anvilAcross = finite(anvil.across);
  return Object.freeze({
    id,
    hazardType,
    placeId,
    sectorId: KILL_MACHINE_SECTOR_ID,
    localPos: Object.freeze({ x: localPos.x, z: localPos.z }),
    globalPos,
    rot,
    dir,
    perp,
    phaseOffsetS: finite(phaseOffsetS),
    cycle: KILL_MACHINE_CYCLE,
    hazardRadius: positive(hazardRadius, 90),
    anvil: Object.freeze({
      id: `${id}_anvil`,
      pos: freezeVec(
        globalPos.x + dir.x * anvilAlong + perp.x * anvilAcross,
        globalPos.z + dir.z * anvilAlong + perp.z * anvilAcross,
      ),
      radius: positive(anvil.radius, 22),
      mass: positive(anvil.mass, 8000),
    }),
    fields: Object.freeze((fields || []).map((field) => Object.freeze({
      id: `environment_ceres_${id}_${field.idSuffix}`,
      kind: field.kind,
      radius: positive(field.radius, 90),
      strength: Math.max(0, finite(field.strength, 0)),
      falloff: positive(field.falloff, 1.1),
      halfAngleRad: positive(field.halfAngleRad, 0.35),
      edgeSoftRad: Math.max(0, finite(field.edgeSoftRad, 0.12)),
      halfWidth: positive(field.halfWidth, 32),
      along: finite(field.along),
      across: finite(field.across),
      dirAlong: field.dirAlong == null ? 1 : field.dirAlong,
    }))),
  });
}

export const KILL_MACHINES = Object.freeze([
  buildKillMachine({
    id: 'excavator_jaws',
    hazardType: 'debris',
    placeId: 'place_crusher_module',
    localPos: { x: 470, z: -700 },
    rot: 0,
    phaseOffsetS: 0,
    hazardRadius: 110,
    anvil: { radius: 22, mass: 9000, along: 12, across: 0 },
    fields: [{
      idSuffix: 'sheet',
      kind: 'sheet',
      strength: 820,
      radius: 108,
      halfWidth: 76,
      falloff: 1.05,
      along: 0,
      across: 0,
      dirAlong: 1,
    }],
  }),
  buildKillMachine({
    id: 'furnace_mouth',
    hazardType: 'debris',
    placeId: 'place_radiator_bank',
    localPos: { x: -1236, z: 652 },
    rot: Math.PI * 0.15,
    phaseOffsetS: 4,
    hazardRadius: 96,
    anvil: { radius: 24, mass: 11000, along: 88, across: 0 },
    fields: [{
      idSuffix: 'intake',
      kind: 'cone',
      strength: 720,
      radius: 100,
      halfAngleRad: 0.52,
      edgeSoftRad: 0.12,
      falloff: 1.08,
      along: -18,
      across: 0,
      dirAlong: 1,
    }],
  }),
  buildKillMachine({
    id: 'mass_driver_breech',
    hazardType: 'debris_current',
    placeId: 'place_extraction_mast',
    localPos: { x: 900, z: -1100 },
    rot: -0.62,
    phaseOffsetS: 8,
    hazardRadius: 150,
    anvil: { radius: 26, mass: 12000, along: 108, across: 0 },
    fields: [{
      idSuffix: 'barrel',
      kind: 'cone',
      strength: 720,
      radius: 132,
      halfAngleRad: 0.26,
      edgeSoftRad: 0.1,
      falloff: 1.05,
      along: 0,
      across: 0,
      dirAlong: 1,
    }],
  }),
]);

export const KILL_MACHINE_BY_ID = Object.freeze(Object.fromEntries(
  KILL_MACHINES.map((machine) => [machine.id, machine]),
));

export function killMachineFieldCenter(machine, field) {
  if (!machine || !field) return freezeVec(0, 0);
  return freezeVec(
    machine.globalPos.x + machine.dir.x * field.along + machine.perp.x * field.across,
    machine.globalPos.z + machine.dir.z * field.along + machine.perp.z * field.across,
  );
}

export function killMachineFieldDir(machine, field) {
  if (!machine || !field) return freezeVec(1, 0);
  const sign = field.dirAlong < 0 ? -1 : 1;
  return freezeVec(machine.dir.x * sign, machine.dir.z * sign);
}

/**
 * Derive warning / surge / calm from saved sim time plus an authored phase offset.
 * Warning registers the volume at strength 0; only surge writes force.
 */
export function killMachinePhase(machine, simTime, out = null) {
  const result = out || {};
  const cycle = machine && machine.cycle || KILL_MACHINE_CYCLE;
  const cycleS = cycle.warningS + cycle.surgeS + cycle.calmS;
  const elapsedS = positiveModulo(finite(simTime) - finite(machine && machine.phaseOffsetS), cycleS);
  let phase;
  let remainingS;
  if (elapsedS < cycle.warningS) {
    phase = 'warning';
    remainingS = cycle.warningS - elapsedS;
  } else if (elapsedS < cycle.warningS + cycle.surgeS) {
    phase = 'surge';
    remainingS = cycle.warningS + cycle.surgeS - elapsedS;
  } else {
    phase = 'calm';
    remainingS = cycleS - elapsedS;
  }
  result.phase = phase;
  result.fieldActive = phase !== 'calm';
  result.fieldStrengthScale = phase === 'surge' ? 1 : 0;
  result.cycleS = cycleS;
  result.elapsedS = elapsedS;
  result.remainingS = remainingS;
  return result;
}

export function pointInsideMachineField(machine, field, point) {
  if (!machine || !field || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
    return false;
  }
  const center = killMachineFieldCenter(machine, field);
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  if (field.kind === 'sheet') {
    const dir = killMachineFieldDir(machine, field);
    const along = dx * dir.x + dz * dir.z;
    if (along < 0 || along >= field.radius) return false;
    const lat = Math.hypot(dx - dir.x * along, dz - dir.z * along);
    return lat <= field.halfWidth;
  }
  const distance = Math.hypot(dx, dz);
  if (distance >= field.radius) return false;
  if (field.kind !== 'cone') return true;
  if (distance < 1e-6) return true;
  const dir = killMachineFieldDir(machine, field);
  const forward = (dx * dir.x + dz * dir.z) / distance;
  if (forward <= 0) return false;
  const angle = Math.acos(Math.max(-1, Math.min(1, forward)));
  return angle < field.halfAngleRad + field.edgeSoftRad;
}

export function pointInsideKillMachine(machine, point) {
  if (!machine) return false;
  for (const field of machine.fields) {
    if (pointInsideMachineField(machine, field, point)) return true;
  }
  return false;
}

export function killMachineHazardZones() {
  return KILL_MACHINES.map((machine) => Object.freeze({
    id: machine.id,
    type: machine.hazardType,
    center: machine.localPos,
    radius: machine.hazardRadius,
    intensity: 0.7,
  }));
}

// PQ-027.01 — Pallas Drift debris reef. An authored cone carries loose mass; a line of
// dynamic reef mines/pods ride it. One body slammed through the string pinballs the rest.
export const PALLAS_REEF_SECTOR_ID = 'sector_pallas_drift';
export const PALLAS_REEF_SITE_ID = 'pallas_debris_reef';
export const PALLAS_REEF_LOCAL_POS = Object.freeze({ x: -320, z: -620 });
export const PALLAS_REEF_ROT = 0.38;
export const PALLAS_REEF_GLOBAL_POS = Object.freeze(
  sectorLocalToGlobalForSector(PALLAS_REEF_LOCAL_POS, PALLAS_REEF_SECTOR_ID),
);
const PALLAS_REEF_DIR = freezeVec(Math.cos(PALLAS_REEF_ROT), Math.sin(PALLAS_REEF_ROT));
const PALLAS_REEF_CYCLE = Object.freeze({ warningS: 2, surgeS: 8, calmS: 4 });

export const PALLAS_REEF_FIELD = Object.freeze({
  id: 'environment_pallas_debris_reef_current',
  kind: 'cone',
  center: PALLAS_REEF_GLOBAL_POS,
  dir: PALLAS_REEF_DIR,
  radius: 420,
  strength: 340,
  falloff: 1.12,
  halfAngleRad: 0.42,
  edgeSoftRad: 0.12,
  sourceId: PALLAS_REEF_SITE_ID,
  team: null,
});

// Tight string: along-gap is just over two radii so the upstream body riding the
// stronger near-apex current actually strikes the next instead of sliding past.
export const PALLAS_REEF_MINE_BODY = Object.freeze({
  radius: 16,
  mass: 8,
});

export const PALLAS_REEF_MINES = Object.freeze([
  Object.freeze({ along: 72, across: -4 }),
  Object.freeze({ along: 108, across: 5 }),
  Object.freeze({ along: 144, across: -5 }),
  Object.freeze({ along: 180, across: 4 }),
  Object.freeze({ along: 216, across: -3 }),
]);

export function pallasReefPhase(simTime, out = null) {
  const result = out || {};
  const cycleS = PALLAS_REEF_CYCLE.warningS + PALLAS_REEF_CYCLE.surgeS + PALLAS_REEF_CYCLE.calmS;
  const elapsedS = positiveModulo(finite(simTime), cycleS);
  let phase;
  let remainingS;
  if (elapsedS < PALLAS_REEF_CYCLE.warningS) {
    phase = 'warning';
    remainingS = PALLAS_REEF_CYCLE.warningS - elapsedS;
  } else if (elapsedS < PALLAS_REEF_CYCLE.warningS + PALLAS_REEF_CYCLE.surgeS) {
    phase = 'surge';
    remainingS = PALLAS_REEF_CYCLE.warningS + PALLAS_REEF_CYCLE.surgeS - elapsedS;
  } else {
    phase = 'calm';
    remainingS = cycleS - elapsedS;
  }
  result.phase = phase;
  result.fieldActive = phase !== 'calm';
  result.fieldStrength = phase === 'surge' ? PALLAS_REEF_FIELD.strength : 0;
  result.cycleS = cycleS;
  result.elapsedS = elapsedS;
  result.remainingS = remainingS;
  return result;
}

export function pallasReefMinePos(slot) {
  return freezeVec(
    PALLAS_REEF_GLOBAL_POS.x + PALLAS_REEF_DIR.x * slot.along - PALLAS_REEF_DIR.z * slot.across,
    PALLAS_REEF_GLOBAL_POS.z + PALLAS_REEF_DIR.z * slot.along + PALLAS_REEF_DIR.x * slot.across,
  );
}

export function pallasReefMineId(index) {
  return `pallas_reef_mine_${index}`;
}

export function pallasReefHazardZone() {
  return Object.freeze({
    id: PALLAS_REEF_SITE_ID,
    type: 'debris_current',
    center: PALLAS_REEF_LOCAL_POS,
    radius: PALLAS_REEF_FIELD.radius,
    intensity: 0.55,
  });
}

export function pointInsidePallasReef(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const dx = point.x - PALLAS_REEF_FIELD.center.x;
  const dz = point.z - PALLAS_REEF_FIELD.center.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= PALLAS_REEF_FIELD.radius) return false;
  if (distance < 1e-6) return true;
  const forward = (dx * PALLAS_REEF_FIELD.dir.x + dz * PALLAS_REEF_FIELD.dir.z) / distance;
  if (forward <= 0) return false;
  const angle = Math.acos(Math.max(-1, Math.min(1, forward)));
  return angle < PALLAS_REEF_FIELD.halfAngleRad + PALLAS_REEF_FIELD.edgeSoftRad;
}

export const PALLAS_REEF_CYCLE_S = PALLAS_REEF_CYCLE;

// PQ-027.02 — weather that shapes fights. One storm sheet and one radiation belt in each
// affected sector. Both MOVE MASS through the field kernel (shots bend, hulls drift, a stacked
// well reads louder). The belt also shrinks world POI scan. Neither is a hull-drain aura;
// `radiation` zone type is forbidden here because world.js would chew hull.
export const VEIL_WEATHER_SECTOR_ID = 'sector_veil_nebula';
export const VESTA_WEATHER_SECTOR_ID = 'sector_vesta_forge';
const WEATHER_CYCLE = Object.freeze({ warningS: 2, surgeS: 6, calmS: 4 });
export const WEATHER_SCAN_SCALE_INSIDE = 0.4;

function buildWeatherVolume({
  id, role, sectorId, hazardType, localPos, rot, scanScale, field,
}) {
  const dir = freezeVec(Math.cos(finite(rot)), Math.sin(finite(rot)));
  const globalPos = Object.freeze(sectorLocalToGlobalForSector(localPos, sectorId));
  return Object.freeze({
    id,
    role,
    sectorId,
    hazardType,
    scanScale: Number.isFinite(scanScale) ? scanScale : 1,
    localPos: Object.freeze({ x: localPos.x, z: localPos.z }),
    globalPos,
    dir,
    cycle: WEATHER_CYCLE,
    field: Object.freeze({
      id: `environment_${id}`,
      kind: field.kind,
      center: globalPos,
      dir,
      radius: positive(field.radius, 220),
      strength: Math.max(0, finite(field.strength, 0)),
      falloff: positive(field.falloff, 1.1),
      halfAngleRad: positive(field.halfAngleRad, 0.4),
      edgeSoftRad: Math.max(0, finite(field.edgeSoftRad, 0.12)),
      halfWidth: positive(field.halfWidth, 72),
      innerRadius: Math.max(0, finite(field.innerRadius, 0)),
      innerSoft: Math.max(0, finite(field.innerSoft, 0)),
      sourceId: id,
      team: null,
    }),
  });
}

export const WEATHER_VOLUMES = Object.freeze([
  buildWeatherVolume({
    id: 'veil_storm_lane',
    role: 'storm',
    sectorId: VEIL_WEATHER_SECTOR_ID,
    hazardType: 'debris_current',
    localPos: { x: -280, z: 640 },
    rot: 0.42,
    scanScale: 1,
    field: {
      kind: 'sheet',
      strength: 320,
      radius: 460,
      halfWidth: 78,
      falloff: 1.05,
    },
  }),
  buildWeatherVolume({
    id: 'veil_radiation_belt',
    role: 'radiation_belt',
    sectorId: VEIL_WEATHER_SECTOR_ID,
    hazardType: 'nebula',
    localPos: { x: 380, z: -980 },
    rot: 0,
    scanScale: WEATHER_SCAN_SCALE_INSIDE,
    field: {
      kind: 'well',
      strength: 210,
      radius: 260,
      innerRadius: 78,
      innerSoft: 24,
      falloff: 1.2,
    },
  }),
  buildWeatherVolume({
    id: 'vesta_storm_lane',
    role: 'storm',
    sectorId: VESTA_WEATHER_SECTOR_ID,
    hazardType: 'debris_current',
    localPos: { x: 680, z: 320 },
    rot: -0.55,
    scanScale: 1,
    field: {
      kind: 'sheet',
      strength: 320,
      radius: 460,
      halfWidth: 78,
      falloff: 1.05,
    },
  }),
  buildWeatherVolume({
    id: 'vesta_radiation_belt',
    role: 'radiation_belt',
    sectorId: VESTA_WEATHER_SECTOR_ID,
    hazardType: 'nebula',
    localPos: { x: -540, z: -480 },
    rot: 0,
    scanScale: WEATHER_SCAN_SCALE_INSIDE,
    field: {
      kind: 'well',
      strength: 210,
      radius: 260,
      innerRadius: 78,
      innerSoft: 24,
      falloff: 1.2,
    },
  }),
]);

export const WEATHER_SECTOR_IDS = Object.freeze(new Set([
  VEIL_WEATHER_SECTOR_ID,
  VESTA_WEATHER_SECTOR_ID,
]));

export function weatherVolumesForSector(sectorId) {
  return WEATHER_VOLUMES.filter((volume) => volume.sectorId === sectorId);
}

export function weatherPhase(volume, simTime, out = null) {
  const result = out || {};
  const cycle = volume && volume.cycle || WEATHER_CYCLE;
  const cycleS = cycle.warningS + cycle.surgeS + cycle.calmS;
  const elapsedS = positiveModulo(finite(simTime), cycleS);
  let phase;
  let remainingS;
  if (elapsedS < cycle.warningS) {
    phase = 'warning';
    remainingS = cycle.warningS - elapsedS;
  } else if (elapsedS < cycle.warningS + cycle.surgeS) {
    phase = 'surge';
    remainingS = cycle.warningS + cycle.surgeS - elapsedS;
  } else {
    phase = 'calm';
    remainingS = cycleS - elapsedS;
  }
  result.phase = phase;
  result.fieldActive = phase !== 'calm';
  result.fieldStrengthScale = phase === 'surge' ? 1 : 0;
  result.cycleS = cycleS;
  result.elapsedS = elapsedS;
  result.remainingS = remainingS;
  return result;
}

export function pointInsideWeatherVolume(volume, point) {
  if (!volume || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const field = volume.field;
  const dx = point.x - field.center.x;
  const dz = point.z - field.center.z;
  if (field.kind === 'sheet') {
    const along = dx * field.dir.x + dz * field.dir.z;
    if (along < 0 || along >= field.radius) return false;
    const lat = Math.hypot(dx - field.dir.x * along, dz - field.dir.z * along);
    return lat <= field.halfWidth;
  }
  const distance = Math.hypot(dx, dz);
  if (distance >= field.radius) return false;
  if (field.innerRadius > 0 && distance < field.innerRadius) return false;
  return true;
}

export function weatherScanScale(sectorId, point, simTime) {
  let scale = 1;
  for (const volume of weatherVolumesForSector(sectorId)) {
    const phase = weatherPhase(volume, simTime);
    if (phase.phase !== 'surge') continue;
    if (!pointInsideWeatherVolume(volume, point)) continue;
    if (volume.scanScale < scale) scale = volume.scanScale;
  }
  return scale;
}

export function weatherHazardZones(sectorId) {
  return weatherVolumesForSector(sectorId).map((volume) => Object.freeze({
    id: volume.id,
    type: volume.hazardType,
    center: volume.localPos,
    radius: volume.field.radius,
    intensity: 0.55,
  }));
}

// PQ-027.03 — Ceres Refinery hangar aperture. The door locks on a schedule; stuffing a hull
// into the mouth jams it. Jam is occupancy plus an inward hold cone — the field moves mass,
// it is not a spawn-flag aura. Reinforcements burning out the bay stay inside for ≥ 20 s.
export const APERTURE_SECTOR_ID = CINDER_SLUICE_SECTOR_ID;
export const APERTURE_STATION_ID = 'station_ceres';
export const APERTURE_ID = 'ceres_refinery_hangar_aperture';
export const APERTURE_JAM_HOLD_S = 20;
export const APERTURE_CYCLE = Object.freeze({ openS: 16, closingS: 2, lockedS: 10 });
export const APERTURE_LOCAL_POS = Object.freeze({ x: -990, z: 620 });
const APERTURE_ROT = 0;
export const APERTURE_DIR = freezeVec(Math.cos(APERTURE_ROT), Math.sin(APERTURE_ROT));
export const APERTURE_INTERIOR_DIR = freezeVec(-APERTURE_DIR.x, -APERTURE_DIR.z);
export const APERTURE_PERP = freezeVec(-APERTURE_DIR.z, APERTURE_DIR.x);
export const APERTURE_GLOBAL_POS = Object.freeze(
  sectorLocalToGlobalForSector(APERTURE_LOCAL_POS, APERTURE_SECTOR_ID),
);
export const APERTURE_MOUTH = Object.freeze({
  alongMin: -22,
  alongMax: 16,
  halfWidth: 34,
});
const APERTURE_HOLD_APEX_ALONG = 10;
export const APERTURE_HOLD_FIELD = Object.freeze({
  id: 'environment_ceres_hangar_aperture_hold',
  kind: 'cone',
  center: freezeVec(
    APERTURE_GLOBAL_POS.x + APERTURE_INTERIOR_DIR.x * APERTURE_HOLD_APEX_ALONG,
    APERTURE_GLOBAL_POS.z + APERTURE_INTERIOR_DIR.z * APERTURE_HOLD_APEX_ALONG,
  ),
  dir: APERTURE_INTERIOR_DIR,
  radius: 92,
  strength: 720,
  falloff: 1.08,
  halfAngleRad: 0.62,
  edgeSoftRad: 0.12,
  sourceId: APERTURE_ID,
  team: null,
});
export const APERTURE_PINCH_FIELD = Object.freeze({
  id: 'environment_ceres_hangar_aperture_pinch',
  kind: 'sheet',
  center: freezeVec(APERTURE_GLOBAL_POS.x, APERTURE_GLOBAL_POS.z),
  dir: APERTURE_DIR,
  radius: 48,
  strength: 820,
  falloff: 1.05,
  halfWidth: 52,
  sourceId: APERTURE_ID,
  team: null,
});
export const APERTURE_FIELDS = Object.freeze([APERTURE_HOLD_FIELD, APERTURE_PINCH_FIELD]);
export const APERTURE_PLUG = Object.freeze({
  id: 'ceres_refinery_hangar_aperture_plug',
  pos: freezeVec(APERTURE_GLOBAL_POS.x, APERTURE_GLOBAL_POS.z),
  radius: 30,
  mass: 11000,
});
export const APERTURE_EXIT_ALONG = APERTURE_PLUG.radius + 8;
const APERTURE_OCCUPANT_TYPES = new Set(['ship', 'wreck', 'asteroid']);

export function aperturePoint(along, across = 0) {
  return freezeVec(
    APERTURE_GLOBAL_POS.x + APERTURE_DIR.x * along + APERTURE_PERP.x * across,
    APERTURE_GLOBAL_POS.z + APERTURE_DIR.z * along + APERTURE_PERP.z * across,
  );
}

export function apertureAlong(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return NaN;
  return (point.x - APERTURE_GLOBAL_POS.x) * APERTURE_DIR.x
    + (point.z - APERTURE_GLOBAL_POS.z) * APERTURE_DIR.z;
}

export function apertureAcross(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return NaN;
  return (point.x - APERTURE_GLOBAL_POS.x) * APERTURE_PERP.x
    + (point.z - APERTURE_GLOBAL_POS.z) * APERTURE_PERP.z;
}

export function pointInsideApertureMouth(point) {
  const along = apertureAlong(point);
  if (!Number.isFinite(along)) return false;
  if (along < APERTURE_MOUTH.alongMin || along > APERTURE_MOUTH.alongMax) return false;
  return Math.abs(apertureAcross(point)) <= APERTURE_MOUTH.halfWidth;
}

export function pointInsideApertureHold(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const field = APERTURE_HOLD_FIELD;
  const dx = point.x - field.center.x;
  const dz = point.z - field.center.z;
  const distance = Math.hypot(dx, dz);
  if (distance >= field.radius) return false;
  if (distance < 1e-6) return true;
  const forward = (dx * field.dir.x + dz * field.dir.z) / distance;
  if (forward <= 0) return false;
  const angle = Math.acos(Math.max(-1, Math.min(1, forward)));
  return angle < field.halfAngleRad + field.edgeSoftRad;
}

export function pointInsideAperture(point) {
  return pointInsideApertureMouth(point) || pointInsideApertureHold(point);
}

export const APERTURE_SEAT_SPEED = 8;

export function isApertureOccupant(entity) {
  if (!entity || entity.alive === false) return false;
  if (entity.collides === false) return false;
  if (entity.data && entity.data.aperturePlugId) return false;
  if (!APERTURE_OCCUPANT_TYPES.has(entity.type)) return false;
  if (!pointInsideApertureMouth(entity.pos)) return false;
  if (entity.type === 'ship') {
    const vel = entity.vel;
    const speed = vel ? Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0) : 0;
    if (speed > APERTURE_SEAT_SPEED) return false;
  }
  return true;
}

export function aperturePhase(simTime, jamState, out = null) {
  const result = out || {};
  const now = finite(simTime);
  const occupied = !!(jamState && jamState.occupied);
  let jammedAtS = jamState && Number.isFinite(jamState.jammedAtS) ? jamState.jammedAtS : null;
  if (occupied && jammedAtS == null) jammedAtS = now;
  if (jammedAtS != null && (occupied || (now - jammedAtS) < APERTURE_JAM_HOLD_S)) {
    const heldS = now - jammedAtS;
    result.phase = 'jam';
    result.fieldActive = true;
    result.fieldStrengthScale = 1;
    result.occupied = occupied;
    result.heldS = heldS;
    result.remainingS = occupied
      ? Math.max(APERTURE_JAM_HOLD_S, APERTURE_JAM_HOLD_S - heldS)
      : Math.max(0, APERTURE_JAM_HOLD_S - heldS);
    result.cycleS = APERTURE_CYCLE.openS + APERTURE_CYCLE.closingS + APERTURE_CYCLE.lockedS;
    result.elapsedS = heldS;
    return result;
  }
  const cycleS = APERTURE_CYCLE.openS + APERTURE_CYCLE.closingS + APERTURE_CYCLE.lockedS;
  const elapsedS = positiveModulo(now, cycleS);
  let phase;
  let remainingS;
  let fieldActive;
  let fieldStrengthScale;
  if (elapsedS < APERTURE_CYCLE.openS) {
    phase = 'open';
    remainingS = APERTURE_CYCLE.openS - elapsedS;
    fieldActive = false;
    fieldStrengthScale = 0;
  } else if (elapsedS < APERTURE_CYCLE.openS + APERTURE_CYCLE.closingS) {
    phase = 'closing';
    remainingS = APERTURE_CYCLE.openS + APERTURE_CYCLE.closingS - elapsedS;
    fieldActive = true;
    fieldStrengthScale = 0;
  } else {
    phase = 'locked';
    remainingS = cycleS - elapsedS;
    fieldActive = true;
    fieldStrengthScale = 1;
  }
  result.phase = phase;
  result.fieldActive = fieldActive;
  result.fieldStrengthScale = fieldStrengthScale;
  result.occupied = occupied;
  result.heldS = 0;
  result.remainingS = remainingS;
  result.cycleS = cycleS;
  result.elapsedS = elapsedS;
  return result;
}

export function apertureHazardZones(sectorId) {
  if (sectorId !== APERTURE_SECTOR_ID) return [];
  return [Object.freeze({
    id: APERTURE_ID,
    type: 'debris_current',
    center: APERTURE_LOCAL_POS,
    radius: 90,
    intensity: 0.6,
  })];
}
