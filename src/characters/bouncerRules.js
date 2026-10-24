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

/** A dead or docked hull cannot be rowdy — the door only throws the living and flying. */
export function bouncerCanEject(entity) {
  return !!entity && entity.alive !== false && finiteXZ(entity.pos);
}
