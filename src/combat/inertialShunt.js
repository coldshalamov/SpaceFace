// PQ-026.02 — Inertial shunt: on a ram, dump the fitted hull's closing speed into the other body.
// Pure planner. Weapons.js is the only caller that queues the impulses.

import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import {
  INERTIAL_SHUNT_TUNING,
  INERTIAL_SHUNT_WEAPON_ID,
} from '../data/combatDefs.js';

const SHUNT_TYPES = new Set(['ship', 'drone']);

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function positive(value, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function pairKey(aId, bId) {
  return String(aId) < String(bId) ? `${aId}|${bId}` : `${bId}|${aId}`;
}

export function hullCarriesInertialShunt(entity) {
  if (!entity || entity.alive === false) return false;
  const weapons = entity.data && entity.data.weapons;
  if (Array.isArray(weapons)) {
    for (let i = 0; i < weapons.length; i++) {
      if (weapons[i] && weapons[i].defId === INERTIAL_SHUNT_WEAPON_ID) return true;
    }
  }
  const fittings = entity.data && entity.data.fittings;
  if (Array.isArray(fittings)) {
    for (let i = 0; i < fittings.length; i++) {
      if (fittings[i] === INERTIAL_SHUNT_WEAPON_ID) return true;
    }
  }
  return false;
}

function authoredMass(entity) {
  return positive(entity && entity.physicsBody && entity.physicsBody.mass, positive(entity && entity.mass, 1));
}

/**
 * Plan equal-and-opposite impulses that dump the shunter's closing speed into the target,
 * scaled by mass so a light flies and a heavy shrugs. A physics impact may supply the
 * authoritative radial closure and contact normal; without that receipt, retain the pure
 * planner's relative-velocity fallback for direct callers.
 */
export function fillInertialShuntImpulses(
  shunterOut,
  targetOut,
  shunter,
  target,
  tuning = INERTIAL_SHUNT_TUNING,
  contact = null,
) {
  if (!shunterOut || !targetOut || !shunter || !target) return false;
  shunterOut.x = 0;
  shunterOut.y = 0;
  shunterOut.z = 0;
  targetOut.x = 0;
  targetOut.y = 0;
  targetOut.z = 0;

  const mS = authoredMass(shunter);
  const mT = authoredMass(target);
  let nx;
  let nz;
  let closing;
  if (contact) {
    const rawNx = finite(contact.normal && contact.normal.x);
    const rawNz = finite(contact.normal && contact.normal.z);
    const normalLength = Math.hypot(rawNx, rawNz);
    if (!(normalLength > 1e-6)) return false;
    const orientation = contact.shunterIsA === false ? -1 : 1;
    nx = orientation * rawNx / normalLength;
    nz = orientation * rawNz / normalLength;
    if (Number.isFinite(contact.closingSpeed)) {
      closing = Math.max(0, contact.closingSpeed);
    } else {
      const dvx = finite(shunter.vel && shunter.vel.x) - finite(target.vel && target.vel.x);
      const dvz = finite(shunter.vel && shunter.vel.z) - finite(target.vel && target.vel.z);
      closing = Math.max(0, dvx * nx + dvz * nz);
    }
  } else {
    const dvx = finite(shunter.vel && shunter.vel.x) - finite(target.vel && target.vel.x);
    const dvz = finite(shunter.vel && shunter.vel.z) - finite(target.vel && target.vel.z);
    closing = Math.hypot(dvx, dvz);
    if (closing > 0) {
      nx = dvx / closing;
      nz = dvz / closing;
    }
  }
  const minClosing = positive(tuning && tuning.minClosingSpeed, 40);
  if (!(closing >= minClosing)) return false;

  const refMass = positive(tuning && tuning.refMass, 24);
  const dump = clamp(finite(tuning && tuning.dumpVsLight, 0.95), 0, 1);
  const couple = clamp(refMass / Math.max(mT, refMass), 0.08, 1);
  const lostSpeed = closing * couple * dump;
  if (!(lostSpeed > 0)) return false;

  const momentum = mS * lostSpeed;
  shunterOut.x = -nx * momentum;
  shunterOut.z = -nz * momentum;
  targetOut.x = nx * momentum;
  targetOut.z = nz * momentum;
  return true;
}

export function tryApplyInertialShuntFromImpact(state, payload, getEntity, shunterOut, targetOut, cooldown) {
  if (!payload || !getEntity || !shunterOut || !targetOut) return null;
  const a = getEntity(payload.aId);
  const b = getEntity(payload.bId);
  if (!a || !b || a === b || a.alive === false || b.alive === false) return null;
  if (!SHUNT_TYPES.has(a.type) || !SHUNT_TYPES.has(b.type)) return null;

  let shunter = null;
  let target = null;
  if (hullCarriesInertialShunt(a) && !hullCarriesInertialShunt(b)) {
    shunter = a;
    target = b;
  } else if (hullCarriesInertialShunt(b) && !hullCarriesInertialShunt(a)) {
    shunter = b;
    target = a;
  } else if (hullCarriesInertialShunt(a) && hullCarriesInertialShunt(b)) {
    const playerId = state && state.playerId;
    shunter = a.id === playerId ? a : b;
    target = shunter === a ? b : a;
  } else {
    return null;
  }

  const tick = Number.isInteger(payload.tick)
    ? payload.tick
    : (state && Number.isInteger(state.tick) ? state.tick : 0);
  const key = pairKey(a.id, b.id);
  if (cooldown && typeof cooldown.get === 'function') {
    const until = cooldown.get(key);
    if (Number.isInteger(until) && tick < until) return null;
    if (Number.isInteger(until)) cooldown.delete(key);
  }

  const contact = payload.normal || Number.isFinite(payload.preSolveClosingSpeed)
    ? {
      normal: payload.normal,
      closingSpeed: payload.preSolveClosingSpeed,
      shunterIsA: shunter === a,
    }
    : null;
  if (!fillInertialShuntImpulses(shunterOut, targetOut, shunter, target, INERTIAL_SHUNT_TUNING, contact)) return null;
  queuePhysicsImpulse(shunter, shunterOut);
  queuePhysicsImpulse(target, targetOut);
  if (cooldown && typeof cooldown.set === 'function') {
    const hold = Number.isInteger(INERTIAL_SHUNT_TUNING.cooldownTicks)
      ? INERTIAL_SHUNT_TUNING.cooldownTicks
      : 45;
    cooldown.set(key, tick + hold);
  }
  return {
    shunterId: shunter.id,
    targetId: target.id,
    targetDeltaV: Math.hypot(targetOut.x, targetOut.z) / authoredMass(target),
    shunterDeltaV: Math.hypot(shunterOut.x, shunterOut.z) / authoredMass(shunter),
  };
}
