// src/characters/gravediggerRules.js — pure rules for GRAVEDIGGER / UG-4
// (row 506 / 03 §4.3). No state, no bus, no Math.random. The adapter censuses
// the field each pass; these answer: what the machine may bury, where it runs
// to, and when the pit pays.

import { GRAVEDIGGER } from '../data/gravedigger.js';
import { mopEligible } from './mopRules.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}
function speedOf(e) {
  return finiteXZ(e?.vel) ? Math.hypot(e.vel.x, e.vel.z) : 0;
}
function dist(a, b) {
  return finiteXZ(a) && finiteXZ(b) ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
}

/** A hull the field can honestly take: the shared unmarked-wreck law (no
 *  story stamps, no salvage pools worth logging, no live tow/latch marks) and
 *  inside the machine's pursuit range. The robot chases the wreck; it does
 *  not reach across the gulf. */
export function gravediggerBuryable(entity, robotPos, pursueRadius = GRAVEDIGGER.pursueRadius) {
  if (!mopEligible(entity)) return false;
  if (dist(entity.pos, robotPos) > pursueRadius) return false;
  return true;
}

/** The nearest buryable wreck — the machine digs the closest grave first. */
export function gravediggerTarget(robotPos, entities, eligible = (e) => gravediggerBuryable(e, robotPos)) {
  let best = null; let bestD = Infinity;
  for (const e of entities || []) {
    if (!e || e.alive === false || !eligible(e)) continue;
    const d = dist(robotPos, e.pos);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** Is the wreck still enough to bury: a hull screaming through the grave is a
 *  flyby, not a burial. */
export function gravediggerCanBury(entity, robotPos, buryRadius = GRAVEDIGGER.buryRadius) {
  if (dist(entity?.pos, robotPos) > buryRadius) return false;
  return speedOf(entity) <= GRAVEDIGGER.settleSpeed;
}

/** The compost verb: a wreck parked settled inside the pit at the robot's
 *  feet is an offering — the same eligibility law plus the pit ring, because
 *  the machine does not get paid for what it chased down itself. */
export function gravediggerCompostable(entity, post, pitRadius = GRAVEDIGGER.pitRadius) {
  if (!mopEligible(entity)) return false;
  if (dist(entity.pos, post) > pitRadius) return false;
  return speedOf(entity) <= GRAVEDIGGER.settleSpeed;
}

/** Chase steering: run down the target beyond the leash, brake inside it —
 *  a delta-v for the caller to scale by mass, never a vel write. */
export function gravediggerSteerDeltaV(robot, targetPos, chaseSpeed = GRAVEDIGGER.chaseSpeed, leash = 40) {
  if (!finiteXZ(robot?.pos) || !finiteXZ(targetPos)) return null;
  const vx = finiteXZ(robot.vel) ? robot.vel.x : 0;
  const vz = finiteXZ(robot.vel) ? robot.vel.z : 0;
  const dx = targetPos.x - robot.pos.x, dz = targetPos.z - robot.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > leash) return { x: (dx / d) * chaseSpeed - vx, z: (dz / d) * chaseSpeed - vz };
  if (vx !== 0 || vz !== 0) return { x: -vx, z: -vz };
  return null;
}

/** Post-keeping when nothing is worth a grave: walk home through the same
 *  membrane. */
export function gravediggerDriftHome(entity, post = GRAVEDIGGER.post, leash = 70, speed = 20) {
  if (!finiteXZ(entity?.pos) || !finiteXZ(post)) return null;
  const d = dist(entity.pos, post);
  if (d <= leash) {
    const vx = finiteXZ(entity.vel) ? entity.vel.x : 0;
    const vz = finiteXZ(entity.vel) ? entity.vel.z : 0;
    if (d < leash * 0.5 && (vx !== 0 || vz !== 0)) return { x: -vx, z: -vz };
    return null;
  }
  return gravediggerSteerDeltaV(entity, post, speed, leash);
}

/** Which flag-ledger beds still need hulls on the field: spots recorded but
 *  no live garden wearing their serial. */
export function gravediggerGardenOwed(gardens, liveSerials) {
  const out = [];
  for (const g of gardens || []) {
    if (!g || !finiteXZ(g)) continue;
    if (!liveSerials.has(Number(g.serial))) out.push(g);
  }
  return out;
}
