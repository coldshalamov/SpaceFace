// src/characters/bouncerRules.js — pure rules for BOUNCER / DR-0 (row 506 / 03 §4.3).
// No state, no bus, no Math.random. The adapter hears firing events and reads positions;
// these answer: was that shot inside the ring, which way is out, and how hard the door
// robot throws.

import { BOUNCER } from '../data/bouncer.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** Inside the cordon is a strike — the ring reads the shooter's position, not the shot's. */
export function bouncerInRing(pos, center = BOUNCER.center, radius = BOUNCER.ringRadius) {
  if (!finiteXZ(pos) || !finiteXZ(center)) return false;
  return Math.hypot(pos.x - center.x, pos.z - center.z) <= radius;
}

/** The door robot counts strikes per hull inside its window. One warning, then out. */
export function bouncerStrikeDecision(strikes, lastAt, now, windowS = BOUNCER.strikeWindowS) {
  const fresh = !(Number.isFinite(lastAt) && (now - lastAt) < windowS);
  const count = fresh ? 1 : (Number(strikes) || 0) + 1;
  // count 1 is the spoken warning; the second strike inside the window is the throw.
  return { count, eject: count > BOUNCER.strikesBeforeEject };
}

/** The throw: a radial impulse away from the ring heart, scaled to the hull's mass so a
 *  fighter and a freighter both leave through the door. Returns the queued-impulse vector
 *  the physics membrane expects (mass × delta-V along the outward radial). */
export function bouncerEjectImpulse(pos, mass, center = BOUNCER.center, dv = BOUNCER.ejectDeltaV) {
  if (!finiteXZ(pos) || !finiteXZ(center) || !(Number.isFinite(mass) && mass > 0)) {
    return { x: 0, z: 0 };
  }
  const dx = pos.x - center.x, dz = pos.z - center.z;
  const d = Math.hypot(dx, dz);
  const ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0;
  return { x: ux * mass * dv, z: uz * mass * dv };
}

/** A dead or docked hull cannot be rowdy — the door only counts the living and flying. A
 *  corpse that still has a firing receipt on the wire (a detonator dart's death commit
 *  reports itself through combat:fire) earns no strike and hears no warning. */
export function bouncerCanEject(entity) {
  return !!entity && entity.alive !== false && finiteXZ(entity.pos);
}

/** Drift-home: the door robot walks back to its post through the impulse membrane — a
 *  velocity correction, never a vel write (Rapier owns linvel on a live dynamic body; a
 *  direct write dies in the next readback). Returns the delta-v for the caller to queue as
 *  mass·dv, or null while the robot holds station inside the leash deadband. */
export function bouncerDriftHome(entity, post = BOUNCER.post, leash = BOUNCER.leashRadius, speed = BOUNCER.driftSpeed) {
  if (!finiteXZ(entity?.pos) || !finiteXZ(post)) return null;
  const vx = finiteXZ(entity.vel) ? entity.vel.x : 0;
  const vz = finiteXZ(entity.vel) ? entity.vel.z : 0;
  const dx = post.x - entity.pos.x, dz = post.z - entity.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > leash) return { x: (dx / d) * speed - vx, z: (dz / d) * speed - vz };
  if (d < leash * 0.5 && (vx !== 0 || vz !== 0)) return { x: -vx, z: -vz };
  return null;
}
