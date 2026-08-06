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

const UNREGULATED_CYCLE = Object.freeze({ warningS: 2, surgeS: 7, calmS: 3 });
const REGULATED_CYCLE = Object.freeze({ warningS: 3, surgeS: 5, calmS: 7 });

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
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
