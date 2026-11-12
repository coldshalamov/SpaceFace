// src/characters/shepherd12Rules.js — pure rules for SHEPHERD-12 (row 506 /
// 03 §4.3). No state, no bus, no Math.random. The adapter censuses the flock each
// calendar pass; these answer: where the ring members drift, who counts as shy,
// and where the broken shepherd walks next on its patrol edge.

import { SHEPHERD12 } from '../data/shepherd12.js';

function finiteXZ(v) {
  return Number.isFinite(v && v.x) && Number.isFinite(v && v.z);
}

/** Stray seq's drift spot: deterministic bearing + wobble radius out past the
 *  ring. The serial is the spot — authored strays take 0..strayCount-1 and every
 *  restock/wave takes the next serial, so two strays never land on one seat. */
export function shepherd12StraySpot(seq, center = SHEPHERD12.flockCenter) {
  const i = Number(seq) || 0;
  const angle = SHEPHERD12.strayBearingStart + i * SHEPHERD12.strayBearingStep;
  const r = SHEPHERD12.strayScatterRadius * (0.75 + (i % 2) * 0.25);
  return { x: center.x + Math.cos(angle) * r, z: center.z + Math.sin(angle) * r };
}

/** Member i's drift spot: the first `strayCount` indexes are the authored strays,
 *  scattered past the ring; the rest ride the ring inside. Deterministic, never
 *  rng — the tide is the same tide on every visit. */
export function shepherd12MemberSpot(index, center = SHEPHERD12.flockCenter) {
  const i = Number(index) || 0;
  if (i < SHEPHERD12.strayCount) return shepherd12StraySpot(i, center);
  const j = i - SHEPHERD12.strayCount;
  const angle = 0.5 + j * 1.45;
  const r = SHEPHERD12.flockRadius * (0.45 + (j % 3) * 0.18);
  return { x: center.x + Math.cos(angle) * r, z: center.z + Math.sin(angle) * r };
}

/** Where the paid fragment materializes: just off the ring's edge at a fixed
 *  bearing — the shepherd sets its payment down beside the flock, never in it. */
export function shepherd12FragmentSpot(center = SHEPHERD12.flockCenter) {
  const r = SHEPHERD12.flockRadius + 120;
  return { x: center.x + Math.cos(1.1) * r, z: center.z + Math.sin(1.1) * r };
}

/** Is this a flock member at all — stamped, alive, present in the world? */
export function shepherd12Member(entity) {
  return !!(entity && entity.alive !== false && entity.data?.shepherdFlock === true);
}

/** Is a flock member shy: alive, outside the ring, or inside but still moving too
 *  fast to count — a stray screaming through the edge is mid-throw, not home. */
export function shepherd12Shy(entity, center = SHEPHERD12.flockCenter, radius = SHEPHERD12.flockRadius) {
  if (!shepherd12Member(entity)) return false;
  if (!finiteXZ(entity.pos) || !finiteXZ(center)) return true; // no fix: it cannot be counted
  const speed = finiteXZ(entity.vel) ? Math.hypot(entity.vel.x, entity.vel.z) : 0;
  if (speed > SHEPHERD12.homeSpeed) return true;
  return Math.hypot(entity.pos.x - center.x, entity.pos.z - center.z) > radius;
}

/** How many members the sector still owes: the authored count minus the live
 *  ones. Violence and salvage thin the flock; the tide replaces it — a member
 *  lost is a member the ring owes back as a new stray. */
export function shepherd12MemberOwed(aliveCount, flockCount = SHEPHERD12.flockCount) {
  return Math.max(0, (Number(flockCount) || 0) - (Number(aliveCount) || 0));
}

/** The shepherd's next patrol mark: point k of a slow ring walk around the flock
 *  edge — the broken engine can still pace the perimeter it cannot pull. */
export function shepherd12PatrolPoint(k, center = SHEPHERD12.flockCenter) {
  const n = Math.max(1, SHEPHERD12.patrolPoints);
  const angle = ((Math.floor(Number(k)) || 0) % n) / n * Math.PI * 2;
  return {
    x: center.x + Math.cos(angle) * SHEPHERD12.patrolRadius,
    z: center.z + Math.sin(angle) * SHEPHERD12.patrolRadius,
  };
}

/** The leg index the shepherd is on: nearest patrol point to where it stands. */
export function shepherd12PatrolLeg(pos, center = SHEPHERD12.flockCenter) {
  if (!finiteXZ(pos)) return 0;
  let best = 0, bestD = Infinity;
  for (let k = 0; k < SHEPHERD12.patrolPoints; k += 1) {
    const p = shepherd12PatrolPoint(k, center);
    const d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

/** The patrol steer: walk to the NEXT mark past the nearest leg — delta-v for the
 *  caller to queue as mass·dv through the impulse membrane, or null when it is
 *  close enough to count the leg done (the adapter advances the leg then). */
export function shepherd12PatrolDeltaV(drone, legIndex, center = SHEPHERD12.flockCenter, speed = SHEPHERD12.patrolSpeed) {
  if (!finiteXZ(drone?.pos)) return null;
  const next = shepherd12PatrolPoint((Math.floor(Number(legIndex)) || 0) + 1, center);
  const dx = next.x - drone.pos.x, dz = next.z - drone.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return null;
  const vx = finiteXZ(drone.vel) ? drone.vel.x : 0;
  const vz = finiteXZ(drone.vel) ? drone.vel.z : 0;
  return { x: (dx / d) * speed - vx, z: (dz / d) * speed - vz, arrived: d < SHEPHERD12.patrolRadius * 0.08 };
}

/** The count line: what the shepherd says while the flock is still shy. */
export function shepherd12ShyLine(strays, template = SHEPHERD12.flockShy) {
  return String(template).replace('{strays}', String(strays));
}

/** The return line: how many crossed home on this census and how many are still out.
 *  One home reads ONE HOME; two or more say their number — the count is never rounded down. */
const HOME_WORDS = ['NONE', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
export function shepherd12HomeLine(strays, home = 1) {
  const n = Math.max(1, Math.floor(Number(home)) || 1);
  if (n === 1) return String(SHEPHERD12.strayHome).replace('{strays}', String(strays));
  return String(SHEPHERD12.strayHomeMany)
    .replace('{home}', HOME_WORDS[n] || String(n))
    .replace('{strays}', String(strays));
}
