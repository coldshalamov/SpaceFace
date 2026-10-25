// src/characters/holdfastRules.js — pure rules for HOLDFAST / AN-1 (row 506 /
// 03 §4.3). No state, no bus, no Math.random. The adapter censuses the lip each
// calendar pass; these answer: where the drift spires scatter, which socket a
// parked spire seats, and how the crack meter moves.

import { HOLDFAST } from '../data/holdfast.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** Clamp socket i on the fissure lip: one bearing out from the post at even
 *  spacing — the sockets are seats, keyed on index never entity id. */
export function holdfastClampSpot(index, post = HOLDFAST.post) {
  const r = HOLDFAST.clampSpacing * ((Number(index) || 0) + 1);
  return {
    x: post.x + Math.cos(HOLDFAST.clampBearing) * r,
    z: post.z + Math.sin(HOLDFAST.clampBearing) * r,
  };
}

/** Drift-spire i's scatter spot: deterministic bearing out past the lip — the
 *  loose stock is authored, not rng, so the rift is the same rift each visit. */
export function holdfastSpireSpot(index, post = HOLDFAST.post) {
  const angle = HOLDFAST.spireBearingStart + (Number(index) || 0) * HOLDFAST.spireBearingStep;
  const r = HOLDFAST.spireScatterRadius * (0.7 + ((Number(index) || 0) % 3) * 0.15);
  return { x: post.x + Math.cos(angle) * r, z: post.z + Math.sin(angle) * r };
}

/** Is this a spire the clamps will take: loose rift stock (stamped, alive, not
 *  already anchored), settled inside a socket ring — a spire still moving is
 *  mid-throw; the socket seats it when it rests. */
export function holdfastSeatable(entity, socketPos, seatRadius = HOLDFAST.seatRadius) {
  if (!entity || entity.alive === false) return false;
  const d = entity.data || {};
  if (d.holdfastSpire !== true || d.holdfastAnchored === true) return false;
  if (!finiteXZ(entity.pos) || !finiteXZ(socketPos)) return false;
  const speed = finiteXZ(entity.vel) ? Math.hypot(entity.vel.x, entity.vel.z) : 0;
  if (speed > HOLDFAST.seatSpeed) return false;
  return Math.hypot(entity.pos.x - socketPos.x, entity.pos.z - socketPos.z) <= seatRadius;
}

/** Which clamp seats this spire: the lowest empty socket it is parked in, or -1.
 *  `claimed` is the set of slot indexes already seated (occupied-seat law — a
 *  live anchored spire owns its socket even before the flags ledger writes). */
export function holdfastSocketFor(entity, post = HOLDFAST.post, clampCount = HOLDFAST.clampCount, claimed = new Set()) {
  for (let i = 0; i < clampCount; i += 1) {
    if (claimed.has(i)) continue;
    if (holdfastSeatable(entity, holdfastClampSpot(i, post))) return i;
  }
  return -1;
}

/** The crack meter's next value: climbs on elapsed sim time; a fresh seat knocks
 *  it back. Clamped to [0, crackMax]; the run itself is the adapter's event. */
export function holdfastCrackAfter(meter, dtSeconds, seatsDropped = 0, opts = HOLDFAST) {
  const next = (Number(meter) || 0) + (Number(dtSeconds) || 0) * opts.crackRate - seatsDropped * opts.crackSeatDrop;
  return Math.min(opts.crackMax, Math.max(0, next));
}

/** How much loose stock the rift still owes: authored count minus drifting
 *  spires minus anchored ones — a seated spire is spent stock, not owed. */
export function holdfastSpireOwed(looseAlive, anchoredAlive, spireCount = HOLDFAST.spireCount) {
  return Math.max(0, (Number(spireCount) || 0) - (Number(looseAlive) || 0) - (Number(anchoredAlive) || 0));
}

/** Station-keeping: the robot holds its post on the lip; shoved off, it walks
 *  home through the impulse membrane — a delta-v for the caller to queue as
 *  mass·dv, never a vel write. */
export function holdfastDriftHome(entity, post = HOLDFAST.post, leash = 60, speed = 18) {
  if (!finiteXZ(entity?.pos) || !finiteXZ(post)) return null;
  const vx = finiteXZ(entity.vel) ? entity.vel.x : 0;
  const vz = finiteXZ(entity.vel) ? entity.vel.z : 0;
  const dx = post.x - entity.pos.x, dz = post.z - entity.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > leash) return { x: (dx / d) * speed - vx, z: (dz / d) * speed - vz };
  if (d < leash * 0.5 && (vx !== 0 || vz !== 0)) return { x: -vx, z: -vz };
  return null;
}

/** Where the paid fragment materializes: just off the lip at a fixed bearing —
 *  the robot sets its payment beside the clamps, never in one. */
export function holdfastFragmentSpot(post = HOLDFAST.post) {
  const r = HOLDFAST.clampSpacing * (HOLDFAST.clampCount + 1);
  return { x: post.x + Math.cos(HOLDFAST.clampBearing + 0.5) * r, z: post.z + Math.sin(HOLDFAST.clampBearing + 0.5) * r };
}
