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
