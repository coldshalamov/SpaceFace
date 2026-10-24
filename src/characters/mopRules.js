// src/characters/mopRules.js — pure rules for MOP / CL-5 (row 506 / 03 §4.3).
// No state, no bus, no Math.random. The adapter reads the entity census each calendar
// pass; these answer: which hull counts as evidence, where the drone steers, and when a
// tidy is close enough to the client to be worth one quiet remark.

import { MOP } from '../data/mop.js';
import { rookBoothEligible } from './rookRules.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** Evidence law: the drone only tidies unmarked wrecks — the same definition of
 *  unprotected freight the booth buys (ordinary aftermath hulls, never authored,
 *  mission-pinned, durable, claimed or world-record bodies). Another lane's hull is not
 *  evidence, it's somebody's property. */
export function mopEligible(entity) {
  return rookBoothEligible(entity);
}

/** The sweep target: the nearest eligible wreck, so the drone works a real patrol
 *  instead of teleporting between meals. Returns null when the sector is already tidy. */
export function mopSweepTarget(dronePos, entities, eligible = mopEligible) {
  if (!finiteXZ(dronePos) || !Array.isArray(entities)) return null;
  let best = null, bestD = Infinity;
  for (const e of entities) {
    if (!eligible(e) || !finiteXZ(e.pos)) continue;
    const d = Math.hypot(e.pos.x - dronePos.x, e.pos.z - dronePos.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** Steering velocity toward a target point; zero inside the leash so the drone parks
 *  rather than jittering over its meal or its post. */
export function mopSteerVelocity(dronePos, targetPos, speed = MOP.sweepSpeed, radius = MOP.leashRadius) {
  if (!finiteXZ(dronePos) || !finiteXZ(targetPos)) return { x: 0, z: 0 };
  const dx = targetPos.x - dronePos.x, dz = targetPos.z - dronePos.z;
  const d = Math.hypot(dx, dz);
  if (d <= radius) return { x: 0, z: 0 };
  const s = Math.min(speed, d);
  return { x: (dx / d) * s, z: (dz / d) * s };
}

/** The meal: inside the consume radius the hull is tidied. */
export function mopCanConsume(dronePos, wreckPos, radius = MOP.consumeRadius) {
  if (!finiteXZ(dronePos) || !finiteXZ(wreckPos)) return false;
  return Math.hypot(wreckPos.x - dronePos.x, wreckPos.z - dronePos.z) <= radius;
}

/** The one line it says — only when the client was close enough to feel the loss. */
export function mopNoticed(dronePos, playerPos, radius = MOP.noticeRadius) {
  if (!finiteXZ(dronePos) || !finiteXZ(playerPos)) return false;
  return Math.hypot(playerPos.x - dronePos.x, playerPos.z - dronePos.z) <= radius;
}
