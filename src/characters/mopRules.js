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
 *  mission-pinned, durable, claimed or world-record bodies), minus any hull already
 *  mid-hand. A body riding an NPC job's line — the occupational latch, a towed
 *  payload, or a live `tethered` mark — belongs to that job while the line holds.
 *  The booth could weigh a hull its owner dragged to the ring; a patrol that takes
 *  one off somebody's line is theft, not erasure. The client's own live latch and
 *  salvage-beam lock ride on state.player where the pure law cannot see — the
 *  adapter excludes those ids before the sweep. */
export function mopEligible(entity) {
  if (!rookBoothEligible(entity)) return false;
  const d = entity.data || {};
  const f = entity.flags || {};
  if (f.tethered === true || d.tethered === true || d.npcMasslineLatch === true) return false;
  if (d.npcTowedByJobId != null) return false;
  return true;
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

/** The calendar pass steers across the impulse membrane: the drone is a live dynamic
 *  body, so a direct `vel` write dies in the Rapier readback before it ever moves
 *  (the same membrane docket's servo and bouncer's drift-home ride). Returns the
 *  delta between the velocity the sweep wants and the velocity the hull carries —
 *  the adapter queues it as an impulse scaled to the hull's mass. */
export function mopSteerDeltaV(drone, targetPos, speed = MOP.sweepSpeed, radius = MOP.leashRadius) {
  if (!finiteXZ(drone && drone.pos) || !finiteXZ(targetPos)) return null;
  const want = mopSteerVelocity(drone.pos, targetPos, speed, radius);
  const vx = finiteXZ(drone.vel) ? drone.vel.x : 0;
  const vz = finiteXZ(drone.vel) ? drone.vel.z : 0;
  const dvx = want.x - vx, dvz = want.z - vz;
  if (dvx === 0 && dvz === 0) return null;
  return { x: dvx, z: dvz };
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
