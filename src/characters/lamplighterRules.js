// src/characters/lamplighterRules.js — pure rules for LAMPLIGHTER / LL-6 (row 506 /
// 03 §4.3). No state, no bus, no Math.random. The adapter censuses the rim each
// calendar pass; these answer: where the dead buoys drift, which one the arms
// accept, and where the next lit lamp stands on the old lane path.

import { LAMPLIGHTER } from '../data/lamplighter.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** Dead-buoy i's drift spot: a deterministic bearing out from the post — the dead
 *  stock is authored scatter, not rng, so the rim is the same rim on every visit. */
export function lamplighterDeadSpot(index, post = LAMPLIGHTER.post) {
  const angle = LAMPLIGHTER.deadBearingStart + (Number(index) || 0) * LAMPLIGHTER.deadBearingStep;
  const r = LAMPLIGHTER.deadScatterRadius * (0.6 + ((Number(index) || 0) % 3) * 0.2);
  return { x: post.x + Math.cos(angle) * r, z: post.z + Math.sin(angle) * r };
}

/** Lit-lamp slot i on the lane path: one bearing, even spacing, index 0 nearest. */
export function lamplighterSlotSpot(index, post = LAMPLIGHTER.post) {
  const r = LAMPLIGHTER.slotSpacing * ((Number(index) || 0) + 1);
  return {
    x: post.x + Math.cos(LAMPLIGHTER.slotBearing) * r,
    z: post.z + Math.sin(LAMPLIGHTER.slotBearing) * r,
  };
}

/** Is this a dead buoy the arms will take — flagged dead stock, physically present,
 *  and parked inside the arm ring? A buoy still moving is mid-throw; the arms take
 *  it when it settles inside the ring (a gentle toss still counts — it ARRIVED). */
export function lamplighterArmable(entity, post = LAMPLIGHTER.post, armRadius = LAMPLIGHTER.armRadius) {
  if (!entity || entity.alive === false) return false;
  if (entity.data?.lamplighterDead !== true) return false;
  if (!finiteXZ(entity.pos) || !finiteXZ(post)) return false;
  const speed = finiteXZ(entity.vel) ? Math.hypot(entity.vel.x, entity.vel.z) : 0;
  if (speed > 30) return false; // screaming through is a miss, not a delivery
  return Math.hypot(entity.pos.x - post.x, entity.pos.z - post.z) <= armRadius;
}

/** How much dead stock the rim still owes: the authored count minus what the arms
 *  already consumed, minus the dead buoys still drifting. */
export function lamplighterDeadOwed(deadAlive, planted, deadCount = LAMPLIGHTER.deadCount) {
  return Math.max(0, deadCount - (Number(planted) || 0) - (Number(deadAlive) || 0));
}

// ─── The lit record: a slot bitmask in story.flags[LAMPLIGHTER.litFlag] ────────────
// The mask is the durable truth of which seats on the path are lit; a live lamp's
// data.lamplighterSlot is the seat it occupies while visiting. Both key on the slot
// INDEX, never an entity id — a recycled id can never inherit a seat or a light.

/** Bits lit on the path. */
export function lamplighterLitCount(mask, slotCount = LAMPLIGHTER.slotCount) {
  let n = 0;
  const m = Number(mask) || 0;
  for (let i = 0; i < slotCount; i += 1) if ((m & (1 << i)) !== 0) n += 1;
  return n;
}

/** Lowest dark slot — the seat the next relit buoy takes, replanting holes first so
 *  a vandalized lamp's gap heals before the path grows. -1 when the rim is done. */
export function lamplighterFirstDark(mask, slotCount = LAMPLIGHTER.slotCount) {
  const m = Number(mask) || 0;
  for (let i = 0; i < slotCount; i += 1) if ((m & (1 << i)) === 0) return i;
  return -1;
}

export function lamplighterMaskSet(mask, slot) {
  const i = Math.floor(Number(slot));
  return Number.isInteger(i) && i >= 0 ? ((Number(mask) || 0) | (1 << i)) : (Number(mask) || 0);
}

export function lamplighterMaskClear(mask, slot) {
  const i = Math.floor(Number(slot));
  return Number.isInteger(i) && i >= 0 ? ((Number(mask) || 0) & ~(1 << i)) : (Number(mask) || 0);
}

/** Station-keeping: the robot holds the relight post; pushed off, it walks home
 *  through the impulse membrane — a velocity correction, never a vel write (a live
 *  dynamic Rapier body owns linvel; the same membrane bouncer's drift-home and mop's
 *  patrol cross). Returns the delta-v for the caller to queue as mass·dv, or null
 *  while it stands inside the leash deadband. */
export function lamplighterDriftHome(entity, post = LAMPLIGHTER.post, leash = LAMPLIGHTER.leashRadius, speed = LAMPLIGHTER.driftSpeed) {
  if (!finiteXZ(entity?.pos) || !finiteXZ(post)) return null;
  const vx = finiteXZ(entity.vel) ? entity.vel.x : 0;
  const vz = finiteXZ(entity.vel) ? entity.vel.z : 0;
  const dx = post.x - entity.pos.x, dz = post.z - entity.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > leash) return { x: (dx / d) * speed - vx, z: (dz / d) * speed - vz };
  if (d < leash * 0.5 && (vx !== 0 || vz !== 0)) return { x: -vx, z: -vz };
  return null;
}
